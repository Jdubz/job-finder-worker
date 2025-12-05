"""Tests for CLI health check functionality in flask_worker."""

import base64
import json
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

    def test_both_clis_checked(self):
        """Test that both codex and gemini CLIs are checked."""
        codex_auth = json.dumps({"tokens": {"refresh_token": "test"}})
        gemini_settings = json.dumps({"security": {"auth": {"selectedType": "oauth-personal"}}})
        gemini_creds = json.dumps({"refresh_token": "test-token"})
        gemini_accounts = json.dumps({"active": "user@gmail.com"})

        def mock_open_files(path, *args, **kwargs):
            path_str = str(path)
            if ".codex/auth.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: codex_auth))
            if "settings.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: gemini_settings))
            if "oauth_creds.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: gemini_creds))
            if "google_accounts.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: gemini_accounts))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files):
            result = self.check_cli_health()

            assert "codex" in result
            assert "gemini" in result
            assert "healthy" in result["codex"]
            assert "message" in result["codex"]
            assert "healthy" in result["gemini"]
            assert "message" in result["gemini"]


class TestCodexConfigCheck:
    """Tests for Codex config-based health check."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Import the function fresh for each test."""
        try:
            from job_finder.flask_worker import _check_codex_config
        except ModuleNotFoundError as exc:
            pytest.skip(f"flask not available: {exc}")

        self._check_codex_config = _check_codex_config

    def test_healthy_oauth_with_email_in_jwt(self):
        """Test Codex returns healthy when OAuth is configured with email in JWT."""
        # Create a mock JWT with email in payload
        payload = {"email": "user@example.com", "exp": 9999999999}
        payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        mock_id_token = f"header.{payload_b64}.signature"

        auth_data = json.dumps(
            {
                "OPENAI_API_KEY": None,
                "tokens": {"refresh_token": "rt_test", "id_token": mock_id_token},
            }
        )

        def mock_open_files(path, *args, **kwargs):
            if ".codex/auth.json" in str(path):
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: auth_data))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files):
            result = self._check_codex_config()

            assert result["healthy"] is True
            assert "user@example.com" in result["message"]

    def test_healthy_oauth_without_email_in_jwt(self):
        """Test Codex returns healthy when OAuth creds exist but JWT is invalid."""
        auth_data = json.dumps(
            {
                "OPENAI_API_KEY": None,
                "tokens": {"refresh_token": "rt_test", "id_token": "invalid.jwt.token"},
            }
        )

        def mock_open_files(path, *args, **kwargs):
            if ".codex/auth.json" in str(path):
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: auth_data))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files):
            result = self._check_codex_config()

            assert result["healthy"] is True
            assert "OAuth credentials configured" in result["message"]

    def test_healthy_api_key_in_file(self):
        """Test Codex returns healthy when API key is in auth file."""
        auth_data = json.dumps({"OPENAI_API_KEY": "sk-test-key", "tokens": None})

        def mock_open_files(path, *args, **kwargs):
            if ".codex/auth.json" in str(path):
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: auth_data))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files):
            result = self._check_codex_config()

            assert result["healthy"] is True
            assert "API key configured" in result["message"]

    def test_healthy_api_key_in_env(self):
        """Test Codex returns healthy when API key is in environment."""
        auth_data = json.dumps({"OPENAI_API_KEY": None, "tokens": {}})

        def mock_open_files(path, *args, **kwargs):
            if ".codex/auth.json" in str(path):
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: auth_data))
            raise FileNotFoundError(f"No such file: {path}")

        with (
            patch("builtins.open", mock_open_files),
            patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}),
        ):
            result = self._check_codex_config()

            assert result["healthy"] is True
            assert "environment" in result["message"]

    def test_healthy_auth_file_missing_but_env_key(self):
        """Test Codex returns healthy when auth file missing but API key in env."""
        with (
            patch("builtins.open", side_effect=FileNotFoundError("No such file")),
            patch.dict("os.environ", {"OPENAI_API_KEY": "sk-test"}),
        ):
            result = self._check_codex_config()

            assert result["healthy"] is True
            assert "environment" in result["message"]

    def test_unhealthy_auth_file_missing_no_env(self):
        """Test Codex returns unhealthy when auth file missing and no env var."""
        with (
            patch("builtins.open", side_effect=FileNotFoundError("No such file")),
            patch.dict("os.environ", {}, clear=True),
        ):
            import os

            os.environ.pop("OPENAI_API_KEY", None)

            result = self._check_codex_config()

            assert result["healthy"] is False
            assert "auth file not found" in result["message"]

    def test_unhealthy_no_credentials(self):
        """Test Codex returns unhealthy when no credentials in auth file."""
        auth_data = json.dumps({"OPENAI_API_KEY": None, "tokens": {}})

        def mock_open_files(path, *args, **kwargs):
            if ".codex/auth.json" in str(path):
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: auth_data))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files), patch.dict("os.environ", {}, clear=True):
            import os

            os.environ.pop("OPENAI_API_KEY", None)

            result = self._check_codex_config()

            assert result["healthy"] is False
            assert "no credentials found" in result["message"]

    def test_unhealthy_invalid_json(self):
        """Test Codex returns unhealthy when config file has invalid JSON."""

        def mock_open_files(path, *args, **kwargs):
            return MagicMock(__enter__=lambda s: MagicMock(read=lambda: "invalid json{"))

        with patch("builtins.open", mock_open_files):
            result = self._check_codex_config()

            assert result["healthy"] is False
            assert "invalid" in result["message"].lower()


class TestGeminiConfigCheck:
    """Tests for Gemini config-based health check."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Import the function fresh for each test."""
        try:
            from job_finder.flask_worker import _check_gemini_config
        except ModuleNotFoundError as exc:
            pytest.skip(f"flask not available: {exc}")

        self._check_gemini_config = _check_gemini_config

    def test_healthy_oauth_with_active_account(self):
        """Test Gemini returns healthy when OAuth is configured with active account."""
        settings_data = json.dumps({"security": {"auth": {"selectedType": "oauth-personal"}}})
        creds_data = json.dumps({"refresh_token": "test-refresh-token"})
        accounts_data = json.dumps({"active": "user@gmail.com"})

        def mock_open_files(path, *args, **kwargs):
            path_str = str(path)
            if "settings.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: settings_data))
            if "oauth_creds.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: creds_data))
            if "google_accounts.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: accounts_data))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files):
            result = self._check_gemini_config()

            assert result["healthy"] is True
            assert "user@gmail.com" in result["message"]

    def test_healthy_oauth_without_accounts_file(self):
        """Test Gemini returns healthy when OAuth creds exist but no accounts file."""
        settings_data = json.dumps({"security": {"auth": {"selectedType": "oauth-personal"}}})
        creds_data = json.dumps({"refresh_token": "test-refresh-token"})

        def mock_open_files(path, *args, **kwargs):
            path_str = str(path)
            if "settings.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: settings_data))
            if "oauth_creds.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: creds_data))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files):
            result = self._check_gemini_config()

            assert result["healthy"] is True
            assert "OAuth credentials configured" in result["message"]

    def test_unhealthy_settings_file_missing(self):
        """Test Gemini returns unhealthy when settings file is missing."""
        with patch("builtins.open", side_effect=FileNotFoundError("No such file")):
            result = self._check_gemini_config()

            assert result["healthy"] is False
            assert "settings file not found" in result["message"]

    def test_unhealthy_no_auth_type_selected(self):
        """Test Gemini returns unhealthy when no auth type is selected."""
        settings_data = json.dumps({"security": {}})

        def mock_open_files(path, *args, **kwargs):
            path_str = str(path)
            if "settings.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: settings_data))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files):
            result = self._check_gemini_config()

            assert result["healthy"] is False
            assert "no auth type selected" in result["message"]

    def test_unhealthy_oauth_missing_refresh_token(self):
        """Test Gemini returns unhealthy when OAuth creds are missing refresh token."""
        settings_data = json.dumps({"security": {"auth": {"selectedType": "oauth-personal"}}})
        creds_data = json.dumps({"access_token": "test-token"})  # No refresh_token

        def mock_open_files(path, *args, **kwargs):
            path_str = str(path)
            if "settings.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: settings_data))
            if "oauth_creds.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: creds_data))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files):
            result = self._check_gemini_config()

            assert result["healthy"] is False
            assert "missing refresh token" in result["message"]

    def test_healthy_api_key_with_env_var(self):
        """Test Gemini returns healthy when API key auth with env var set."""
        settings_data = json.dumps({"security": {"auth": {"selectedType": "api-key"}}})

        def mock_open_files(path, *args, **kwargs):
            path_str = str(path)
            if "settings.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: settings_data))
            raise FileNotFoundError(f"No such file: {path}")

        with (
            patch("builtins.open", mock_open_files),
            patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}),
        ):
            result = self._check_gemini_config()

            assert result["healthy"] is True
            assert "API key configured" in result["message"]

    def test_unhealthy_api_key_without_env_var(self):
        """Test Gemini returns unhealthy when API key auth but no env var."""
        settings_data = json.dumps({"security": {"auth": {"selectedType": "api-key"}}})

        def mock_open_files(path, *args, **kwargs):
            path_str = str(path)
            if "settings.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: settings_data))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files), patch.dict("os.environ", {}, clear=True):
            import os

            os.environ.pop("GEMINI_API_KEY", None)
            os.environ.pop("GOOGLE_API_KEY", None)

            result = self._check_gemini_config()

            assert result["healthy"] is False
            assert "API key not found" in result["message"]

    def test_healthy_gcloud_auth_type(self):
        """Test Gemini returns healthy for gcloud auth type."""
        settings_data = json.dumps({"security": {"auth": {"selectedType": "gcloud"}}})

        def mock_open_files(path, *args, **kwargs):
            path_str = str(path)
            if "settings.json" in path_str:
                return MagicMock(__enter__=lambda s: MagicMock(read=lambda: settings_data))
            raise FileNotFoundError(f"No such file: {path}")

        with patch("builtins.open", mock_open_files):
            result = self._check_gemini_config()

            assert result["healthy"] is True
            assert "gcloud" in result["message"]

    def test_unhealthy_invalid_json(self):
        """Test Gemini returns unhealthy when config file has invalid JSON."""

        def mock_open_files(path, *args, **kwargs):
            return MagicMock(__enter__=lambda s: MagicMock(read=lambda: "invalid json{"))

        with patch("builtins.open", mock_open_files):
            result = self._check_gemini_config()

            assert result["healthy"] is False
            assert "invalid" in result["message"].lower()
