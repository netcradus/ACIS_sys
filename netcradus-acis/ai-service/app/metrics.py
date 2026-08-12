import threading
import time
from collections import deque
from typing import Optional


class AIMetricsTracker:
    """Real, in-process metrics for the LLM provider chain — request volume,
    success rate, latency, and which provider actually served each request.

    This deliberately does NOT track "accuracy"/"recall"/"novelty": those
    require labeled ground truth this system has none of (see the Dashboard's
    AI Model Performance widget — it now surfaces exactly these numbers
    instead of ones that could never be genuinely computed).
    """

    def __init__(self, window_size: int = 200):
        self._lock = threading.Lock()
        self._window_size = window_size
        self._recent = deque(maxlen=window_size)
        self._total_requests = 0
        self._total_success = 0
        self._total_failed = 0

    def record(self, feature: str, provider: Optional[str], duration_ms: float, success: bool) -> None:
        with self._lock:
            self._total_requests += 1
            if success:
                self._total_success += 1
            else:
                self._total_failed += 1
            self._recent.append({
                "feature": feature,
                "provider": provider,
                "duration_ms": duration_ms,
                "success": success,
                "ts": time.time(),
            })

    def snapshot(self) -> dict:
        with self._lock:
            recent = list(self._recent)
            total_requests = self._total_requests
            total_success = self._total_success
            total_failed = self._total_failed

        success_rate = round((total_success / total_requests) * 100, 1) if total_requests else None

        durations = sorted(r["duration_ms"] for r in recent if r["success"])
        avg_latency_ms = round(sum(durations) / len(durations), 1) if durations else None
        p95_latency_ms = None
        if durations:
            idx = min(len(durations) - 1, int(round(0.95 * (len(durations) - 1))))
            p95_latency_ms = round(durations[idx], 1)

        provider_breakdown: dict = {}
        for r in recent:
            if r["success"] and r["provider"]:
                provider_breakdown[r["provider"]] = provider_breakdown.get(r["provider"], 0) + 1

        return {
            "totalRequests": total_requests,
            "successCount": total_success,
            "failedCount": total_failed,
            "successRatePercent": success_rate,
            "avgLatencyMs": avg_latency_ms,
            "p95LatencyMs": p95_latency_ms,
            "providerBreakdown": provider_breakdown,
            "recentSampleSize": len(recent),
        }


ai_metrics = AIMetricsTracker()
