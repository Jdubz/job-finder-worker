"""AI provider abstractions for different LLM services.

Provider configuration is managed via the ai-settings config entry.
The selected provider/interface/model is used for all AI tasks.
"""

import json
import logging
import os
import subprocess
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from anthropic import Anthropic
from openai import OpenAI

from job_finder.exceptions import AIProviderError, QuotaExhaustedError

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


class ClaudeProvider(AIProvider):
    """Anthropic Claude provider (API interface)."""

    def __init__(self, model: str, api_key: Optional[str] = None):
        """
        Initialize Claude provider.

        Args:
            model: Model identifier (required - from ai-settings config).
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var).
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

    def __init__(self, model: str, api_key: Optional[str] = None):
        """
        Initialize OpenAI provider.

        Args:
            model: Model identifier (required - from ai-settings config).
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var).
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

    def __init__(self, model: str, api_key: Optional[str] = None):
        """
        Initialize Gemini provider.

        Args:
            model: Model identifier (required - from ai-settings config).
            api_key: Google API key (defaults to GOOGLE_API_KEY or GEMINI_API_KEY env var).
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
            model: Model identifier. If omitted, CLI uses its default (latest flash).
            timeout: Command timeout in seconds (default 120s for longer responses).
        """
        self.model = model
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
        ]
        if self.model:
            cmd.extend(["-m", self.model])
        cmd.append(prompt)

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
                    error_output = result.stderr.strip() or stdout
                    if _is_quota_exhausted(error_output):
                        raise QuotaExhaustedError(
                            "Gemini daily quota exhausted",
                            provider="gemini",
                            reset_info="midnight Pacific time",
                        )
                    raise AIProviderError(
                        f"Gemini CLI failed (exit {result.returncode}): {error_output}"
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
                if _is_quota_exhausted(error_msg):
                    raise QuotaExhaustedError(
                        "Gemini daily quota exhausted",
                        provider="gemini",
                        reset_info="midnight Pacific time",
                    )
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
    If model is omitted, the CLI uses its configured default from config.toml.
    """

    def __init__(self, model: Optional[str] = None, timeout: int = 60):
        """
        Initialize Codex CLI provider.

        Args:
            model: Model identifier. If omitted, CLI uses its configured default.
            timeout: Command timeout in seconds (default 60s).
        """
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
            raise AIProviderError(f"Claude CLI timed out after {self.timeout}s") from exc
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
_PROVIDER_MAP: Dict[tuple, type] = {
    ("codex", "cli"): CodexCLIProvider,
    ("claude", "cli"): ClaudeCLIProvider,
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


_CLI_AUTH_CONFIG: Dict[str, Dict[str, Any]] = {
    "codex": {
        "env_vars": ["OPENAI_API_KEY"],
        "file_path": Path.home().joinpath(".codex", "auth.json"),
        "hint": "OPENAI_API_KEY or ~/.codex/auth.json",
    },
    "gemini": {
        "env_vars": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
        "file_path": Path.home().joinpath(".gemini", "settings.json"),
        "hint": "GEMINI_API_KEY/GOOGLE_API_KEY or ~/.gemini/settings.json",
    },
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


def auth_status(provider: str, interface: str) -> Tuple[bool, str]:
    """Return (is_available, reason)."""
    if interface == "api":
        if _check_api_key_available(provider, interface):
            return True, ""
        missing = ",".join(_get_missing_api_key_names(provider, interface))
        return False, f"missing_api_key:{missing}"

    available, hint = _check_cli_auth(provider)
    if available:
        return True, ""
    return False, f"missing_cli_auth:{hint}"
