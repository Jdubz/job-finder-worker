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
            "seniority",
            "location",
            "skillMatch",
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

        # Enforce required skillMatch fields (no defaults)
        skill_match = config.get("skillMatch", {})
        skill_required = [
            "baseMatchScore",
            "yearsMultiplier",
            "maxYearsBonus",
            "missingScore",
            "analogScore",
            "maxBonus",
            "maxPenalty",
            "analogGroups",
        ]
        skill_missing = [k for k in skill_required if k not in skill_match]
        if skill_missing:
            raise InitializationError(
                f"match-policy.skillMatch missing required keys: {skill_missing}. "
                "Add skillMatch fields to match-policy."
            )

        return config

    def is_processing_enabled(self) -> bool:
        """Check if queue processing is enabled (worker-settings.runtime)."""
        settings = self.get_worker_settings()
        runtime = settings["runtime"]
        return bool(runtime["isProcessingEnabled"])

    def get_ai_settings(self) -> Dict[str, Any]:
        """
        Get AI settings configuration.

        Returns the new agent manager structure:
        - agents: Dict of agent configs keyed by agent ID (e.g., "gemini.cli")
        - taskFallbacks: Dict of fallback chains per task type
        - modelRates: Dict of model cost rates
        - documentGenerator: Document generator selection
        - options: Provider availability metadata
        """
        settings = self._get_config("ai-settings")

        if not isinstance(settings, dict):
            raise InitializationError("ai-settings must be an object")

        # Validate required top-level keys
        required_keys = ["agents", "taskFallbacks", "modelRates", "documentGenerator", "options"]
        missing = [k for k in required_keys if k not in settings]
        if missing:
            raise InitializationError(
                f"ai-settings missing required keys: {missing}. "
                "Run the migration to upgrade from legacy ai-settings format."
            )

        # Validate agents structure
        agents = settings.get("agents")
        if not isinstance(agents, dict) or not agents:
            raise InitializationError("ai-settings.agents must be a non-empty object")

        for agent_id, agent in agents.items():
            if not isinstance(agent, dict):
                raise InitializationError(f"agent {agent_id} must be an object")
            for key in [
                "provider",
                "interface",
                "defaultModel",
                "dailyBudget",
                "dailyUsage",
                "runtimeState",
                "authRequirements",
            ]:
                if key not in agent:
                    raise InitializationError(f"agent {agent_id} missing required key: {key}")
            if not isinstance(agent.get("provider"), str) or not isinstance(agent.get("interface"), str):
                raise InitializationError(f"agent {agent_id} provider/interface must be strings")
            if not isinstance(agent.get("defaultModel"), str):
                raise InitializationError(f"agent {agent_id} defaultModel must be a string")
            if not isinstance(agent.get("dailyBudget"), (int, float)):
                raise InitializationError(f"agent {agent_id} dailyBudget must be numeric")
            if not isinstance(agent.get("dailyUsage"), (int, float)):
                raise InitializationError(f"agent {agent_id} dailyUsage must be numeric")

            auth_req = agent.get("authRequirements")
            if not isinstance(auth_req, dict):
                raise InitializationError(f"agent {agent_id} authRequirements must be an object")
            if auth_req.get("type") not in {"cli", "api"}:
                raise InitializationError(f"agent {agent_id} authRequirements.type must be 'cli' or 'api'")
            if not isinstance(auth_req.get("requiredEnv"), list) or not auth_req.get("requiredEnv"):
                raise InitializationError(f"agent {agent_id} authRequirements.requiredEnv must be a non-empty list")
            if not all(isinstance(v, str) for v in auth_req.get("requiredEnv", [])):
                raise InitializationError(f"agent {agent_id} authRequirements.requiredEnv must be strings")
            if "requiredFiles" in auth_req:
                if not isinstance(auth_req.get("requiredFiles"), list) or not all(
                    isinstance(v, str) for v in auth_req.get("requiredFiles", [])
                ):
                    raise InitializationError(
                        f"agent {agent_id} authRequirements.requiredFiles must be a list of strings"
                    )
            runtime_state = agent.get("runtimeState")
            if not isinstance(runtime_state, dict):
                raise InitializationError(f"agent {agent_id} runtimeState must be an object")
            for scope in ["worker", "backend"]:
                if scope not in runtime_state:
                    raise InitializationError(f"agent {agent_id} missing runtimeState for scope '{scope}'")
                scope_state = runtime_state[scope]
                if not isinstance(scope_state, dict):
                    raise InitializationError(f"agent {agent_id} runtimeState.{scope} must be an object")
                if not isinstance(scope_state.get("enabled"), bool):
                    raise InitializationError(f"agent {agent_id} runtimeState.{scope}.enabled must be a boolean")
                reason = scope_state.get("reason")
                if reason is not None and not isinstance(reason, str):
                    raise InitializationError(f"agent {agent_id} runtimeState.{scope}.reason must be string or null")

        # Validate taskFallbacks structure
        task_fallbacks = settings.get("taskFallbacks")
        if not isinstance(task_fallbacks, dict):
            raise InitializationError("ai-settings.taskFallbacks must be an object")
        required_tasks = ["extraction", "analysis", "document"]
        for task_name, chain in task_fallbacks.items():
            if task_name not in required_tasks:
                raise InitializationError(f"Unexpected task type in taskFallbacks: {task_name}")
            if not isinstance(chain, list) or not chain:
                raise InitializationError(f"taskFallbacks.{task_name} must be a non-empty list")
            for agent_id in chain:
                if not isinstance(agent_id, str):
                    raise InitializationError(f"taskFallbacks.{task_name} entries must be strings")
        for task_name in required_tasks:
            if task_name not in task_fallbacks:
                raise InitializationError(f"taskFallbacks missing required task type: {task_name}")

        # Validate modelRates structure
        model_rates = settings.get("modelRates")
        if not isinstance(model_rates, dict):
            raise InitializationError("ai-settings.modelRates must be an object")

        # Validate documentGenerator structure
        doc_gen = settings.get("documentGenerator")
        if not isinstance(doc_gen, dict) or not isinstance(doc_gen.get("selected"), dict):
            raise InitializationError("ai-settings.documentGenerator.selected must be an object")

        return settings

    def increment_agent_usage(self, agent_id: str, model: str) -> None:
        """
        Increment an agent's daily usage counter.

        Args:
            agent_id: The agent ID (e.g., "gemini.cli")
            model: The model used (for cost rate lookup)
        """
        settings = self._get_config("ai-settings")
        agents = settings.get("agents", {})
        model_rates = settings.get("modelRates", {})

        if agent_id not in agents:
            raise InitializationError(f"Agent {agent_id} not found in ai-settings")

        agent = agents[agent_id]
        if "dailyUsage" not in agent:
            raise InitializationError(f"Agent {agent_id} missing dailyUsage")

        cost = model_rates.get(model, 1.0)
        agent["dailyUsage"] = agent["dailyUsage"] + cost

        self._set_config("ai-settings", settings)
        logger.debug(f"Incremented {agent_id} usage by {cost} (model: {model})")

    def update_agent_status(
        self, agent_id: str, scope: str, enabled: bool, reason: Optional[str] = None
    ) -> None:
        """
        Update an agent's enabled status and reason.

        Args:
            agent_id: The agent ID (e.g., "gemini.cli")
            enabled: Whether the agent should be enabled
            reason: Why the agent is disabled (None if enabled)
        """
        settings = self._get_config("ai-settings")
        agents = settings.get("agents", {})

        if agent_id not in agents:
            raise InitializationError(f"Agent {agent_id} not found in ai-settings")

        if scope not in {"worker", "backend"}:
            raise InitializationError(f"Invalid agent scope: {scope}")

        agent = agents[agent_id]
        runtime_state = agent.get("runtimeState")
        if not runtime_state or scope not in runtime_state:
            raise InitializationError(f"Agent {agent_id} missing runtimeState for scope {scope}")

        runtime_state[scope]["enabled"] = enabled
        runtime_state[scope]["reason"] = reason if not enabled else None

        self._set_config("ai-settings", settings)
        logger.info(
            f"Updated agent {agent_id} for scope {scope}: enabled={enabled}, reason={reason}"
        )

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
