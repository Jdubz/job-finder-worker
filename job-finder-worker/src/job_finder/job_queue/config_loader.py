"""Load queue configuration from SQLite."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

from job_finder.exceptions import InitializationError
from job_finder.storage.sqlite_client import sqlite_connection

logger = logging.getLogger(__name__)


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

    def get_stop_list(self) -> Dict[str, Any]:
        try:
            return self._get_config("stop-list")
        except InitializationError:
            logger.warning("Stop list not configured; using defaults")
            return {"excludedCompanies": [], "excludedKeywords": [], "excludedDomains": []}

    def get_queue_settings(self) -> Dict[str, Any]:
        try:
            return self._get_config("queue-settings")
        except InitializationError:
            logger.warning("Queue settings not configured; using defaults")
            return {"maxRetries": 3, "retryDelaySeconds": 300, "processingTimeout": 600}

    def get_ai_settings(self) -> Dict[str, Any]:
        try:
            return self._get_config("ai-settings")
        except InitializationError:
            logger.warning("AI settings not configured; using defaults")
            return {
                "provider": "claude",
                "model": "claude-sonnet-4",
                "minMatchScore": 70,
                "generateIntakeData": True,
                "portlandOfficeBonus": 15,
                "userTimezone": -8,
                "preferLargeCompanies": True,
            }

    def get_job_filters(self) -> Dict[str, Any]:
        try:
            return self._get_config("job-filters")
        except InitializationError:
            logger.warning("Job filters not configured; using defaults")
            return {}

    def get_technology_ranks(self) -> Dict[str, Any]:
        try:
            raw = self._get_config("technology-ranks")
            techs = raw.get("technologies", {})
            converted = {}
            for name, value in techs.items():
                if isinstance(value, (int, float)):
                    converted[name] = {"rank": "ok", "points": value}
                elif isinstance(value, dict):
                    rank = value.get("rank", "ok")
                    if rank not in ["required", "ok", "strike", "fail"]:
                        rank = "ok"
                    converted[name] = {
                        "rank": rank,
                        **({"points": value["points"]} if isinstance(value.get("points"), (int, float)) else {}),
                        **({"mentions": value["mentions"]} if isinstance(value.get("mentions"), (int, float)) else {}),
                    }
            strikes = raw.get("strikes", {})
            return {
                "technologies": converted,
                "strikes": {
                    "missingAllRequired": strikes.get("missingAllRequired", 1),
                    "perBadTech": strikes.get("perBadTech", 2),
                },
                "version": raw.get("version"),
                "extractedFromJobs": raw.get("extractedFromJobs"),
            }
        except InitializationError:
            logger.warning("Technology ranks not configured; using defaults")
            return {"technologies": {}, "strikes": {"missingAllRequired": 1, "perBadTech": 2}}

    def get_scheduler_settings(self) -> Dict[str, Any]:
        try:
            return self._get_config("scheduler-settings")
        except InitializationError:
            logger.warning("Scheduler settings not configured; using defaults")
            return {"pollIntervalSeconds": 60}
