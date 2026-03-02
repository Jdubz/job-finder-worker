"""Regression tests for setup_logging().

Ensures setup_logging() does not raise UnboundLocalError or ValueError
across different ENVIRONMENT values, including when ENVIRONMENT is unset.
"""

import logging
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from job_finder.logging_config import setup_logging


@pytest.fixture(autouse=True)
def _reset_root_logger():
    """Reset root logger handlers after each test to avoid leaking state."""
    yield
    root = logging.getLogger()
    for handler in root.handlers[:]:
        handler.close()
        root.removeHandler(handler)


class TestSetupLogging:
    """Tests for the setup_logging function."""

    def test_production_environment(self, tmp_path: Path) -> None:
        """setup_logging succeeds with ENVIRONMENT=production (regression for UnboundLocalError)."""
        log_file = str(tmp_path / "worker.log")
        with patch.dict(os.environ, {"ENVIRONMENT": "production"}, clear=False):
            setup_logging(log_file=log_file)
        assert Path(log_file).exists()

    def test_staging_environment(self, tmp_path: Path) -> None:
        """setup_logging succeeds with ENVIRONMENT=staging."""
        log_file = str(tmp_path / "worker.log")
        with patch.dict(os.environ, {"ENVIRONMENT": "staging"}, clear=False):
            setup_logging(log_file=log_file)
        assert Path(log_file).exists()

    def test_development_environment(self, tmp_path: Path) -> None:
        """setup_logging succeeds with ENVIRONMENT=development."""
        log_file = str(tmp_path / "worker.log")
        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
            setup_logging(log_file=log_file)
        assert Path(log_file).exists()

    def test_unset_environment_defaults_to_development(self, tmp_path: Path) -> None:
        """setup_logging defaults ENVIRONMENT to 'development' and sets os.environ."""
        log_file = str(tmp_path / "worker.log")
        env = os.environ.copy()
        env.pop("ENVIRONMENT", None)
        with patch.dict(os.environ, env, clear=True):
            setup_logging(log_file=log_file)
            assert os.environ.get("ENVIRONMENT") == "development"
        assert Path(log_file).exists()

    def test_log_level_override(self, tmp_path: Path) -> None:
        """LOG_LEVEL env var overrides the log_level parameter."""
        log_file = str(tmp_path / "worker.log")
        with patch.dict(
            os.environ, {"ENVIRONMENT": "development", "LOG_LEVEL": "DEBUG"}, clear=False
        ):
            setup_logging(log_level="WARNING", log_file=log_file)
        root = logging.getLogger()
        assert root.level == logging.DEBUG
