"""Tests for AgentManager.

Tests the AgentManager class which handles AI agent selection,
fallback chains, budget enforcement, and error handling.
"""

import pytest
from unittest.mock import patch, MagicMock

from job_finder.ai.agent_manager import AgentManager, AgentResult
from job_finder.exceptions import AIProviderError, NoAgentsAvailableError, QuotaExhaustedError


def make_ai_settings(
    agents=None,
    task_fallbacks=None,
    model_rates=None,
):
    """Helper to create ai-settings test fixtures."""
    return {
        "agents": agents or {},
        "taskFallbacks": task_fallbacks or {"extraction": [], "analysis": [], "document": []},
        "modelRates": model_rates or {"gpt-4o": 1.0, "gemini-2.0-flash": 0.5},
        "options": [],
    }


def make_agent_config(
    provider="gemini",
    interface="cli",
    model="gemini-2.0-flash",
    daily_budget=100,
    daily_usage=0,
    runtime_state=None,
):
    """Helper to create agent config test fixtures."""
    runtime_state = runtime_state or {
        "worker": {"enabled": True, "reason": None},
        "backend": {"enabled": True, "reason": None},
    }
    return {
        "provider": provider,
        "interface": interface,
        "defaultModel": model,
        "dailyBudget": daily_budget,
        "dailyUsage": daily_usage,
        "runtimeState": runtime_state,
        "authRequirements": {
            "type": interface,
            "requiredEnv": ["PATH"],
        },
    }


class TestAgentManagerExecute:
    """Test AgentManager.execute() method."""

    @patch("job_finder.ai.agent_manager._get_provider_class")
    def test_executes_first_available_agent(self, mock_get_provider):
        """Should use first enabled agent in fallback chain."""
        mock_provider = MagicMock()
        mock_provider.generate.return_value = "test response"
        mock_get_provider.return_value = lambda model: mock_provider

        config_loader = MagicMock()
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={
                "gemini.cli": make_agent_config(),
                "codex.cli": make_agent_config(provider="codex"),
            },
            task_fallbacks={"extraction": ["gemini.cli", "codex.cli"]},
        )

        manager = AgentManager(config_loader)
        result = manager.execute("extraction", "test prompt")

        assert isinstance(result, AgentResult)
        assert result.text == "test response"
        assert result.agent_id == "gemini.cli"
        mock_provider.generate.assert_called_once()

    @patch("job_finder.ai.agent_manager._get_provider_class")
    def test_skips_disabled_agents(self, mock_get_provider):
        """Should skip disabled agents and use next in chain."""
        mock_provider = MagicMock()
        mock_provider.generate.return_value = "from codex"
        mock_get_provider.return_value = lambda model: mock_provider

        config_loader = MagicMock()
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={
                "gemini.cli": make_agent_config(
                    runtime_state={
                        "worker": {"enabled": False, "reason": "error: test"},
                        "backend": {"enabled": True, "reason": None},
                    }
                ),
                "codex.cli": make_agent_config(provider="codex"),
            },
            task_fallbacks={"extraction": ["gemini.cli", "codex.cli"]},
        )

        manager = AgentManager(config_loader)
        result = manager.execute("extraction", "test prompt")

        assert result.agent_id == "codex.cli"

    @patch("job_finder.ai.agent_manager._get_provider_class")
    def test_skips_over_budget_agents(self, mock_get_provider):
        """Should skip agents over budget and disable them."""
        mock_provider = MagicMock()
        mock_provider.generate.return_value = "from codex"
        mock_get_provider.return_value = lambda model: mock_provider

        config_loader = MagicMock()
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={
                "gemini.cli": make_agent_config(daily_budget=10, daily_usage=10),
                "codex.cli": make_agent_config(provider="codex"),
            },
            task_fallbacks={"extraction": ["gemini.cli", "codex.cli"]},
        )

        manager = AgentManager(config_loader)
        result = manager.execute("extraction", "test prompt")

        assert result.agent_id == "codex.cli"
        # Should have disabled the over-budget agent
        config_loader.update_agent_status.assert_called_with(
            "gemini.cli", "worker", enabled=False, reason="quota_exhausted: daily budget reached"
        )

    @patch("job_finder.ai.agent_manager._get_provider_class")
    def test_increments_usage_after_success(self, mock_get_provider):
        """Should increment usage after successful execution."""
        mock_provider = MagicMock()
        mock_provider.generate.return_value = "success"
        mock_get_provider.return_value = lambda model: mock_provider

        config_loader = MagicMock()
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={"gemini.cli": make_agent_config()},
            task_fallbacks={"extraction": ["gemini.cli"]},
        )

        manager = AgentManager(config_loader)
        manager.execute("extraction", "test prompt")

        config_loader.increment_agent_usage.assert_called_once_with(
            "gemini.cli", "gemini-2.0-flash"
        )

    @patch("job_finder.ai.agent_manager._get_provider_class")
    def test_disables_agent_on_error(self, mock_get_provider):
        """Should disable agent and break on AIProviderError."""
        mock_provider = MagicMock()
        mock_provider.generate.side_effect = AIProviderError("API rate limit")
        mock_get_provider.return_value = lambda model: mock_provider

        config_loader = MagicMock()
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={
                "gemini.cli": make_agent_config(),
                "codex.cli": make_agent_config(provider="codex"),
            },
            task_fallbacks={"extraction": ["gemini.cli", "codex.cli"]},
        )

        manager = AgentManager(config_loader)

        with pytest.raises(NoAgentsAvailableError):
            manager.execute("extraction", "test prompt")

        # Should disable the failed agent with error reason
        config_loader.update_agent_status.assert_called_with(
            "gemini.cli", "worker", enabled=False, reason="error: API rate limit"
        )

    @patch("job_finder.ai.agent_manager._get_provider_class")
    def test_continues_to_next_agent_on_quota_exhausted(self, mock_get_provider):
        """Should continue to next agent when QuotaExhaustedError is raised."""
        # First agent raises QuotaExhaustedError, second succeeds
        gemini_provider = MagicMock()
        gemini_provider.generate.side_effect = QuotaExhaustedError(
            "Gemini quota exhausted", provider="gemini"
        )

        codex_provider = MagicMock()
        codex_provider.generate.return_value = "success from codex"

        def get_provider(provider, interface):
            if provider == "gemini":
                return lambda model: gemini_provider
            return lambda model: codex_provider

        mock_get_provider.side_effect = get_provider

        config_loader = MagicMock()
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={
                "gemini.cli": make_agent_config(),
                "codex.cli": make_agent_config(provider="codex"),
            },
            task_fallbacks={"extraction": ["gemini.cli", "codex.cli"]},
        )

        manager = AgentManager(config_loader)
        result = manager.execute("extraction", "test prompt")

        # Should have succeeded with second agent
        assert result.agent_id == "codex.cli"
        assert result.text == "success from codex"

        # First agent should be disabled with quota reason
        config_loader.update_agent_status.assert_any_call(
            "gemini.cli", "worker", enabled=False, reason="quota_exhausted: Gemini quota exhausted"
        )

    def test_raises_when_no_fallback_chain(self):
        """Should raise NoAgentsAvailableError when no fallback chain configured."""
        config_loader = MagicMock()
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={"gemini.cli": make_agent_config()},
            task_fallbacks={"extraction": []},  # Empty chain
        )

        manager = AgentManager(config_loader)

        with pytest.raises(NoAgentsAvailableError) as exc_info:
            manager.execute("extraction", "test prompt")

        assert "No fallback chain" in str(exc_info.value)

    def test_raises_when_all_agents_disabled(self):
        """Should raise NoAgentsAvailableError when all agents disabled."""
        config_loader = MagicMock()
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={
                "gemini.cli": make_agent_config(
                    runtime_state={
                        "worker": {"enabled": False, "reason": "error: test"},
                        "backend": {"enabled": True, "reason": None},
                    }
                ),
                "codex.cli": make_agent_config(
                    provider="codex",
                    runtime_state={
                        "worker": {"enabled": False, "reason": "quota_exhausted: test"},
                        "backend": {"enabled": True, "reason": None},
                    },
                ),
            },
            task_fallbacks={"extraction": ["gemini.cli", "codex.cli"]},
        )

        manager = AgentManager(config_loader)

        with pytest.raises(NoAgentsAvailableError) as exc_info:
            manager.execute("extraction", "test prompt")

        assert exc_info.value.task_type == "extraction"
        assert "gemini.cli" in exc_info.value.tried_agents
        assert "codex.cli" in exc_info.value.tried_agents

    @patch("job_finder.ai.agent_manager._get_provider_class")
    def test_uses_model_override(self, mock_get_provider):
        """Should use model_override when provided."""
        mock_provider = MagicMock()
        mock_provider.generate.return_value = "response"
        mock_get_provider.return_value = lambda model: mock_provider

        config_loader = MagicMock()
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={"gemini.cli": make_agent_config(model="gemini-2.0-flash")},
            task_fallbacks={"extraction": ["gemini.cli"]},
        )

        manager = AgentManager(config_loader)
        result = manager.execute("extraction", "test prompt", model_override="gemini-1.5-pro")

        assert result.model == "gemini-1.5-pro"
        config_loader.increment_agent_usage.assert_called_with("gemini.cli", "gemini-1.5-pro")


class TestAgentManagerBudgetEnforcement:
    """Test budget enforcement logic."""

    @patch("job_finder.ai.agent_manager._get_provider_class")
    def test_budget_check_happens_before_call(self, mock_get_provider):
        """Budget should be checked BEFORE calling the agent, accounting for model cost."""
        mock_provider = MagicMock()
        mock_provider.generate.return_value = "response"
        mock_get_provider.return_value = lambda model: mock_provider

        config_loader = MagicMock()
        # Agent usage + cost (0.5 for gemini-2.0-flash) would exceed budget
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={"gemini.cli": make_agent_config(daily_budget=50, daily_usage=50)},
            task_fallbacks={"extraction": ["gemini.cli"]},
        )

        manager = AgentManager(config_loader)

        with pytest.raises(NoAgentsAvailableError):
            manager.execute("extraction", "test prompt")

        # Provider should NOT have been called since budget was exceeded
        mock_provider.generate.assert_not_called()

    @patch("job_finder.ai.agent_manager._get_provider_class")
    def test_reads_fresh_config_each_call(self, mock_get_provider):
        """Should read config fresh on each execute call."""
        mock_provider = MagicMock()
        mock_provider.generate.return_value = "response"
        mock_get_provider.return_value = lambda model: mock_provider

        config_loader = MagicMock()
        config_loader.get_ai_settings.return_value = make_ai_settings(
            agents={"gemini.cli": make_agent_config()},
            task_fallbacks={"extraction": ["gemini.cli"]},
        )

        manager = AgentManager(config_loader)

        manager.execute("extraction", "prompt 1")
        manager.execute("extraction", "prompt 2")

        # get_ai_settings should be called twice (fresh read each time)
        assert config_loader.get_ai_settings.call_count == 2


class TestNoAgentsAvailableError:
    """Test NoAgentsAvailableError exception."""

    def test_contains_task_type(self):
        """Should include task type in exception."""
        error = NoAgentsAvailableError("test message", task_type="extraction")
        assert error.task_type == "extraction"

    def test_contains_tried_agents(self):
        """Should include list of tried agents."""
        error = NoAgentsAvailableError(
            "test message",
            task_type="extraction",
            tried_agents=["gemini.cli", "codex.cli"],
        )
        assert error.tried_agents == ["gemini.cli", "codex.cli"]

    def test_message_is_accessible(self):
        """Should have accessible message."""
        error = NoAgentsAvailableError("No agents for task")
        assert "No agents for task" in str(error)
