"""Runtime settings loaded from database config with fallback to constants.

This module provides centralized access to configuration values that were
previously hardcoded in constants.py. It loads from the database on first
access and caches the results.

Usage:
    from job_finder.settings import get_worker_settings

    settings = get_worker_settings()
    timeout = settings["scraping"]["requestTimeoutSeconds"]
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Any, Dict, Optional

from job_finder.exceptions import InitializationError

logger = logging.getLogger(__name__)


def _get_db_path() -> Optional[str]:
    """Get database path from environment."""
    return os.environ.get("SQLITE_DB_PATH")


@lru_cache(maxsize=1)
def get_worker_settings(db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Get worker settings from database with fallback to defaults.

    Results are cached for the lifetime of the process.

    Args:
        db_path: Optional database path (uses env var if not provided)

    Returns:
        Worker settings dictionary
    """
    db = db_path or _get_db_path()
    if not db:
        raise InitializationError("SQLITE_DB_PATH not set; cannot load worker-settings")

    try:
        from job_finder.job_queue.config_loader import ConfigLoader

        loader = ConfigLoader(db)
        settings = loader.get_worker_settings()
        logger.debug("Loaded worker settings from database")
        return settings
    except InitializationError as e:
        logger.error(f"Failed to load worker settings from DB: {e}")
        raise
    except Exception:
        logger.exception("Unexpected error loading worker settings from DB")
        raise


def clear_settings_cache() -> None:
    """Clear cached settings (useful for testing or config reload)."""
    get_worker_settings.cache_clear()


# Convenience accessors for common settings
def get_text_limits(db_path: Optional[str] = None) -> Dict[str, int]:
    """Get text limit settings."""
    return get_worker_settings(db_path)["textLimits"]


def get_scraping_settings(db_path: Optional[str] = None) -> Dict[str, Any]:
    """Get scraping settings."""
    return get_worker_settings(db_path)["scraping"]


def get_fetch_delay_seconds(db_path: Optional[str] = None) -> float:
    """Get delay between detail page fetches (default: 1 second)."""
    try:
        scraping = get_scraping_settings(db_path)
        return float(scraping.get("fetchDelaySeconds", 1))
    except Exception:
        logger.debug("Using default fetch delay (0s) due to missing settings")
        return 0.0


def get_request_timeout(db_path: Optional[str] = None) -> int:
    """Get per-request HTTP timeout in seconds (default: 30)."""
    try:
        scraping = get_scraping_settings(db_path)
        timeout = int(scraping.get("requestTimeoutSeconds", 30))
        if timeout <= 0:
            logger.warning("Invalid requestTimeoutSeconds=%s; using default 30s", timeout)
            return 30
        return timeout
    except Exception:
        logger.debug("Using default request timeout (30s) due to missing settings")
        return 30
