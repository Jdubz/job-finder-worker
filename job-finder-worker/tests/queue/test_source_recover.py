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
    RecoveryResult,
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

    def test_returns_recovery_result_without_agent_manager(self, source_processor):
        """Test that method returns RecoveryResult with can_recover=False when agent_manager is not available."""
        source_processor.agent_manager = None

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com",
            current_config={"type": "html"},
            disabled_notes="",
            content_sample="<html></html>",
        )

        assert isinstance(result, RecoveryResult)
        assert result.can_recover is False
        assert result.config is None

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_returns_valid_html_config(self, mock_extract_json, source_processor):
        """Test that valid HTML config from agent is returned."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"can_recover": true, "config": {"job_selector": ".new-selector", "fields": {"title": ".title"}}}'
        )
        mock_extract_json.return_value = '{"can_recover": true, "config": {"job_selector": ".new-selector", "fields": {"title": ".title"}}}'

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com",
            current_config={"type": "html", "url": "https://example.com"},
            disabled_notes="",
            content_sample="<html></html>",
        )

        assert isinstance(result, RecoveryResult)
        assert result.config is not None
        assert result.config["job_selector"] == ".new-selector"
        # Verify required fields are merged from current_config
        assert result.config["url"] == "https://example.com"
        assert result.config["type"] == "html"

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_returns_valid_api_config(self, mock_extract_json, source_processor):
        """Test that valid API config from agent is returned."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"can_recover": true, "config": {"response_path": "jobs", "fields": {"title": "title"}}}'
        )
        mock_extract_json.return_value = '{"can_recover": true, "config": {"response_path": "jobs", "fields": {"title": "title"}}}'

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://api.example.com",
            current_config={"type": "api", "url": "https://api.example.com"},
            disabled_notes="",
            content_sample='{"jobs": []}',
        )

        assert isinstance(result, RecoveryResult)
        assert result.config is not None
        assert result.config["fields"]["title"] == "title"
        # Verify required fields are merged from current_config
        assert result.config["url"] == "https://api.example.com"
        assert result.config["type"] == "api"

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_returns_non_recoverable_for_invalid_html_config(
        self, mock_extract_json, source_processor
    ):
        """Test that invalid HTML config (missing job_selector) returns non-recoverable result."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"can_recover": true, "config": {"fields": {"title": ".title"}}}'
        )
        mock_extract_json.return_value = (
            '{"can_recover": true, "config": {"fields": {"title": ".title"}}}'
        )

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com",
            current_config={"type": "html"},
            disabled_notes="",
            content_sample="<html></html>",
        )

        assert isinstance(result, RecoveryResult)
        assert result.can_recover is False
        assert result.config is None


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

        # Mock agent to return a fixed config via RecoveryResult
        fixed_config = {
            "type": "html",
            "url": "https://example.com/careers",
            "job_selector": ".job",
            "fields": {"title": "h2"},
        }

        # Mock probe to return success
        with patch.object(
            source_processor,
            "_probe_config",
            return_value=ProbeResult(status="success", job_count=5),
        ):
            with patch.object(
                source_processor,
                "_agent_recover_source",
                return_value=RecoveryResult(config=fixed_config),
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
        # Use content with job-related keywords to avoid triggering bot detection
        mock_result.html = (
            "<html><body><div class='job-listings'>Jobs at Company</div></body></html>"
        )
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        # Agent returns RecoveryResult with no config
        with patch.object(
            source_processor,
            "_agent_recover_source",
            return_value=RecoveryResult(can_recover=False, diagnosis="Could not find jobs"),
        ):
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
        # Use content with job-related keywords to avoid triggering bot detection
        mock_result.html = (
            "<html><body><div class='job-listings'>Jobs at Company</div></body></html>"
        )
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        fixed_config = {
            "type": "html",
            "url": "https://example.com/careers",
            "job_selector": ".job",
            "fields": {"title": "h2", "url": "a@href"},
        }

        # Probe returns 0 jobs - use content with job keywords
        with patch.object(
            source_processor,
            "_probe_config",
            return_value=ProbeResult(
                status="empty",
                job_count=0,
                sample="<html><body><div class='careers'>Open Positions</div></body></html>",
            ),
        ):
            with patch.object(
                source_processor,
                "_agent_recover_source",
                return_value=RecoveryResult(config=fixed_config),
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

    def test_probe_timeout_matches_default(self):
        """Verify probe timeout matches default to avoid false negatives.

        Previously the probe timeout was shorter (10s vs 20s) which caused
        valid JS-rendered sources to fail during recovery because they didn't
        have enough time to render. The probe timeout should match normal
        render timeout to give pages the same rendering window.
        """
        from job_finder.scrapers.source_config import DEFAULT_RENDER_TIMEOUT_MS

        assert PROBE_RENDER_TIMEOUT_MS == DEFAULT_RENDER_TIMEOUT_MS
        assert PROBE_RENDER_TIMEOUT_MS >= 15000  # At least 15 seconds for JS rendering


class TestAgentTypeChange:
    """Test that agent can propose different source types."""

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_allows_html_to_api_type_change(self, mock_extract_json, source_processor):
        """Test that agent can propose API config for source currently typed as HTML."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"can_recover": true, "config": {"type": "api", "response_path": "jobs", "fields": {"title": "title", "url": "url"}}}'
        )
        mock_extract_json.return_value = '{"can_recover": true, "config": {"type": "api", "response_path": "jobs", "fields": {"title": "title", "url": "url"}}}'

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com/api",
            current_config={"type": "html", "url": "https://example.com/api"},
            disabled_notes="",
            content_sample='{"jobs": []}',
        )

        assert isinstance(result, RecoveryResult)
        assert result.config is not None
        assert result.config["type"] == "api"
        assert result.config["response_path"] == "jobs"

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_allows_api_to_html_type_change(self, mock_extract_json, source_processor):
        """Test that agent can propose HTML config for source currently typed as API."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"can_recover": true, "config": {"type": "html", "job_selector": ".job", "fields": {"title": ".title", "url": "a@href"}}}'
        )
        mock_extract_json.return_value = '{"can_recover": true, "config": {"type": "html", "job_selector": ".job", "fields": {"title": ".title", "url": "a@href"}}}'

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com/careers",
            current_config={"type": "api", "url": "https://example.com/careers"},
            disabled_notes="",
            content_sample="<html><div class='job'></div></html>",
        )

        assert isinstance(result, RecoveryResult)
        assert result.config is not None
        assert result.config["type"] == "html"
        assert result.config["job_selector"] == ".job"


class TestProbeHintInErrorDetails:
    """Test that probe hints are included in error messages."""

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    def test_includes_probe_hint_in_failure_message(
        self, mock_get_renderer, source_processor, mock_dependencies
    ):
        """Test that probe hint is included when recovery fails."""
        mock_renderer = Mock()
        mock_result = Mock()
        # Use content with job-related keywords to avoid triggering bot detection
        mock_result.html = (
            "<html><body><div class='job-listings'>Jobs at Company</div></body></html>"
        )
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        fixed_config = {
            "type": "html",
            "url": "https://example.com/careers",
            "job_selector": ".job",
            "fields": {"title": "h2", "url": "a@href"},
        }

        # Probe returns error with hint - include job content to avoid bot detection
        with patch.object(
            source_processor,
            "_probe_config",
            return_value=ProbeResult(
                status="error",
                job_count=0,
                hint="Timeout waiting for selector",
                sample="<html><body>Careers page content</body></html>",
            ),
        ):
            with patch.object(
                source_processor,
                "_agent_recover_source",
                return_value=RecoveryResult(config=fixed_config),
            ):
                item = make_recover_item()
                source_processor.process_source_recover(item)

        # Verify hint is in result message
        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "Timeout waiting for selector" in final_call[0][2]


class TestTypeJsonNormalization:
    """Test that type=json is normalized to type=api."""

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_normalizes_type_json_to_api(self, mock_extract_json, source_processor):
        """Test that agent proposing type=json is normalized to type=api."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"can_recover": true, "config": {"type": "json", "response_path": "content", "fields": {"title": "name", "url": "applyUrl"}}}'
        )
        mock_extract_json.return_value = '{"can_recover": true, "config": {"type": "json", "response_path": "content", "fields": {"title": "name", "url": "applyUrl"}}}'

        result = source_processor._agent_recover_source(
            source_name="Test API",
            url="https://api.example.com/jobs",
            current_config={"type": "html", "url": "https://api.example.com/jobs"},
            disabled_notes="",
            content_sample='{"content": [{"name": "Test Job", "applyUrl": "/apply/123"}]}',
        )

        assert isinstance(result, RecoveryResult)
        assert result.config is not None
        assert result.config["type"] == "api"  # Should be normalized to "api", not "json"
        assert result.config["response_path"] == "content"


class TestAgentURLChange:
    """Test that agent can propose different URLs."""

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_uses_agent_url_for_html_type(self, mock_extract_json, source_processor):
        """Test that agent's proposed URL is used for HTML sources (e.g., URL redirects)."""
        source_processor.agent_manager = Mock()
        new_url = "https://example.com/careers/all-jobs"
        source_processor.agent_manager.execute.return_value = Mock(
            text=f'{{"can_recover": true, "config": {{"type": "html", "url": "{new_url}", "job_selector": ".job", "fields": {{"title": ".title", "url": "a@href"}}}}}}'
        )
        mock_extract_json.return_value = f'{{"can_recover": true, "config": {{"type": "html", "url": "{new_url}", "job_selector": ".job", "fields": {{"title": ".title", "url": "a@href"}}}}}}'

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com/careers",  # Original URL (redirects to new one)
            current_config={"type": "html", "url": "https://example.com/careers"},
            disabled_notes="",
            content_sample="<div class='job'></div>",
        )

        assert isinstance(result, RecoveryResult)
        assert result.config is not None
        assert result.config["type"] == "html"
        assert result.config["url"] == new_url  # Should use agent's URL, not original

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_uses_agent_url_for_api_type(self, mock_extract_json, source_processor):
        """Test that agent's proposed URL is used for API type changes."""
        source_processor.agent_manager = Mock()
        new_api_url = "https://api.example.com/v1/jobs"
        source_processor.agent_manager.execute.return_value = Mock(
            text=f'{{"can_recover": true, "config": {{"type": "api", "url": "{new_api_url}", "response_path": "jobs", "fields": {{"title": "title", "url": "url"}}}}}}'
        )
        mock_extract_json.return_value = f'{{"can_recover": true, "config": {{"type": "api", "url": "{new_api_url}", "response_path": "jobs", "fields": {{"title": "title", "url": "url"}}}}}}'

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com/careers",  # Original HTML page URL
            current_config={"type": "html", "url": "https://example.com/careers"},
            disabled_notes="",
            content_sample='<script>fetch("/api/v1/jobs")</script>',
        )

        assert isinstance(result, RecoveryResult)
        assert result.config is not None
        assert result.config["type"] == "api"
        assert result.config["url"] == new_api_url  # Should use agent's URL, not original

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_falls_back_to_original_url_when_not_provided(
        self, mock_extract_json, source_processor
    ):
        """Test that original URL is used when agent doesn't provide one."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"can_recover": true, "config": {"type": "api", "response_path": "jobs", "fields": {"title": "title", "url": "url"}}}'
        )
        mock_extract_json.return_value = '{"can_recover": true, "config": {"type": "api", "response_path": "jobs", "fields": {"title": "title", "url": "url"}}}'

        original_url = "https://example.com/api/jobs"
        result = source_processor._agent_recover_source(
            source_name="Test",
            url=original_url,
            current_config={"type": "html", "url": original_url},
            disabled_notes="",
            content_sample='{"jobs": []}',
        )

        assert isinstance(result, RecoveryResult)
        assert result.config is not None
        assert result.config["url"] == original_url  # Should fall back to original


class TestBodyNormalization:
    """Test that body is normalized to post_body for API configs."""

    @patch("job_finder.job_queue.processors.source_processor.extract_json_from_response")
    def test_normalizes_body_to_post_body(self, mock_extract_json, source_processor):
        """Test that agent using 'body' key gets normalized to 'post_body'."""
        source_processor.agent_manager = Mock()
        source_processor.agent_manager.execute.return_value = Mock(
            text='{"can_recover": true, "config": {"type": "api", "url": "https://api.example.com/jobs", "method": "POST", "body": {"limit": 20}, "response_path": "jobs", "fields": {"title": "title", "url": "url"}}}'
        )
        mock_extract_json.return_value = '{"can_recover": true, "config": {"type": "api", "url": "https://api.example.com/jobs", "method": "POST", "body": {"limit": 20}, "response_path": "jobs", "fields": {"title": "title", "url": "url"}}}'

        result = source_processor._agent_recover_source(
            source_name="Test",
            url="https://example.com/careers",
            current_config={"type": "html", "url": "https://example.com/careers"},
            disabled_notes="",
            content_sample="<html></html>",
        )

        assert isinstance(result, RecoveryResult)
        assert result.config is not None
        assert "post_body" in result.config
        assert result.config["post_body"] == {"limit": 20}
        assert "body" not in result.config  # Should be removed after normalization


class TestDisabledTagsRecovery:
    """Test disabled_tags behavior during source recovery."""

    def test_skips_recovery_when_disabled_tags_present(self, source_processor, mock_dependencies):
        """Test that recovery is skipped for sources with disabled_tags."""
        mock_dependencies["sources_manager"].get_source_by_id.return_value = {
            "id": "source-123",
            "name": "Protected Source",
            "config": {
                "type": "api",
                "url": "https://api.example.com/jobs",
                "disabled_tags": ["protected_api"],
                "disabled_notes": "API requires authentication",
            },
        }

        item = make_recover_item()
        source_processor.process_source_recover(item)

        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "non-recoverable" in final_call[0][2].lower()
        assert "protected API" in final_call[0][2]

    def test_skips_recovery_with_anti_bot_tag(self, source_processor, mock_dependencies):
        """Test that recovery is skipped for sources with anti_bot tag."""
        mock_dependencies["sources_manager"].get_source_by_id.return_value = {
            "id": "source-123",
            "name": "Bot Protected Source",
            "config": {
                "type": "html",
                "url": "https://protected.example.com/careers",
                "disabled_tags": ["anti_bot"],
                "disabled_notes": "Cloudflare protection detected",
            },
        }

        item = make_recover_item()
        source_processor.process_source_recover(item)

        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "bot protection" in final_call[0][2].lower()

    def test_skips_recovery_with_auth_required_tag(self, source_processor, mock_dependencies):
        """Test that recovery is skipped for sources with auth_required tag."""
        mock_dependencies["sources_manager"].get_source_by_id.return_value = {
            "id": "source-123",
            "name": "Login Required Source",
            "config": {
                "type": "html",
                "url": "https://login.example.com/careers",
                "disabled_tags": ["auth_required"],
                "disabled_notes": "Login page detected",
            },
        }

        item = make_recover_item()
        source_processor.process_source_recover(item)

        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "authentication required" in final_call[0][2].lower()

    def test_proceeds_with_recovery_without_disabled_tags(
        self, source_processor, mock_dependencies
    ):
        """Test that recovery proceeds normally when no disabled_tags present."""
        mock_dependencies["sources_manager"].get_source_by_id.return_value = {
            "id": "source-123",
            "name": "Normal Source",
            "config": {
                "type": "html",
                "url": "https://example.com/careers",
                "job_selector": ".job",
                "fields": {"title": ".title"},
                "disabled_notes": "Selector changed",
            },
        }

        # Mock the content fetch and agent to prevent actual execution
        with (
            patch.object(
                source_processor, "_fetch_content_sample", return_value="<html>jobs</html>"
            ),
            patch.object(
                source_processor,
                "_agent_recover_source",
                return_value=RecoveryResult(can_recover=False, diagnosis="Test"),
            ),
        ):
            item = make_recover_item()
            source_processor.process_source_recover(item)

        # Should not have failed due to disabled_tags
        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        # Check that PROCESSING status was set (meaning it got past the tag check)
        processing_calls = [c for c in calls if c[0][1] == QueueStatus.PROCESSING]
        assert len(processing_calls) > 0, "Should have set PROCESSING status"

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    def test_sets_protected_api_tag_on_recovery_failure(
        self, mock_get_renderer, source_processor, mock_dependencies
    ):
        """Test that protected_api tag is set when recovery detects 401/403/422."""
        mock_dependencies["sources_manager"].get_source_by_id.return_value = {
            "id": "source-123",
            "name": "API Source",
            "config": {
                "type": "api",
                "url": "https://api.example.com/jobs",
                "response_path": "jobs",
                "fields": {"title": "title", "url": "url"},
            },
        }

        fixed_config = {
            "type": "api",
            "url": "https://api.example.com/v2/jobs",
            "response_path": "jobs",
            "fields": {"title": "title", "url": "url"},
        }

        # Mock probe to return protected API error
        with (
            patch.object(
                source_processor,
                "_fetch_content_sample",
                return_value='{"error": "Unauthorized"}',
            ),
            patch.object(
                source_processor,
                "_agent_recover_source",
                return_value=RecoveryResult(config=fixed_config),
            ),
            patch.object(
                source_processor,
                "_probe_config",
                return_value=ProbeResult(status="error", status_code=401, hint="Unauthorized"),
            ),
        ):
            item = make_recover_item()
            source_processor.process_source_recover(item)

        # Should have called disable_source_with_tags with protected_api
        mock_dependencies["sources_manager"].disable_source_with_tags.assert_called_once_with(
            "source-123",
            "API endpoint is protected (HTTP 401)",
            tags=["protected_api"],
        )

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    def test_sets_anti_bot_tag_when_agent_diagnoses_bot_protection(
        self, mock_get_renderer, source_processor, mock_dependencies
    ):
        """Test that anti_bot tag is set when agent diagnoses bot protection."""
        mock_dependencies["sources_manager"].get_source_by_id.return_value = {
            "id": "source-123",
            "name": "HTML Source",
            "config": {
                "type": "html",
                "url": "https://example.com/careers",
                "job_selector": ".job",
                "fields": {"title": ".title", "url": "a@href"},
            },
        }

        mock_renderer = Mock()
        mock_result = Mock()
        # Use content with job keywords to pass content detection
        mock_result.html = "<html><body><div class='careers'>Open Positions</div></body></html>"
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        # Agent diagnoses bot protection
        with patch.object(
            source_processor,
            "_agent_recover_source",
            return_value=RecoveryResult(
                can_recover=False,
                disable_reason="bot_protection",
                diagnosis="Cloudflare protection detected in rendered content",
            ),
        ):
            item = make_recover_item()
            source_processor.process_source_recover(item)

        # Should have called disable_source_with_tags with anti_bot
        mock_dependencies["sources_manager"].disable_source_with_tags.assert_called_once_with(
            "source-123",
            "Cloudflare protection detected in rendered content",
            tags=["anti_bot"],
        )

        # Verify queue status
        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "bot_protection" in final_call[0][2]
        assert "anti_bot" in final_call[0][2]

    @patch("job_finder.job_queue.processors.source_processor.get_renderer")
    def test_sets_auth_required_tag_when_content_has_login_page(
        self, mock_get_renderer, source_processor, mock_dependencies
    ):
        """Test that auth_required tag is set when content shows login page."""
        mock_dependencies["sources_manager"].get_source_by_id.return_value = {
            "id": "source-123",
            "name": "HTML Source",
            "config": {
                "type": "html",
                "url": "https://example.com/careers",
                "job_selector": ".job",
                "fields": {"title": ".title", "url": "a@href"},
            },
        }

        mock_renderer = Mock()
        mock_result = Mock()
        # Content with login page indicator
        mock_result.html = "<html><body><h1>Please log in to view jobs</h1></body></html>"
        mock_renderer.render.return_value = mock_result
        mock_get_renderer.return_value = mock_renderer

        item = make_recover_item()
        source_processor.process_source_recover(item)

        # Should have called disable_source_with_tags with auth_required
        mock_dependencies["sources_manager"].disable_source_with_tags.assert_called_once()
        call_args = mock_dependencies["sources_manager"].disable_source_with_tags.call_args
        assert call_args[0][0] == "source-123"
        assert "auth_required" in call_args[1]["tags"]

        # Verify queue status
        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        final_call = calls[-1]
        assert final_call[0][1] == QueueStatus.FAILED
        assert "Authentication required" in final_call[0][2]
