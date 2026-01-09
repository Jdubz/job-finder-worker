"""Tests for AI provider classes.

Tests individual provider classes (GeminiProvider, ClaudeCLIProvider)
for correct initialization, API/CLI handling, and response parsing.

Supported agents: gemini.api, claude.cli

Note: Tests for provider selection and fallback logic are in test_agent_manager.py.
"""

import pytest
from unittest.mock import patch, MagicMock

from job_finder.ai.providers import (
    ClaudeCLIProvider,
    GeminiProvider,
)
from job_finder.exceptions import AIProviderError, QuotaExhaustedError, TransientError


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
    def test_init_with_model(self, mock_client):
        """Should accept custom model."""
        provider = GeminiProvider(model="gemini-1.5-pro")
        assert provider.model == "gemini-1.5-pro"

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


class TestClaudeCLIProvider:
    """Test ClaudeCLIProvider behavior."""

    def test_init_with_model(self):
        """Should initialize with specified model."""
        provider = ClaudeCLIProvider(model="sonnet")
        assert provider.model == "sonnet"

    def test_init_without_model(self):
        """Should initialize without model (uses CLI default)."""
        provider = ClaudeCLIProvider()
        assert provider.model is None

    def test_init_with_timeout(self):
        """Should accept custom timeout."""
        provider = ClaudeCLIProvider(timeout=180)
        assert provider.timeout == 180

    def test_init_default_timeout(self):
        """Should use default timeout of 120s."""
        provider = ClaudeCLIProvider()
        assert provider.timeout == 120

    @patch("subprocess.run")
    def test_generate_success_with_text_field(self, mock_run):
        """Should parse JSON response with text field."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"text": "Test response from Claude"}',
            stderr="",
        )

        provider = ClaudeCLIProvider()
        result = provider.generate("Test prompt")

        assert result == "Test response from Claude"
        mock_run.assert_called_once()

    @patch("subprocess.run")
    def test_generate_success_with_completion_field(self, mock_run):
        """Should parse JSON response with completion field."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"completion": "Completion response"}',
            stderr="",
        )

        provider = ClaudeCLIProvider()
        result = provider.generate("Test prompt")

        assert result == "Completion response"

    @patch("subprocess.run")
    def test_generate_success_with_nested_output(self, mock_run):
        """Should parse JSON response with output.text field."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"output": {"text": "Nested response"}}',
            stderr="",
        )

        provider = ClaudeCLIProvider()
        result = provider.generate("Test prompt")

        assert result == "Nested response"

    @patch("subprocess.run")
    def test_generate_fallback_to_raw_output(self, mock_run):
        """Should fall back to raw stdout when JSON has unknown structure."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"unknown_field": "value"}',
            stderr="",
        )

        provider = ClaudeCLIProvider()
        result = provider.generate("Test prompt")

        assert result == '{"unknown_field": "value"}'

    @patch("subprocess.run")
    def test_generate_non_json_output(self, mock_run):
        """Should handle plain text output (non-JSON)."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="Plain text response",
            stderr="",
        )

        provider = ClaudeCLIProvider()
        result = provider.generate("Test prompt")

        assert result == "Plain text response"

    @patch("subprocess.run")
    def test_generate_uses_correct_cli_command(self, mock_run):
        """Should invoke 'claude --print --output-format json' with model."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"text": "Response"}',
            stderr="",
        )

        provider = ClaudeCLIProvider(model="opus")
        provider.generate("Test prompt")

        cmd = mock_run.call_args[0][0]
        assert cmd[0] == "claude"
        assert "--print" in cmd
        assert "--output-format" in cmd
        assert "json" in cmd
        assert "--model" in cmd
        assert "opus" in cmd
        assert "Test prompt" in cmd

    @patch("subprocess.run")
    def test_generate_without_model_flag(self, mock_run):
        """Should not include --model flag when model is None."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"text": "Response"}',
            stderr="",
        )

        provider = ClaudeCLIProvider()  # No model specified
        provider.generate("Test prompt")

        cmd = mock_run.call_args[0][0]
        assert "--model" not in cmd

    @patch("subprocess.run")
    def test_generate_cli_error(self, mock_run):
        """Should raise AIProviderError on CLI failure."""
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="Authentication required",
        )

        provider = ClaudeCLIProvider()

        with pytest.raises(AIProviderError, match="Authentication required"):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_cli_error_uses_stdout_when_no_stderr(self, mock_run):
        """Should use stdout for error when stderr is empty."""
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="Error in stdout",
            stderr="",
        )

        provider = ClaudeCLIProvider()

        with pytest.raises(AIProviderError, match="Error in stdout"):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_timeout(self, mock_run):
        """Should raise TransientError on timeout."""
        import subprocess

        mock_run.side_effect = subprocess.TimeoutExpired(cmd="claude", timeout=120)

        provider = ClaudeCLIProvider()

        with pytest.raises(TransientError, match="timed out"):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_binary_not_found(self, mock_run):
        """Should raise AIProviderError when claude binary not found."""
        mock_run.side_effect = FileNotFoundError("claude not found")

        provider = ClaudeCLIProvider()

        with pytest.raises(AIProviderError, match="Claude CLI binary not found"):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_empty_output(self, mock_run):
        """Should raise AIProviderError when CLI returns no output."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="",
            stderr="",
        )

        provider = ClaudeCLIProvider()

        with pytest.raises(AIProviderError, match="returned no output"):
            provider.generate("Test prompt")


class TestAuthHelpers:
    """Test authentication helper functions.

    Note: Gemini API uses Vertex AI which requires GOOGLE_CLOUD_PROJECT and ADC.
    """

    def test_check_gemini_api_auth_missing_project(self):
        """Should return False when GOOGLE_CLOUD_PROJECT is not set."""
        from job_finder.ai.providers import _check_gemini_api_auth

        with patch.dict("os.environ", {}, clear=True):
            available, reason = _check_gemini_api_auth()
            assert available is False
            assert "GOOGLE_CLOUD_PROJECT" in reason

    def test_check_gemini_api_auth_with_adc(self):
        """Should return True when GOOGLE_CLOUD_PROJECT and ADC are available."""
        # Mock google.auth.default() to succeed
        mock_default = MagicMock(return_value=(MagicMock(), "test-project"))

        with (
            patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "test-project"}, clear=True),
            patch("google.auth.default", mock_default),
        ):
            from job_finder.ai.providers import _check_gemini_api_auth

            available, reason = _check_gemini_api_auth()
            assert available is True
            assert reason == ""

    def test_check_cli_auth_with_oauth_token(self):
        """Should detect CLAUDE_CODE_OAUTH_TOKEN."""
        from job_finder.ai.providers import _check_cli_auth

        with patch.dict("os.environ", {"CLAUDE_CODE_OAUTH_TOKEN": "test-token"}):
            available, hint = _check_cli_auth("claude")
            assert available is True

    def test_check_cli_auth_missing(self):
        """Should return False when CLAUDE_CODE_OAUTH_TOKEN not set."""
        from job_finder.ai.providers import _check_cli_auth

        with patch.dict("os.environ", {}, clear=True):
            available, hint = _check_cli_auth("claude")
            assert available is False
            assert "CLAUDE_CODE_OAUTH_TOKEN" in hint

    def test_auth_status_gemini_api_missing_project(self):
        """Should check Gemini API auth correctly - requires GOOGLE_CLOUD_PROJECT."""
        from job_finder.ai.providers import auth_status

        with patch.dict("os.environ", {}, clear=True):
            available, reason = auth_status("gemini", "api")
            assert available is False
            assert "GOOGLE_CLOUD_PROJECT" in reason

    def test_auth_status_claude_cli(self):
        """Should check Claude CLI auth correctly."""
        from job_finder.ai.providers import auth_status

        with patch.dict("os.environ", {"CLAUDE_CODE_OAUTH_TOKEN": "test-token"}):
            available, reason = auth_status("claude", "cli")
            assert available is True

    def test_auth_status_unsupported_agent(self):
        """Should return False for unsupported agents."""
        from job_finder.ai.providers import auth_status

        available, reason = auth_status("openai", "api")
        assert available is False
        assert "unsupported_agent" in reason
