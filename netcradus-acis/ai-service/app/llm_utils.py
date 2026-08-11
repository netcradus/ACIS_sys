"""
Shared helpers for parsing LLM completions — used by main.py to extract a
structured {explanation, recommended_action} object out of /ai/explain's
real provider output.
"""
import json
from typing import Optional


def parse_json_object(text: str) -> Optional[dict]:
    """Best-effort parse of a JSON object out of an LLM completion, tolerating ```json fences."""
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if candidate.lower().startswith("json"):
            candidate = candidate[4:]
        candidate = candidate.strip()
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except ValueError:
        return None
