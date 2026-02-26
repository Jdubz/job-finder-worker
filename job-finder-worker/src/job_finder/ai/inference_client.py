"""Unified AI inference client via LiteLLM proxy.

Replaces AgentManager by routing all AI requests through the LiteLLM proxy,
which handles provider selection, fallbacks, retries, and budget tracking.

The InferenceClient exposes the same `.execute()` interface as the old
AgentManager so callers can swap with minimal changes.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

from openai import OpenAI, APIConnectionError, APIStatusError, APITimeoutError

from job_finder.ai.task_router import get_model_for_task
from job_finder.exceptions import (
    AIProviderError,
    NoAgentsAvailableError,
    QuotaExhaustedError,
    TransientError,
)

logger = logging.getLogger(__name__)

# LiteLLM proxy defaults (overridable via env)
_DEFAULT_BASE_URL = "http://litellm:4000"
_DEFAULT_TIMEOUT = 120


@dataclass
class AgentResult:
    """Result from an inference execution.

    Kept identical to the old agent_manager.AgentResult so callers don't change.
    """

    text: str
    agent_id: str
    model: str


class InferenceClient:
    """Thin wrapper around OpenAI SDK pointed at LiteLLM proxy.

    Provides the same `.execute()` interface as the old AgentManager:
        result = client.execute(task_type="extraction", prompt="...", max_tokens=2048)
        result.text  # response content

    LiteLLM handles:
    - Provider routing (Claude, Gemini, Ollama)
    - Fallback chains (configured in litellm-config.yaml)
    - Retries and timeouts
    - Budget tracking
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: Optional[int] = None,
    ):
        """Initialize the inference client.

        Args:
            base_url: LiteLLM proxy origin (default: http://litellm:4000)
            api_key: LiteLLM master key (default: from LITELLM_MASTER_KEY env)
            timeout: Request timeout in seconds (default: 120)
        """
        self._base_url = base_url or os.getenv("LITELLM_BASE_URL", _DEFAULT_BASE_URL)
        self._api_key = api_key or os.getenv("LITELLM_MASTER_KEY", "")
        self._timeout = timeout or int(os.getenv("LITELLM_TIMEOUT", str(_DEFAULT_TIMEOUT)))

        self._client = OpenAI(
            base_url=f"{self._base_url.rstrip('/')}/v1",
            api_key=self._api_key,
            timeout=self._timeout,
        )

    def execute(
        self,
        task_type: str,
        prompt: str,
        model_override: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        scope: Optional[str] = None,  # Accepted for API compat, unused
    ) -> AgentResult:
        """Execute an AI task via LiteLLM proxy.

        Drop-in replacement for AgentManager.execute(). The `scope` parameter
        is accepted for API compatibility but ignored — LiteLLM handles
        scoping via its own virtual keys.

        Args:
            task_type: Task type ("extraction", "analysis", "document", "chat")
            prompt: The prompt to send
            model_override: Override the task router's model selection
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature
            scope: Ignored (kept for API compatibility)

        Returns:
            AgentResult with response text and metadata

        Raises:
            NoAgentsAvailableError: LiteLLM returned 503 (all providers down)
            QuotaExhaustedError: LiteLLM returned 429 (rate/budget limit)
            TransientError: Timeout or temporary connection failure
            AIProviderError: Other API errors
        """
        model = model_override or get_model_for_task(task_type)

        try:
            response = self._client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens,
                temperature=temperature,
            )

            text = response.choices[0].message.content or ""
            actual_model = response.model or model

            logger.info(
                "LiteLLM call succeeded: task=%s model=%s tokens=%s",
                task_type,
                actual_model,
                getattr(response.usage, "total_tokens", "?"),
            )

            return AgentResult(
                text=text,
                agent_id=f"litellm:{model}",
                model=actual_model,
            )

        except APITimeoutError as e:
            raise TransientError(
                f"LiteLLM request timed out after {self._timeout}s",
                provider="litellm",
            ) from e

        except APIConnectionError as e:
            raise TransientError(
                f"Could not connect to LiteLLM proxy at {self._base_url}: {e}",
                provider="litellm",
            ) from e

        except APIStatusError as e:
            status = e.status_code
            body = str(e.body) if e.body else str(e)

            if status == 429:
                raise QuotaExhaustedError(
                    f"LiteLLM rate/budget limit: {body}",
                    provider="litellm",
                    reset_info="check LiteLLM budget settings",
                ) from e

            if status in (502, 503):
                raise NoAgentsAvailableError(
                    f"All LiteLLM providers unavailable for model {model}: {body}",
                    task_type=task_type,
                    tried_agents=[model],
                ) from e

            raise AIProviderError(f"LiteLLM API error (HTTP {status}): {body}") from e

        except Exception as e:
            raise AIProviderError(f"Unexpected error calling LiteLLM: {e}") from e
