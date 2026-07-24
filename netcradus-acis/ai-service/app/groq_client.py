"""
Real client for Groq's OpenAI-compatible /chat/completions endpoint — an
officially-supported free tier (not a reverse-engineered proxy like
kiro-gateway), used as the primary LLM backend for /ai/explain and /ai/query.

GROQ_API_KEY / GROQ_MODEL are read from the environment so this module has
no dependency on how the caller is deployed (docker-compose service, bare
host, etc). Get a free key at https://console.groq.com/keys.
"""
import json
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger("ai-service.groq_client")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("GROQ_REQUEST_TIMEOUT_SECONDS", "30"))


class GroqUnavailableError(Exception):
    """Raised whenever Groq isn't configured, unreachable, or errors — callers should fall back, never surface this as a hard failure."""


def is_configured() -> bool:
    return bool(GROQ_API_KEY)


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


async def chat_completion(system_prompt: str, user_prompt: str, *, max_tokens: int = 1024, temperature: float = 0.2) -> str:
    if not is_configured():
        raise GroqUnavailableError("GROQ_API_KEY not configured")

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(f"{GROQ_BASE_URL}/chat/completions", json=payload, headers=headers)
            if response.status_code != 200:
                raise GroqUnavailableError(
                    f"Groq returned HTTP {response.status_code}: {response.text[:500]!r}"
                )
            data = response.json()
    except httpx.HTTPError as e:
        raise GroqUnavailableError(f"Groq request failed: {e}") from e

    choices = data.get("choices") or []
    if not choices:
        raise GroqUnavailableError("Groq returned no choices")
    content = (choices[0].get("message") or {}).get("content", "").strip()
    if not content:
        raise GroqUnavailableError("Groq returned an empty completion")
    return content
