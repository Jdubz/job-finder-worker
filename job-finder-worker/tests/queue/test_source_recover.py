"""Tests for the SOURCE_RECOVER queue item type."""

from __future__ import annotations

from typing import Any, Dict
from unittest.mock import MagicMock, Mock, patch

import pytest

from job_finder.job_queue.models import (
    JobQueueItem,
    ProcessorContext,
    QueueItemType,
    QueueStatus,
    SourceStatus,
)
from job_finder.job_queue.processor import QueueItemProcessor
from job_finder.job_queue.processors.source_processor import (
    CONTENT_SAMPLE_FETCH_LIMIT,
    CONTENT_SAMPLE_PROMPT_LIMIT,
    PROBE_RENDER_TIMEOUT_MS,
    ProbeResult,
)


@pytest.fixture
def mock_dependencies() -> Dict[str, Any]:
    """Provide minimal dependencies for SOURCE_RECOVER tests."""
    queue_manager = MagicMock()
    queue_manager.update_status = MagicMock()

    config_loader = MagicMock()
    config_loader.get_ai_settings.return_value = {
        "agents": {},
        "taskFallbacks": {},
        "modelRates": {},
        "options": [],
    }
    config_loader.get_title_filter.return_value = {
        "requiredKeywords": [],
        "excludedKeywords": [],
    }
    config_loader.get_prefilter_policy.return_value = {
        "title": {"requiredKeywords": [], "excludedKeywords": []},
        "freshness": {"maxAgeDays": 60},
        "workArrangement": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": True,
            "willRelocate": True,
            "userLocation": "Portland, OR",
        },
        "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
        "salary": {"minimum": None},
    }
    config_loader.get_match_policy.return_value = {
        "minScore": 60,
        "seniority": {
            "preferred": ["senior"],
            "acceptable": ["mid"],
            "rejected": ["junior"],
            "preferredScore": 15,
            "acceptableScore": 0,
            "rejectedScore": -100,
        },
        "location": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": False,
            "userTimezone": -8,
            "maxTimezoneDiffHours": 4,
            "perHourScore": -3,
            "hybridSameCityScore": 10,
            "remoteScore": 5,
            "relocationScore": -50,
            "unknownTimezoneScore": -5,
            "relocationAllowed": False,
        },
        "skillMatch": {
            "baseMatchScore": 1,
            "yearsMultiplier": 0.5,
            "maxYearsBonus": 5,
            "missingScore": -1,
            "analogScore": 0,
            "maxBonus": 25,
            "maxPenalty": -15,
            "missingIgnore": [],
        },
        "skills": {"bonusPerSkill": 2, "maxSkillBonus": 15},
        "salary": {
            "minimum": None,
            "target": None,
            "belowTargetScore": -2,
            "belowTargetMaxPenalty": -20,
            "missingSalaryScore": 0,
            "meetsTargetScore": 0,
            "equityScore": 0,
            "contractScore": 0,
        },
        "experience": {"maxRequired": 15, "overqualifiedScore": -5},
        "freshness": {
            "freshDays": 2,
            "freshScore": 10,
            "staleDays": 3,
            "staleScore": -10,
            "veryStaleDays": 12,
            "veryStaleScore": -20,
            "repostScore": -5,
        },
        "roleFit": {
            "preferred": ["backend"],
            "acceptable": ["fullstack"],
            "penalized": ["frontend"],
            "rejected": [],
            "preferredScore": 5,
            "penalizedScore": -5,
        },
        "company": {
            "preferredCityScore": 20,
            "preferredCity": "Portland",
            "remoteFirstScore": 15,
            "aiMlFocusScore": 10,
            "largeCompanyScore": 10,
            "smallCompanyScore": -5,
            "largeCompanyThreshold": 10000,
            "smallCompanyThreshold": 100,
            "startupScore": 0,
        },
    }

    job_storage = MagicMock()
    job_listing_storage = MagicMock()
    companies_manager = MagicMock()

    sources_manager = MagicMock()
    sources_manager.get_source_by_id.return_value = {
        "id": "source-123",
        "name": "Test Company",
        "status": "disabled",
        "config": {
            "type": "html",
            "url": "https://example.com/careers",
            "job_selector": ".job-card",
            "fields": {"title": ".title", "url": "a@href"},
            "disabled_notes": "Selector no longer matches",
        },
    }

    company_info_fetcher = MagicMock()
    ai_matcher = MagicMock()

    return {
        "queue_manager": queue_manager,
        "config_loader": config_loader,
        "job_storage": job_storage,
        "job_listing_storage": job_listing_storage,
        "companies_manager": companies_manager,
        "sources_manager": sources_manager,
        "company_info_fetcher": company_info_fetcher,
        "ai_matcher": ai_matcher,
    }


@pytest.fixture
def processor(mock_dependencies: Dict[str, Any]) -> QueueItemProcessor:
    """Instantiate a QueueItemProcessor with mocked dependencies."""
    with (
        patch("job_finder.job_queue.processors.source_processor.AgentManager"),
        patch("job_finder.job_queue.processors.job_processor.AgentManager"),
        patch("job_finder.job_queue.processors.job_processor.ScrapeRunner"),
    ):
        ctx = ProcessorContext(
            queue_manager=mock_dependencies["queue_manager"],
            config_loader=mock_dependencies["config_loader"],
            job_storage=mock_dependencies["job_storage"],
            job_listing_storage=mock_dependencies["job_listing_storage"],
            companies_manager=mock_dependencies["companies_manager"],
            sources_manager=mock_dependencies["sources_manager"],
            company_info_fetcher=mock_dependencies["company_info_fetcher"],
            ai_matcher=mock_dependencies["ai_matcher"],
        )
        return QueueItemProcessor(ctx)


@pytest.fixture
def source_processor(processor: QueueItemProcessor):
    """Expose the specialized SourceProcessor from the main processor."""
    return processor.source_processor


def make_recover_item(source_id: str = "source-123") -> JobQueueItem:
    """Build a SOURCE_RECOVER queue item for tests."""
    return JobQueueItem(
        id="queue-recover-001",
        type=QueueItemType.SOURCE_RECOVER,
        source_id=source_id,
    )


class TestQueueRouting:
    """Test that SOURCE_RECOVER items are routed correctly."""

    def test_routes_source_recover_items(self, processor: QueueItemProcessor):
        """Test that SOURCE_RECOVER items are routed to source_processor."""
        item = make_recover_item()

        with patch.object(
            processor.source_processor, "process_source_recover", return_value=None
        ) as mocked:
            processor.process_item(item)

        mocked.assert_called_once_with(item)


class TestSourceRecoverValidation:
    """Test validation and early exit conditions."""

    def test_fails_without_source_id(self, source_processor, mock_dependencies):
        """Test that recovery fails when source_id is missing."""
        item = JobQueueItem(
            id="queue-recover-001",
            type=QueueItemType.SOURCE_RECOVER,
            source_id=None,
        )

        source_processor.process_source_recover(item)

        mock_dependencies["queue_manager"].update_status.assert_called_with(
            "queue-recover-001",
            QueueStatus.FAILED,
            "SOURCE_RECOVER requires source_id",
        )

    def test_fails_when_source_not_found(self, source_processor, mock_dependencies):
        """Test that recovery fails when source doesn't exist."""
        mock_dependencies["sources_manager"].get_source_by_id.return_value = None
        item = make_recover_item(source_id="nonexistent-source")

        source_processor.process_source_recover(item)

        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "Source not found" in final_call[0][2]

    def test_fails_when_source_has_no_url(self, source_processor, mock_dependencies):
        """Test that recovery fails when source config has no URL."""
        mock_dependencies["sources_manager"].get_source_by_id.return_value = {
            "id": "source-123",
            "name": "Test Company",
            "config": {"type": "html", "job_selector": ".job"},
        }
        item = make_recover_item()

        source_processor.process_source_recover(item)

        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "has no URL" in final_call[0][2]


class TestFetchContentSample:
    """Test the _fetch_content_sample helper method."""

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    def test_html_uses_playwright(self, mock_get_renderer, source_processor):
        """Test that HTML sources use Playwright for rendering."""
        mock_renderer = Mock()
        mock_result = Mock()
        mock_result.html = "<html><body>Test content</body></html>"
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        result = source_processor._fetch_content_sample(
            url="https://example.com/careers",
            source_type="html",
            config={"job_selector": ".job"},
        )

        assert "Test content" in result
        mock_renderer.render.assert_called_once()

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    def test_html_falls_back_to_static_on_playwright_failure(
        self, mock_requests_get, mock_get_renderer, source_processor
    ):
        """Test that HTML sources fall back to static fetch when Playwright fails."""
        mock_get_renderer.return_value.render.side_effect = RuntimeError("Playwright failed")

        mock_response = Mock()
        mock_response.text = "<html>Static content</html>"
        mock_requests_get.return_value = mock_response

        result = source_processor._fetch_content_sample(
            url="https://example.com/careers",
            source_type="html",
            config={},
        )

        assert "Static content" in result

    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    def test_api_fetches_json_response(self, mock_requests_get, source_processor):
        """Test that API sources fetch JSON response with status code."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = '{"jobs": [{"title": "Engineer"}]}'
        mock_requests_get.return_value = mock_response

        result = source_processor._fetch_content_sample(
            url="https://api.example.com/jobs",
            source_type="api",
            config={},
        )

        assert "API Response - Status 200" in result
        assert "jobs" in result

    def test_unknown_source_type_returns_message(self, source_processor):
        """Test that unknown source types return an error message."""
        result = source_processor._fetch_content_sample(
            url="https://example.com",
            source_type="unknown",
            config={},
        )

        assert "Unknown source type" in result

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    def test_respects_fetch_limit(self, mock_get_renderer, source_processor):
        """Test that content is truncated to CONTENT_SAMPLE_FETCH_LIMIT."""
        mock_renderer = Mock()
        mock_result = Mock()
        # Create content longer than the limit
        mock_result.html = "x" * (CONTENT_SAMPLE_FETCH_LIMIT + 1000)
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        result = source_processor._fetch_content_sample(
            url="https://example.com/careers",
            source_type="html",
            config={},
        )

        assert len(result) == CONTENT_SAMPLE_FETCH_LIMIT


class TestAgentRecoverSource:
    """Test the _agent_recover_source method."""

    def test_returns_none_without_agent_manager(self, source_processor):
        """Test that method returns None when agent_manager is not available."""
        source_processor.agent_manager = None

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com",
            current_config={"type": "html"},
            disabled_notes="",
            content_sample="<html></html>",
        )

        assert result is None

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_returns_valid_html_config(self, mock_extract_json, source_processor):
        """Test that valid HTML config from agent is returned."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"job_selector": ".new-selector", "fields": {"title": ".title"}}'
        )
        mock_extract_json.return_value = (
            '{"job_selector": ".new-selector", "fields": {"title": ".title"}}'
        )

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com",
            current_config={"type": "html", "url": "https://example.com"},
            disabled_notes="",
            content_sample="<html></html>",
        )

        assert result is not None
        assert result["job_selector"] == ".new-selector"
        # Verify required fields are merged from current_config
        assert result["url"] == "https://example.com"
        assert result["type"] == "html"

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_returns_valid_api_config(self, mock_extract_json, source_processor):
        """Test that valid API config from agent is returned."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"response_path": "jobs", "fields": {"title": "title"}}'
        )
        mock_extract_json.return_value = '{"response_path": "jobs", "fields": {"title": "title"}}'

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://api.example.com",
            current_config={"type": "api", "url": "https://api.example.com"},
            disabled_notes="",
            content_sample='{"jobs": []}',
        )

        assert result is not None
        assert result["fields"]["title"] == "title"
        # Verify required fields are merged from current_config
        assert result["url"] == "https://api.example.com"
        assert result["type"] == "api"

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_returns_none_for_invalid_html_config(self, mock_extract_json, source_processor):
        """Test that invalid HTML config (missing job_selector) returns None."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"fields": {"title": ".title"}}'
        )
        mock_extract_json.return_value = '{"fields": {"title": ".title"}}'

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com",
            current_config={"type": "html"},
            disabled_notes="",
            content_sample="<html></html>",
        )

        assert result is None


class TestSourceRecoverSuccess:
    """Test successful recovery scenarios."""

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    def test_successful_recovery_updates_source_and_status(
        self, mock_get_renderer, source_processor, mock_dependencies
    ):
        """Test that successful recovery updates source config and marks SUCCESS."""
        # Mock Playwright render
        mock_renderer = Mock()
        mock_result = Mock()
        mock_result.html = "<html><div class='job'><h2>Engineer</h2></div></html>"
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        # Mock agent to return a fixed config
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"job_selector": ".job", "fields": {"title": "h2"}}'
        )

        # Mock probe to return success
        with patch.object(
            source_processor,
            "_probe_config",
            return_value=ProbeResult(status="success", job_count=5),
        ):
            with patch(
                "job_finder.job_queue.processors.source_processor.extract_json_from_response",
                return_value='{"job_selector": ".job", "fields": {"title": "h2"}}',
            ):
                item = make_recover_item()
                source_processor.process_source_recover(item)

        # Verify source was updated
        mock_dependencies["sources_manager"].update_config.assert_called_once()
        mock_dependencies["sources_manager"].update_source_status.assert_called_once_with(
            "source-123", SourceStatus.ACTIVE
        )

        # Verify status was set to SUCCESS
        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.SUCCESS
        assert "Recovered" in final_call[0][2]
        assert "5 jobs" in final_call[0][2]


class TestSourceRecoverFailure:
    """Test recovery failure scenarios."""

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    def test_fails_when_agent_returns_no_fix(
        self, mock_get_renderer, source_processor, mock_dependencies
    ):
        """Test that recovery fails when agent cannot propose a fix."""
        mock_renderer = Mock()
        mock_result = Mock()
        mock_result.html = "<html></html>"
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        # Agent returns None (couldn't propose fix)
        source_processor.agent_manager = None

        item = make_recover_item()
        source_processor.process_source_recover(item)

        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "could not propose a fix" in final_call[0][2]

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    def test_fails_when_probe_finds_no_jobs(
        self, mock_get_renderer, source_processor, mock_dependencies
    ):
        """Test that recovery fails when probe finds 0 jobs with proposed config."""
        mock_renderer = Mock()
        mock_result = Mock()
        mock_result.html = "<html></html>"
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"job_selector": ".job", "fields": {"title": "h2"}}'
        )

        # Probe returns 0 jobs
        with patch.object(
            source_processor,
            "_probe_config",
            return_value=ProbeResult(status="empty", job_count=0, sample="<html></html>"),
        ):
            with patch(
                "job_finder.job_queue.processors.source_processor.extract_json_from_response",
                return_value='{"job_selector": ".job", "fields": {"title": "h2"}}',
            ):
                item = make_recover_item()
                source_processor.process_source_recover(item)

        # Source should NOT be updated
        mock_dependencies["sources_manager"].update_config.assert_not_called()
        mock_dependencies["sources_manager"].update_source_status.assert_not_called()

        # Status should be FAILED
        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "found 0 jobs" in final_call[0][2]


class TestConstants:
    """Test that constants are properly defined."""

    def test_fetch_limit_is_larger_than_prompt_limit(self):
        """Verify fetch limit is larger to allow for buffer."""
        assert CONTENT_SAMPLE_FETCH_LIMIT > CONTENT_SAMPLE_PROMPT_LIMIT

    def test_constants_have_reasonable_values(self):
        """Verify constants are reasonable sizes."""
        assert CONTENT_SAMPLE_FETCH_LIMIT >= 4000
        assert CONTENT_SAMPLE_PROMPT_LIMIT >= 4000

    def test_probe_timeout_is_shorter_than_default(self):
        """Verify probe timeout is shorter for fast failure."""
        from job_finder.scrapers.source_config import DEFAULT_RENDER_TIMEOUT_MS

        assert PROBE_RENDER_TIMEOUT_MS < DEFAULT_RENDER_TIMEOUT_MS
        assert PROBE_RENDER_TIMEOUT_MS >= 5000  # At least 5 seconds


class TestAgentTypeChange:
    """Test that agent can propose different source types."""

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_allows_html_to_api_type_change(self, mock_extract_json, source_processor):
        """Test that agent can propose API config for source currently typed as HTML."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"type": "api", "response_path": "jobs", "fields": {"title": "title", "url": "url"}}'
        )
        mock_extract_json.return_value = (
            '{"type": "api", "response_path": "jobs", "fields": {"title": "title", "url": "url"}}'
        )

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com/api",
            current_config={"type": "html", "url": "https://example.com/api"},
            disabled_notes="",
            content_sample='{"jobs": []}',
        )

        assert result is not None
        assert result["type"] == "api"
        assert result["response_path"] == "jobs"

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_allows_api_to_html_type_change(self, mock_extract_json, source_processor):
        """Test that agent can propose HTML config for source currently typed as API."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"type": "html", "job_selector": ".job", "fields": {"title": ".title", "url": "a@href"}}'
        )
        mock_extract_json.return_value = '{"type": "html", "job_selector": ".job", "fields": {"title": ".title", "url": "a@href"}}'

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com/careers",
            current_config={"type": "api", "url": "https://example.com/careers"},
            disabled_notes="",
            content_sample="<html><div class='job'></div></html>",
        )

        assert result is not None
        assert result["type"] == "html"
        assert result["job_selector"] == ".job"


class TestProbeHintInErrorDetails:
    """Test that probe hints are included in error messages."""

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    def test_includes_probe_hint_in_failure_message(
        self, mock_get_renderer, source_processor, mock_dependencies
    ):
        """Test that probe hint is included when recovery fails."""
        mock_renderer = Mock()
        mock_result = Mock()
        mock_result.html = "<html></html>"
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"job_selector": ".job", "fields": {"title": "h2", "url": "a@href"}}'
        )

        # Probe returns error with hint
        with patch.object(
            source_processor,
            "_probe_config",
            return_value=ProbeResult(
                status="error", job_count=0, hint="Timeout waiting for selector"
            ),
        ):
            with patch(
                "job_finder.job_queue.processors.source_processor.extract_json_from_response",
                return_value='{"job_selector": ".job", "fields": {"title": "h2", "url": "a@href"}}',
            ):
                item = make_recover_item()
                source_processor.process_source_recover(item)

        # Verify hint is in result message
        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "Timeout waiting for selector" in final_call[0][2]
