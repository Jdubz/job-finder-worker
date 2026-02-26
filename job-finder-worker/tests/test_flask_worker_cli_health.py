"""Tests for LiteLLM health check functionality in flask_worker.

The worker checks the LiteLLM proxy's /health endpoint to verify
AI inference is available.
"""

from unittest.mock import MagicMock, patch

import pytest


class TestCheckLitellmHealth:
    """Tests for the check_litellm_health function."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Import the function fresh for each test."""
        try:
            from job_finder.flask_worker import check_litellm_health
        except ModuleNotFoundError as exc:  # flask not installed in lightweight envs
            pytest.skip(f"flask not available: {exc}")

        self.check_litellm_health = check_litellm_health

    @patch("requests.get")
    def test_healthy_when_proxy_returns_200(self, mock_get):
        """Test returns healthy when LiteLLM proxy responds with 200."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "healthy"}
        mock_get.return_value = mock_resp

        result = self.check_litellm_health()

        assert result["healthy"] is True
        assert "healthy" in result["message"].lower()

    @patch("requests.get")
    def test_unhealthy_when_proxy_returns_error(self, mock_get):
        """Test returns unhealthy when LiteLLM proxy returns non-200."""
        mock_resp = MagicMock()
        mock_resp.status_code = 503
        mock_get.return_value = mock_resp

        result = self.check_litellm_health()

        assert result["healthy"] is False
        assert "503" in result["message"]

    @patch("requests.get")
    def test_unhealthy_when_proxy_unreachable(self, mock_get):
        """Test returns unhealthy when LiteLLM proxy is unreachable."""
        mock_get.side_effect = ConnectionError("Connection refused")

        result = self.check_litellm_health()

        assert result["healthy"] is False
        assert "Cannot reach" in result["message"]
