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

    def __init__(self, model: str = "gpt-4o-mini", timeout: int = 60):
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


def create_provider_from_config(ai_settings: Dict[str, Any]) -> AIProvider:
    """
    Create an AI provider from the ai-settings configuration.

    Args:
        ai_settings: The ai-settings config dict with 'selected' key containing
                     provider, interface, and model.

    Returns:
        AIProvider instance configured according to settings.

    Raises:
        AIProviderError: If provider/interface combination is invalid or not available.
    """
    selected = ai_settings.get("selected", {})
    provider_type = selected.get("provider", "codex")
    interface_type = selected.get("interface", "cli")
    model = selected.get("model", "gpt-4o-mini")

    # Codex CLI
    if provider_type == "codex" and interface_type == "cli":
        return CodexCLIProvider(model=model)

    # Claude API
    if provider_type == "claude" and interface_type == "api":
        return ClaudeProvider(model=model)

    # OpenAI API
    if provider_type == "openai" and interface_type == "api":
        return OpenAIProvider(model=model)

    # Gemini API
    if provider_type == "gemini" and interface_type == "api":
        return GeminiProvider(model=model)

    raise AIProviderError(
        f"Unsupported provider/interface combination: {provider_type}/{interface_type}. "
        f"Supported: codex/cli, claude/api, openai/api, gemini/api"
    )
