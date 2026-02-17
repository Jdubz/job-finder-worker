"""AI provider abstractions for different LLM services.

Provider configuration is managed via the ai-settings config entry.
Supported agents: claude.cli, gemini.api
"""

import json
import logging
import os
import subprocess
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Tuple

from job_finder.exceptions import AIProviderError, QuotaExhaustedError, TransientError

logger = logging.getLogger(__name__)

# Patterns that indicate quota/rate limit exhaustion
QUOTA_EXHAUSTION_PATTERNS = [
    "exhausted your daily quota",
    "quota exceeded",
    "rate limit exceeded",
    "resource exhausted",
]


def _is_quota_exhausted(message: str) -> bool:
    """Check if an error message indicates quota exhaustion."""
    msg_lower = message.lower()
    return any(pattern in msg_lower for pattern in QUOTA_EXHAUSTION_PATTERNS)


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


class GeminiProvider(AIProvider):
    """
    Google Gemini provider via API key or Vertex AI.

    Supports two authentication modes (checked in order):
    1. API Key: Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable
    2. Vertex AI: Set GOOGLE_CLOUD_PROJECT + ADC credentials

    API key auth is simpler and recommended for most use cases.
    Vertex AI is useful for enterprise deployments with existing GCP infrastructure.
    """

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        project: Optional[str] = None,
        location: Optional[str] = None,
    ):
        """
        Initialize Gemini provider.

        Args:
            model: Model identifier (defaults to gemini-2.0-flash).
            api_key: Gemini API key (defaults to GEMINI_API_KEY or GOOGLE_API_KEY env var).
            project: GCP project ID for Vertex AI (defaults to GOOGLE_CLOUD_PROJECT env var).
            location: GCP region for Vertex AI (defaults to us-central1).
        """
        self.model = model or os.getenv("GEMINI_DEFAULT_MODEL") or "gemini-2.0-flash"

        # Try API key auth first (simpler, no GCP project needed)
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

        try:
            from google import genai

            if self.api_key:
                # Use simple API key authentication
                self.client = genai.Client(api_key=self.api_key)
                self._auth_mode = "api_key"
            else:
                # Fall back to Vertex AI authentication
                self.project = project or os.getenv("GOOGLE_CLOUD_PROJECT")
                if not self.project:
                    raise AIProviderError(
                        "Gemini requires either GEMINI_API_KEY/GOOGLE_API_KEY or "
                        "GOOGLE_CLOUD_PROJECT with ADC credentials"
                    )
                self.location = location or os.getenv("GOOGLE_CLOUD_LOCATION") or "us-central1"
                self.client = genai.Client(
                    vertexai=True,
                    project=self.project,
                    location=self.location,
                )
                self._auth_mode = "vertex_ai"

        except ImportError:
            raise AIProviderError(
                "google-genai package not installed. Run: pip install google-genai"
            )
        except Exception as e:
            error_msg = str(e).lower()
            if "credentials" in error_msg or "authentication" in error_msg:
                raise AIProviderError(
                    f"Gemini authentication failed. Set GEMINI_API_KEY for API key auth, "
                    f"or configure ADC for Vertex AI. Error: {e}"
                )
            raise AIProviderError(f"Failed to initialize Gemini client: {e}") from e

    def generate(self, prompt: str, max_tokens: int = 1000, temperature: float = 0.7) -> str:
        """Generate a response using Gemini API."""
        try:
            from google.genai import types

            response = self.client.models.generate_content(
                model=self.model,
                contents=prompt,
                config={
                    "max_output_tokens": max_tokens,
                    "temperature": temperature,
                    # Disable thinking tokens for models that support it (e.g. 2.5 Flash).
                    # Thinking tokens count against max_output_tokens, causing truncated
                    # responses for structured-output tasks like JSON extraction.
                    "thinking_config": types.ThinkingConfig(thinking_budget=0),
                },
            )
            # Check for truncation (finish_reason=MAX_TOKENS) before returning
            try:
                candidates = getattr(response, "candidates", None)
                if candidates and len(candidates) > 0:
                    finish_reason = getattr(candidates[0], "finish_reason", None)
                    reason_name = getattr(finish_reason, "name", str(finish_reason))
                    # STOP is a normal completion; MAX_TOKENS indicates truncation.
                    if reason_name == "MAX_TOKENS":
                        logger.warning(
                            "Gemini response truncated (finish_reason=MAX_TOKENS, "
                            "max_output_tokens=%d). Increase max_tokens.",
                            max_tokens,
                        )
            except Exception as e:
                logger.warning("Could not check Gemini finish_reason: %s", e)

            # The .text property is the idiomatic way to get text from response.
            # It raises ValueError if the response is blocked or empty.
            try:
                return response.text or ""
            except ValueError as e:
                # Check if response was blocked by safety filters
                if hasattr(response, "prompt_feedback") and response.prompt_feedback:
                    block_reason = getattr(response.prompt_feedback, "block_reason", None)
                    if block_reason:
                        reason = getattr(block_reason, "name", str(block_reason))
                        raise AIProviderError(
                            f"Gemini response blocked by safety filters: {reason}"
                        ) from e
                raise AIProviderError("Gemini API returned an empty or invalid response") from e
        except AIProviderError:
            # Re-raise our own errors unchanged
            raise
        except Exception as e:
            error_msg = str(e).lower()
            if _is_quota_exhausted(error_msg):
                raise QuotaExhaustedError(
                    "Gemini API quota exhausted",
                    provider="gemini",
                    reset_info="check Google AI Studio or GCP quotas",
                )
            raise AIProviderError(f"Gemini API error: {str(e)}") from e


class ClaudeCLIProvider(AIProvider):
    """Claude Code CLI provider (CLI interface)."""

    def __init__(self, model: Optional[str] = None, timeout: int = 120):
        """
        Initialize Claude CLI provider.

        Args:
            model: Model identifier or short alias (e.g. 'sonnet', 'opus', 'haiku').
                   If omitted, CLI uses its configured default (latest sonnet).
            timeout: Command timeout in seconds (default 120s).
        """
        self.model = model
        self.timeout = timeout

    def generate(self, prompt: str, max_tokens: int = 1000, temperature: float = 0.7) -> str:
        cmd = [
            "claude",
            "--print",
            "--output-format",
            "json",
        ]
        if self.model:
            cmd.extend(["--model", self.model])
        # Prompt is a positional argument in Claude CLI, not a flag
        cmd.append(prompt)

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
        except subprocess.TimeoutExpired as exc:
            raise TransientError(
                f"Claude CLI timed out after {self.timeout}s", provider="claude"
            ) from exc
        except FileNotFoundError as exc:
            raise AIProviderError("Claude CLI binary not found on PATH") from exc

        stdout = (result.stdout or "").strip()
        stderr = (result.stderr or "").strip()

        if result.returncode != 0:
            err_msg = stderr or stdout or f"Claude CLI exited with code {result.returncode}"
            raise AIProviderError(err_msg)

        if not stdout:
            raise AIProviderError("Claude CLI returned no output")

        # Parse JSON output when available
        try:
            parsed = json.loads(stdout)
            if isinstance(parsed, dict):
                # Handle Claude CLI --output-format json which uses "result" field
                if isinstance(parsed.get("result"), str):
                    return parsed["result"].strip()
                if isinstance(parsed.get("text"), str):
                    return parsed["text"].strip()
                if isinstance(parsed.get("completion"), str):
                    return parsed["completion"].strip()
                output = parsed.get("output")
                if isinstance(output, dict) and isinstance(output.get("text"), str):
                    return output["text"].strip()
            if isinstance(parsed, list):
                text_parts = [str(p) for p in parsed if isinstance(p, (str, int, float))]
                if text_parts:
                    return "\n".join(text_parts).strip()
        except json.JSONDecodeError:
            return stdout

        return stdout


# Provider dispatch map: (provider, interface) -> provider class
# Supported agents: claude.cli, gemini.api
_PROVIDER_MAP: Dict[tuple, type] = {
    ("claude", "cli"): ClaudeCLIProvider,
    ("gemini", "api"): GeminiProvider,
}


# CLI auth configuration for Claude
_CLI_AUTH_CONFIG: Dict[str, Dict[str, Any]] = {
    "claude": {
        "env_vars": ["CLAUDE_CODE_OAUTH_TOKEN"],
        "file_path": None,
        "hint": "CLAUDE_CODE_OAUTH_TOKEN",
    },
}


def _check_cli_auth(provider: str) -> Tuple[bool, str]:
    """Check CLI auth for provider returning (available, reason)."""
    cfg = _CLI_AUTH_CONFIG.get(provider)
    if not cfg:
        return True, ""

    env_ok = any(os.getenv(var) for var in cfg["env_vars"])
    file_path = cfg.get("file_path")
    file_ok = file_path.exists() if file_path is not None else False

    return env_ok or file_ok, cfg["hint"]


def _check_gemini_api_auth() -> Tuple[bool, str]:
    """Check if Gemini API authentication is available.

    Supports two authentication modes (checked in order):
    1. API Key: GEMINI_API_KEY or GOOGLE_API_KEY environment variable
    2. Vertex AI: GOOGLE_CLOUD_PROJECT + ADC credentials

    API key auth is simpler and doesn't require google-auth package.
    """
    # Check for API key first (simpler, preferred)
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if api_key:
        return True, ""

    # Fall back to Vertex AI auth check
    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project:
        return False, "missing_env:GEMINI_API_KEY/GOOGLE_API_KEY and GOOGLE_CLOUD_PROJECT"

    # Check for ADC credentials (only needed for Vertex AI mode)
    try:
        import google.auth
        from google.auth.exceptions import DefaultCredentialsError

        google.auth.default()
        return True, ""
    except ImportError:
        # google-auth not installed, but that's only needed for Vertex AI
        # User should use API key auth instead
        return False, "missing_env:GEMINI_API_KEY (or install google-auth for Vertex AI)"
    except DefaultCredentialsError:
        return False, "missing_credentials:ADC not configured (API key also not set)"


def hydrate_auth_from_host_file(provider: str) -> None:
    """
    Best-effort attempt to populate required env vars from provider host files.

    This is intentionally permissive: if a file is missing or unreadable we do
    nothing and let normal auth_status checks handle the failure.
    """
    # No host file hydration needed for supported providers:
    # - claude.cli uses CLAUDE_CODE_OAUTH_TOKEN (no file)
    # - gemini.api uses Vertex AI ADC (handled by google-auth)
    pass


def auth_status(provider: str, interface: str) -> Tuple[bool, str]:
    """Return (is_available, reason)."""
    # Gemini API supports API key or Vertex AI with ADC
    if provider == "gemini" and interface == "api":
        return _check_gemini_api_auth()

    # Claude CLI uses OAuth token
    if provider == "claude" and interface == "cli":
        available, hint = _check_cli_auth(provider)
        if available:
            return True, ""
        return False, f"missing_cli_auth:{hint}"

    return False, f"unsupported_agent:{provider}.{interface}"
