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

    def _seed_config(self, key: str, value: Dict[str, Any]) -> Dict[str, Any]:
        """Persist default config to SQLite and return it."""
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO job_finder_config (id, payload_json, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                  payload_json = excluded.payload_json,
                  updated_at = excluded.updated_at
                """,
                (
                    key,
                    json.dumps(value),
                ),
            )
        return value

    def get_stop_list(self) -> Dict[str, Any]:
        default = {"excludedCompanies": [], "excludedKeywords": [], "excludedDomains": []}
        try:
            return self._get_config("stop-list")
        except InitializationError:
            logger.warning("Stop list missing; seeding defaults")
            return self._seed_config("stop-list", default)

    def get_queue_settings(self) -> Dict[str, Any]:
        default = {"processingTimeoutSeconds": 1800}
        try:
            return self._get_config("queue-settings")
        except InitializationError:
            logger.warning("Queue settings missing; seeding defaults")
            return self._seed_config("queue-settings", default)

    def get_ai_settings(self) -> Dict[str, Any]:
        """Get AI provider configuration (provider selection only)."""
        default = {
            "selected": {
                "provider": "codex",
                "interface": "cli",
                "model": "gpt-4o-mini",
            },
            "providers": [],  # Populated dynamically by backend on GET
        }
        try:
            return self._get_config("ai-settings")
        except InitializationError:
            logger.warning("AI settings missing; seeding defaults")
            return self._seed_config("ai-settings", default)

    def get_job_match(self) -> Dict[str, Any]:
        """Get job matching preferences (scoring, bonuses, thresholds)."""
        default = {
            "minMatchScore": 70,
            "portlandOfficeBonus": 15,
            "userTimezone": -8,
            "preferLargeCompanies": True,
            "generateIntakeData": True,
        }
        try:
            return self._get_config("job-match")
        except InitializationError:
            logger.warning("Job match config missing; seeding defaults")
            return self._seed_config("job-match", default)

    def get_job_filters(self) -> Dict[str, Any]:
        default = {
            "enabled": True,
            "strikeThreshold": 5,
            "hardRejections": {
                "excludedJobTypes": [],
                "excludedSeniority": [],
                "excludedCompanies": [],
                "excludedKeywords": [],
                "requiredTitleKeywords": ["software", "developer", "engineer", "frontend", "full stack", "fullstack"],
                "minSalaryFloor": 100000,
                "rejectCommissionOnly": True,
            },
            "remotePolicy": {
                "allowRemote": True,
                "allowHybridPortland": True,
                "allowOnsite": False,
            },
            "salaryStrike": {"enabled": True, "threshold": 150000, "points": 2},
            "experienceStrike": {"enabled": True, "minPreferred": 6, "points": 1},
            "seniorityStrikes": {},
            "qualityStrikes": {
                "minDescriptionLength": 200,
                "shortDescriptionPoints": 1,
                "buzzwords": [],
                "buzzwordPoints": 1,
            },
            "ageStrike": {"enabled": True, "strikeDays": 1, "rejectDays": 7, "points": 1},
        }
        try:
            return self._get_config("job-filters")
        except InitializationError:
            logger.warning("Job filters missing; seeding defaults")
            return self._seed_config("job-filters", default)

    def get_technology_ranks(self) -> Dict[str, Any]:
        default = {
            "technologies": {},
            "strikes": {"missingAllRequired": 1, "perBadTech": 2},
        }
        try:
            return self._get_config("technology-ranks")
        except InitializationError:
            logger.warning("Technology ranks missing; seeding defaults")
            return self._seed_config("technology-ranks", default)

    def get_scheduler_settings(self) -> Dict[str, Any]:
        default = {"pollIntervalSeconds": 60}
        try:
            return self._get_config("scheduler-settings")
        except InitializationError:
            logger.warning("Scheduler settings missing; seeding defaults")
            return self._seed_config("scheduler-settings", default)

    def get_company_scoring(self) -> Dict[str, Any]:
        default = {
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
        try:
            return self._get_config("company-scoring")
        except InitializationError:
            logger.warning("Company scoring config missing; seeding defaults")
            return self._seed_config("company-scoring", default)

    def get_worker_settings(self) -> Dict[str, Any]:
        default = {
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
        try:
            return self._get_config("worker-settings")
        except InitializationError:
            logger.warning("Worker settings missing; seeding defaults")
            return self._seed_config("worker-settings", default)
