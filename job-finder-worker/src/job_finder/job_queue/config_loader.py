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

    def get_title_filter(self) -> Dict[str, Any]:
        """Get title filter configuration. Fails if not configured."""
        config = self._get_config("title-filter")
        # Validate required keys
        required_keys = ["requiredKeywords", "excludedKeywords"]
        missing = [k for k in required_keys if k not in config]
        if missing:
            raise InitializationError(f"title-filter missing required keys: {missing}")
        return config

    def get_match_policy(self) -> Dict[str, Any]:
        """
        Get match policy configuration for scoring engine.

        Fails loudly if config is missing or incomplete - no defaults to prevent
        silent gaps between config and implementation.
        """
        config = self._get_config("match-policy")

        # Validate all required top-level sections exist
        required_sections = [
            "minScore",
            "weights",
            "seniority",
            "location",
            "technology",
            "salary",
            "experience",
            "freshness",
            "roleFit",
            "company",
            "dealbreakers",
        ]
        missing = [s for s in required_sections if s not in config]
        if missing:
            raise InitializationError(
                f"match-policy missing required sections: {missing}. "
                "Update the match-policy config record to include all required fields."
            )

        return config

    def get_scoring_config(self) -> Dict[str, Any]:
        """
        @deprecated Use get_match_policy() instead.

        Temporary shim that returns match-policy for backwards compatibility
        during migration. Will be removed once all callers are updated.
        """
        logger.warning(
            "get_scoring_config() is deprecated - use get_match_policy() instead"
        )
        return self.get_match_policy()

    def get_queue_settings(self) -> Dict[str, Any]:
        return self._get_config("queue-settings")

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
                    },
                ],
            },
        ]
        raw = self._get_config("ai-settings")
        return self._normalize_ai_settings(raw, default_selection, default_options)

    @staticmethod
    def _normalize_ai_settings(
        settings: Dict[str, Any],
        default_selection: Dict[str, str],
        default_options: list,
    ) -> Dict[str, Any]:
        """Upgrade legacy AI settings into tiered provider/interface/model schema."""
        if not isinstance(settings, dict):
            raise InitializationError("ai-settings must be an object")

        if not isinstance(settings.get("worker"), dict):
            raise InitializationError("ai-settings.worker missing or invalid")
        if not isinstance(settings.get("documentGenerator"), dict):
            raise InitializationError("ai-settings.documentGenerator missing or invalid")

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
            provider = (selected or {}).get("provider")
            if not provider:
                raise InitializationError("ai-settings selection missing provider")
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

        payload: Dict[str, Any] = {
            "worker": {"selected": worker_selected},
            "documentGenerator": {"selected": doc_selected},
            "options": options,
        }
        if worker_tasks:
            payload["worker"]["tasks"] = worker_tasks
        if doc_tasks:
            payload["documentGenerator"]["tasks"] = doc_tasks

        return payload

    def get_scheduler_settings(self) -> Dict[str, Any]:
        return self._get_config("scheduler-settings")

    def get_worker_settings(self) -> Dict[str, Any]:
        return self._get_config("worker-settings")
