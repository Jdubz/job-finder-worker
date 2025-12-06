"""Agent Manager for AI provider selection and lifecycle management.

The AgentManager abstracts AI agent selection from callers. Workers supply a task type
and prompt; the manager selects the appropriate agent based on configuration,
availability, and budget.

Key responsibilities:
- Select agents from fallback chain based on task type
- Enforce daily budget limits before calling agents
- Disable agents on errors (quota exhaustion, API failures)
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
        CodexCLIProvider,
        GeminiCLIProvider,
        GeminiProvider,
        OpenAIProvider,
    )

    provider_map = {
        ("codex", "cli"): CodexCLIProvider,
        ("claude", "api"): ClaudeProvider,
        ("openai", "api"): OpenAIProvider,
        ("gemini", "api"): GeminiProvider,
        ("gemini", "cli"): GeminiCLIProvider,
    }
    return provider_map.get((provider, interface))


class AgentManager:
    """Manages AI agent selection, fallback, and lifecycle.

    The manager reads ai-settings fresh on every call to support shared budget
    tracking between worker and backend. It enforces budget limits before calling
    agents and disables agents on errors.
    """

    def __init__(self, config_loader: "ConfigLoader"):
        """Initialize the agent manager.

        Args:
            config_loader: ConfigLoader instance for reading/writing ai-settings
        """
        self.config_loader = config_loader

    def execute(
        self,
        task_type: str,
        prompt: str,
        model_override: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
    ) -> AgentResult:
        """Execute a task using the appropriate agent from the fallback chain.

        Tries agents in fallback order until one succeeds. Handles budget
        enforcement and error-based agent disabling.

        Args:
            task_type: The type of task ("extraction" or "analysis")
            prompt: The prompt to send to the agent
            model_override: Optional model to use instead of agent default
            max_tokens: Maximum tokens in response
            temperature: Sampling temperature

        Returns:
            AgentResult with response text and metadata

        Raises:
            NoAgentsAvailableError: All agents exhausted, disabled, or over budget
        """
        # Always read fresh config (enables shared budget with backend)
        ai_settings = self.config_loader.get_ai_settings()

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

            # Skip disabled agents
            if not agent_config.get("enabled", True):
                reason = agent_config.get("reason", "unknown")
                logger.debug(f"Skipping disabled agent {agent_id}: {reason}")
                continue

            provider = agent_config.get("provider")
            interface = agent_config.get("interface")
            if not provider or not interface:
                logger.warning(f"Agent {agent_id} missing provider/interface; skipping")
                continue

            auth_ok, auth_reason = auth_status(provider, interface)
            if not auth_ok:
                agent_config["enabled"] = False
                agent_config["reason"] = auth_reason
                try:
                    self.config_loader.update_agent_status(agent_id, enabled=False, reason=auth_reason)
                except Exception as exc:  # best-effort, don't crash caller
                    logger.warning(f"Failed to persist disable for {agent_id}: {exc}")
                logger.info(f"Skipping agent {agent_id}: {auth_reason}")
                continue

            # Determine model first so we can calculate cost for budget check
            model = model_override or agent_config.get("defaultModel")
            cost = model_rates.get(model, 1.0)

            # Budget enforcement - check before calling (using model cost)
            daily_usage = agent_config.get("dailyUsage", 0)
            daily_budget = agent_config.get("dailyBudget", float("inf"))
            if daily_usage + cost > daily_budget:
                logger.info(
                    f"Agent {agent_id} over budget ({daily_usage}+{cost}/{daily_budget}), disabling"
                )
                self._disable_agent(agent_id, "quota_exhausted: daily budget reached")
                continue

            # Try to call the agent
            try:
                result = self._call_agent(
                    agent_id, agent_config, prompt, model, max_tokens, temperature
                )

                # Increment usage after successful call
                cost = model_rates.get(model, 1.0)
                self.config_loader.increment_agent_usage(agent_id, model)
                logger.info(f"Agent {agent_id} executed successfully (model={model}, cost={cost})")

                return result

            except QuotaExhaustedError as e:
                # Quota/rate limit errors - disable agent but continue to next
                error_msg = str(e)
                logger.warning(f"Agent {agent_id} quota exhausted: {error_msg}")
                self._disable_agent(agent_id, f"quota_exhausted: {error_msg}")
                errors.append((agent_id, error_msg))
                continue  # Try next agent in fallback chain

            except AIProviderError as e:
                # Other API errors - disable agent and stop (requires investigation)
                error_msg = str(e)
                logger.error(f"Agent {agent_id} failed: {error_msg}")
                self._disable_agent(agent_id, f"error: {error_msg}")
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

    def _disable_agent(self, agent_id: str, reason: str) -> None:
        """Disable an agent with a reason.

        Args:
            agent_id: The agent ID to disable
            reason: Why the agent is being disabled
        """
        self.config_loader.update_agent_status(agent_id, enabled=False, reason=reason)
        logger.warning(f"Disabled agent {agent_id}: {reason}")
