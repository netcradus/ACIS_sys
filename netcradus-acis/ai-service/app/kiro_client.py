"""
Real client for kiro-gateway's OpenAI-compatible /v1/chat/completions
endpoint. See project notes for what kiro-gateway actually is (an
unofficial, community-maintained proxy onto Kiro's backend) before
enabling this — it is opt-in and disabled by default (see is_configured()).

KIRO_GATEWAY_URL / KIRO_GATEWAY_API_KEY / KIRO_MODEL are read from the
environment so this module has no dependency on how the caller is deployed
(docker-compose service, bare host, etc).
"""
import json
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger("ai-service.kiro_client")

KIRO_GATEWAY_URL = os.environ.get("KIRO_GATEWAY_URL", "").rstrip("/")
KIRO_GATEWAY_API_KEY = os.environ.get("KIRO_GATEWAY_API_KEY", "")
KIRO_MODEL = os.environ.get("KIRO_MODEL", "claude-sonnet-4-5")
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("KIRO_REQUEST_TIMEOUT_SECONDS", "30"))


class KiroUnavailableError(Exception):
    """Raised whenever the gateway isn't configured, unreachable, or errors — callers should fall back to mock mode, never surface this to the end user as a hard failure."""


def is_configured() -> bool:
    return bool(KIRO_GATEWAY_URL and KIRO_GATEWAY_API_KEY)


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
    """
    Requests a streamed completion from kiro-gateway and reassembles it into
    a single string. Streaming (rather than a plain request) is used
    deliberately: kiro-gateway's own docs describe first-token timeout/retry
    handling specifically for streamed requests, making it the more reliable
    mode against this particular backend — not because ACIS needs
    token-by-token delivery here (this function returns the full text).
    """
    if not is_configured():
        raise KiroUnavailableError("KIRO_GATEWAY_URL / KIRO_GATEWAY_API_KEY not configured")

    payload = {
        "model": KIRO_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": True,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {KIRO_GATEWAY_API_KEY}",
        "Content-Type": "application/json",
    }

    chunks: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            async with client.stream(
                "POST", f"{KIRO_GATEWAY_URL}/v1/chat/completions", json=payload, headers=headers
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    raise KiroUnavailableError(
                        f"kiro-gateway returned HTTP {response.status_code}: {body[:500]!r}"
                    )
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        break
                    try:
                        event = json.loads(data)
                    except ValueError:
                        continue
                    choices = event.get("choices") or []
                    if not choices:
                        continue
                    delta = (choices[0].get("delta") or {}).get("content")
                    if delta:
                        chunks.append(delta)
    except httpx.HTTPError as e:
        raise KiroUnavailableError(f"kiro-gateway request failed: {e}") from e

    result = "".join(chunks).strip()
    if not result:
        raise KiroUnavailableError("kiro-gateway returned an empty completion")
    return result
