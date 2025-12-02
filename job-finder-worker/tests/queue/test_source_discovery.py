"""Tests for the source discovery pipeline."""

from __future__ import annotations

from typing import Any, Dict
from unittest.mock import MagicMock, Mock, patch

import pytest

from job_finder.job_queue.models import (
    JobQueueItem,
    QueueItemType,
    QueueStatus,
    SourceDiscoveryConfig,
    SourceStatus,
    SourceTypeHint,
)
from job_finder.job_queue.processor import QueueItemProcessor


def _default_stop_list() -> Dict[str, list[str]]:
    return {"excludedCompanies": [], "excludedDomains": [], "excludedKeywords": []}


@pytest.fixture
def mock_dependencies() -> Dict[str, Any]:
    """Provide fully configured dependencies for the processor graph."""
    queue_manager = MagicMock()
    queue_manager.update_status = MagicMock()
    queue_manager.add_item = MagicMock(return_value="scrape-001")

    config_loader = MagicMock()
    config_loader.get_stop_list.return_value = _default_stop_list()
    config_loader.get_prefilter_policy.return_value = {
        "stopList": _default_stop_list(),
        "strikeEngine": {
            "enabled": False,
            "hardRejections": {
                "excludedJobTypes": [],
                "excludedSeniority": [],
                "excludedCompanies": [],
                "excludedKeywords": [],
            },
            "remotePolicy": {},
            "salaryStrike": {},
            "seniorityStrikes": {},
            "qualityStrikes": {},
            "ageStrike": {},
        },
        "technologyRanks": {"technologies": {}},
    }
    config_loader.get_ai_settings.return_value = {
        "worker": {
            "selected": {"provider": "codex", "interface": "cli", "model": "gpt-4o"}
        },
        "documentGenerator": {
            "selected": {"provider": "codex", "interface": "cli", "model": "gpt-4o"}
        },
        "options": [],
    }

    job_storage = MagicMock()
    job_storage.job_exists.return_value = False

    job_listing_storage = MagicMock()
    job_listing_storage.listing_exists.return_value = False

    companies_manager = MagicMock()
    sources_manager = MagicMock()
    sources_manager.create_from_discovery.return_value = "source-123"

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
    return QueueItemProcessor(**mock_dependencies)


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
    def test_routes_source_discovery_items(
        self, processor: QueueItemProcessor, mock_dependencies
    ):
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

    @patch("job_finder.ai.providers.create_provider_from_config")
    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_discovers_api_source(
        self,
        mock_discovery_class,
        _mock_create_provider,
        source_processor,
        mock_dependencies,
    ):
        """Test discovering an API source (like Greenhouse)."""
        mock_discovery = Mock()
        mock_discovery.discover.return_value = {
            "type": "api",
            "url": "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
            "response_path": "jobs",
            "fields": {"title": "title", "url": "absolute_url"},
            "company_name": "Stripe",
        }
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://boards.greenhouse.io/stripe")
        source_processor.process_source_discovery(item)

        # Should create source
        mock_dependencies["sources_manager"].create_from_discovery.assert_called_once()
        create_kwargs = mock_dependencies[
            "sources_manager"
        ].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "api"

        # Should mark as success
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[
            -1
        ]
        assert status_call[0][1] == QueueStatus.SUCCESS
        assert status_call[0][2] == "source-123"

        # Should spawn SCRAPE_SOURCE via spawn_item_safely
        mock_dependencies["queue_manager"].spawn_item_safely.assert_called_once()
        spawn_call = mock_dependencies["queue_manager"].spawn_item_safely.call_args
        new_item_data = spawn_call.kwargs.get("new_item_data", {})
        assert new_item_data.get("type") == QueueItemType.SCRAPE_SOURCE

    @patch("job_finder.ai.providers.create_provider_from_config")
    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_discovers_rss_source(
        self,
        mock_discovery_class,
        _mock_create_provider,
        source_processor,
        mock_dependencies,
    ):
        """Test discovering an RSS source."""
        mock_discovery = Mock()
        mock_discovery.discover.return_value = {
            "type": "rss",
            "url": "https://example.com/jobs.rss",
            "fields": {"title": "title", "url": "link"},
        }
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://example.com/jobs.rss")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies[
            "sources_manager"
        ].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "rss"

        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[
            -1
        ]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.ai.providers.create_provider_from_config")
    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_discovers_html_source(
        self,
        mock_discovery_class,
        _mock_create_provider,
        source_processor,
        mock_dependencies,
    ):
        """Test discovering an HTML source."""
        mock_discovery = Mock()
        mock_discovery.discover.return_value = {
            "type": "html",
            "url": "https://example.com/careers",
            "job_selector": ".job-listing",
            "fields": {"title": ".title", "url": "a@href"},
        }
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://example.com/careers")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies[
            "sources_manager"
        ].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "html"

        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[
            -1
        ]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.ai.providers.create_provider_from_config")
    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_creates_disabled_when_api_key_needed(
        self,
        mock_discovery_class,
        _mock_create_provider,
        source_processor,
        mock_dependencies,
    ):
        """Sources needing API keys should be created disabled with notes and no scrape spawn."""
        mock_discovery = Mock()
        mock_discovery.discover.return_value = (
            {
                "type": "api",
                "url": "https://api.example.com/jobs",
                "response_path": "jobs",
                "fields": {"title": "title", "url": "link"},
            },
            {"needs_api_key": True},
        )
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://api.example.com/jobs")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies[
            "sources_manager"
        ].create_from_discovery.call_args.kwargs
        assert create_kwargs["status"] == SourceStatus.DISABLED
        assert create_kwargs["config"]["disabled_notes"] == "needs api key"

        # Should NOT spawn scrape item when disabled
        mock_dependencies["queue_manager"].add_item.assert_not_called()


class TestSourceDiscoveryFailure:
    """Test source discovery failure scenarios."""

    @patch("job_finder.ai.providers.create_provider_from_config")
    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_handles_discovery_failure(
        self,
        mock_discovery_class,
        _mock_create_provider,
        source_processor,
        mock_dependencies,
    ):
        """Test handling when discovery returns None."""
        mock_discovery = Mock()
        mock_discovery.discover.return_value = None
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://example.com/invalid")
        source_processor.process_source_discovery(item)

        # Should mark as failed (no config produced)
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[
            -1
        ]
        assert status_call[0][1] == QueueStatus.FAILED

    @patch("job_finder.ai.providers.create_provider_from_config")
    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_disables_on_bot_protection(
        self,
        mock_discovery_class,
        _mock_create_provider,
        source_processor,
        mock_dependencies,
    ):
        """If bot protection blocks discovery, create a disabled source with notes."""
        mock_discovery = Mock()
        mock_discovery.discover.return_value = (None, {"error": "bot_protection"})
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://blocked.example.com/careers")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies[
            "sources_manager"
        ].create_from_discovery.call_args.kwargs
        assert create_kwargs["status"] == SourceStatus.DISABLED
        assert create_kwargs["config"]["disabled_notes"] == "bot_protection"
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[
            -1
        ]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.ai.providers.create_provider_from_config")
    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_disables_on_dns_error(
        self,
        mock_discovery_class,
        _mock_create_provider,
        source_processor,
        mock_dependencies,
    ):
        """If the host cannot be resolved, create a disabled source with notes."""
        mock_discovery = Mock()
        mock_discovery.discover.return_value = (None, {"error": "dns_error"})
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://no-such-host.invalid/jobs")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies[
            "sources_manager"
        ].create_from_discovery.call_args.kwargs
        assert create_kwargs["status"] == SourceStatus.DISABLED
        assert create_kwargs["config"]["disabled_notes"] == "dns_error"
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[
            -1
        ]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.ai.providers.create_provider_from_config")
    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_disables_on_dns_inside_api_probe(
        self,
        mock_discovery_class,
        _mock_create_provider,
        source_processor,
        mock_dependencies,
    ):
        """If API probe fails due to DNS resolution, treat as dns_error and disable."""
        mock_discovery = Mock()
        mock_discovery.discover.return_value = (
            None,
            {
                "error": "api_probe_failed",
                "error_details": "Failed to resolve 'boards-api.consider.com'",
            },
        )
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://careers.nea.com/jobs/perplexity-ai")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies[
            "sources_manager"
        ].create_from_discovery.call_args.kwargs
        assert create_kwargs["status"] == SourceStatus.DISABLED
        assert create_kwargs["config"]["disabled_notes"] == "dns_error"
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[
            -1
        ]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.ai.providers.create_provider_from_config")
    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_handles_discovery_exception(
        self,
        mock_discovery_class,
        _mock_create_provider,
        source_processor,
        mock_dependencies,
    ):
        """Test handling when discovery raises an exception."""
        mock_discovery = Mock()
        mock_discovery.discover.side_effect = Exception("API Error")
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://example.com/error")
        source_processor.process_source_discovery(item)

        # Should mark as failed
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[
            -1
        ]
        assert status_call[0][1] == QueueStatus.FAILED


class TestCompanyNameExtraction:
    """Test company name extraction from URL."""

    def test_extract_company_from_url(self, source_processor):
        """Test extracting company name from URL."""
        # Simple domain
        assert (
            source_processor._extract_company_from_url("https://stripe.com/careers")
            == "Stripe"
        )

        # Hyphenated
        result = source_processor._extract_company_from_url(
            "https://tech-corp.com/jobs"
        )
        assert result in ("TechCorp", "Tech Corp")

        # With www
        assert (
            source_processor._extract_company_from_url("https://www.example.com/jobs")
            == "Example"
        )

    def test_extract_company_from_invalid_url(self, source_processor):
        """Test handling invalid URLs."""
        assert source_processor._extract_company_from_url("not-a-url") == ""
        assert source_processor._extract_company_from_url("") == ""
