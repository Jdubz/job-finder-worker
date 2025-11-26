"""Runtime settings loaded from database config with fallback to constants.

This module provides centralized access to configuration values that were
previously hardcoded in constants.py. It loads from the database on first
access and caches the results.

Usage:
    from job_finder.settings import get_worker_settings, get_company_scoring

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
        "rateLimitDelaySeconds": 2,
        "maxRetries": 3,
        "maxHtmlSampleLength": 20000,
        "maxHtmlSampleLengthSmall": 15000,
    },
    "health": {
        "maxConsecutiveFailures": 5,
        "healthCheckIntervalSeconds": 3600,
    },
    "cache": {
        "companyInfoTtlSeconds": 86400,
        "sourceConfigTtlSeconds": 3600,
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
}

DEFAULT_COMPANY_SCORING: Dict[str, Any] = {
    "tierThresholds": {"s": 150, "a": 100, "b": 70, "c": 50},
    "priorityBonuses": {
        "portlandOffice": 50,
        "remoteFirst": 15,
        "aiMlFocus": 10,
        "techStackMax": 100,
    },
    "matchAdjustments": {
        "largeCompanyBonus": 10,
        "smallCompanyPenalty": -5,
        "largeCompanyThreshold": 10000,
        "smallCompanyThreshold": 100,
    },
    "timezoneAdjustments": {
        "sameTimezone": 5,
        "diff1to2hr": -2,
        "diff3to4hr": -5,
        "diff5to8hr": -10,
        "diff9plusHr": -15,
    },
    "priorityThresholds": {"high": 85, "medium": 70},
}


def _get_db_path() -> Optional[str]:
    """Get database path from environment."""
    return os.environ.get("JF_SQLITE_DB_PATH")


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


@lru_cache(maxsize=1)
def get_company_scoring(db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Get company scoring config from database with fallback to defaults.

    Results are cached for the lifetime of the process.

    Args:
        db_path: Optional database path (uses env var if not provided)

    Returns:
        Company scoring configuration dictionary
    """
    db = db_path or _get_db_path()
    if not db:
        logger.debug("No database path available, using default company scoring")
        return DEFAULT_COMPANY_SCORING

    try:
        from job_finder.job_queue.config_loader import ConfigLoader

        loader = ConfigLoader(db)
        config = loader.get_company_scoring()
        logger.debug("Loaded company scoring from database")
        return config
    except Exception as e:
        logger.warning(f"Failed to load company scoring from DB: {e}, using defaults")
        return DEFAULT_COMPANY_SCORING


def clear_settings_cache() -> None:
    """Clear cached settings (useful for testing or config reload)."""
    get_worker_settings.cache_clear()
    get_company_scoring.cache_clear()


# Convenience accessors for common settings
def get_text_limits(db_path: Optional[str] = None) -> Dict[str, int]:
    """Get text limit settings."""
    return get_worker_settings(db_path)["textLimits"]


def get_scraping_settings(db_path: Optional[str] = None) -> Dict[str, int]:
    """Get scraping settings."""
    return get_worker_settings(db_path)["scraping"]


def get_tier_thresholds(db_path: Optional[str] = None) -> Dict[str, int]:
    """Get company tier thresholds."""
    return get_company_scoring(db_path)["tierThresholds"]


def get_priority_bonuses(db_path: Optional[str] = None) -> Dict[str, int]:
    """Get priority bonuses."""
    return get_company_scoring(db_path)["priorityBonuses"]


def get_match_adjustments(db_path: Optional[str] = None) -> Dict[str, int]:
    """Get match score adjustments."""
    return get_company_scoring(db_path)["matchAdjustments"]


def get_timezone_adjustments(db_path: Optional[str] = None) -> Dict[str, int]:
    """Get timezone-based adjustments."""
    return get_company_scoring(db_path)["timezoneAdjustments"]
