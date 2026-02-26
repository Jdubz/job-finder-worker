"""Tests for InferenceClient.

Tests the InferenceClient class which routes AI requests through LiteLLM proxy.
LiteLLM handles provider selection, fallbacks, retries, and budget tracking.
"""

import pytest
from unittest.mock import patch, MagicMock

from job_finder.ai.inference_client import InferenceClient, AgentResult
from job_finder.ai.task_router import get_model_for_task, TASK_MODEL_MAP, DEFAULT_MODEL
from job_finder.exceptions import (
    AIProviderError,
    NoAgentsAvailableError,
    QuotaExhaustedError,
    TransientError,
)


class TestTaskRouter:
    """Test task-to-model routing."""

    def test_extraction_routes_to_local(self):
        assert get_model_for_task("extraction") == "local-extract"

    def test_analysis_routes_to_local(self):
        assert get_model_for_task("analysis") == "local-extract"

    def test_document_routes_to_claude(self):
        assert get_model_for_task("document") == "claude-document"

    def test_chat_routes_to_claude(self):
        assert get_model_for_task("chat") == "claude-document"

    def test_unknown_task_routes_to_default(self):
        assert get_model_for_task("unknown-task") == DEFAULT_MODEL

    def test_all_task_types_have_mappings(self):
        """All expected task types should have explicit mappings."""
        expected = {"extraction", "analysis", "document", "chat"}
        assert expected == set(TASK_MODEL_MAP.keys())


class TestInferenceClientExecute:
    """Test InferenceClient.execute() method."""

    def _make_mock_response(self, text="test response", model="local-extract"):
        """Create a mock OpenAI chat completion response."""
        message = MagicMock()
        message.content = text
        choice = MagicMock()
        choice.message = message
        usage = MagicMock()
        usage.total_tokens = 100
        response = MagicMock()
        response.choices = [choice]
        response.model = model
        response.usage = usage
        return response

    @patch("job_finder.ai.inference_client.OpenAI")
    def test_execute_returns_agent_result(self, mock_openai_cls):
        """Should return AgentResult with text and metadata."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = self._make_mock_response()
        mock_openai_cls.return_value = mock_client

        client = InferenceClient(api_key="test-key")
        result = client.execute("extraction", "test prompt")

        assert isinstance(result, AgentResult)
        assert result.text == "test response"
        assert result.agent_id == "litellm:local-extract"
        assert result.model == "local-extract"

    @patch("job_finder.ai.inference_client.OpenAI")
    def test_routes_task_to_correct_model(self, mock_openai_cls):
        """Should route task types to correct LiteLLM model names."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = self._make_mock_response(
            model="claude-document"
        )
        mock_openai_cls.return_value = mock_client

        client = InferenceClient(api_key="test-key")
        client.execute("document", "generate resume")

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "claude-document"

    @patch("job_finder.ai.inference_client.OpenAI")
    def test_model_override_takes_precedence(self, mock_openai_cls):
        """Should use model_override when provided."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = self._make_mock_response(
            model="gemini-general"
        )
        mock_openai_cls.return_value = mock_client

        client = InferenceClient(api_key="test-key")
        client.execute("extraction", "test", model_override="gemini-general")

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["model"] == "gemini-general"

    @patch("job_finder.ai.inference_client.OpenAI")
    def test_passes_max_tokens_and_temperature(self, mock_openai_cls):
        """Should forward max_tokens and temperature to API call."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = self._make_mock_response()
        mock_openai_cls.return_value = mock_client

        client = InferenceClient(api_key="test-key")
        client.execute("extraction", "test", max_tokens=2048, temperature=0.1)

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        assert call_kwargs["max_tokens"] == 2048
        assert call_kwargs["temperature"] == 0.1

    @patch("job_finder.ai.inference_client.OpenAI")
    def test_scope_param_accepted_but_ignored(self, mock_openai_cls):
        """Should accept scope parameter for API compat without error."""
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = self._make_mock_response()
        mock_openai_cls.return_value = mock_client

        client = InferenceClient(api_key="test-key")
        result = client.execute("extraction", "test", scope="worker")
        assert result.text == "test response"


class TestInferenceClientErrors:
    """Test error handling and mapping."""

    @patch("job_finder.ai.inference_client.OpenAI")
    def test_timeout_raises_transient_error(self, mock_openai_cls):
        """APITimeoutError should map to TransientError."""
        from openai import APITimeoutError

        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = APITimeoutError(request=MagicMock())
        mock_openai_cls.return_value = mock_client

        client = InferenceClient(api_key="test-key")
        with pytest.raises(TransientError, match="timed out"):
            client.execute("extraction", "test")

    @patch("job_finder.ai.inference_client.OpenAI")
    def test_connection_error_raises_transient_error(self, mock_openai_cls):
        """APIConnectionError should map to TransientError."""
        from openai import APIConnectionError

        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = APIConnectionError(
            request=MagicMock(), message="Connection refused"
        )
        mock_openai_cls.return_value = mock_client

        client = InferenceClient(api_key="test-key")
        with pytest.raises(TransientError, match="Could not connect"):
            client.execute("extraction", "test")

    @patch("job_finder.ai.inference_client.OpenAI")
    def test_429_raises_quota_exhausted(self, mock_openai_cls):
        """HTTP 429 should map to QuotaExhaustedError."""
        from openai import RateLimitError

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.json.return_value = {"error": {"message": "rate limit"}}
        mock_client.chat.completions.create.side_effect = RateLimitError(
            message="rate limit exceeded",
            response=mock_response,
            body={"error": {"message": "rate limit"}},
        )
        mock_openai_cls.return_value = mock_client

        client = InferenceClient(api_key="test-key")
        with pytest.raises(QuotaExhaustedError):
            client.execute("extraction", "test")

    @patch("job_finder.ai.inference_client.OpenAI")
    def test_503_raises_no_agents_available(self, mock_openai_cls):
        """HTTP 503 should map to NoAgentsAvailableError."""
        from openai import APIStatusError

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_client.chat.completions.create.side_effect = APIStatusError(
            message="all providers unavailable",
            response=mock_response,
            body="all providers unavailable",
        )
        mock_openai_cls.return_value = mock_client

        client = InferenceClient(api_key="test-key")
        with pytest.raises(NoAgentsAvailableError):
            client.execute("extraction", "test")

    @patch("job_finder.ai.inference_client.OpenAI")
    def test_other_status_raises_ai_provider_error(self, mock_openai_cls):
        """Other HTTP errors should map to AIProviderError."""
        from openai import APIStatusError

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_client.chat.completions.create.side_effect = APIStatusError(
            message="internal server error",
            response=mock_response,
            body="internal server error",
        )
        mock_openai_cls.return_value = mock_client

        client = InferenceClient(api_key="test-key")
        with pytest.raises(AIProviderError, match="HTTP 500"):
            client.execute("extraction", "test")


class TestNoAgentsAvailableError:
    """Test NoAgentsAvailableError exception."""

    def test_contains_task_type(self):
        error = NoAgentsAvailableError("test message", task_type="extraction")
        assert error.task_type == "extraction"

    def test_contains_tried_agents(self):
        error = NoAgentsAvailableError(
            "test message",
            task_type="extraction",
            tried_agents=["local-extract"],
        )
        assert error.tried_agents == ["local-extract"]

    def test_message_is_accessible(self):
        error = NoAgentsAvailableError("No agents for task")
        assert "No agents for task" in str(error)
