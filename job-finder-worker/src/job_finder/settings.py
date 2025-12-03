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

logger = logging.getLogger(__name__)

# Default values (fallback if DB not available)
DEFAULT_WORKER_SETTINGS: Dict[str, Any] = {
    "scraping": {
        "requestTimeoutSeconds": 30,
        "maxHtmlSampleLength": 20000,
    },
    "textLimits": {
        "minCompanyPageLength": 200,
        "minSparseCompanyInfoLength": 100,
        "maxIntakeTextLength": 500,
        "maxIntakeDescriptionLength": 2000,
        "maxIntakeFieldLength": 400,
        "maxDescriptionPreviewLength": 500,
        "maxCompanyInfoTextLength": 1000,
    },
    "runtime": {
        "processingTimeoutSeconds": 1800,
        "isProcessingEnabled": True,
        "taskDelaySeconds": 1,
        "pollIntervalSeconds": 60,
        "scrapeConfig": {},
    },
}


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
        logger.debug("No database path available, using default worker settings")
        return DEFAULT_WORKER_SETTINGS

    try:
        from job_finder.job_queue.config_loader import ConfigLoader

        loader = ConfigLoader(db)
        settings = loader.get_worker_settings()
        logger.debug("Loaded worker settings from database")
        return settings
    except Exception as e:
        logger.warning(f"Failed to load worker settings from DB: {e}, using defaults")
        return DEFAULT_WORKER_SETTINGS


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
