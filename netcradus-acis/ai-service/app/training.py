"""Real classifier retraining pipeline.

Trains exclusively on analyst-confirmed alert labels fetched from acis-alerts
(GET /api/alerts/labeled) - never synthetic data. Every trained version is
persisted to disk with real evaluation metrics computed on a held-out test
split, so "which model is live" and "how good is it" are both verifiable
facts, not claims. Supports manual trigger, a background scheduler (daily +
every N new labels), deploy-if-better, and rollback to any prior version.
"""
import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

from .features import CLASSES, extract_features

logger = logging.getLogger("ai-service.training")

MODELS_DIR = Path(os.environ.get("AI_MODELS_DIR", "models"))
MODELS_DIR.mkdir(parents=True, exist_ok=True)
MANIFEST_PATH = MODELS_DIR / "manifest.json"

ALERTS_SERVICE_URL = os.environ.get("ALERTS_SERVICE_URL", "http://localhost:8081")
INTERNAL_SERVICE_KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")

# A stratified train/test split needs at least 2 examples of the rarest
# class actually present; below MIN_SAMPLES_TO_TRAIN total we don't even
# attempt it - "not enough real labels yet" is the honest status, not a
# model trained on 3 examples that would just be noise.
MIN_SAMPLES_TO_TRAIN = 20
LABEL_COUNT_TRIGGER = 50
DAILY_INTERVAL_SECONDS = 24 * 60 * 60
SCHEDULER_CHECK_INTERVAL_SECONDS = 15 * 60

_manifest_lock = threading.Lock()
_train_lock = threading.Lock()
_is_training = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_manifest() -> dict:
    return {
        "versions": [],
        "active_version": None,
        "last_trained_at": None,
        "last_train_label_count": 0,
    }


def load_manifest() -> dict:
    with _manifest_lock:
        if MANIFEST_PATH.exists():
            try:
                return json.loads(MANIFEST_PATH.read_text())
            except Exception as e:
                logger.warning(f"Failed to read model manifest, starting fresh: {e}")
        return _empty_manifest()


def _save_manifest(manifest: dict) -> None:
    with _manifest_lock:
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))


def fetch_labeled_samples() -> list:
    """Real analyst-confirmed labels from acis-alerts - the actual training data."""
    if not INTERNAL_SERVICE_KEY:
        raise RuntimeError("INTERNAL_SERVICE_KEY not configured - cannot fetch real labeled data")
    headers = {"X-Internal-Service-Key": INTERNAL_SERVICE_KEY}
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(f"{ALERTS_SERVICE_URL}/api/alerts/labeled", headers=headers)
        resp.raise_for_status()
        return resp.json()


def _classifier_factory():
    try:
        from xgboost import XGBClassifier
        return XGBClassifier(n_estimators=50, max_depth=3, eval_metric="mlogloss")
    except ImportError:
        from sklearn.ensemble import RandomForestClassifier
        return RandomForestClassifier(random_state=42)


def _model_path(version_id: str) -> Path:
    return MODELS_DIR / f"classifier_{version_id}.joblib"


def train_and_evaluate(samples: list) -> Optional[dict]:
    """Real stratified train/test split, real fit, real evaluation on the
    held-out test half. Returns None (does not train) if there isn't enough
    real labeled data yet - never trains on a fabricated/padded dataset."""
    if len(samples) < MIN_SAMPLES_TO_TRAIN:
        logger.info(f"AI_RETRAIN_SKIPPED reason=insufficient_data samples={len(samples)} required={MIN_SAMPLES_TO_TRAIN}")
        return None

    X, y = [], []
    for s in samples:
        label = s.get("confirmedCategory")
        event = s.get("event") or {}
        if label not in CLASSES:
            continue
        X.append(extract_features(event))
        y.append(CLASSES.index(label))

    if len(X) < MIN_SAMPLES_TO_TRAIN:
        return None

    distinct_classes = set(y)
    if len(distinct_classes) < 2:
        logger.info("AI_RETRAIN_SKIPPED reason=single_class_only")
        return None

    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        stratified = True
    except ValueError:
        # A class with only 1 real example can't be stratified - fall back
        # to a plain random split rather than refusing to train at all.
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )
        stratified = False

    model = _classifier_factory()
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    accuracy = float(accuracy_score(y_test, y_pred))
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test, y_pred, average="macro", zero_division=0
    )

    return {
        "model": model,
        "metrics": {
            "accuracy": round(accuracy, 4),
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1": round(float(f1), 4),
            "trainSampleCount": len(X_train),
            "testSampleCount": len(X_test),
            "totalLabeledSampleCount": len(X),
            "distinctClassesInTraining": len(distinct_classes),
            "stratified": stratified,
        },
    }


def run_training_cycle(app_state, trigger: str) -> dict:
    """The one entry point for both the manual-trigger endpoint and the
    scheduler. Fetches real labels, trains+evaluates, saves a new version,
    and deploys it only if it's at least as good as the currently active
    real-trained version (a version trained on the startup synthetic bootstrap
    is never treated as a real baseline to beat)."""
    global _is_training
    if not _train_lock.acquire(blocking=False):
        return {"status": "already_training"}
    try:
        _is_training = True
        logger.info(f"AI_RETRAIN_STARTED trigger={trigger}")
        try:
            samples = fetch_labeled_samples()
        except Exception as e:
            logger.warning(f"AI_RETRAIN_FAILED reason=fetch_error error={e}")
            return {"status": "failed", "reason": f"Could not fetch labeled alerts: {e}"}

        result = train_and_evaluate(samples)
        manifest = load_manifest()
        if result is None:
            manifest["last_attempted_at"] = _now_iso()
            manifest["last_attempted_label_count"] = len(samples)
            _save_manifest(manifest)
            return {
                "status": "insufficient_data",
                "labeledSampleCount": len(samples),
                "minimumRequired": MIN_SAMPLES_TO_TRAIN,
            }

        version_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        joblib.dump(result["model"], _model_path(version_id))

        active_version = manifest.get("active_version")
        active_entry = next((v for v in manifest["versions"] if v["versionId"] == active_version), None)
        # Only compare against a PRIOR REAL-TRAINED version - the very first
        # real version always deploys, since the synthetic bootstrap it's
        # replacing was never evaluated on real data at all.
        should_deploy = active_entry is None or result["metrics"]["accuracy"] >= active_entry["metrics"]["accuracy"]

        version_entry = {
            "versionId": version_id,
            "trainedAt": _now_iso(),
            "trigger": trigger,
            "metrics": result["metrics"],
            "deployed": should_deploy,
        }
        manifest["versions"].append(version_entry)
        manifest["last_trained_at"] = _now_iso()
        manifest["last_train_label_count"] = len(samples)

        if should_deploy:
            manifest["active_version"] = version_id
            # Exactly one version is ever "deployed" - clear the flag on every
            # other version now that this one has taken over as active.
            for v in manifest["versions"]:
                v["deployed"] = v["versionId"] == version_id
            app_state.classifier = result["model"]
            app_state.classifier_version = version_id
            app_state.classifier_is_real_trained = True
            logger.info(f"AI_RETRAIN_DEPLOYED version={version_id} accuracy={result['metrics']['accuracy']}")
        else:
            logger.info(f"AI_RETRAIN_NOT_DEPLOYED version={version_id} "
                        f"newAccuracy={result['metrics']['accuracy']} "
                        f"activeAccuracy={active_entry['metrics']['accuracy']}")

        _save_manifest(manifest)
        return {"status": "trained", "version": version_entry}
    finally:
        _is_training = False
        _train_lock.release()


def rollback_to(app_state, version_id: str) -> dict:
    manifest = load_manifest()
    entry = next((v for v in manifest["versions"] if v["versionId"] == version_id), None)
    if entry is None:
        return {"status": "not_found"}
    path = _model_path(version_id)
    if not path.exists():
        return {"status": "model_file_missing"}

    model = joblib.load(path)
    app_state.classifier = model
    app_state.classifier_version = version_id
    app_state.classifier_is_real_trained = True
    manifest["active_version"] = version_id
    for v in manifest["versions"]:
        v["deployed"] = v["versionId"] == version_id
    _save_manifest(manifest)
    logger.info(f"AI_MODEL_ROLLBACK version={version_id}")
    return {"status": "rolled_back", "version": entry}


def is_training() -> bool:
    return _is_training


def get_status(app_state) -> dict:
    manifest = load_manifest()
    active_version = manifest.get("active_version")
    active_entry = next((v for v in manifest["versions"] if v["versionId"] == active_version), None)
    return {
        "isTraining": _is_training,
        "usingRealTrainedModel": bool(getattr(app_state, "classifier_is_real_trained", False)),
        "activeVersion": active_version,
        "activeVersionMetrics": active_entry["metrics"] if active_entry else None,
        "lastTrainedAt": manifest.get("last_trained_at"),
        "lastTrainLabelCount": manifest.get("last_train_label_count", 0),
        "versionHistory": list(reversed(manifest.get("versions", [])))[:20],
        "minimumSamplesRequired": MIN_SAMPLES_TO_TRAIN,
        "labelCountTrigger": LABEL_COUNT_TRIGGER,
    }


def restore_active_model_on_startup(app_state) -> bool:
    """Loads the last-deployed real model from disk on process start, if one
    exists, so a container restart doesn't silently drop back to the
    synthetic bootstrap. Returns True if a real model was restored."""
    manifest = load_manifest()
    active_version = manifest.get("active_version")
    if not active_version:
        return False
    path = _model_path(active_version)
    if not path.exists():
        logger.warning(f"Active model version {active_version} in manifest but file missing - staying on bootstrap model")
        return False
    try:
        app_state.classifier = joblib.load(path)
        app_state.classifier_version = active_version
        app_state.classifier_is_real_trained = True
        logger.info(f"Restored real-trained classifier version {active_version} from disk")
        return True
    except Exception as e:
        logger.warning(f"Failed to restore model version {active_version}: {e}")
        return False


def start_scheduler(app_state) -> None:
    """Background thread (not asyncio - keeps this independent of the
    request event loop) checking every 15 minutes whether either real
    trigger condition is met: 24h since last training, or 50+ new real
    labels accumulated since the last run."""

    def _loop():
        while True:
            time.sleep(SCHEDULER_CHECK_INTERVAL_SECONDS)
            try:
                manifest = load_manifest()
                last_trained_at = manifest.get("last_trained_at")
                due_by_schedule = True
                if last_trained_at:
                    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(last_trained_at)).total_seconds()
                    due_by_schedule = elapsed >= DAILY_INTERVAL_SECONDS

                due_by_label_count = False
                try:
                    samples = fetch_labeled_samples()
                    new_since_last = len(samples) - manifest.get("last_train_label_count", 0)
                    due_by_label_count = new_since_last >= LABEL_COUNT_TRIGGER
                except Exception as e:
                    logger.debug(f"Scheduler label-count check failed (non-fatal): {e}")

                if due_by_schedule or due_by_label_count:
                    trigger = "scheduled_daily" if due_by_schedule and not due_by_label_count else \
                        ("label_threshold" if due_by_label_count and not due_by_schedule else "scheduled_daily+label_threshold")
                    run_training_cycle(app_state, trigger=trigger)
            except Exception as e:
                logger.warning(f"AI_RETRAIN_SCHEDULER_ERROR error={e}")

    thread = threading.Thread(target=_loop, daemon=True, name="ai-retrain-scheduler")
    thread.start()
    logger.info(f"Retraining scheduler started (daily + every {LABEL_COUNT_TRIGGER} new labels, checked every {SCHEDULER_CHECK_INTERVAL_SECONDS}s)")
