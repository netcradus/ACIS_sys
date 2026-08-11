"""
Real provider implementations, all built on one generic OpenAI-compatible
chat-completions client (NVIDIA NIM, OpenRouter, Groq, and kiro-gateway all
speak the same request/response shape) — this is what "centralized, not
duplicated" means concretely: one HTTP implementation, four configurations.

PROVIDER_CHAIN is the single ordered list every AI feature in main.py walks
through. NVIDIA is primary per this deployment's configuration; the others
are optional real fallbacks. There is no entry in this chain that returns
fabricated content — every entry is a real API or nothing.
"""
import json
import logging
import os
import time
from typing import AsyncGenerator, Callable, Optional

import httpx

from .ai_provider import AIErrorCategory, AIProvider, AIProviderError

logger = logging.getLogger("ai-service.providers")


class OpenAICompatibleProvider(AIProvider):
    """
    One real client implementation shared by every OpenAI-compatible
    provider this service talks to. Each instance below just supplies its
    own env var names, base URL, and default model — no per-provider HTTP
    logic is duplicated.
    """

    def __init__(
        self,
        name: str,
        *,
        api_key_env: str,
        model_env: str,
        default_model: str,
        base_url: str,
        base_url_env: Optional[str] = None,
        timeout_env: Optional[str] = None,
        default_timeout: float = 30.0,
        require_explicit_base_url: bool = False,
        extra_headers: Optional[Callable[[], dict]] = None,
    ):
        self.name = name
        self._api_key_env = api_key_env
        self._require_explicit_base_url = require_explicit_base_url
        self._extra_headers = extra_headers or (lambda: {})
        # Read lazily via properties (not cached at import time) so tests /
        # local runs that set env vars after import still work correctly.
        self._model_env = model_env
        self._default_model = default_model
        self._base_url_env = base_url_env
        self._default_base_url = base_url
        self._timeout_env = timeout_env
        self._default_timeout = default_timeout

    @property
    def _api_key(self) -> str:
        return os.environ.get(self._api_key_env, "")

    @property
    def _model(self) -> str:
        return os.environ.get(self._model_env, self._default_model)

    @property
    def _base_url(self) -> str:
        raw = os.environ.get(self._base_url_env, "") if self._base_url_env else ""
        return (raw or self._default_base_url).rstrip("/")

    @property
    def _timeout(self) -> float:
        raw = os.environ.get(self._timeout_env, "") if self._timeout_env else ""
        try:
            return float(raw) if raw else self._default_timeout
        except ValueError:
            return self._default_timeout

    def is_configured(self) -> bool:
        if not self._api_key:
            return False
        if self._require_explicit_base_url and not (self._base_url_env and os.environ.get(self._base_url_env, "")):
            return False
        return True

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            **self._extra_headers(),
        }

    def _payload(self, system_prompt: str, user_prompt: str, *, max_tokens: int, temperature: float, stream: bool) -> dict:
        return {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": stream,
        }

    def _classify_http_error(self, status_code: int, body: str) -> AIErrorCategory:
        if status_code in (401, 403):
            return AIErrorCategory.AUTH
        if status_code == 429:
            return AIErrorCategory.RATE_LIMIT
        if status_code == 402:
            return AIErrorCategory.QUOTA
        if status_code >= 500:
            return AIErrorCategory.NETWORK
        return AIErrorCategory.UNKNOWN

    async def complete(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 1024, temperature: float = 0.2) -> str:
        if not self.is_configured():
            raise AIProviderError(self.name, AIErrorCategory.NOT_CONFIGURED, f"{self._api_key_env} not configured")

        payload = self._payload(system_prompt, user_prompt, max_tokens=max_tokens, temperature=temperature, stream=False)

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(f"{self._base_url}/chat/completions", json=payload, headers=self._headers())
        except httpx.TimeoutException as e:
            raise AIProviderError(self.name, AIErrorCategory.TIMEOUT, f"request timed out: {e}") from e
        except httpx.HTTPError as e:
            raise AIProviderError(self.name, AIErrorCategory.NETWORK, f"request failed: {e}") from e

        if response.status_code != 200:
            category = self._classify_http_error(response.status_code, response.text)
            raise AIProviderError(self.name, category, f"HTTP {response.status_code}: {response.text[:500]}", status_code=response.status_code)

        try:
            data = response.json()
        except ValueError as e:
            raise AIProviderError(self.name, AIErrorCategory.INVALID_RESPONSE, f"non-JSON response: {e}") from e

        choices = data.get("choices") or []
        if not choices:
            raise AIProviderError(self.name, AIErrorCategory.EMPTY_RESPONSE, "response contained no choices")
        # `.get("content", "")` alone isn't enough — the key can be present
        # but explicitly null (e.g. a truncated or tool-call-only response).
        content = ((choices[0].get("message") or {}).get("content") or "").strip()
        if not content:
            raise AIProviderError(self.name, AIErrorCategory.EMPTY_RESPONSE, "response content was empty")
        return content

    async def stream(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 1024, temperature: float = 0.2) -> AsyncGenerator[str, None]:
        if not self.is_configured():
            raise AIProviderError(self.name, AIErrorCategory.NOT_CONFIGURED, f"{self._api_key_env} not configured")

        payload = self._payload(system_prompt, user_prompt, max_tokens=max_tokens, temperature=temperature, stream=True)

        got_any_content = False
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream("POST", f"{self._base_url}/chat/completions", json=payload, headers=self._headers()) as response:
                    if response.status_code != 200:
                        body = (await response.aread()).decode("utf-8", errors="replace")
                        category = self._classify_http_error(response.status_code, body)
                        raise AIProviderError(self.name, category, f"HTTP {response.status_code}: {body[:500]}", status_code=response.status_code)

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
                        # Some providers pass upstream errors through as a
                        # 200 SSE stream containing an "error" event rather
                        # than a non-200 status.
                        if event.get("error"):
                            raise AIProviderError(self.name, AIErrorCategory.UNKNOWN, f"stream error event: {event['error']}")
                        choices = event.get("choices") or []
                        if not choices:
                            continue
                        delta = (choices[0].get("delta") or {}).get("content")
                        if delta:
                            got_any_content = True
                            yield delta
        except httpx.TimeoutException as e:
            raise AIProviderError(self.name, AIErrorCategory.TIMEOUT, f"stream timed out: {e}") from e
        except httpx.HTTPError as e:
            raise AIProviderError(self.name, AIErrorCategory.NETWORK, f"stream failed: {e}") from e

        if not got_any_content:
            raise AIProviderError(self.name, AIErrorCategory.EMPTY_RESPONSE, "stream produced no content")


def _openrouter_attribution_headers() -> dict:
    return {
        "HTTP-Referer": os.environ.get("OPENROUTER_SITE_URL", "https://github.com/netcradus/ACIS_sys"),
        "X-Title": os.environ.get("OPENROUTER_SITE_NAME", "NETCRADUS ACIS"),
    }


# Primary — NVIDIA NIM (integrate.api.nvidia.com), an OpenAI-compatible
# endpoint. Tried first for every LLM feature in this deployment.
nvidia_provider = OpenAICompatibleProvider(
    "nvidia",
    api_key_env="NVIDIA_API_KEY",
    model_env="NVIDIA_MODEL",
    default_model="meta/llama-3.1-8b-instruct",
    base_url="https://integrate.api.nvidia.com/v1",
    base_url_env="NVIDIA_BASE_URL",
    timeout_env="NVIDIA_REQUEST_TIMEOUT_SECONDS",
)

# Real fallback #1 — OpenRouter.
openrouter_provider = OpenAICompatibleProvider(
    "openrouter",
    api_key_env="OPENROUTER_API_KEY",
    model_env="OPENROUTER_MODEL",
    default_model="openai/gpt-4o-mini",
    base_url="https://openrouter.ai/api/v1",
    base_url_env="OPENROUTER_BASE_URL",
    timeout_env="OPENROUTER_REQUEST_TIMEOUT_SECONDS",
    extra_headers=_openrouter_attribution_headers,
)

# Real fallback #2 — Groq's official free tier.
groq_provider = OpenAICompatibleProvider(
    "groq",
    api_key_env="GROQ_API_KEY",
    model_env="GROQ_MODEL",
    default_model="llama-3.3-70b-versatile",
    base_url="https://api.groq.com/openai/v1",
    timeout_env="GROQ_REQUEST_TIMEOUT_SECONDS",
)

# Real fallback #3 — kiro-gateway (unofficial, opt-in — requires both the
# API key AND an explicit KIRO_GATEWAY_URL; there's no sensible default
# base URL to fall back to like the others).
kiro_provider = OpenAICompatibleProvider(
    "kiro",
    api_key_env="KIRO_GATEWAY_API_KEY",
    model_env="KIRO_MODEL",
    default_model="claude-sonnet-4-5",
    # No sensible default base URL (unlike the others) — base_url_env is
    # always read live at call time, so this default is only ever used if
    # KIRO_GATEWAY_URL is unset, in which case require_explicit_base_url
    # already makes is_configured() false before base_url is ever needed.
    base_url="",
    base_url_env="KIRO_GATEWAY_URL",
    timeout_env="KIRO_REQUEST_TIMEOUT_SECONDS",
    require_explicit_base_url=True,
)

# The single ordered chain every AI feature in main.py consumes. Real
# providers only — see ai_provider.py / main.py for the "no fake fallback"
# enforcement once every configured entry here has failed.
PROVIDER_CHAIN = [nvidia_provider, openrouter_provider, groq_provider, kiro_provider]
