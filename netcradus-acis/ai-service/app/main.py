import json
import logging
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sklearn.ensemble import IsolationForest
from typing import AsyncGenerator, List, Optional, Tuple
import threading
from . import grpc_server
from . import threat_intel_client
from .ai_provider import AIProviderError, AllProvidersFailedError, NoProviderConfiguredError
from .providers import PROVIDER_CHAIN
from .llm_utils import parse_json_object

# Setup logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service")

# Fallback wrapper for XGBoost (User Constraint 5)
try:
    import xgboost as xgb
    from xgboost import XGBClassifier
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    from sklearn.ensemble import RandomForestClassifier
    logger.warning("XGBoost not available — using RandomForest fallback")

# A naive FAISS mock index builder
def build_mitre_index(embedder: SentenceTransformer):
    try:
        import faiss
        with open("data/mitre_techniques.json", "r") as f:
            techniques = json.load(f)
        texts = [t["description"] for t in techniques]
        embeddings = embedder.encode(texts)
        dimension = embeddings.shape[1]
        index = faiss.IndexFlatL2(dimension)
        index.add(embeddings)
        return index, techniques
    except Exception as e:
        logger.error(f"Failed to build FAISS index: {e}")
        return None, None

# Lifespan manager (User Constraint 1 & 2)
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Loading sentence-transformers model...")
    # Bound to 'all-MiniLM-L6-v2' per user constraint
    app.state.embedder = SentenceTransformer("all-MiniLM-L6-v2")
    logger.info("Model loaded. Starting FAISS index build...")
    app.state.faiss_index, app.state.mitre_data = build_mitre_index(app.state.embedder)
    
    logger.info("Training IsolationForest model for anomaly detection...")
    app.state.iforest = IsolationForest(contamination=0.1, random_state=42)
    app.state.iforest.fit(BASELINE_FEATURE_ROWS)

    logger.info("Instantiating and fitting Threat Classifier on synthetic demo data...")
    if XGBOOST_AVAILABLE:
        app.state.classifier = XGBClassifier(n_estimators=50, max_depth=3, eval_metric="mlogloss")
    else:
        app.state.classifier = RandomForestClassifier(random_state=42)
    app.state.classifier.fit(
        [row for row, _ in CLASSIFIER_TRAINING_ROWS],
        [CLASSES.index(label) for _, label in CLASSIFIER_TRAINING_ROWS],
    )

    logger.info("Starting gRPC server in background...")
    grpc_thread = threading.Thread(target=grpc_server.serve_grpc, daemon=True)
    grpc_thread.start()

    logger.info("AI service ready.")
    yield
    logger.info("AI service shutting down.")

app = FastAPI(lifespan=lifespan)

# Models
class AlertRequest(BaseModel):
    raw_alert: dict

class QueryRequest(BaseModel):
    query: str

# Every LLM-backed feature routes through this one provider chain (see
# providers.PROVIDER_CHAIN) — NVIDIA first (primary provider for this
# deployment), then any other real providers that happen to be configured,
# in order. There is NO mock/fake fallback here: if nothing is configured,
# or every configured provider fails, the caller gets a real error and must
# surface "AI unavailable" — never fabricated content. This is the one
# place that enforces that rule for every feature below.

def _log_event(event: str, **fields) -> None:
    """Structured-ish log line: EVENT_NAME key=value key=value ... — never
    pass prompt text, alert payloads, or API keys/headers in fields."""
    rendered = " ".join(f"{k}={v}" for k, v in fields.items())
    logger.info(f"{event} {rendered}".rstrip())


async def _complete_via_chain(system_prompt: str, user_prompt: str, **kwargs) -> Tuple[str, str]:
    """Returns (provider_name, text) from the first configured provider
    that succeeds. Raises NoProviderConfiguredError or AllProvidersFailedError
    — callers must not fabricate a response in either case."""
    configured = [p for p in PROVIDER_CHAIN if p.is_configured()]
    if not configured:
        raise NoProviderConfiguredError("No AI provider has credentials configured")

    errors = []
    for provider in configured:
        try:
            text = await provider.complete(system_prompt, user_prompt, **kwargs)
            return provider.name, text
        except AIProviderError as e:
            logger.warning(f"AI_PROVIDER_FAILED provider={provider.name} category={e.category.value}")
            errors.append(e)
    raise AllProvidersFailedError(errors)


async def _stream_via_chain(system_prompt: str, user_prompt: str, **kwargs) -> AsyncGenerator[Tuple[str, str], None]:
    """Yields (provider_name, delta) from the first configured provider
    whose stream succeeds, trying the next configured provider if one fails
    BEFORE yielding any content. If a provider fails PARTWAY through (after
    already yielding real content), the failure is re-raised rather than
    silently switching — bytes already sent to the client can't be
    un-sent, so switching providers mid-stream would just produce garbled
    duplicate text."""
    configured = [p for p in PROVIDER_CHAIN if p.is_configured()]
    if not configured:
        raise NoProviderConfiguredError("No AI provider has credentials configured")

    errors = []
    for provider in configured:
        yielded_any = False
        try:
            async for delta in provider.stream(system_prompt, user_prompt, **kwargs):
                yielded_any = True
                yield provider.name, delta
            return
        except AIProviderError as e:
            if yielded_any:
                raise
            logger.warning(f"AI_PROVIDER_STREAM_FAILED provider={provider.name} category={e.category.value}")
            errors.append(e)
    raise AllProvidersFailedError(errors)


def _sse_event(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _unavailable_response(request_id: str, feature: str, error: Exception, started_at: float) -> JSONResponse:
    """The one place every non-streaming endpoint builds its 'AI is
    genuinely unavailable' response — never a 200 with fabricated content."""
    duration_ms = round((time.monotonic() - started_at) * 1000)
    if isinstance(error, NoProviderConfiguredError):
        status_code = 503
        category = "not_configured"
        message = "No AI provider is configured."
    else:
        status_code = 502
        category = "provider_error"
        message = "The AI provider is temporarily unavailable. Please try again."
    _log_event("AI_REQUEST_FAILED", feature=feature, request_id=request_id, error_category=category, duration_ms=duration_ms)
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "mode": "unavailable", "error": message},
        headers={"X-ACIS-AI-Mode": "unavailable"},
    )

# 5-dim feature vector shared by the anomaly + classifier models:
# [bytes_out_norm, failed_logins, has_admin_signal, has_lolbin_signal, severity_weight]
FEATURE_NAMES = ["bytes_out", "failed_logins", "admin_signal", "lolbin_signal", "severity_weight"]
SEVERITY_WEIGHTS = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}

def extract_features(event: dict) -> List[float]:
    action = str(event.get("action") or "").lower()
    raw = str(event.get("raw") or event.get("message") or "").lower()
    severity = str(event.get("severity") or "").lower()
    text = f"{action} {raw}"

    def to_float(value, default=0.0):
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    return [
        to_float(event.get("bytes_out") or event.get("outbound_bytes_mb"), 0.0),
        to_float(event.get("failed_logins") or event.get("failed_auth_count"), 0.0),
        1.0 if ("admin" in text or event.get("is_admin_account")) else 0.0,
        1.0 if any(k in text for k in ("powershell", "certutil", "lolbin", "mimikatz")) else 0.0,
        float(SEVERITY_WEIGHTS.get(severity, 0)),
    ]

BASELINE_FEATURE_ROWS = [
    [5, 0, 0, 0, 0],
    [10, 0, 0, 0, 1],
    [20, 1, 0, 0, 1],
    [8000, 5, 1, 1, 4],
]

CLASSES = ["malware", "exfiltration", "lateral_movement", "phishing", "privilege_escalation", "benign"]

# Small synthetic, clearly-labeled demo dataset used only because no real
# labeled training data exists yet — the classifier is genuinely fit on
# this and genuinely scores whatever features are extracted from the
# request, it just isn't backed by production telemetry.
CLASSIFIER_TRAINING_ROWS = [
    ([0, 0, 0, 0, 0], "benign"),
    ([15, 0, 0, 0, 0], "benign"),
    ([30, 1, 0, 0, 1], "benign"),
    ([500, 0, 0, 1, 3], "malware"),
    ([200, 0, 0, 1, 4], "malware"),
    ([9000, 0, 0, 0, 2], "exfiltration"),
    ([12000, 1, 0, 0, 3], "exfiltration"),
    ([50, 8, 0, 0, 3], "lateral_movement"),
    ([100, 12, 1, 0, 3], "lateral_movement"),
    ([20, 4, 0, 0, 2], "phishing"),
    ([40, 2, 0, 0, 3], "phishing"),
    ([60, 0, 1, 1, 4], "privilege_escalation"),
    ([90, 1, 1, 1, 4], "privilege_escalation"),
]

# ------------------------------------------------------------------------------------------------
# Internal REST endpoints (Callable by Spring Boot only, not Gateway - User Constraint 6)
# ------------------------------------------------------------------------------------------------

EXPLAIN_SYSTEM_PROMPT = (
    "You are a senior SOC analyst assistant. Given a security alert as a JSON object, "
    "respond with ONLY a JSON object with exactly two keys: \"explanation\" (2-4 plain-English "
    "sentences covering what happened and why it matters) and \"recommended_action\" (one concise, "
    "concrete next step for an analyst). No markdown, no code fences, no extra text — just the JSON object."
)

NL_TO_SPL_SYSTEM_PROMPT = (
    "Convert the natural language security query into Splunk-like SPL syntax. "
    "Available fields: index, sourcetype, src_ip, dest_ip, user, action, severity, timestamp. "
    "Respond with ONLY the SPL query string — no explanation, no markdown, no code fences."
)

# Separate, plain-prose system prompt for the streaming variant — the
# structured-JSON prompt above works well for the non-streaming endpoint
# (parsed whole once the response completes), but streaming raw JSON
# character-by-character to the UI would render as visible '{"explanation":'
# noise while it's still arriving. This asks for flowing prose instead so
# what streams in is directly displayable.
EXPLAIN_STREAM_SYSTEM_PROMPT = (
    "You are a senior SOC analyst assistant. Given a security alert as a JSON object, "
    "write a concise real-time analysis for the analyst reading it: 2-4 plain-English "
    "sentences covering what happened and why it matters, followed by one concrete "
    "recommended next step. Plain prose only — no markdown, no JSON, no code fences."
)


@app.post("/ai/explain")
async def explain_alert(request: AlertRequest):
    request_id = str(uuid.uuid4())
    started_at = time.monotonic()
    alert = request.raw_alert or {}
    _log_event("AI_REQUEST_STARTED", feature="explain", request_id=request_id)

    try:
        provider_name, completion = await _complete_via_chain(EXPLAIN_SYSTEM_PROMPT, json.dumps(alert, default=str))
    except (NoProviderConfiguredError, AllProvidersFailedError) as e:
        return _unavailable_response(request_id, "explain", e, started_at)

    parsed = parse_json_object(completion)
    if parsed and parsed.get("explanation"):
        explanation = parsed["explanation"]
        recommended_action = parsed.get("recommended_action") or "Review the alert details and assign an owner."
    else:
        # Model produced real output but didn't follow the JSON schema —
        # still genuine LLM output, just pass it through unstructured
        # rather than discarding it.
        explanation = completion
        recommended_action = "Review the alert details and assign an owner."

    duration_ms = round((time.monotonic() - started_at) * 1000)
    _log_event("AI_REQUEST_SUCCESS", feature="explain", request_id=request_id, provider=provider_name, duration_ms=duration_ms)
    # No "success" key here (unlike the error responses) — Java forwards
    # this body verbatim to the frontend's apiClient, whose response
    # interceptor treats ANY body containing a "success" key as its
    # {success, data} envelope convention and tries to unwrap a nonexistent
    # "data" field, corrupting a flat body like this one. Error responses
    # are unaffected: non-2xx statuses go through axios's rejection path,
    # not this unwrap.
    return JSONResponse(
        content={
            "explanation": explanation,
            "recommended_action": recommended_action,
            "provider": provider_name,
        },
        headers={"X-ACIS-AI-Mode": "live"},
    )


@app.post("/ai/explain/stream")
async def explain_alert_stream(request: AlertRequest):
    """
    Server-Sent Events variant of /ai/explain — streams real token-by-token
    output from the active provider as it arrives, instead of waiting for
    the full completion. Event payloads: {"mode": "live", "provider": "..."}
    once at the start, then repeated {"delta": "..."} chunks, then a final
    {"done": true} — or, if nothing is configured or every provider fails,
    {"error": "...", "mode": "unavailable"} followed by {"done": true}.
    Never fabricates content and never emits {"mode": "live"} unless a real
    provider actually returned real data.
    """
    request_id = str(uuid.uuid4())
    started_at = time.monotonic()
    alert = request.raw_alert or {}

    configured = [p for p in PROVIDER_CHAIN if p.is_configured()]
    if not configured:
        _log_event("AI_STREAM_FAILED", feature="explain_stream", request_id=request_id, error_category="not_configured")
        return JSONResponse(
            status_code=503,
            content={"success": False, "mode": "unavailable", "error": "No AI provider is configured."},
            headers={"X-ACIS-AI-Mode": "unavailable"},
        )

    async def event_stream():
        _log_event("AI_STREAM_STARTED", feature="explain_stream", request_id=request_id)
        got_any = False
        active_provider = None
        try:
            async for provider_name, delta in _stream_via_chain(EXPLAIN_STREAM_SYSTEM_PROMPT, json.dumps(alert, default=str)):
                if not got_any:
                    got_any = True
                    active_provider = provider_name
                    yield _sse_event({"mode": "live", "provider": provider_name})
                yield _sse_event({"delta": delta})
        except AllProvidersFailedError as e:
            duration_ms = round((time.monotonic() - started_at) * 1000)
            _log_event("AI_STREAM_FAILED", feature="explain_stream", request_id=request_id, error_category="provider_error", duration_ms=duration_ms)
            yield _sse_event({"error": "The AI provider is temporarily unavailable. Please try again.", "mode": "unavailable"})
            yield _sse_event({"done": True})
            return

        duration_ms = round((time.monotonic() - started_at) * 1000)
        _log_event("AI_STREAM_COMPLETED", feature="explain_stream", request_id=request_id, provider=active_provider, duration_ms=duration_ms)
        yield _sse_event({"done": True})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/ai/query")
async def nl_to_spl(request: QueryRequest):
    request_id = str(uuid.uuid4())
    started_at = time.monotonic()
    _log_event("AI_REQUEST_STARTED", feature="query", request_id=request_id)

    try:
        provider_name, completion = await _complete_via_chain(NL_TO_SPL_SYSTEM_PROMPT, request.query, max_tokens=256, temperature=0.0)
    except (NoProviderConfiguredError, AllProvidersFailedError) as e:
        return _unavailable_response(request_id, "query", e, started_at)

    spl = completion.strip().strip("`").strip()
    if not spl:
        # Providers already reject empty completions before returning
        # (AIErrorCategory.EMPTY_RESPONSE), but stripping code-fence/backtick
        # artifacts here could theoretically leave nothing — guard it too.
        duration_ms = round((time.monotonic() - started_at) * 1000)
        _log_event("AI_REQUEST_FAILED", feature="query", request_id=request_id, error_category="empty_response", duration_ms=duration_ms)
        return JSONResponse(
            status_code=502,
            content={"success": False, "mode": "unavailable", "error": "AI response was empty."},
            headers={"X-ACIS-AI-Mode": "unavailable"},
        )

    duration_ms = round((time.monotonic() - started_at) * 1000)
    _log_event("AI_REQUEST_SUCCESS", feature="query", request_id=request_id, provider=provider_name, duration_ms=duration_ms)
    # No "success" key on the success body — see the matching comment in
    # explain_alert() above for why.
    return JSONResponse(content={"spl": spl, "provider": provider_name}, headers={"X-ACIS-AI-Mode": "live"})

@app.post("/ai/anomaly")
async def detect_anomaly(event: dict):
    features = extract_features(event)
    score = float(app.state.iforest.decision_function([features])[0])
    deviations = sorted(
        zip(FEATURE_NAMES, features),
        key=lambda pair: abs(pair[1]),
        reverse=True,
    )
    top_features = [name for name, _ in deviations[:2] if _ != 0] or ["none"]
    return {
        "anomaly_score": max(0.0, -score),
        "is_anomaly": score < 0,
        "top_features": top_features,
    }

@app.post("/ai/classify")
async def classify_threat(event: dict):
    features = extract_features(event)
    probabilities = app.state.classifier.predict_proba([features])[0]
    prob_map = {CLASSES[i]: float(p) for i, p in enumerate(probabilities)}
    predicted = max(prob_map, key=prob_map.get)
    return {
        "predicted_class": predicted,
        "confidence": prob_map[predicted],
        "probabilities": prob_map,
    }

@app.get("/ai/health")
async def health_check():
    provider_status = {p.name: p.is_configured() for p in PROVIDER_CHAIN}
    return {
        "status": "ok",
        "components": {
            "xgboost": XGBOOST_AVAILABLE,
            "threat_intel_configured": threat_intel_client.is_configured(),
            **{f"{name}_llm_configured": configured for name, configured in provider_status.items()},
        },
        # Callers (Java's /ai-health passthrough) use this to report an
        # honest "AI Agent Ready"/"Offline" status — "ok" above only means
        # this process is up, not that any LLM feature can actually work.
        "llm_provider_configured": any(provider_status.values()),
        "llm_providers_available": [name for name, configured in provider_status.items() if configured],
    }

@app.post("/ai/mitre")
async def mitre_map(request: QueryRequest):
    # Map a free-text description to a MITRE ATT&CK technique using the FAISS index if available
    query = request.query
    if getattr(app.state, 'faiss_index', None) is None or app.state.mitre_data is None:
        # Fallback mock response
        return JSONResponse(content={"technique_id": "T1566.001", "technique_name": "Spearphishing Attachment", "tactic": "initial-access", "similarity": 0.93}, headers={"X-ACIS-AI-Mode": "mock"})

    try:
        import numpy as np
        q_emb = app.state.embedder.encode([query])
        D, I = app.state.faiss_index.search(np.array(q_emb).astype('float32'), 1)
        idx = int(I[0][0])
        technique = app.state.mitre_data[idx]
        return {
            "technique_id": technique.get("id"),
            "technique_name": technique.get("name"),
            "tactic": technique.get("tactic"),
            "similarity": float(D[0][0])
        }
    except Exception as e:
        logger.error(f"MITRE mapping failed: {e}")
        return JSONResponse(content={"technique_id": "T1566.001", "technique_name": "Spearphishing Attachment", "tactic": "initial-access", "similarity": 0.0}, headers={"X-ACIS-AI-Mode": "mock"})
# gRPC will be started independently below if `__name__ == '__main__'`
def serve_grpc():
    import grpc
    from concurrent import futures
    # In a full build, we map grpc stubs to Threat Intel logic.
    pass

if __name__ == "__main__":
    import uvicorn
    # Start REST server
    uvicorn.run(app, host="0.0.0.0", port=8090)
