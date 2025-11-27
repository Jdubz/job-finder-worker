"""Load queue configuration from SQLite."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional, cast

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
        default_selection = {
            "provider": "codex",
            "interface": "cli",
            "model": "gpt-4o",
        }
        default_options = [
            {
                "value": "codex",
                "interfaces": [
                    {
                        "value": "cli",
                        "models": ["o3", "o4-mini", "gpt-4.1", "gpt-4o", "gpt-4o-mini"],
                        "enabled": True,
                    }
                ],
            },
            {
                "value": "claude",
                "interfaces": [
                    {
                        "value": "api",
                        "models": [
                            "claude-sonnet-4-5-20250929",
                            "claude-sonnet-4-20250514",
                            "claude-3-5-sonnet-20241022",
                            "claude-3-5-haiku-20241022",
                        ],
                        "enabled": True,
                    }
                ],
            },
            {
                "value": "openai",
                "interfaces": [
                    {
                        "value": "api",
                        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
                        "enabled": True,
                    }
                ],
            },
            {
                "value": "gemini",
                "interfaces": [
                    {
                        "value": "api",
                        "models": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
                        "enabled": True,
                    }
                ],
            },
        ]
        default = {
            "worker": {"selected": dict(default_selection)},
            "documentGenerator": {"selected": dict(default_selection)},
            "options": default_options,
        }
        try:
            raw = self._get_config("ai-settings")
            return self._normalize_ai_settings(raw, default_selection, default_options)
        except InitializationError:
            logger.warning("AI settings missing; seeding defaults")
            return self._seed_config("ai-settings", default)

    @staticmethod
    def _normalize_ai_settings(
        settings: Dict[str, Any],
        default_selection: Dict[str, str],
        default_options: list,
    ) -> Dict[str, Any]:
        """Upgrade legacy AI settings into tiered provider/interface/model schema."""
        if not isinstance(settings, dict):
            return {
                "worker": {"selected": dict(default_selection)},
                "documentGenerator": {"selected": dict(default_selection)},
                "options": default_options,
            }

        legacy_selected = (
            settings.get("selected") if isinstance(settings.get("selected"), dict) else None
        )

        def pick_interface(provider: str, requested: Optional[str]) -> str:
            provider_opt = next((p for p in default_options if p.get("value") == provider), None)
            interfaces = provider_opt.get("interfaces", []) if provider_opt else []
            if requested and any(i.get("value") == requested for i in interfaces):
                return requested
            if interfaces:
                return cast(str, interfaces[0].get("value") or default_selection["interface"])
            return cast(str, default_selection["interface"])

        def pick_model(provider: str, interface: str, requested: Optional[str]) -> str:
            provider_opt = next((p for p in default_options if p.get("value") == provider), None)
            iface_opt = None
            if provider_opt:
                iface_opt = next(
                    (i for i in provider_opt.get("interfaces", []) if i.get("value") == interface),
                    None,
                )
            raw_models = iface_opt.get("models", []) if iface_opt else []
            models = [str(m) for m in raw_models] if isinstance(raw_models, list) else []
            if requested in models:
                return requested
            if models:
                return models[0]
            return default_selection["model"]

        def build_selection(selected: Optional[Dict[str, Any]]) -> Dict[str, Any]:
            provider = (selected or {}).get("provider", default_selection["provider"])
            interface = pick_interface(provider, (selected or {}).get("interface"))
            model = pick_model(provider, interface, (selected or {}).get("model"))
            return {"provider": provider, "interface": interface, "model": model}

        worker_selected = build_selection(
            (settings.get("worker") or {}).get("selected") or legacy_selected
        )
        doc_selected = build_selection(
            (settings.get("documentGenerator") or {}).get("selected")
            or (settings.get("document_generator") or {}).get("selected")
            or legacy_selected
            or worker_selected
        )

        options = (
            settings.get("options")
            if isinstance(settings.get("options"), list)
            else default_options
        )

        return {
            "worker": {"selected": worker_selected},
            "documentGenerator": {"selected": doc_selected},
            "options": options,
        }

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
                "requiredTitleKeywords": [
                    "software",
                    "developer",
                    "engineer",
                    "frontend",
                    "full stack",
                    "fullstack",
                ],
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
