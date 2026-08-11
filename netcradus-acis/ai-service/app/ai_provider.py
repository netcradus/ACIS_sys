"""
Centralized AI provider abstraction. Every LLM-backed feature in this
service (/ai/explain, /ai/explain/stream, /ai/query, and any future
AI feature) goes through this interface and the provider chain built on
top of it in providers.py — no feature gets its own bespoke integration.

Hard rule enforced here: a provider either returns real, non-empty text
from a real API call, or it raises AIProviderError. There is no code path
in this module that fabricates content.
"""
from abc import ABC, abstractmethod
from enum import Enum
from typing import AsyncGenerator, List, Optional


class AIErrorCategory(str, Enum):
    AUTH = "auth"
    RATE_LIMIT = "rate_limit"
    QUOTA = "quota"
    TIMEOUT = "timeout"
    NETWORK = "network"
    INVALID_RESPONSE = "invalid_response"
    EMPTY_RESPONSE = "empty_response"
    NOT_CONFIGURED = "not_configured"
    UNKNOWN = "unknown"


class AIProviderError(Exception):
    """Normalized error every AIProvider implementation raises on failure —
    callers (the provider chain) catch this one type regardless of which
    provider or which underlying httpx/API failure produced it."""

    def __init__(self, provider: str, category: AIErrorCategory, message: str, status_code: Optional[int] = None):
        self.provider = provider
        self.category = category
        self.status_code = status_code
        super().__init__(f"[{provider}] {category.value}: {message}")


class NoProviderConfiguredError(Exception):
    """Raised when zero providers in the chain have credentials set — a
    deployment/config issue, distinct from a configured provider failing."""


class AllProvidersFailedError(Exception):
    """Raised when every configured provider was tried and every one
    failed. Carries the individual AIProviderErrors for logging."""

    def __init__(self, errors: List[AIProviderError]):
        self.errors = errors
        summary = "; ".join(str(e) for e in errors) or "no providers attempted"
        super().__init__(f"All configured AI providers failed: {summary}")


class AIProvider(ABC):
    """Common interface every real LLM backend implements."""

    name: str

    @abstractmethod
    def is_configured(self) -> bool:
        ...

    @abstractmethod
    async def complete(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 1024, temperature: float = 0.2) -> str:
        """Returns real, non-empty generated text, or raises AIProviderError. Never returns None/empty on success."""

    @abstractmethod
    def stream(self, system_prompt: str, user_prompt: str, *, max_tokens: int = 1024, temperature: float = 0.2) -> AsyncGenerator[str, None]:
        """Yields real text deltas as they arrive from the provider's own streaming API, or raises AIProviderError."""
