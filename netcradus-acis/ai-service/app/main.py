import os
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
import grpc_server

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
    app.state.iforest = IsolationForest(contamination=0.1)
    app.state.iforest.fit([[1]*5, [1]*5, [10]*5]) # dummy fit
    
    logger.info("Instantiating Threat Classifier...")
    if XGBOOST_AVAILABLE:
        app.state.classifier = XGBClassifier()
        # dummy fit not provided directly for XGBoost as it requires labels, using basic mock strategy
    else:
        app.state.classifier = RandomForestClassifier()
        app.state.classifier.fit([[0,0], [1,1]], [0, 1])
    
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

def get_llm_mode():
    api_key1 = os.environ.get("OPENAI_API_KEY")
    api_key2 = os.environ.get("ANTHROPIC_API_KEY")
    if api_key1 or api_key2:
        return "live"
    return "mock"

# ------------------------------------------------------------------------------------------------
# Internal REST endpoints (Callable by Spring Boot only, not Gateway - User Constraint 6)
# ------------------------------------------------------------------------------------------------

@app.post("/ai/explain")
async def explain_alert(request: AlertRequest):
    mode = get_llm_mode()
    if mode == "mock":
        return JSONResponse(
            content={
                "explanation": "This is a simulated explanation because Language Models are running in DEMO mode. The raw alert detected a potential incident requiring analyst review.",
                "recommended_action": "Isolate the compromised endpoint and reset the user credentials."
            },
            headers={"X-ACIS-AI-Mode": "mock"}
        )
    return {"explanation": "Live explanation goes here", "recommended_action": "Action"}

@app.post("/ai/query")
async def nl_to_spl(request: QueryRequest):
    mode = get_llm_mode()
    if mode == "mock":
        # Returning a parsed SPL string for demonstration
        return JSONResponse(
            content={"spl": f'index=acis sourcetype=firewall | search "{request.query}" | stats count by dest_ip'},
            headers={"X-ACIS-AI-Mode": "mock"}
        )
    return {"spl": "Live SPL string goes here"}

@app.post("/ai/anomaly")
async def detect_anomaly(event: dict):
    # In a real scenario, extract features and use app.state.iforest
    score = float(app.state.iforest.decision_function([[1, 2, 3, 4, 5]])[0])
    return {"anomaly_score": max(0.0, score), "is_anomaly": score < 0, "top_features": ["bytes_out", "failed_logins"]}

@app.post("/ai/classify")
async def classify_threat(event: dict):
    return {"predicted_class": "lateral_movement", "confidence": 0.89, "probabilities": {"lateral_movement": 0.89, "benign": 0.11}}

@app.get("/ai/health")
async def health_check():
    return {"status": "ok", "components": {"xgboost": XGBOOST_AVAILABLE}}

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
