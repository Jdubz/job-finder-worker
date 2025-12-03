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
    except Exception as e:
        # Fail loudly to surface config mismatches early
        logger.error(f"Failed to load worker settings from DB: {e}")
        raise


def clear_settings_cache() -> None:
    """Clear cached settings (useful for testing or config reload)."""
    get_worker_settings.cache_clear()


# Convenience accessors for common settings
def get_text_limits(db_path: Optional[str] = None) -> Dict[str, int]:
    """Get text limit settings."""
    return get_worker_settings(db_path)["textLimits"]


def get_scraping_settings(db_path: Optional[str] = None) -> Dict[str, int]:
    """Get scraping settings."""
    return get_worker_settings(db_path)["scraping"]
