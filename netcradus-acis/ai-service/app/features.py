"""Shared feature extraction + class definitions for the threat classifier.

Split out from main.py so training.py can import them without a circular
import (main.py -> training.py -> features.py, never the other way).
"""
from typing import List

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

# Startup-only bootstrap so /ai/classify returns something before any real
# analyst-confirmed label exists. Real retraining (see training.py) replaces
# this with a model fit purely on real labeled alerts once enough exist -
# this synthetic set is never touched again after the very first fit and is
# never counted as "real training data" anywhere in the retraining pipeline.
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
