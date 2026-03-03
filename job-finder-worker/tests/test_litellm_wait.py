"""Tests for wait_for_litellm() startup readiness check."""

import pytest

pytest.importorskip("flask", reason="Flask not installed in test environment")

from unittest.mock import patch

from job_finder.flask_worker import wait_for_litellm


class TestWaitForLitellm:
    @patch("job_finder.flask_worker.check_litellm_health")
    @patch("job_finder.flask_worker.time")
    def test_returns_true_when_immediately_healthy(self, mock_time, mock_health):
        mock_health.return_value = {"healthy": True}
        assert wait_for_litellm(max_wait=10, interval=1) is True
        assert mock_health.call_count == 1
        mock_time.sleep.assert_not_called()

    @patch("job_finder.flask_worker.check_litellm_health")
    @patch("job_finder.flask_worker.time")
    def test_retries_until_healthy(self, mock_time, mock_health):
        mock_health.side_effect = [
            {"healthy": False},
            {"healthy": False},
            {"healthy": True},
        ]
        result = wait_for_litellm(max_wait=10, interval=2)
        assert result is True
        assert mock_health.call_count == 3
        assert mock_time.sleep.call_count == 2

    @patch("job_finder.flask_worker.check_litellm_health")
    @patch("job_finder.flask_worker.time")
    def test_returns_false_on_timeout(self, mock_time, mock_health):
        mock_health.return_value = {"healthy": False}
        result = wait_for_litellm(max_wait=4, interval=2)
        assert result is False
        # Should check at elapsed=0 and elapsed=2, then elapsed reaches 4 → exit
        assert mock_health.call_count == 2
