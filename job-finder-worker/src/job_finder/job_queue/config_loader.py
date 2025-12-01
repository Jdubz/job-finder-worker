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
        policy = self.get_prefilter_policy()
        return policy.get(
            "stopList", {"excludedCompanies": [], "excludedKeywords": [], "excludedDomains": []}
        )

    def get_queue_settings(self) -> Dict[str, Any]:
        default = {"processingTimeoutSeconds": 1800, "isProcessingEnabled": True, "taskDelaySeconds": 1}
        try:
            settings = self._get_config("queue-settings")
            # Ensure isProcessingEnabled defaults to True if not present
            if "isProcessingEnabled" not in settings:
                settings["isProcessingEnabled"] = True
            if "taskDelaySeconds" not in settings:
                settings["taskDelaySeconds"] = 1
            return settings
        except InitializationError:
            logger.warning("Queue settings missing; seeding defaults")
            return self._seed_config("queue-settings", default)

    def is_processing_enabled(self) -> bool:
        """Check if queue processing is enabled. Defaults to True if not set."""
        try:
            settings = self.get_queue_settings()
            return settings.get("isProcessingEnabled", True)
        except Exception:
            return True  # Default to enabled if config can't be read

    def get_ai_settings(self) -> Dict[str, Any]:
        """Get AI provider configuration (provider selection only)."""
        default_selection = {
            "provider": "gemini",
            "interface": "api",
            "model": "gemini-2.0-flash",
        }
        default_options = [
            {
                "value": "codex",
                "interfaces": [
                    {
                        "value": "cli",
                        "models": [
                            "gpt-5.1-codex",
                            "gpt-5-codex",
                            "o3",
                            "o4-mini",
                            "gpt-4o",
                            "gpt-4o-mini",
                        ],
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
                    },
                    {
                        "value": "cli",
                        "models": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
                        "enabled": True,
                    }
                ],
            },
        ]
        default = {
            "worker": {
                "selected": dict(default_selection),
                "tasks": {
                    "jobMatch": dict(default_selection),
                    "companyDiscovery": dict(default_selection),
                    "sourceDiscovery": dict(default_selection),
                },
            },
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

        worker_tasks = None
        doc_tasks = None
        if isinstance(settings.get("worker"), dict):
            worker_tasks = settings.get("worker", {}).get("tasks")
        if isinstance(settings.get("documentGenerator"), dict):
            doc_tasks = settings.get("documentGenerator", {}).get("tasks")

        return {
            "worker": {"selected": worker_selected, **({"tasks": worker_tasks} if worker_tasks else {})},
            "documentGenerator": {
                "selected": doc_selected,
                **({"tasks": doc_tasks} if doc_tasks else {}),
            },
            "options": options,
        }

    def get_match_policy(self) -> Dict[str, Any]:
        default = {
            "jobMatch": {
                "minMatchScore": 70,
                "portlandOfficeBonus": 15,
                "userTimezone": -8,
                "preferLargeCompanies": True,
                "generateIntakeData": True,
            },
            "companyWeights": {
                "bonuses": {
                    "remoteFirst": 15,
                    "aiMlFocus": 10,
                },
                "sizeAdjustments": {
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
                "priorityThresholds": {
                    "high": 85,
                    "medium": 70,
                },
            },
            "dealbreakers": {
                "maxTimezoneDiffHours": 8,
                "perHourTimezonePenalty": 5,
                "hardTimezonePenalty": 60,
                "requireRemote": False,
                "allowHybridInTimezone": True,
                "locationPenaltyPoints": 60,
                "relocationPenaltyPoints": 80,
                "ambiguousLocationPenaltyPoints": 40,
            },
        }
        try:
            return self._get_config("match-policy") or default
        except InitializationError:
            logger.warning("Match policy missing; seeding defaults")
            return self._seed_config("match-policy", default)

    def get_job_match(self) -> Dict[str, Any]:
        """Get job matching settings from match-policy.jobMatch."""
        policy = self.get_match_policy()
        default = {
            "minMatchScore": 70,
            "portlandOfficeBonus": 15,
            "userTimezone": -8,
            "preferLargeCompanies": True,
            "generateIntakeData": True,
        }
        job_match = policy.get("jobMatch", default)
        # Merge with defaults for any missing keys
        for key, value in default.items():
            if key not in job_match:
                job_match[key] = value
        # Also include companyWeights for callers that need priority thresholds
        job_match["companyWeights"] = policy.get("companyWeights", {})
        return job_match

    def get_prefilter_policy(self) -> Dict[str, Any]:
        default = {
            "stopList": {"excludedCompanies": [], "excludedKeywords": [], "excludedDomains": []},
            "strikeEngine": {
                "enabled": True,
                "strikeThreshold": 5,
                "hardRejections": {
                    "excludedJobTypes": [],
                    "excludedSeniority": ["intern", "entry", "entry-level", "entry level"],
                    "excludedCompanies": [],
                    "excludedKeywords": [],
                    "requiredTitleKeywords": [
                        "software",
                        "developer",
                        "engineer",
                        "frontend",
                        "front end",
                        "front-end",
                        "full stack",
                        "fullstack",
                        "full-stack",
                        "backend",
                        "back end",
                        "back-end",
                    ],
                    "minSalaryFloor": 100000,
                    "rejectCommissionOnly": True,
                },
                "remotePolicy": {
                    "allowRemote": True,
                    "allowHybridInTimezone": True,
                    "allowOnsite": False,
                    "maxTimezoneDiffHours": 8,
                    "perHourTimezonePenalty": 1,
                    "hardTimezonePenalty": 3,
                },
                "salaryStrike": {"enabled": True, "threshold": 150000, "points": 2},
                # NOTE: experienceStrike REMOVED - seniority filtering handles this
                # NOTE: jobTypeStrike REMOVED - AI analysis handles job fit determination
                "seniorityStrikes": {},
                "qualityStrikes": {
                    "minDescriptionLength": 200,
                    "shortDescriptionPoints": 1,
                    "buzzwords": [],
                    "buzzwordPoints": 1,
                },
                "ageStrike": {"enabled": True, "strikeDays": 1, "rejectDays": 7, "points": 1},
            },
            "technologyRanks": {
                "technologies": {},
            },
        }
        try:
            return self._get_config("prefilter-policy") or default
        except InitializationError:
            logger.warning("Prefilter policy missing; seeding defaults")
            return self._seed_config("prefilter-policy", default)

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
