"""Tests for the Flask worker /cli/health endpoint."""

import subprocess
from unittest.mock import patch, MagicMock

import pytest


@pytest.fixture
def flask_client():
    """Create a Flask test client for the worker app."""
    from job_finder.flask_worker import app

    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


class TestCliHealthEndpoint:
    """Tests for the /cli/health endpoint."""

    def test_cli_health_all_providers_authenticated(self, flask_client, monkeypatch):
        """Test when all providers are authenticated."""
        # Mock subprocess for CLI checks
        def mock_run(args, **kwargs):
            result = MagicMock()
            result.returncode = 0
            if args[0] == "codex":
                result.stdout = "Logged in as user@example.com"
                result.stderr = ""
            elif args[0] == "gemini":
                result.stdout = "I'm ready for your first command."
                result.stderr = ""
            return result

        with patch("subprocess.run", side_effect=mock_run):
            response = flask_client.get("/cli/health")

        assert response.status_code == 200
        data = response.get_json()

        assert "providers" in data
        assert "timestamp" in data

        # Check codex
        assert data["providers"]["codex"]["available"] is True
        assert data["providers"]["codex"]["authenticated"] is True
        assert "Logged in" in data["providers"]["codex"]["message"]

        # Check gemini
        assert data["providers"]["gemini"]["available"] is True
        assert data["providers"]["gemini"]["authenticated"] is True
        assert "ready" in data["providers"]["gemini"]["message"].lower()

        # Only codex and gemini should be present
        assert len(data["providers"]) == 2

    def test_cli_health_codex_not_logged_in(self, flask_client, monkeypatch):
        """Test when codex is installed but not logged in."""
        def mock_run(args, **kwargs):
            result = MagicMock()
            if args[0] == "codex":
                result.returncode = 1
                result.stdout = ""
                result.stderr = "Not logged in. Run `codex login` to authenticate."
            elif args[0] == "gemini":
                result.returncode = 0
                result.stdout = "I'm ready for your first command."
                result.stderr = ""
            return result

        with patch("subprocess.run", side_effect=mock_run):
            response = flask_client.get("/cli/health")

        assert response.status_code == 200
        data = response.get_json()

        assert data["providers"]["codex"]["available"] is True
        assert data["providers"]["codex"]["authenticated"] is False
        assert "Not logged in" in data["providers"]["codex"]["message"]

    def test_cli_health_gemini_not_authenticated(self, flask_client, monkeypatch):
        """Test when gemini CLI returns non-ready status."""
        def mock_run(args, **kwargs):
            result = MagicMock()
            if args[0] == "codex":
                result.returncode = 0
                result.stdout = "Logged in as user@example.com"
                result.stderr = ""
            elif args[0] == "gemini":
                result.returncode = 1
                result.stdout = ""
                result.stderr = "Please set an Auth method in your settings.json"
            return result

        with patch("subprocess.run", side_effect=mock_run):
            response = flask_client.get("/cli/health")

        assert response.status_code == 200
        data = response.get_json()

        assert data["providers"]["gemini"]["available"] is True
        assert data["providers"]["gemini"]["authenticated"] is False
        assert "Auth method" in data["providers"]["gemini"]["message"]

    def test_cli_health_cli_not_installed(self, flask_client, monkeypatch):
        """Test when CLI tools are not installed."""
        def mock_run(args, **kwargs):
            raise FileNotFoundError(f"Command '{args[0]}' not found")

        with patch("subprocess.run", side_effect=mock_run):
            response = flask_client.get("/cli/health")

        assert response.status_code == 200
        data = response.get_json()

        assert data["providers"]["codex"]["available"] is False
        assert data["providers"]["codex"]["authenticated"] is False
        assert "not installed" in data["providers"]["codex"]["message"].lower()

        assert data["providers"]["gemini"]["available"] is False
        assert data["providers"]["gemini"]["authenticated"] is False
        assert "not installed" in data["providers"]["gemini"]["message"].lower()

    def test_cli_health_timeout(self, flask_client, monkeypatch):
        """Test when CLI health check times out."""
        def mock_run(args, **kwargs):
            raise subprocess.TimeoutExpired(cmd=args[0], timeout=5)

        with patch("subprocess.run", side_effect=mock_run):
            response = flask_client.get("/cli/health")

        assert response.status_code == 200
        data = response.get_json()

        assert data["providers"]["codex"]["available"] is True
        assert data["providers"]["codex"]["authenticated"] is False
        assert "timed out" in data["providers"]["codex"]["message"].lower()

        assert data["providers"]["gemini"]["available"] is True
        assert data["providers"]["gemini"]["authenticated"] is False
        assert "timed out" in data["providers"]["gemini"]["message"].lower()

    def test_cli_health_unexpected_error(self, flask_client, monkeypatch):
        """Test handling of unexpected errors during CLI check."""
        def mock_run(args, **kwargs):
            raise RuntimeError("Unexpected subprocess error")

        with patch("subprocess.run", side_effect=mock_run):
            response = flask_client.get("/cli/health")

        assert response.status_code == 200
        data = response.get_json()

        assert data["providers"]["codex"]["available"] is False
        assert data["providers"]["codex"]["authenticated"] is False
        assert "Unexpected subprocess error" in data["providers"]["codex"]["message"]

    def test_cli_health_response_structure(self, flask_client, monkeypatch):
        """Test that response matches expected CliHealthResponse structure."""
        def mock_run(args, **kwargs):
            result = MagicMock()
            result.returncode = 0
            result.stdout = "Logged in" if args[0] == "codex" else "I'm ready"
            result.stderr = ""
            return result

        with patch("subprocess.run", side_effect=mock_run):
            response = flask_client.get("/cli/health")

        data = response.get_json()

        # Verify top-level structure
        assert "providers" in data
        assert "timestamp" in data
        assert isinstance(data["timestamp"], (int, float))

        # Verify only codex and gemini are present
        expected_providers = ["codex", "gemini"]
        assert len(data["providers"]) == 2
        for provider in expected_providers:
            assert provider in data["providers"]

            # Verify provider structure
            provider_data = data["providers"][provider]
            assert "available" in provider_data
            assert "authenticated" in provider_data
            assert "message" in provider_data
            assert isinstance(provider_data["available"], bool)
            assert isinstance(provider_data["authenticated"], bool)
            assert isinstance(provider_data["message"], str)

    def test_cli_health_mixed_status(self, flask_client, monkeypatch):
        """Test with mixed authentication status across providers."""
        call_count = {"codex": 0, "gemini": 0}

        def mock_run(args, **kwargs):
            result = MagicMock()
            if args[0] == "codex":
                call_count["codex"] += 1
                result.returncode = 0
                result.stdout = "Logged in as user@example.com"
                result.stderr = ""
            elif args[0] == "gemini":
                call_count["gemini"] += 1
                result.returncode = 1
                result.stdout = ""
                result.stderr = "Not authenticated"
            return result

        with patch("subprocess.run", side_effect=mock_run):
            response = flask_client.get("/cli/health")

        assert response.status_code == 200
        data = response.get_json()

        # Codex: authenticated
        assert data["providers"]["codex"]["authenticated"] is True

        # Gemini: not authenticated
        assert data["providers"]["gemini"]["authenticated"] is False

        # Verify both CLIs were checked
        assert call_count["codex"] == 1
        assert call_count["gemini"] == 1
