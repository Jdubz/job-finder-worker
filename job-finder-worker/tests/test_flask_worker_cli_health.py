"""Tests for CLI health check functionality in flask_worker."""

import subprocess
from unittest.mock import MagicMock, patch

import pytest


class TestCheckCliHealth:
    """Tests for the check_cli_health function."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Import the function fresh for each test."""
        # Import here to avoid module-level import issues with mocking
        from job_finder.flask_worker import check_cli_health

        self.check_cli_health = check_cli_health

    def test_healthy_codex_logged_in(self):
        """Test codex CLI returns healthy when user is logged in."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "You are logged in as user@example.com"
        mock_result.stderr = ""

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            result = self.check_cli_health()

            assert result["codex"]["healthy"] is True
            assert "logged in" in result["codex"]["message"].lower()

    def test_healthy_gemini_authenticated(self):
        """Test gemini CLI returns healthy when authenticated."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "You are authenticated as user@example.com"
        mock_result.stderr = ""

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            result = self.check_cli_health()

            assert result["gemini"]["healthy"] is True
            assert "authenticated" in result["gemini"]["message"].lower()

    def test_unhealthy_codex_not_logged_in(self):
        """Test codex CLI returns unhealthy when not logged in."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "You are not logged in. Run 'codex login' to authenticate."
        mock_result.stderr = ""

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            result = self.check_cli_health()

            assert result["codex"]["healthy"] is False

    def test_unhealthy_gemini_not_authenticated(self):
        """Test gemini CLI returns unhealthy when not authenticated."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "Not authenticated. Please run gemini auth login."
        mock_result.stderr = ""

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            result = self.check_cli_health()

            assert result["gemini"]["healthy"] is False

    def test_unhealthy_login_required(self):
        """Test CLI returns unhealthy when login is required."""
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stdout = "Login required to continue"
        mock_result.stderr = ""

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            result = self.check_cli_health()

            assert result["codex"]["healthy"] is False

    def test_unhealthy_nonzero_return_code(self):
        """Test CLI returns unhealthy when command returns non-zero."""
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stdout = "Some error occurred"
        mock_result.stderr = "Error details"

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            result = self.check_cli_health()

            assert result["codex"]["healthy"] is False
            assert result["gemini"]["healthy"] is False

    def test_cli_not_installed_file_not_found(self):
        """Test handling when CLI binary is not found."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = FileNotFoundError("No such file or directory: 'codex'")

            result = self.check_cli_health()

            assert result["codex"]["healthy"] is False
            assert "not installed" in result["codex"]["message"].lower()
            assert result["gemini"]["healthy"] is False
            assert "not installed" in result["gemini"]["message"].lower()

    def test_cli_timeout_expired(self):
        """Test handling when CLI command times out."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="codex", timeout=5)

            result = self.check_cli_health()

            assert result["codex"]["healthy"] is False
            assert "timed out" in result["codex"]["message"].lower()
            assert result["gemini"]["healthy"] is False
            assert "timed out" in result["gemini"]["message"].lower()

    def test_generic_exception_handling(self):
        """Test handling of unexpected exceptions."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = RuntimeError("Unexpected error")

            result = self.check_cli_health()

            assert result["codex"]["healthy"] is False
            assert "Unexpected error" in result["codex"]["message"]
            assert result["gemini"]["healthy"] is False

    def test_message_includes_stderr(self):
        """Test that error message includes stderr content."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = ""
        mock_result.stderr = "Warning: API key expired"

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            result = self.check_cli_health()

            assert "API key expired" in result["codex"]["message"]

    def test_empty_output_command_succeeded(self):
        """Test that empty output returns appropriate message."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = ""
        mock_result.stderr = ""

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            result = self.check_cli_health()

            # Empty output without success terms should be unhealthy
            assert result["codex"]["healthy"] is False
            assert result["codex"]["message"] == "Command succeeded"

    def test_both_clis_checked(self):
        """Test that both codex and gemini CLIs are checked."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "You are logged in"
        mock_result.stderr = ""

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            result = self.check_cli_health()

            assert "codex" in result
            assert "gemini" in result
            assert "healthy" in result["codex"]
            assert "message" in result["codex"]
            assert "healthy" in result["gemini"]
            assert "message" in result["gemini"]

    def test_subprocess_called_with_correct_args(self):
        """Test that subprocess.run is called with correct arguments."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "logged in"
        mock_result.stderr = ""

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            self.check_cli_health()

            # Check that both commands were called
            calls = mock_run.call_args_list
            assert len(calls) == 2

            # Verify codex call
            codex_call = [c for c in calls if c[0][0] == ["codex", "login", "status"]]
            assert len(codex_call) == 1
            assert codex_call[0][1]["check"] is False
            assert codex_call[0][1]["capture_output"] is True
            assert codex_call[0][1]["timeout"] == 5

            # Verify gemini call
            gemini_call = [c for c in calls if c[0][0] == ["gemini", "auth", "status"]]
            assert len(gemini_call) == 1
            assert gemini_call[0][1]["check"] is False
            assert gemini_call[0][1]["capture_output"] is True
            assert gemini_call[0][1]["timeout"] == 5

    def test_success_terms_case_insensitive(self):
        """Test that success term matching is case insensitive."""
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "LOGGED IN as user@example.com"
        mock_result.stderr = ""

        with patch("subprocess.run") as mock_run:
            mock_run.return_value = mock_result

            result = self.check_cli_health()

            assert result["codex"]["healthy"] is True
