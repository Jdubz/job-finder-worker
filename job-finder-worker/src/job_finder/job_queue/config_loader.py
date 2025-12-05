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
            "technology",
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
        ]
        missing = [s for s in required_sections if s not in config]
        if missing:
            raise InitializationError(
                f"match-policy missing required sections: {missing}. "
                "Update the match-policy config record to include all required fields."
            )

        return config

    def is_processing_enabled(self) -> bool:
        """Check if queue processing is enabled (worker-settings.runtime)."""
        settings = self.get_worker_settings()
        runtime = settings["runtime"]
        return bool(runtime["isProcessingEnabled"])

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
