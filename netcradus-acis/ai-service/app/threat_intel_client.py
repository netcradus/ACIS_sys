"""
Real IOC enrichment against VirusTotal (and, optionally, AbuseIPDB for IPs).
Both are opt-in via environment variables — with neither configured, callers
get an explicit "not configured" result instead of fabricated data.
"""
import logging
import os
import re
from typing import Optional

import httpx

logger = logging.getLogger("ai-service.threat_intel")

VT_API_KEY = os.environ.get("VIRUSTOTAL_API_KEY", "")
ABUSEIPDB_API_KEY = os.environ.get("ABUSEIPDB_API_KEY", "")
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("THREAT_INTEL_TIMEOUT_SECONDS", "15"))

VT_BASE_URL = "https://www.virustotal.com/api/v3"
ABUSEIPDB_BASE_URL = "https://api.abuseipdb.com/api/v2/check"

_IPV4_RE = re.compile(r"^(\d{1,3}\.){3}\d{1,3}$")
_HASH_RE = re.compile(r"^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$|^[a-fA-F0-9]{64}$")


def is_virustotal_configured() -> bool:
    return bool(VT_API_KEY)


def is_abuseipdb_configured() -> bool:
    return bool(ABUSEIPDB_API_KEY)


def is_configured() -> bool:
    return is_virustotal_configured() or is_abuseipdb_configured()


def detect_indicator_type(indicator: str, type_hint: str = "") -> str:
    """Best-effort classification — the caller's type_hint is honored only
    when it matches a known value; the frontend currently never sends one
    (always defaults to "UNKNOWN"), so real detection happens here."""
    hint = (type_hint or "").strip().upper()
    if hint in ("IP", "DOMAIN", "HASH"):
        return hint
    value = indicator.strip()
    if _IPV4_RE.match(value) or ":" in value:
        return "IP"
    if _HASH_RE.match(value):
        return "HASH"
    return "DOMAIN"


def _vt_lookup(indicator: str, indicator_type: str) -> Optional[dict]:
    path = {
        "IP": f"/ip_addresses/{indicator}",
        "DOMAIN": f"/domains/{indicator}",
        "HASH": f"/files/{indicator}",
    }[indicator_type]

    try:
        resp = httpx.get(
            f"{VT_BASE_URL}{path}",
            headers={"x-apikey": VT_API_KEY},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as e:
        logger.warning(f"VirusTotal request failed for {indicator}: {e}")
        return None

    if resp.status_code == 404:
        return {"found": False}
    if resp.status_code != 200:
        logger.warning(f"VirusTotal returned HTTP {resp.status_code} for {indicator}: {resp.text[:300]}")
        return None

    attrs = resp.json().get("data", {}).get("attributes", {})
    stats = attrs.get("last_analysis_stats") or {}
    malicious = stats.get("malicious", 0)
    suspicious = stats.get("suspicious", 0)
    total = sum(stats.values()) or 0

    categories = set()
    raw_categories = attrs.get("categories")
    if isinstance(raw_categories, dict):
        categories.update(raw_categories.values())
    threat_label = (attrs.get("popular_threat_classification") or {}).get("suggested_threat_label")
    if threat_label:
        categories.add(threat_label)

    return {
        "found": True,
        "malicious": malicious,
        "suspicious": suspicious,
        "total": total,
        "reputation": attrs.get("reputation"),
        "categories": sorted(categories),
    }


def _abuseipdb_lookup(ip: str) -> Optional[dict]:
    try:
        resp = httpx.get(
            ABUSEIPDB_BASE_URL,
            headers={"Key": ABUSEIPDB_API_KEY, "Accept": "application/json"},
            params={"ipAddress": ip, "maxAgeInDays": 90},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as e:
        logger.warning(f"AbuseIPDB request failed for {ip}: {e}")
        return None

    if resp.status_code != 200:
        logger.warning(f"AbuseIPDB returned HTTP {resp.status_code} for {ip}: {resp.text[:300]}")
        return None

    data = resp.json().get("data", {})
    return {
        "abuse_confidence_score": data.get("abuseConfidenceScore", 0),
        "total_reports": data.get("totalReports", 0),
        "is_whitelisted": data.get("isWhitelisted"),
    }


def enrich(indicator: str, type_hint: str = "") -> dict:
    """
    Returns { threat_score: int 0-100, categories: [str], description: str, source: str }.
    Never raises — any failure degrades to a clearly-labeled "unknown" result
    rather than fabricated maliciousness.
    """
    indicator_type = detect_indicator_type(indicator, type_hint)

    if not is_configured():
        return {
            "threat_score": 0,
            "categories": ["unconfigured"],
            "description": (
                "No threat intelligence source is configured (VirusTotal/AbuseIPDB). "
                "This is not a verdict — set VIRUSTOTAL_API_KEY and/or ABUSEIPDB_API_KEY "
                "to get a real enrichment result."
            ),
            "source": "none",
        }

    vt_result = _vt_lookup(indicator, indicator_type) if is_virustotal_configured() else None
    abuse_result = (
        _abuseipdb_lookup(indicator)
        if indicator_type == "IP" and is_abuseipdb_configured()
        else None
    )

    if vt_result is None and abuse_result is None:
        return {
            "threat_score": 0,
            "categories": ["lookup-failed"],
            "description": f"Threat intelligence lookup for {indicator} failed — see ai-service logs for details.",
            "source": "error",
        }

    scores = []
    categories: set = set()
    description_parts = []

    if vt_result and vt_result.get("found"):
        total = vt_result["total"]
        flagged = vt_result["malicious"] + vt_result["suspicious"]
        vt_score = round((flagged / total) * 100) if total else 0
        scores.append(vt_score)
        categories.update(vt_result["categories"])
        description_parts.append(
            f"VirusTotal: {vt_result['malicious']} of {total} vendors flagged this {indicator_type.lower()} "
            f"as malicious ({vt_result['suspicious']} additional as suspicious)."
        )
    elif vt_result and not vt_result.get("found"):
        description_parts.append("VirusTotal has no record of this indicator.")

    if abuse_result:
        scores.append(abuse_result["abuse_confidence_score"])
        description_parts.append(
            f"AbuseIPDB: {abuse_result['abuse_confidence_score']}% abuse confidence "
            f"across {abuse_result['total_reports']} reports."
        )

    threat_score = max(scores) if scores else 0

    return {
        "threat_score": threat_score,
        "categories": sorted(categories) if categories else (["clean"] if threat_score == 0 else ["flagged"]),
        "description": " ".join(description_parts) or f"No threat data found for {indicator}.",
        "source": "+".join(
            s for s, present in (("virustotal", bool(vt_result)), ("abuseipdb", bool(abuse_result))) if present
        ),
    }
