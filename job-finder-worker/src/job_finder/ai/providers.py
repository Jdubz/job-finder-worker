"""AI provider abstractions for different LLM services.

Provider configuration is managed via the ai-settings config entry.
The selected provider/interface/model is used for all AI tasks.
"""

import json
import logging
import os
import subprocess
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from anthropic import Anthropic
from openai import OpenAI

from job_finder.exceptions import AIProviderError

logger = logging.getLogger(__name__)


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


class GeminiCLIProvider(AIProvider):
    """
    Gemini CLI provider: uses the `gemini` CLI with Google account OAuth instead of API keys.

    Requires the `gemini` binary on PATH and that the user is already authenticated
    (via `gemini auth login`). Credentials are stored in ~/.gemini/oauth_creds.json.

    The CLI is invoked with:
    - `-o json` for structured JSON output
    - `--yolo` to auto-approve all actions (no interactive prompts)
    - Working directory set to /tmp to minimize context token usage
    """

    def __init__(self, model: Optional[str] = None, timeout: int = 120):
        """
        Initialize Gemini CLI provider.

        Args:
            model: Model identifier (currently ignored - CLI uses its own model selection).
            timeout: Command timeout in seconds (default 120s for longer responses).
        """
        self.model = model  # Reserved for future use when CLI supports model selection
        self.timeout = timeout

    def generate(self, prompt: str, max_tokens: int = 1000, temperature: float = 0.7) -> str:
        """
        Invoke gemini CLI and return the response text.

        The CLI outputs JSON with a `response` field containing the LLM's text.
        We run from /tmp to avoid scanning the current directory for context,
        which significantly reduces token usage.
        """
        cmd = [
            "gemini",
            "-o",
            "json",
            "--yolo",
            prompt,
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.timeout,
                cwd="/tmp",  # Run from /tmp to minimize context tokens
            )

            # Parse JSON output
            stdout = result.stdout.strip()

            # Find the JSON object in the output (may have prefix text like "YOLO mode...")
            json_start = stdout.find("{")
            if json_start == -1:
                if result.returncode != 0:
                    raise AIProviderError(
                        f"Gemini CLI failed (exit {result.returncode}): "
                        f"{result.stderr.strip() or stdout}"
                    )
                raise AIProviderError("Gemini CLI returned no JSON output")

            json_str = stdout[json_start:]
            try:
                output = json.loads(json_str)
            except json.JSONDecodeError as e:
                raise AIProviderError(f"Gemini CLI returned invalid JSON: {e}") from e

            # Check for error response
            if "error" in output:
                error_info = output["error"]
                error_msg = error_info.get("message", str(error_info))
                error_code = error_info.get("code", "unknown")
                raise AIProviderError(f"Gemini CLI error ({error_code}): {error_msg}")

            # Extract response text
            response_text = output.get("response")
            if not response_text:
                raise AIProviderError("Gemini CLI returned empty response")

            return response_text

        except subprocess.TimeoutExpired as exc:
            raise AIProviderError(f"Gemini CLI timed out after {self.timeout}s") from exc


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
            if (
                result.returncode != 0
                and "not supported when using Codex with a ChatGPT account"
                in (result.stderr + result.stdout)
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
    ("gemini", "cli"): GeminiCLIProvider,
}

# Map of API-based providers to their required environment variables
_API_KEY_REQUIREMENTS: Dict[tuple, list] = {
    ("claude", "api"): ["ANTHROPIC_API_KEY"],
    ("openai", "api"): ["OPENAI_API_KEY"],
    ("gemini", "api"): ["GOOGLE_API_KEY", "GEMINI_API_KEY"],  # Either one works
}

# Fallback interfaces for providers when API keys are missing
_INTERFACE_FALLBACKS: Dict[str, str] = {
    "gemini": "cli",  # gemini/api -> gemini/cli
    # codex only has cli, claude/openai only have api (no fallback)
}


def _check_api_key_available(provider: str, interface: str) -> bool:
    """Check if the required API key(s) are available for this provider/interface."""
    key = (provider, interface)
    required_vars = _API_KEY_REQUIREMENTS.get(key)
    if not required_vars:
        return True  # CLI interfaces don't need API keys
    # For providers that accept multiple keys (like gemini), any one is sufficient
    return any(os.getenv(var) for var in required_vars)


def _get_missing_api_key_names(provider: str, interface: str) -> list:
    """Get the names of missing API keys for this provider/interface."""
    key = (provider, interface)
    required_vars = _API_KEY_REQUIREMENTS.get(key, [])
    return [var for var in required_vars if not os.getenv(var)]


def create_provider_from_config(
    ai_settings: Dict[str, Any],
    section: str = "worker",
    task: Optional[str] = None,
) -> AIProvider:
    """
    Create an AI provider from the ai-settings configuration.

    Supports both the new `{selected:{provider,interface,model}}` shape and the
    legacy `{provider, model}` shape that ships in production SQLite. Defaults
    to API interfaces for cloud providers to avoid CLI breakage.

    Args:
        ai_settings: The ai-settings configuration dictionary.
        section: Config section to use ("worker" or "documentGenerator").
        task: Optional task name for per-task overrides ("jobMatch", "companyDiscovery",
              "sourceDiscovery"). If specified and a task config exists, it overrides
              the section default.

    Returns:
        An initialized AIProvider instance.
    """
    selected = {}

    # Prefer sectioned configuration (worker/documentGenerator)
    section_payload = ai_settings.get(section) if isinstance(ai_settings, dict) else None
    if isinstance(section_payload, dict) and isinstance(section_payload.get("selected"), dict):
        selected = dict(section_payload.get("selected") or {})
    else:
        selected = dict(ai_settings.get("selected") or {})

    # Legacy support: allow top-level provider/model keys (no defaults)
    if not selected and any(k in ai_settings for k in ("provider", "model", "interface")):
        selected = {
            "provider": ai_settings.get("provider"),
            "interface": ai_settings.get("interface"),
            "model": ai_settings.get("model"),
        }

    # Apply per-task overrides if task is specified
    if task and isinstance(section_payload, dict):
        tasks_config = section_payload.get("tasks") or {}
        task_config = tasks_config.get(task)
        if isinstance(task_config, dict):
            # Track if provider changed but interface wasn't explicitly set
            provider_changed = (
                "provider" in task_config
                and task_config["provider"] is not None
                and task_config["provider"] != selected.get("provider")
            )
            interface_explicitly_set = (
                "interface" in task_config and task_config["interface"] is not None
            )

            # Merge task config into selected (task overrides default)
            for key in ("provider", "interface", "model"):
                if key in task_config and task_config[key] is not None:
                    selected[key] = task_config[key]

            # If provider was changed but interface wasn't explicitly set,
            # clear interface so it gets re-inferred for the new provider
            if provider_changed and not interface_explicitly_set:
                selected.pop("interface", None)

    provider_type = selected.get("provider")
    interface_type = selected.get("interface")
    model = selected.get("model")

    # Require explicit provider - no silent defaults
    if not provider_type:
        raise AIProviderError(
            f"AI provider not configured. "
            f"Set ai-settings.{section}.selected.provider in the database. "
            f"Supported providers: codex, claude, openai, gemini"
        )

    # Infer interface if not set: CLI for codex/gemini, API for others
    if not interface_type:
        interface_type = "cli" if provider_type in ("codex", "gemini") else "api"

    # Default model per provider if not specified
    if not model:
        model_defaults = {
            "codex": "gpt-5-codex",
            "claude": "claude-sonnet-4-5-20250929",
            "openai": "gpt-4o",
            "gemini": "gemini-2.0-flash",
        }
        model = model_defaults.get(provider_type, "")

    task_info = f" (task={task})" if task else ""
    logger.info(f"AI provider selected: {provider_type}/{interface_type} model={model}{task_info}")

    # Check if the requested interface has available credentials
    if not _check_api_key_available(provider_type, interface_type):
        missing_keys = _get_missing_api_key_names(provider_type, interface_type)
        fallback_interface = _INTERFACE_FALLBACKS.get(provider_type)

        if fallback_interface and (provider_type, fallback_interface) in _PROVIDER_MAP:
            # Log warning and fall back to CLI interface
            logging.warning(
                f"API key not found for {provider_type}/{interface_type}. "
                f"Falling back to {provider_type}/{fallback_interface}."
            )
            interface_type = fallback_interface
        else:
            # No fallback available - raise descriptive error
            raise AIProviderError(
                f"Missing API key for {provider_type}/{interface_type}. "
                f"Set one of these environment variables: {', '.join(missing_keys)}"
            )

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
