import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sklearn.ensemble import IsolationForest
from typing import List, Optional
import threading
from . import grpc_server
from . import kiro_client
from . import groq_client
from . import threat_intel_client

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

# /ai/explain and /ai/query try Groq first (official free tier), then
# kiro_client (opt-in, unofficial), and fall back to the honest mock
# templates below — tagged via X-ACIS-AI-Mode — whenever neither is
# configured or both fail. The fallback must never raise; a broken LLM
# backend should degrade to mock mode, not break the endpoint.

async def _llm_complete(system_prompt: str, user_prompt: str, **kwargs) -> Optional[str]:
    if groq_client.is_configured():
        try:
            return await groq_client.chat_completion(system_prompt, user_prompt, **kwargs)
        except groq_client.GroqUnavailableError as e:
            logger.warning(f"Groq unavailable, trying next backend: {e}")
    if kiro_client.is_configured():
        try:
            return await kiro_client.chat_completion(system_prompt, user_prompt, **kwargs)
        except kiro_client.KiroUnavailableError as e:
            logger.warning(f"Kiro gateway unavailable: {e}")
    return None

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


@app.post("/ai/explain")
async def explain_alert(request: AlertRequest):
    alert = request.raw_alert or {}
    title = alert.get("title") or alert.get("name") or "this alert"
    severity = str(alert.get("severity") or "medium").lower()
    completion = await _llm_complete(EXPLAIN_SYSTEM_PROMPT, json.dumps(alert, default=str))
    if completion is not None:
        parsed = kiro_client.parse_json_object(completion)
        if parsed and parsed.get("explanation"):
            return JSONResponse(
                content={
                    "explanation": parsed["explanation"],
                    "recommended_action": parsed.get("recommended_action")
                    or "Review the alert details and assign an owner.",
                },
                headers={"X-ACIS-AI-Mode": "live"},
            )
        # Model produced real output but didn't follow the JSON schema —
        # still genuine LLM output, just pass it through unstructured
        # rather than discarding it.
        return JSONResponse(
            content={
                "explanation": completion,
                "recommended_action": "Review the alert details and assign an owner.",
            },
            headers={"X-ACIS-AI-Mode": "live"},
        )

    return JSONResponse(
        content={
            "explanation": (
                f"[Simulated — no LLM configured] {title} was flagged at {severity} severity. "
                "This is a template response; enable an LLM provider to get a real narrative explanation."
            ),
            "recommended_action": "Isolate the affected asset and review the raw event before dismissing this alert."
        },
        headers={"X-ACIS-AI-Mode": "mock"}
    )

@app.post("/ai/query")
async def nl_to_spl(request: QueryRequest):
    completion = await _llm_complete(NL_TO_SPL_SYSTEM_PROMPT, request.query, max_tokens=256, temperature=0.0)
    if completion is not None:
        spl = completion.strip().strip("`").strip()
        return JSONResponse(content={"spl": spl}, headers={"X-ACIS-AI-Mode": "live"})

    return JSONResponse(
        content={"spl": f'index=acis sourcetype=firewall | search "{request.query}" | stats count by dest_ip'},
        headers={"X-ACIS-AI-Mode": "mock"}
    )

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
    return {
        "status": "ok",
        "components": {
            "xgboost": XGBOOST_AVAILABLE,
            "groq_llm_configured": groq_client.is_configured(),
            "kiro_llm_configured": kiro_client.is_configured(),
            "threat_intel_configured": threat_intel_client.is_configured(),
        },
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
