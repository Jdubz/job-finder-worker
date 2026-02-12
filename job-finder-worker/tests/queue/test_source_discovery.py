"""Tests for the source discovery pipeline."""

from __future__ import annotations

from typing import Any, Dict, Optional
from unittest.mock import MagicMock, Mock, patch

import pytest

from job_finder.ai.source_analysis_agent import (
    DisableReason,
    SourceAnalysisResult,
    SourceClassification,
)
from job_finder.job_queue.models import (
    JobQueueItem,
    ProcessorContext,
    QueueItemType,
    QueueStatus,
    SourceDiscoveryConfig,
    SourceStatus,
    SourceTypeHint,
)
from job_finder.job_queue.processor import QueueItemProcessor
from job_finder.scrapers.ats_prober import ATSProbeResultSet


def make_analysis_result(
    classification: SourceClassification = SourceClassification.COMPANY_SPECIFIC,
    aggregator_domain: Optional[str] = None,
    company_name: Optional[str] = None,
    should_disable: bool = False,
    disable_reason: Optional[DisableReason] = None,
    disable_notes: str = "",
    source_config: Optional[Dict[str, Any]] = None,
    confidence: float = 0.9,
    reasoning: str = "Test reasoning",
) -> SourceAnalysisResult:
    """Helper to create SourceAnalysisResult for tests."""
    return SourceAnalysisResult(
        classification=classification,
        aggregator_domain=aggregator_domain,
        company_name=company_name,
        should_disable=should_disable,
        disable_reason=disable_reason,
        disable_notes=disable_notes,
        source_config=source_config,
        confidence=confidence,
        reasoning=reasoning,
    )


@pytest.fixture(autouse=True)
def _bypass_ats_probing():
    """Bypass ATS probing in all discovery tests.

    The ATS prober uses requests.get internally. When tests patch requests.get
    on the source_processor module, it affects the shared requests module globally,
    causing the prober to receive incomplete Mock responses that crash on attribute
    access (e.g., response.url). Mocking the probe function directly isolates tests
    from network dependencies and ensures the agent analysis path is exercised.
    """
    empty_result = ATSProbeResultSet(
        best_result=None,
        all_results=[],
        expected_domain=None,
        domain_matched_results=[],
        has_slug_collision=False,
        slugs_tried=[],
    )
    with patch(
        "job_finder.job_queue.processors.source_processor.probe_all_ats_providers_detailed",
        return_value=empty_result,
    ):
        yield


@pytest.fixture
def mock_dependencies() -> Dict[str, Any]:
    """Provide fully configured dependencies for the processor graph."""
    queue_manager = MagicMock()
    queue_manager.update_status = MagicMock()
    queue_manager.add_item = MagicMock(return_value="scrape-001")

    config_loader = MagicMock()
    config_loader.get_ai_settings.return_value = {
        "agents": {
            "claude.cli": {
                "provider": "claude",
                "interface": "cli",
                "defaultModel": "default",
                "dailyBudget": 100,
                "dailyUsage": 0,
                "runtimeState": {
                    "worker": {"enabled": True, "reason": None},
                    "backend": {"enabled": True, "reason": None},
                },
                "authRequirements": {
                    "type": "cli",
                    "requiredEnv": ["CLAUDE_CODE_OAUTH_TOKEN"],
                },
            }
        },
        "taskFallbacks": {
            "extraction": ["claude.cli"],
            "analysis": ["claude.cli"],
            "document": ["claude.cli"],
        },
        "modelRates": {"default": 1.0},
        "options": [],
    }
    config_loader.get_title_filter.return_value = {
        "requiredKeywords": ["engineer", "developer"],
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
        "skills": {
            "bonusPerSkill": 2,
            "maxSkillBonus": 15,
        },
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
    job_storage.job_exists.return_value = False

    job_listing_storage = MagicMock()
    job_listing_storage.listing_exists.return_value = False

    companies_manager = MagicMock()
    sources_manager = MagicMock()
    sources_manager.create_from_discovery.return_value = "source-123"
    sources_manager.get_source_by_company_and_aggregator.return_value = None
    sources_manager.get_source_by_name.return_value = None
    sources_manager.find_duplicate_candidate.return_value = None

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
    """Instantiate a QueueItemProcessor wired with mocked dependencies."""
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


def make_discovery_item(
    *,
    url: str,
    type_hint: SourceTypeHint = SourceTypeHint.AUTO,
    company_name: str = "Example Corp",
) -> JobQueueItem:
    """Build a SOURCE_DISCOVERY queue item for tests."""
    config = SourceDiscoveryConfig(
        url=url,
        type_hint=type_hint,
        company_id="company-123",
        company_name=company_name,
    )
    return JobQueueItem(
        id="queue-123",
        type=QueueItemType.SOURCE_DISCOVERY,
        url=url,
        company_name=company_name,
        source="user_submission",
        submitted_by="tester",
        source_discovery_config=config,
    )


class TestQueueRouting:
    def test_routes_source_discovery_items(self, processor: QueueItemProcessor, mock_dependencies):
        """Test that SOURCE_DISCOVERY items are routed to source_processor."""
        item = make_discovery_item(url="https://boards.greenhouse.io/stripe")

        with patch.object(
            processor.source_processor, "process_source_discovery", return_value=None
        ) as mocked:
            processor.process_item(item)

        mocked.assert_called_once_with(item)
        # Note: PROCESSING status is set inside process_source_discovery,
        # which is mocked here. The test verifies routing works correctly.

    def test_missing_config_does_not_update_status(
        self, processor: QueueItemProcessor, mock_dependencies
    ):
        """Test that items without source_discovery_config exit early without status update."""
        item = make_discovery_item(url="https://boards.greenhouse.io/stripe")
        item.source_discovery_config = None

        processor.process_item(item)

        # The process_source_discovery method returns early without updating status
        # when source_discovery_config is missing
        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        assert len(calls) == 0


class TestSourceDiscoverySuccess:
    """Test successful source discovery scenarios."""

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_discovers_api_source(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """Test discovering an API source (like Greenhouse)."""
        # Mock the fetch attempt
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = '{"jobs": []}'
        mock_response.headers = {"Content-Type": "application/json"}
        mock_requests_get.return_value = mock_response

        # Mock the analysis agent
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.JOB_AGGREGATOR,
            aggregator_domain="greenhouse.io",
            company_name="Stripe",
            source_config={
                "type": "api",
                "url": "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
                "response_path": "jobs",
                "fields": {"title": "title", "url": "absolute_url"},
            },
        )
        mock_agent_class.return_value = mock_agent

        item = make_discovery_item(url="https://boards.greenhouse.io/stripe")
        source_processor.process_source_discovery(item)

        # Should create source
        mock_dependencies["sources_manager"].create_from_discovery.assert_called_once()
        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "api"

        # Should mark as success
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS
        assert status_call[0][2] == "source-123"

        # Should spawn SCRAPE_SOURCE via spawn_item_safely
        mock_dependencies["queue_manager"].spawn_item_safely.assert_called_once()
        spawn_call = mock_dependencies["queue_manager"].spawn_item_safely.call_args
        new_item_data = spawn_call.kwargs.get("new_item_data", {})
        assert new_item_data.get("type") == QueueItemType.SCRAPE_SOURCE

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_discovers_rss_source(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """Test discovering an RSS source."""
        # Mock the fetch attempt
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = "<rss>...</rss>"
        mock_response.headers = {"Content-Type": "application/rss+xml"}
        mock_requests_get.return_value = mock_response

        # Mock the analysis agent
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.COMPANY_SPECIFIC,
            company_name="Example Corp",
            source_config={
                "type": "rss",
                "url": "https://example.com/jobs.rss",
                "fields": {"title": "title", "url": "link"},
            },
        )
        mock_agent_class.return_value = mock_agent

        item = make_discovery_item(url="https://example.com/jobs.rss")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "rss"

        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_discovers_html_source(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """Test discovering an HTML source."""
        # Mock the fetch attempt
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = "<html>...</html>"
        mock_response.headers = {"Content-Type": "text/html"}
        mock_requests_get.return_value = mock_response

        # Mock the analysis agent
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.COMPANY_SPECIFIC,
            company_name="Example Corp",
            source_config={
                "type": "html",
                "url": "https://example.com/careers",
                "job_selector": ".job-listing",
                "fields": {"title": ".title", "url": "a@href"},
            },
        )
        mock_agent_class.return_value = mock_agent

        item = make_discovery_item(url="https://example.com/careers")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "html"

        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_creates_disabled_when_api_key_needed(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """Sources needing API keys should be created disabled with notes and no scrape spawn."""
        # Mock the fetch attempt (auth required)
        mock_response = Mock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = Exception("401 Unauthorized")
        mock_requests_get.return_value = mock_response

        # Mock the analysis agent
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.COMPANY_SPECIFIC,
            company_name="Example Corp",
            should_disable=True,
            disable_reason=DisableReason.AUTH_REQUIRED,
            disable_notes="API requires authentication",
            source_config={
                "type": "api",
                "url": "https://api.example.com/jobs",
                "response_path": "jobs",
                "fields": {"title": "title", "url": "link"},
            },
        )
        mock_agent_class.return_value = mock_agent

        item = make_discovery_item(url="https://api.example.com/jobs")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["status"] == SourceStatus.DISABLED
        assert "authentication" in create_kwargs["config"]["disabled_notes"].lower()

        # Should NOT spawn scrape item when disabled
        mock_dependencies["queue_manager"].add_item.assert_not_called()


class TestSourceDiscoveryFailure:
    """Test source discovery failure scenarios."""

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_handles_discovery_failure(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """Test handling when agent returns disabled result."""
        # Mock fetch failure
        mock_requests_get.side_effect = Exception("Connection failed")
        mock_search_client.return_value = None

        # Mock the analysis agent returning disabled result
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.INVALID,
            should_disable=True,
            disable_reason=DisableReason.DISCOVERY_FAILED,
            disable_notes="discovery_failed",
        )
        mock_agent_class.return_value = mock_agent

        item = make_discovery_item(url="https://example.com/invalid")
        source_processor.process_source_discovery(item)

        # Should create disabled source with notes and still mark SUCCESS for queue item
        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["status"] == SourceStatus.DISABLED
        assert (
            "discovery_failed" in create_kwargs["config"].get("disabled_notes", "").lower()
            or "invalid" in create_kwargs["config"].get("disabled_notes", "").lower()
        )

        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_disables_on_bot_protection(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """If bot protection blocks discovery, create a disabled source with notes."""
        # Mock 403 response
        mock_response = Mock()
        mock_response.status_code = 403
        mock_response.raise_for_status.side_effect = Exception("403 Forbidden")
        mock_requests_get.return_value = mock_response
        mock_search_client.return_value = None

        # Mock the analysis agent
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.COMPANY_SPECIFIC,
            company_name="Example Corp",
            should_disable=True,
            disable_reason=DisableReason.BOT_PROTECTION,
            disable_notes="bot_protection",
        )
        mock_agent_class.return_value = mock_agent

        item = make_discovery_item(url="https://blocked.example.com/careers")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["status"] == SourceStatus.DISABLED
        assert "bot_protection" in create_kwargs["config"]["disabled_notes"]
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_disables_on_dns_error(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """If the host cannot be resolved, create a disabled source with notes."""
        # Mock DNS error
        mock_requests_get.side_effect = Exception("Name or service not known")
        mock_search_client.return_value = None

        # Mock the analysis agent
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.INVALID,
            should_disable=True,
            disable_reason=DisableReason.DNS_ERROR,
            disable_notes="dns_error",
        )
        mock_agent_class.return_value = mock_agent

        item = make_discovery_item(url="https://no-such-host.invalid/jobs")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["status"] == SourceStatus.DISABLED
        assert "dns_error" in create_kwargs["config"]["disabled_notes"]
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_handles_discovery_exception(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """Test handling when analysis raises an exception."""
        # Mock successful fetch but agent raises exception
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.text = "<html>...</html>"
        mock_response.headers = {"Content-Type": "text/html"}
        mock_requests_get.return_value = mock_response

        # Mock the analysis agent raising exception
        mock_agent = Mock()
        mock_agent.analyze.side_effect = Exception("API Error")
        mock_agent_class.return_value = mock_agent

        item = make_discovery_item(url="https://example.com/error")
        source_processor.process_source_discovery(item)

        # Should mark as failed
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.FAILED


class TestPlaceholderNaming:
    """Test placeholder source naming when discovery fails.

    Regression tests for the fix where sources were incorrectly named with URLs
    instead of company names when discovery failed.
    """

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_placeholder_uses_company_name_without_aggregator(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """When discovery fails and company_name is provided without aggregator, use company name.

        Regression test: Previously this would incorrectly use the URL netloc.
        """
        # Mock fetch failure
        mock_requests_get.side_effect = Exception("Connection failed")
        mock_search_client.return_value = None

        # Mock the analysis agent returning disabled company-specific result
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.COMPANY_SPECIFIC,
            company_name="BaxEnergy",
            should_disable=True,
            disable_reason=DisableReason.DISCOVERY_FAILED,
            disable_notes="discovery_failed",
        )
        mock_agent_class.return_value = mock_agent

        # Configure sources_manager to return None for aggregator domain (company-specific URL)
        mock_dependencies["sources_manager"].get_aggregator_domain_for_url.return_value = None

        # Company-specific URL (not an aggregator)
        item = make_discovery_item(
            url="https://www.baxenergy.com/careers/",
            company_name="BaxEnergy",
        )
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        # Should be "BaxEnergy Jobs", NOT "www.baxenergy.com Jobs"
        assert create_kwargs["name"] == "BaxEnergy Jobs"
        assert create_kwargs["status"] == SourceStatus.DISABLED

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_placeholder_uses_company_and_aggregator_when_both_present(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """When discovery has both company_name and aggregator, create company-specific source with filter."""
        # Mock fetch failure
        mock_requests_get.side_effect = Exception("Connection failed")
        mock_search_client.return_value = None

        # Mock the analysis agent returning aggregator result with company
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.JOB_AGGREGATOR,
            aggregator_domain="myworkdayjobs.com",
            company_name="Yahoo",
            should_disable=True,
            disable_reason=DisableReason.DISCOVERY_FAILED,
            disable_notes="discovery_failed",
        )
        mock_agent_class.return_value = mock_agent

        # Configure sources_manager to return aggregator domain
        mock_dependencies["sources_manager"].get_aggregator_domain_for_url.return_value = (
            "myworkdayjobs.com"
        )

        item = make_discovery_item(
            url="https://ouryahoo.wd5.myworkdayjobs.com/careers",
            company_name="Yahoo",
        )
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["name"] == "Yahoo Jobs (myworkdayjobs.com)"
        # Invariant: a source is either company-specific OR an aggregator, not both
        # When company_id exists, aggregator_domain should be None and company_filter added
        assert create_kwargs["company_id"] == "company-123"  # from make_discovery_item default
        assert create_kwargs["aggregator_domain"] is None
        assert create_kwargs["config"].get("company_filter") == "Yahoo"

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_placeholder_falls_back_to_url_when_no_company_name(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """When discovery fails without company_name, fall back to URL netloc."""
        # Mock fetch failure
        mock_requests_get.side_effect = Exception("Connection failed")
        mock_search_client.return_value = None

        # Mock the analysis agent returning no company info
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.INVALID,
            should_disable=True,
            disable_reason=DisableReason.DISCOVERY_FAILED,
            disable_notes="discovery_failed",
        )
        mock_agent_class.return_value = mock_agent

        # Configure sources_manager to return None (not an aggregator)
        mock_dependencies["sources_manager"].get_aggregator_domain_for_url.return_value = None

        # Create item without company_name
        config = SourceDiscoveryConfig(
            url="https://unknown-company.com/jobs",
            type_hint=SourceTypeHint.AUTO,
            company_id=None,
            company_name=None,
        )
        item = JobQueueItem(
            id="queue-456",
            type=QueueItemType.SOURCE_DISCOVERY,
            url="https://unknown-company.com/jobs",
            company_name=None,
            source="user_submission",
            submitted_by="tester",
            source_discovery_config=config,
        )
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        # Should use URL netloc as fallback
        assert create_kwargs["name"] == "unknown-company.com Jobs"

    @patch("job_finder.job_queue.processors.source_processor.get_search_client")
    @patch("job_finder.job_queue.processors.source_processor.requests.get")
    @patch("job_finder.job_queue.processors.source_processor.AgentManager")
    @patch("job_finder.job_queue.processors.source_processor.SourceAnalysisAgent")
    def test_placeholder_naming_regression_sticker_mule(
        self,
        mock_agent_class,
        _mock_agent_manager,
        mock_requests_get,
        mock_search_client,
        source_processor,
        mock_dependencies,
    ):
        """Regression test: Sticker Mule should be named correctly, not with URL."""
        # Mock fetch failure
        mock_requests_get.side_effect = Exception("Connection failed")
        mock_search_client.return_value = None

        # Mock the analysis agent
        mock_agent = Mock()
        mock_agent.analyze.return_value = make_analysis_result(
            classification=SourceClassification.COMPANY_SPECIFIC,
            company_name="Sticker Mule",
            should_disable=True,
            disable_reason=DisableReason.DISCOVERY_FAILED,
            disable_notes="api_probe_failed",
        )
        mock_agent_class.return_value = mock_agent

        # Configure sources_manager to return None (company-specific URL)
        mock_dependencies["sources_manager"].get_aggregator_domain_for_url.return_value = None

        item = make_discovery_item(
            url="https://www.stickermule.com/careers",
            company_name="Sticker Mule",
        )
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        # Should be "Sticker Mule Jobs", NOT "www.stickermule.com Jobs"
        assert create_kwargs["name"] == "Sticker Mule Jobs"
