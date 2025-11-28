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

    NOTE: The Codex CLI has recently removed the `api chat/completions` surface. We now call
    `codex exec --json` and parse the streamed JSON events to retrieve the final agent message.
    Some ChatGPT accounts only support Codex-specific models (e.g., gpt-5-codex); if a supplied
    model is rejected, we automatically retry using the CLI default model.
    """

    def __init__(self, model: Optional[str] = "gpt-5-codex", timeout: int = 60):
        self.model = model
        self.timeout = timeout

    def generate(self, prompt: str, max_tokens: int = 1000, temperature: float = 0.7) -> str:
        """
        Invoke codex exec and return the final agent message text.

        We request JSONL output and scan for the last agent_message item. If the CLI rejects the
        configured model for ChatGPT accounts, we retry once without a model flag to let Codex pick
        the default from config.toml.
        """

        def run_codex(include_model: bool = True) -> subprocess.CompletedProcess:
            workdir = os.getenv("CODEX_WORKDIR") or os.getcwd()
            cmd = [
                "codex",
                "exec",
                "--json",
                "--skip-git-repo-check",
                "--cd",
                workdir,
            ]
            if include_model and self.model:
                cmd.extend(["--model", self.model])
            # Temperature/max_tokens not exposed in CLI; rely on prompt discipline.
            cmd.extend(["--", prompt])
            return subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )

        def parse_stdout(stdout: str) -> str:
            final_text = ""
            for line in stdout.splitlines():
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if payload.get("type") in ("item.completed", "message.completed"):
                    item = payload.get("item", {})
                    item_type = item.get("type") or payload.get("item_type")
                    text = item.get("text") or payload.get("text")
                    if item_type in ("agent_message", "message", "final") and text:
                        final_text = text
                elif payload.get("type") == "turn.completed" and final_text:
                    break

            if not final_text:
                raise AIProviderError("Codex CLI returned no message content")
            return final_text

        try:
            result = run_codex(include_model=True)
            if result.returncode != 0 and "not supported when using Codex with a ChatGPT account" in (
                result.stderr + result.stdout
            ):
                # Retry without model flag to fall back to CLI default (usually gpt-5-codex)
                result = run_codex(include_model=False)

            parsed_text = ""
            parse_error: Optional[Exception] = None
            try:
                parsed_text = parse_stdout(result.stdout)
            except Exception as exc:  # capture parse error but still evaluate exit code
                parse_error = exc

            if parsed_text:
                return parsed_text

            if result.returncode != 0:
                raise AIProviderError(
                    f"Codex CLI failed (exit {result.returncode}): {result.stderr.strip() or result.stdout.strip()}"
                )

            # If exit code succeeded but no text was parsed, surface parse error
            if parse_error:
                raise parse_error

            raise AIProviderError("Codex CLI returned no message content")

        except subprocess.TimeoutExpired as exc:
            raise AIProviderError(f"Codex CLI timed out after {self.timeout}s") from exc


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
            "model": ai_settings.get("model", "gpt-5-codex"),
        }

    provider_type = selected.get("provider", "codex")
    interface_type = selected.get("interface")
    model = selected.get("model", "gpt-5-codex")

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
        return provider_class(model=model or None)

    supported = ", ".join(f"{p}/{i}" for p, i in _PROVIDER_MAP.keys())
    raise AIProviderError(
        f"Unsupported provider/interface combination: {provider_type}/{interface_type}. "
        f"Supported: {supported}"
    )
