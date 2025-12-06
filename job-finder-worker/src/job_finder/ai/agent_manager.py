"""Agent Manager for AI provider selection and lifecycle management.

The AgentManager abstracts AI agent selection from callers. Workers supply a task type
and prompt; the manager selects the appropriate agent based on configuration,
availability, and budget.

Key responsibilities:
- Select agents from fallback chain based on task type
- Enforce daily budget limits before calling agents (shared across scopes)
- Disable agents per-scope on auth/errors while keeping shared quotas
- Track usage via config updates
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional, TYPE_CHECKING

from job_finder.ai.providers import auth_status

from job_finder.exceptions import AIProviderError, NoAgentsAvailableError, QuotaExhaustedError

if TYPE_CHECKING:
    from job_finder.job_queue.config_loader import ConfigLoader

logger = logging.getLogger(__name__)


@dataclass
class AgentResult:
    """Result from an agent execution."""

    text: str
    agent_id: str
    model: str


# Provider dispatch map: (provider, interface) -> provider class
# Import lazily to avoid circular imports
def _get_provider_class(provider: str, interface: str):
    """Get the provider class for a provider/interface combination."""
    from job_finder.ai.providers import (
        ClaudeProvider,
        ClaudeCLIProvider,
        CodexCLIProvider,
        GeminiCLIProvider,
        GeminiProvider,
        OpenAIProvider,
    )

    provider_map = {
        ("codex", "cli"): CodexCLIProvider,
        ("claude", "api"): ClaudeProvider,
        ("claude", "cli"): ClaudeCLIProvider,
        ("openai", "api"): OpenAIProvider,
        ("gemini", "api"): GeminiProvider,
        ("gemini", "cli"): GeminiCLIProvider,
    }
    return provider_map.get((provider, interface))


class AgentManager:
    """Manages AI agent selection, fallback, and lifecycle.

    The manager reads ai-settings fresh on every call to support shared budget
    tracking between worker and backend. It enforces budget limits before calling
    agents and disables agents per-scope on errors.
    """

    def __init__(self, config_loader: "ConfigLoader", scope: str = "worker"):
        """Initialize the agent manager.

        Args:
            config_loader: ConfigLoader instance for reading/writing ai-settings
            scope: runtime scope using this manager ("worker" | "backend")
        """
        if scope not in {"worker", "backend"}:
            raise ValueError(f"Invalid agent scope: {scope}")
        self.config_loader = config_loader
        self.scope = scope

    def execute(
        self,
        task_type: str,
        prompt: str,
        model_override: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        scope: Optional[str] = None,
    ) -> AgentResult:
        """Execute a task using the appropriate agent from the fallback chain.

        Tries agents in fallback order until one succeeds. Handles budget
        enforcement and error-based agent disabling.

        Args:
            task_type: The type of task ("extraction", "analysis", or "document")
            prompt: The prompt to send to the agent
            model_override: Optional model to use instead of agent default
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature
            scope: Optional override scope; defaults to the manager's scope

        Returns:
            AgentResult with response text and metadata

        Raises:
            NoAgentsAvailableError: All agents exhausted, disabled, or over budget
        """
        # Always read fresh config (enables shared budget with backend)
        ai_settings = self.config_loader.get_ai_settings()
        active_scope = scope or self.scope

        fallback_chain = ai_settings.get("taskFallbacks", {}).get(task_type, [])
        if not fallback_chain:
            raise NoAgentsAvailableError(
                f"No fallback chain configured for task type: {task_type}",
                task_type=task_type,
            )

        agents = ai_settings.get("agents", {})
        model_rates = ai_settings.get("modelRates", {})
        tried_agents = []
        errors = []

        for agent_id in fallback_chain:
            agent_config = agents.get(agent_id)
            if not agent_config:
                logger.warning(f"Agent {agent_id} in fallback chain not found in agents config")
                continue

            tried_agents.append(agent_id)

            runtime_state = (agent_config.get("runtimeState") or {}).get(active_scope)
            if not runtime_state:
                raise NoAgentsAvailableError(
                    f"Missing runtimeState for scope {active_scope}",
                    task_type=task_type,
                    tried_agents=tried_agents,
                )

            if not runtime_state.get("enabled", False):
                reason = runtime_state.get("reason", "unknown")
                logger.debug(
                    f"Skipping disabled agent {agent_id} for scope {active_scope}: {reason}"
                )
                continue

            provider = agent_config.get("provider")
            interface = agent_config.get("interface")
            if not provider or not interface:
                logger.warning(f"Agent {agent_id} missing provider/interface; skipping")
                continue

            auth_req = agent_config.get("authRequirements")
            if not isinstance(auth_req, dict):
                raise NoAgentsAvailableError(
                    f"Agent {agent_id} missing authRequirements",
                    task_type=task_type,
                    tried_agents=tried_agents,
                )
            required_env = auth_req.get("requiredEnv") or []
            required_files = auth_req.get("requiredFiles") or []
            # Fail fast on empty auth requirements to comply with hard cutover (no implicit defaults)
            if not required_env and not required_files:
                raise NoAgentsAvailableError(
                    f"Agent {agent_id} authRequirements empty",
                    task_type=task_type,
                    tried_agents=tried_agents,
                )

            auth_ok, auth_reason = auth_status(provider, interface)
            if not auth_ok:
                try:
                    self.config_loader.update_agent_status(
                        agent_id, active_scope, enabled=False, reason=auth_reason
                    )
                except Exception as exc:  # best-effort, don't crash caller
                    logger.warning(f"Failed to persist disable for {agent_id}: {exc}")
                logger.info(f"Skipping agent {agent_id}: {auth_reason}")
                continue

            # Determine model first so we can calculate cost for budget check
            model = model_override or agent_config.get("defaultModel")
            if model is None:
                raise NoAgentsAvailableError(
                    f"Agent {agent_id} missing defaultModel",
                    task_type=task_type,
                    tried_agents=tried_agents,
                )
            cost = model_rates.get(model, 1.0)

            # Budget enforcement - check before calling (using model cost)
            if "dailyUsage" not in agent_config or "dailyBudget" not in agent_config:
                raise NoAgentsAvailableError(
                    f"Agent {agent_id} missing budget fields",
                    task_type=task_type,
                    tried_agents=tried_agents,
                )
            daily_usage = agent_config.get("dailyUsage")
            daily_budget = agent_config.get("dailyBudget")
            if daily_usage + cost > daily_budget:
                logger.info(
                    f"Agent {agent_id} over budget ({daily_usage}+{cost}/{daily_budget}), disabling for scope {active_scope}"
                )
                self._disable_agent(agent_id, active_scope, "quota_exhausted: daily budget reached")
                continue

            # Try to call the agent
            try:
                result = self._call_agent(
                    agent_id, agent_config, prompt, model, max_tokens, temperature
                )

                # Increment usage after successful call
                cost = model_rates.get(model, 1.0)
                self.config_loader.increment_agent_usage(agent_id, model)
                logger.info(
                    f"Agent {agent_id} executed successfully (model={model}, cost={cost}, scope={active_scope})"
                )

                return result

            except QuotaExhaustedError as e:
                # Quota/rate limit errors - disable agent but continue to next
                error_msg = str(e)
                logger.warning(f"Agent {agent_id} quota exhausted: {error_msg}")
                self._disable_agent(agent_id, active_scope, f"quota_exhausted: {error_msg}")
                errors.append((agent_id, error_msg))
                continue  # Try next agent in fallback chain

            except AIProviderError as e:
                # Other API errors - disable agent and stop (requires investigation)
                error_msg = str(e)
                logger.error(f"Agent {agent_id} failed: {error_msg}")
                self._disable_agent(agent_id, active_scope, f"error: {error_msg}")
                errors.append((agent_id, error_msg))
                # Don't continue - non-quota errors may indicate systemic issues
                break

        # All agents exhausted
        error_summary = (
            "; ".join(f"{aid}: {err}" for aid, err in errors)
            if errors
            else "all disabled/over budget"
        )
        raise NoAgentsAvailableError(
            f"No agents available for task '{task_type}'. Tried: {tried_agents}. Errors: {error_summary}",
            task_type=task_type,
            tried_agents=tried_agents,
        )

    def _call_agent(
        self,
        agent_id: str,
        agent_config: Dict[str, Any],
        prompt: str,
        model: str,
        max_tokens: int,
        temperature: float,
    ) -> AgentResult:
        """Instantiate and call the appropriate provider.

        Args:
            agent_id: The agent ID for logging
            agent_config: Agent configuration dict
            prompt: The prompt to send
            model: Model to use
            max_tokens: Max tokens in response
            temperature: Sampling temperature

        Returns:
            AgentResult with response text
        """
        provider_type = agent_config.get("provider")
        interface_type = agent_config.get("interface")

        provider_class = _get_provider_class(provider_type, interface_type)
        if not provider_class:
            raise AIProviderError(f"No provider class for {provider_type}/{interface_type}")

        logger.debug(f"Calling {agent_id} with model={model}")
        provider = provider_class(model=model)
        response = provider.generate(prompt, max_tokens=max_tokens, temperature=temperature)

        return AgentResult(text=response, agent_id=agent_id, model=model)

    def _disable_agent(self, agent_id: str, scope: str, reason: str) -> None:
        """Disable an agent with a reason for a specific scope.

        Args:
            agent_id: The agent ID to disable
            scope: runtime scope to disable (worker|backend)
            reason: Why the agent is being disabled
        """
        self.config_loader.update_agent_status(agent_id, scope, enabled=False, reason=reason)
        logger.warning(f"Disabled agent {agent_id} in scope {scope}: {reason}")
