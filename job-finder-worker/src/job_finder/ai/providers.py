"""AI provider abstractions for different LLM services.

Provider configuration is managed via the ai-settings config entry.
The selected provider/interface/model is used for all AI tasks.
"""

import json
import os
import subprocess
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from anthropic import Anthropic
from openai import OpenAI

from job_finder.exceptions import AIProviderError


class AIProvider(ABC):
    """Abstract base class for AI providers."""

    @abstractmethod
    def generate(self, prompt: str, max_tokens: int = 1000, temperature: float = 0.7) -> str:
        """
        Generate a response from the AI model.

        Args:
            prompt: The prompt to send to the model.
            max_tokens: Maximum tokens in the response.
            temperature: Sampling temperature (0.0 to 1.0).

        Returns:
            The generated text response.
        """
        pass


class ClaudeProvider(AIProvider):
    """Anthropic Claude provider (API interface)."""

    def __init__(self, api_key: Optional[str] = None, model: str = "claude-sonnet-4-5-20250929"):
        """
        Initialize Claude provider.

        Args:
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var).
            model: Model identifier.
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise AIProviderError(
                "Anthropic API key must be provided or set in ANTHROPIC_API_KEY environment variable"
            )

        self.model = model
        self.client = Anthropic(api_key=self.api_key)

    def generate(self, prompt: str, max_tokens: int = 1000, temperature: float = 0.7) -> str:
        """Generate a response using Claude."""
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text
        except Exception as e:
            raise AIProviderError(f"Claude API error: {str(e)}") from e


class OpenAIProvider(AIProvider):
    """OpenAI GPT provider (API interface)."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gpt-4o"):
        """
        Initialize OpenAI provider.

        Args:
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var).
            model: Model identifier.
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise AIProviderError(
                "OpenAI API key must be provided or set in OPENAI_API_KEY environment variable"
            )

        self.model = model
        self.client = OpenAI(api_key=self.api_key)

    def generate(self, prompt: str, max_tokens: int = 1000, temperature: float = 0.7) -> str:
        """Generate a response using GPT."""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            raise AIProviderError(f"OpenAI API error: {str(e)}") from e


class GeminiProvider(AIProvider):
    """Google Gemini provider (API interface)."""

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-2.0-flash"):
        """
        Initialize Gemini provider.

        Args:
            api_key: Google API key (defaults to GOOGLE_API_KEY or GEMINI_API_KEY env var).
            model: Model identifier.
        """
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise AIProviderError(
                "Google API key must be provided or set in GOOGLE_API_KEY/GEMINI_API_KEY environment variable"
            )

        self.model = model
        # Lazy import to avoid dependency if not used
        try:
            import google.generativeai as genai

            genai.configure(api_key=self.api_key)
            self.client = genai.GenerativeModel(self.model)
        except ImportError:
            raise AIProviderError("google-generativeai package not installed")

    def generate(self, prompt: str, max_tokens: int = 1000, temperature: float = 0.7) -> str:
        """Generate a response using Gemini."""
        try:
            response = self.client.generate_content(
                prompt,
                generation_config={
                    "max_output_tokens": max_tokens,
                    "temperature": temperature,
                },
            )
            return response.text or ""
        except Exception as e:
            raise AIProviderError(f"Gemini API error: {str(e)}") from e


class CodexCLIProvider(AIProvider):
    """
    Codex CLI provider: uses the `codex` CLI (pro account session) instead of per-request API keys.

    Requires the `codex` binary on PATH and that the user is already authenticated
    (via `codex login`).
    """

    def __init__(self, model: str = "gpt-4o", timeout: int = 60):
        self.model = model
        self.timeout = timeout

    def generate(self, prompt: str, max_tokens: int = 1000, temperature: float = 0.7) -> str:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are a helpful assistant for job processing."},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        try:
            result = subprocess.run(
                [
                    "codex",
                    "api",
                    "chat/completions",
                    "-m",
                    self.model,
                    "-d",
                    json.dumps(body),
                ],
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )

            if result.returncode != 0:
                raise AIProviderError(
                    f"Codex CLI failed (exit {result.returncode}): {result.stderr.strip()}"
                )

            parsed = json.loads(result.stdout)
            content = parsed.get("choices", [{}])[0].get("message", {}).get("content", "")
            if not content:
                raise AIProviderError("Codex CLI returned empty content")
            return content

        except subprocess.TimeoutExpired as exc:
            raise AIProviderError(f"Codex CLI timed out after {self.timeout}s") from exc
        except json.JSONDecodeError as exc:
            raise AIProviderError("Failed to parse Codex CLI JSON response") from exc


# Provider dispatch map: (provider, interface) -> provider class
_PROVIDER_MAP: Dict[tuple, type] = {
    ("codex", "cli"): CodexCLIProvider,
    ("claude", "api"): ClaudeProvider,
    ("openai", "api"): OpenAIProvider,
    ("gemini", "api"): GeminiProvider,
}


def create_provider_from_config(ai_settings: Dict[str, Any], section: str = "worker") -> AIProvider:
    """
    Create an AI provider from the ai-settings configuration.

    Supports both the new `{selected:{provider,interface,model}}` shape and the
    legacy `{provider, model}` shape that ships in production SQLite. Defaults
    to API interfaces for cloud providers to avoid CLI breakage.
    """

    selected = {}

    # Prefer sectioned configuration (worker/documentGenerator)
    section_payload = ai_settings.get(section) if isinstance(ai_settings, dict) else None
    if isinstance(section_payload, dict) and isinstance(section_payload.get("selected"), dict):
        selected = section_payload.get("selected") or {}
    else:
        selected = ai_settings.get("selected") or {}

    # Legacy support: allow top-level provider/model keys
    if not selected and any(k in ai_settings for k in ("provider", "model", "interface")):
        selected = {
            "provider": ai_settings.get("provider", "codex"),
            "interface": ai_settings.get("interface"),
            "model": ai_settings.get("model", "gpt-4o"),
        }

    provider_type = selected.get("provider", "codex")
    interface_type = selected.get("interface")
    model = selected.get("model", "gpt-4o")

    # Prefer CLI for codex (only supported interface here); otherwise default to API
    if not interface_type:
        interface_type = "cli" if provider_type == "codex" else "api"

    # Enforce supported combinations to avoid invalid invocations
    supported_keys = set(_PROVIDER_MAP.keys())
    if (provider_type, interface_type) not in supported_keys:
        raise AIProviderError(
            f"Unsupported provider/interface combination: {provider_type}/{interface_type}. "
            f"Supported: {', '.join(f'{p}/{i}' for p, i in supported_keys)}"
        )

    provider_key = (provider_type, interface_type)
    provider_class = _PROVIDER_MAP.get(provider_key)

    if provider_class:
        return provider_class(model=model)

    supported = ", ".join(f"{p}/{i}" for p, i in _PROVIDER_MAP.keys())
    raise AIProviderError(
        f"Unsupported provider/interface combination: {provider_type}/{interface_type}. "
        f"Supported: {supported}"
    )
