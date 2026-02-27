"""Load queue configuration from SQLite."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from job_finder.exceptions import InitializationError
from job_finder.storage.sqlite_client import sqlite_connection

logger = logging.getLogger(__name__)


def _validate_section(config: Dict[str, Any], section_name: str, required_keys: List[str]) -> None:
    """
    Validate that a config section contains all required keys.

    Args:
        config: The parent config dict
        section_name: Name of the section to validate
        required_keys: List of keys that must be present

    Raises:
        InitializationError: If any required keys are missing
    """
    section = config.get(section_name, {})
    missing_keys = [key for key in required_keys if key not in section]
    if missing_keys:
        raise InitializationError(
            f"match-policy.{section_name} missing required keys: {missing_keys}. "
            f"Add {section_name} fields to match-policy."
        )


class ConfigLoader:
    """Read queue-related configuration blobs from the job_finder_config table."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def _get_config(self, key: str) -> Dict[str, Any]:
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT payload_json FROM job_finder_config WHERE id = ?", (key,)
            ).fetchone()

        if not row:
            raise InitializationError(f"Configuration '{key}' not found")

        try:
            return json.loads(row["payload_json"])
        except json.JSONDecodeError as exc:
            raise InitializationError(f"Invalid JSON for config '{key}': {exc}") from exc

    def get_prefilter_policy(self) -> Dict[str, Any]:
        """
        Get pre-filter policy configuration.

        Fails loudly if config is missing or incomplete - no defaults to prevent
        silent gaps between config and implementation.
        """
        config = self._get_config("prefilter-policy")

        # Validate all required top-level sections exist
        required_sections = [
            "title",
            "freshness",
            "workArrangement",
            "employmentType",
            "salary",
        ]
        missing = [s for s in required_sections if s not in config]
        if missing:
            raise InitializationError(
                f"prefilter-policy missing required sections: {missing}. "
                "Update the prefilter-policy config record to include all required fields."
            )

        wa = config["workArrangement"]
        wa_required = ["allowRemote", "allowHybrid", "allowOnsite", "willRelocate", "userLocation"]
        wa_missing = [k for k in wa_required if k not in wa]
        if wa_missing:
            raise InitializationError(
                f"prefilter-policy.workArrangement missing required keys: {wa_missing}. "
                "Update the prefilter-policy config record to include all required work arrangement fields."
            )

        return config

    def get_personal_info(self) -> Dict[str, Any]:
        """
        Get personal info configuration.

        Returns user profile data including location/timezone for scoring.
        Returns empty dict if not configured (graceful degradation).
        """
        try:
            return self._get_config("personal-info")
        except InitializationError:
            logger.debug("personal-info config not found, using defaults")
            return {}

    def get_match_policy(self) -> Dict[str, Any]:
        """
        Get match policy configuration for scoring engine.

        Fails loudly if config is missing or incomplete - no defaults to prevent
        silent gaps between config and implementation.
        """
        config = self._get_config("match-policy")

        # Validate all required top-level sections exist
        # Note: "experience" removed - experience scoring is disabled
        # Note: "skills" removed - consolidated into skillMatch (single skill scoring pipeline)
        required_sections = [
            "minScore",
            "seniority",
            "location",
            "skillMatch",
            "salary",
            "freshness",
            "roleFit",
            "company",
        ]
        missing = [s for s in required_sections if s not in config]
        if missing:
            raise InitializationError(
                f"match-policy missing required sections: {missing}. "
                "Update the match-policy config record to include all required fields."
            )

        # Validate all config sections using helper (no defaults allowed)
        # Note: analogGroups removed - skill parallels now managed by taxonomy system
        _validate_section(
            config,
            "skillMatch",
            [
                "baseMatchScore",
                "yearsMultiplier",
                "maxYearsBonus",
                "missingScore",
                "analogScore",
                "maxBonus",
                "maxPenalty",
                "missingIgnore",
            ],
        )

        _validate_section(
            config,
            "salary",
            [
                "minimum",
                "target",
                "belowTargetScore",
                "belowTargetMaxPenalty",
                "missingSalaryScore",
                "meetsTargetScore",
                "equityScore",
                "contractScore",
            ],
        )

        _validate_section(
            config,
            "seniority",
            [
                "preferred",
                "acceptable",
                "rejected",
                "preferredScore",
                "acceptableScore",
                "rejectedScore",
            ],
        )

        _validate_section(
            config,
            "location",
            [
                "allowRemote",
                "allowHybrid",
                "allowOnsite",
                "userTimezone",
                "maxTimezoneDiffHours",
                "perHourScore",
                "hybridSameCityScore",
                "remoteScore",
                "relocationScore",
                "unknownTimezoneScore",
                "relocationAllowed",
            ],
        )

        # Experience scoring is DISABLED - no validation needed
        # Year-based qualification comparisons have been removed entirely

        _validate_section(
            config,
            "freshness",
            [
                "freshDays",
                "freshScore",
                "staleDays",
                "staleScore",
                "veryStaleDays",
                "veryStaleScore",
                "repostScore",
            ],
        )

        _validate_section(
            config,
            "roleFit",
            [
                "preferred",
                "acceptable",
                "penalized",
                "rejected",
                "preferredScore",
                "penalizedScore",
            ],
        )

        _validate_section(
            config,
            "company",
            [
                "preferredCityScore",
                "remoteFirstScore",
                "aiMlFocusScore",
                "largeCompanyScore",
                "smallCompanyScore",
                "largeCompanyThreshold",
                "smallCompanyThreshold",
                "startupScore",
            ],
        )

        return config

    def is_processing_enabled(self) -> bool:
        """Check if queue processing is enabled (worker-settings.runtime)."""
        settings = self.get_worker_settings()
        runtime = settings["runtime"]
        return bool(runtime["isProcessingEnabled"])

    def _set_config(self, key: str, payload: Dict[str, Any]) -> None:
        """Update a config entry in the database."""
        with sqlite_connection(self.db_path) as conn:
            from datetime import datetime, timezone

            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                """
                UPDATE job_finder_config
                SET payload_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(payload), now, key),
            )

    def set_processing_disabled_with_reason(self, reason: str) -> None:
        """
        Disable processing and set a stop reason.

        This is used when a critical error (like quota exhaustion) requires
        stopping the queue and recording why.
        """
        settings = self.get_worker_settings()
        settings["runtime"]["isProcessingEnabled"] = False
        settings["runtime"]["stopReason"] = reason
        self._set_config("worker-settings", settings)
        logger.warning(f"Processing disabled with reason: {reason}")

    def clear_stop_reason(self) -> None:
        """Clear the stop reason when processing is re-enabled."""
        settings = self.get_worker_settings()
        if settings["runtime"].get("stopReason"):
            settings["runtime"]["stopReason"] = None
            self._set_config("worker-settings", settings)
            logger.info("Cleared stop reason")

    def get_worker_settings(self) -> Dict[str, Any]:
        settings = self._get_config("worker-settings")

        required_sections = ["scraping", "textLimits", "runtime"]
        missing = [s for s in required_sections if s not in settings]
        if missing:
            raise InitializationError(
                f"worker-settings missing required sections: {missing}. "
                "Update the worker-settings config record to include all required fields."
            )

        runtime = settings.get("runtime")
        if not isinstance(runtime, dict):
            raise InitializationError("worker-settings.runtime missing or invalid")

        # Validate required runtime keys (fail loud on schema drift)
        required_keys = {
            "processingTimeoutSeconds",
            "isProcessingEnabled",
            "taskDelaySeconds",
            "pollIntervalSeconds",
        }
        missing_keys = required_keys - set(runtime.keys())
        if missing_keys:
            raise InitializationError(
                "worker-settings.runtime missing keys: " + ", ".join(sorted(missing_keys))
            )

        return settings

    # ============================================================
    # WORKER RUNTIME HELPERS
    # ============================================================

    # Bounds for runtime settings
    MIN_PROCESSING_TIMEOUT_SECONDS = 5
    DEFAULT_PROCESSING_TIMEOUT_SECONDS = 1800  # 30 minutes
    MIN_TASK_DELAY_SECONDS = 0
    MAX_TASK_DELAY_SECONDS = 60
    DEFAULT_TASK_DELAY_SECONDS = 1

    def get_processing_timeout(self) -> int:
        """
        Get processing timeout in seconds with bounds validation.

        Returns:
            Processing timeout (minimum 5 seconds, default 1800).
        """
        worker_settings = self.get_worker_settings()
        runtime = worker_settings.get("runtime", {})
        timeout = runtime.get("processingTimeoutSeconds", self.DEFAULT_PROCESSING_TIMEOUT_SECONDS)
        return max(self.MIN_PROCESSING_TIMEOUT_SECONDS, int(timeout))

    def get_task_delay(self) -> float:
        """
        Get delay between tasks in seconds with bounds validation.

        Returns:
            Task delay (0-60 seconds, default 1).
        """
        worker_settings = self.get_worker_settings()
        runtime = worker_settings.get("runtime", {})
        delay_raw = runtime.get("taskDelaySeconds", self.DEFAULT_TASK_DELAY_SECONDS)

        try:
            delay = float(delay_raw)
            if delay < self.MIN_TASK_DELAY_SECONDS:
                logger.warning(
                    "Invalid taskDelaySeconds=%s (negative), using default of %ss",
                    delay_raw,
                    self.DEFAULT_TASK_DELAY_SECONDS,
                )
                return float(self.DEFAULT_TASK_DELAY_SECONDS)
            elif delay > self.MAX_TASK_DELAY_SECONDS:
                logger.warning(
                    "taskDelaySeconds=%s exceeds maximum of %ss, capping",
                    delay_raw,
                    self.MAX_TASK_DELAY_SECONDS,
                )
                return float(self.MAX_TASK_DELAY_SECONDS)
            return delay
        except (TypeError, ValueError):
            logger.warning(
                "Invalid taskDelaySeconds=%s (not a number), using default of %ss",
                delay_raw,
                self.DEFAULT_TASK_DELAY_SECONDS,
            )
            return float(self.DEFAULT_TASK_DELAY_SECONDS)
