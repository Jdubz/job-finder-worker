"""Tests for AI provider classes.

Tests individual provider classes (CodexCLIProvider, ClaudeProvider, etc.)
for correct initialization, API key handling, and response parsing.

Note: Tests for provider selection and fallback logic are in test_agent_manager.py.
The create_provider_from_config function was removed in the AgentManager refactor.
"""

import pytest
from unittest.mock import patch, MagicMock

from job_finder.ai.providers import (
    ClaudeProvider,
    CodexCLIProvider,
    GeminiCLIProvider,
    GeminiProvider,
    OpenAIProvider,
)
from job_finder.exceptions import AIProviderError, QuotaExhaustedError


class TestCodexCLIProvider:
    """Test CodexCLIProvider behavior."""

    def test_init_with_model(self):
        """Should initialize with specified model."""
        provider = CodexCLIProvider(model="gpt-5-codex")
        assert provider.model == "gpt-5-codex"

    def test_init_with_default_model(self):
        """Should use default model when not specified."""
        provider = CodexCLIProvider()
        assert provider.model == "gpt-5-codex"

    def test_init_with_timeout(self):
        """Should accept custom timeout."""
        provider = CodexCLIProvider(timeout=120)
        assert provider.timeout == 120

    @patch("subprocess.run")
    def test_generate_success(self, mock_run):
        """Should successfully parse agent message from codex exec JSONL."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="\n".join(
                [
                    '{"type":"turn.started"}',
                    '{"type":"item.completed","item":{"type":"agent_message","text":"Test response"}}',
                    '{"type":"turn.completed"}',
                ]
            ),
            stderr="",
        )

        provider = CodexCLIProvider()
        result = provider.generate("Test prompt")

        assert result == "Test response"
        mock_run.assert_called_once()

    @patch("subprocess.run")
    def test_generate_uses_correct_cli_command(self, mock_run, tmp_path):
        """Should invoke 'codex exec --json' with cwd and model flags."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"type":"item.completed","item":{"type":"agent_message","text":"Test response"}}',
            stderr="",
        )

        with patch.dict("os.environ", {"CODEX_WORKDIR": str(tmp_path)}):
            provider = CodexCLIProvider(model="gpt-5-codex")
            provider.generate("Test prompt")

        cmd = mock_run.call_args[0][0]
        assert cmd[:4] == ["codex", "exec", "--json", "--skip-git-repo-check"]
        assert "--cd" in cmd and str(tmp_path) in cmd
        assert "--model" in cmd and "gpt-5-codex" in cmd
        assert cmd[-2:] == ["--", "Test prompt"]

    @patch("subprocess.run")
    def test_generate_retries_without_model_when_unsupported(self, mock_run):
        """Retry without model flag when ChatGPT account rejects model."""
        mock_run.side_effect = [
            MagicMock(
                returncode=1,
                stdout="",
                stderr="The 'gpt-4o' model is not supported when using Codex with a ChatGPT account.",
            ),
            MagicMock(
                returncode=0,
                stdout='{"type":"item.completed","item":{"type":"agent_message","text":"Fallback response"}}',
                stderr="",
            ),
        ]

        provider = CodexCLIProvider(model="gpt-4o")
        result = provider.generate("Test prompt")

        assert result == "Fallback response"
        assert mock_run.call_count == 2

    @patch("subprocess.run")
    def test_generate_cli_error(self, mock_run):
        """Should raise AIProviderError on CLI failure."""
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="Authentication required",
        )

        provider = CodexCLIProvider()

        with pytest.raises(AIProviderError, match="Codex CLI failed"):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_timeout(self, mock_run):
        """Should raise AIProviderError on timeout."""
        import subprocess

        mock_run.side_effect = subprocess.TimeoutExpired(cmd="codex", timeout=60)

        provider = CodexCLIProvider()

        with pytest.raises(AIProviderError, match="timed out"):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_empty_content_raises_error(self, mock_run):
        """Should raise AIProviderError when CLI returns empty content."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"type":"turn.completed"}',
            stderr="",
        )

        provider = CodexCLIProvider()

        with pytest.raises(AIProviderError, match="no message content"):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_malformed_json_raises_error(self, mock_run):
        """Should raise AIProviderError on malformed JSON response."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="not valid json",
            stderr="",
        )

        provider = CodexCLIProvider()

        with pytest.raises(AIProviderError, match="no message content"):
            provider.generate("Test prompt")


class TestClaudeProvider:
    """Test ClaudeProvider behavior."""

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
    @patch("job_finder.ai.providers.Anthropic")
    def test_init_with_env_key(self, mock_anthropic):
        """Should use API key from environment."""
        provider = ClaudeProvider()
        assert provider.api_key == "test-key"
        mock_anthropic.assert_called_once_with(api_key="test-key")

    @patch("job_finder.ai.providers.Anthropic")
    def test_init_with_explicit_key(self, mock_anthropic):
        """Should use explicitly provided API key."""
        provider = ClaudeProvider(api_key="explicit-key")
        assert provider.api_key == "explicit-key"
        mock_anthropic.assert_called_once_with(api_key="explicit-key")

    @patch.dict("os.environ", {}, clear=True)
    def test_init_raises_without_key(self):
        """Should raise error when no API key available."""
        # Clear ANTHROPIC_API_KEY if it exists
        import os

        os.environ.pop("ANTHROPIC_API_KEY", None)

        with pytest.raises(AIProviderError, match="API key must be provided"):
            ClaudeProvider()

    def test_init_with_model(self):
        """Should use specified model."""
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            with patch("job_finder.ai.providers.Anthropic"):
                provider = ClaudeProvider(model="claude-3-opus")
                assert provider.model == "claude-3-opus"


class TestOpenAIProvider:
    """Test OpenAIProvider behavior."""

    @patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"})
    @patch("job_finder.ai.providers.OpenAI")
    def test_init_with_env_key(self, mock_openai):
        """Should use API key from environment."""
        provider = OpenAIProvider()
        assert provider.api_key == "test-key"
        mock_openai.assert_called_once_with(api_key="test-key")

    @patch.dict("os.environ", {}, clear=True)
    def test_init_raises_without_key(self):
        """Should raise error when no API key available."""
        import os

        os.environ.pop("OPENAI_API_KEY", None)

        with pytest.raises(AIProviderError, match="API key must be provided"):
            OpenAIProvider()


class TestGeminiProvider:
    """Test GeminiProvider behavior (Vertex AI implementation)."""

    @pytest.fixture(autouse=True)
    def skip_if_no_google_genai(self):
        """Skip tests if google-genai is not installed."""
        try:
            from google import genai  # noqa: F401
        except ImportError:
            pytest.skip("google-genai package not installed")

    @patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "test-project"})
    @patch("google.genai.Client")
    def test_init_with_project(self, mock_client):
        """Should use GOOGLE_CLOUD_PROJECT from environment."""
        provider = GeminiProvider()
        assert provider.project == "test-project"
        mock_client.assert_called_once_with(
            vertexai=True,
            project="test-project",
            location="us-central1",
        )

    @patch.dict(
        "os.environ",
        {"GOOGLE_CLOUD_PROJECT": "test-project", "GOOGLE_CLOUD_LOCATION": "europe-west1"},
    )
    @patch("google.genai.Client")
    def test_init_with_custom_location(self, mock_client):
        """Should use custom location from environment."""
        provider = GeminiProvider()
        assert provider.location == "europe-west1"
        mock_client.assert_called_once_with(
            vertexai=True,
            project="test-project",
            location="europe-west1",
        )

    @patch.dict("os.environ", {}, clear=True)
    def test_init_raises_without_project(self):
        """Should raise error when GOOGLE_CLOUD_PROJECT not set."""
        import os

        os.environ.pop("GOOGLE_CLOUD_PROJECT", None)

        with pytest.raises(AIProviderError, match="GCP project must be provided"):
            GeminiProvider()

    @patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "test-project"})
    @patch("google.genai.Client")
    def test_generate_success(self, mock_client_class):
        """Should return text from successful response."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_response = MagicMock()
        mock_response.text = "Hello, world!"
        mock_client.models.generate_content.return_value = mock_response

        provider = GeminiProvider()
        result = provider.generate("Say hello")

        assert result == "Hello, world!"
        mock_client.models.generate_content.assert_called_once()

    @patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "test-project"})
    @patch("google.genai.Client")
    def test_generate_empty_response(self, mock_client_class):
        """Should raise error when response.text raises ValueError."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_response = MagicMock()
        mock_response.prompt_feedback = None
        type(mock_response).text = property(
            lambda self: (_ for _ in ()).throw(ValueError("No text"))
        )
        mock_client.models.generate_content.return_value = mock_response

        provider = GeminiProvider()
        with pytest.raises(AIProviderError, match="empty or invalid response"):
            provider.generate("Say hello")

    @patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "test-project"})
    @patch("google.genai.Client")
    def test_generate_safety_blocked(self, mock_client_class):
        """Should raise error with safety filter reason when blocked."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_response = MagicMock()
        mock_response.prompt_feedback = MagicMock()
        mock_response.prompt_feedback.block_reason = MagicMock()
        mock_response.prompt_feedback.block_reason.name = "SAFETY"
        type(mock_response).text = property(
            lambda self: (_ for _ in ()).throw(ValueError("Blocked"))
        )
        mock_client.models.generate_content.return_value = mock_response

        provider = GeminiProvider()
        with pytest.raises(AIProviderError, match="blocked by safety filters: SAFETY"):
            provider.generate("Bad prompt")

    @patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "test-project"})
    @patch("google.genai.Client")
    def test_generate_quota_exhausted(self, mock_client_class):
        """Should raise QuotaExhaustedError when quota is hit."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.models.generate_content.side_effect = Exception(
            "Resource exhausted: quota exceeded"
        )

        provider = GeminiProvider()
        with pytest.raises(QuotaExhaustedError):
            provider.generate("Say hello")

    @patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "test-project"})
    @patch("google.genai.Client")
    def test_generate_api_error(self, mock_client_class):
        """Should wrap generic errors in AIProviderError."""
        mock_client = MagicMock()
        mock_client_class.return_value = mock_client
        mock_client.models.generate_content.side_effect = Exception("Network error")

        provider = GeminiProvider()
        with pytest.raises(AIProviderError, match="Gemini API error: Network error"):
            provider.generate("Say hello")


class TestGeminiCLIProvider:
    """Test GeminiCLIProvider behavior."""

    def test_init_with_model(self):
        """Should initialize with specified model."""
        provider = GeminiCLIProvider(model="gemini-2.0-flash")
        assert provider.model == "gemini-2.0-flash"

    def test_init_with_timeout(self):
        """Should accept custom timeout."""
        provider = GeminiCLIProvider(timeout=180)
        assert provider.timeout == 180

    @patch("subprocess.run")
    def test_generate_success(self, mock_run):
        """Should parse JSON response from gemini CLI."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"response": "Test response from Gemini"}',
            stderr="",
        )

        provider = GeminiCLIProvider()
        result = provider.generate("Test prompt")

        assert result == "Test response from Gemini"

    @patch("subprocess.run")
    def test_generate_handles_yolo_prefix(self, mock_run):
        """Should handle 'YOLO mode...' prefix in output."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='YOLO mode enabled\n{"response": "Test response"}',
            stderr="",
        )

        provider = GeminiCLIProvider()
        result = provider.generate("Test prompt")

        assert result == "Test response"

    @patch("subprocess.run")
    def test_generate_quota_exhausted(self, mock_run):
        """Should raise QuotaExhaustedError when quota is exceeded."""
        from job_finder.exceptions import QuotaExhaustedError

        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="Error: You have exhausted your daily quota",
        )

        provider = GeminiCLIProvider()

        with pytest.raises(QuotaExhaustedError):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_timeout(self, mock_run):
        """Should raise AIProviderError on timeout."""
        import subprocess

        mock_run.side_effect = subprocess.TimeoutExpired(cmd="gemini", timeout=120)

        provider = GeminiCLIProvider()

        with pytest.raises(AIProviderError, match="timed out"):
            provider.generate("Test prompt")
