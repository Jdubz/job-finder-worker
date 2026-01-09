"""Tests for CLI health check functionality in flask_worker.

Supported agents: claude.cli, gemini.api
"""

from unittest.mock import MagicMock, patch

import pytest


class TestCheckCliHealth:
    """Tests for the check_cli_health function."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Import the function fresh for each test."""
        # Import here to avoid module-level import issues with mocking
        try:
            from job_finder.flask_worker import check_cli_health
        except ModuleNotFoundError as exc:  # flask not installed in lightweight envs
            pytest.skip(f"flask not available: {exc}")

        self.check_cli_health = check_cli_health

    def test_both_agents_checked(self):
        """Test that both claude and gemini agents are checked."""
        with patch.dict(
            "os.environ",
            {
                "CLAUDE_CODE_OAUTH_TOKEN": "test-token-thats-long-enough-to-pass",
                "GEMINI_API_KEY": "test-api-key-long-enough",
            },
        ):
            result = self.check_cli_health()

            assert "claude" in result
            assert "gemini" in result
            assert "healthy" in result["claude"]
            assert "message" in result["claude"]
            assert "healthy" in result["gemini"]
            assert "message" in result["gemini"]


class TestClaudeCLIConfigCheck:
    """Tests for Claude CLI config-based health check."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Import the function fresh for each test."""
        try:
            from job_finder.flask_worker import _check_claude_cli_config
        except ModuleNotFoundError as exc:
            pytest.skip(f"flask not available: {exc}")

        self._check_claude_cli_config = _check_claude_cli_config

    def test_healthy_with_oauth_token(self):
        """Test Claude returns healthy when OAuth token is configured."""
        with patch.dict(
            "os.environ", {"CLAUDE_CODE_OAUTH_TOKEN": "a-valid-oauth-token-thats-long-enough"}
        ):
            result = self._check_claude_cli_config()

            assert result["healthy"] is True
            assert "OAuth token configured" in result["message"]

    def test_unhealthy_token_too_short(self):
        """Test Claude returns unhealthy when token is too short."""
        with patch.dict("os.environ", {"CLAUDE_CODE_OAUTH_TOKEN": "short"}):
            result = self._check_claude_cli_config()

            assert result["healthy"] is False
            assert "invalid" in result["message"].lower()

    def test_unhealthy_no_token(self):
        """Test Claude returns unhealthy when no token is set."""
        with patch.dict("os.environ", {}, clear=True):
            result = self._check_claude_cli_config()

            assert result["healthy"] is False
            assert "CLAUDE_CODE_OAUTH_TOKEN" in result["message"]


class TestGeminiAPIConfigCheck:
    """Tests for Gemini API config-based health check."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Import the function fresh for each test."""
        try:
            from job_finder.flask_worker import _check_gemini_api_config
        except ModuleNotFoundError as exc:
            pytest.skip(f"flask not available: {exc}")

        self._check_gemini_api_config = _check_gemini_api_config

    def test_healthy_with_gemini_api_key(self):
        """Test Gemini returns healthy when GEMINI_API_KEY is set."""
        with patch.dict("os.environ", {"GEMINI_API_KEY": "test-api-key-long-enough"}, clear=True):
            result = self._check_gemini_api_config()

            assert result["healthy"] is True
            assert "API key configured" in result["message"]

    def test_healthy_with_google_api_key(self):
        """Test Gemini returns healthy when GOOGLE_API_KEY is set."""
        with patch.dict("os.environ", {"GOOGLE_API_KEY": "test-api-key-long-enough"}, clear=True):
            result = self._check_gemini_api_config()

            assert result["healthy"] is True
            assert "API key configured" in result["message"]

    def test_unhealthy_api_key_too_short(self):
        """Test Gemini returns unhealthy when API key is too short."""
        with patch.dict("os.environ", {"GEMINI_API_KEY": "short"}, clear=True):
            result = self._check_gemini_api_config()

            assert result["healthy"] is False
            assert "invalid" in result["message"].lower()

    def test_healthy_with_vertex_ai_service_account(self, tmp_path):
        """Test Gemini returns healthy with Vertex AI and service account file."""
        creds_file = tmp_path / "creds.json"
        creds_file.write_text("{}")

        with patch.dict(
            "os.environ",
            {
                "GOOGLE_CLOUD_PROJECT": "test-project",
                "GOOGLE_APPLICATION_CREDENTIALS": str(creds_file),
            },
            clear=True,
        ):
            result = self._check_gemini_api_config()

            assert result["healthy"] is True
            assert "Vertex AI" in result["message"]
            assert "test-project" in result["message"]

    def test_unhealthy_vertex_ai_missing_creds_file(self):
        """Test Gemini returns unhealthy when service account file doesn't exist."""
        with patch.dict(
            "os.environ",
            {
                "GOOGLE_CLOUD_PROJECT": "test-project",
                "GOOGLE_APPLICATION_CREDENTIALS": "/nonexistent/creds.json",
            },
            clear=True,
        ):
            result = self._check_gemini_api_config()

            assert result["healthy"] is False
            assert "not found" in result["message"]

    def test_healthy_with_vertex_ai_adc(self):
        """Test Gemini returns healthy with Vertex AI ADC."""
        mock_google_auth = MagicMock()
        mock_google_auth.default.return_value = (MagicMock(), "test-project")

        with (
            patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "test-project"}, clear=True),
            patch.dict("sys.modules", {"google.auth": mock_google_auth}),
        ):
            # Re-import to pick up the mocked module
            import importlib

            from job_finder import flask_worker

            importlib.reload(flask_worker)
            result = flask_worker._check_gemini_api_config()

            assert result["healthy"] is True
            assert "ADC" in result["message"]

    def test_unhealthy_vertex_ai_no_adc(self):
        """Test Gemini returns unhealthy when ADC fails."""
        mock_google_auth = MagicMock()
        mock_google_auth.default.side_effect = Exception("No credentials")

        with (
            patch.dict("os.environ", {"GOOGLE_CLOUD_PROJECT": "test-project"}, clear=True),
            patch.dict("sys.modules", {"google.auth": mock_google_auth}),
        ):
            import importlib

            from job_finder import flask_worker

            importlib.reload(flask_worker)
            result = flask_worker._check_gemini_api_config()

            assert result["healthy"] is False
            assert "ADC not configured" in result["message"]

    def test_unhealthy_no_credentials(self):
        """Test Gemini returns unhealthy when no credentials available."""
        with patch.dict("os.environ", {}, clear=True):
            result = self._check_gemini_api_config()

            assert result["healthy"] is False
            assert "not configured" in result["message"]
