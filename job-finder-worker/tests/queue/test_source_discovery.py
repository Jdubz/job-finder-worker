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
    config_loader.get_job_filters.return_value = {
        "enabled": False,
        "hardRejections": {
            "excludedJobTypes": [],
            "excludedSeniority": [],
            "excludedCompanies": [],
            "excludedKeywords": [],
        },
        "remotePolicy": {},
        "salaryStrike": {},
        "experienceStrike": {},
        "seniorityStrikes": {},
        "qualityStrikes": {},
        "ageStrike": {},
    }
    config_loader.get_technology_ranks.return_value = {"technologies": {}, "strikes": {}}
    config_loader.get_stop_list.return_value = _default_stop_list()

    job_storage = MagicMock()
    job_storage.job_exists.return_value = False

    companies_manager = MagicMock()
    sources_manager = MagicMock()
    sources_manager.create_from_discovery.return_value = "source-123"

    company_info_fetcher = MagicMock()
    ai_matcher = MagicMock()
    profile = MagicMock()

    return {
        "queue_manager": queue_manager,
        "config_loader": config_loader,
        "job_storage": job_storage,
        "companies_manager": companies_manager,
        "sources_manager": sources_manager,
        "company_info_fetcher": company_info_fetcher,
        "ai_matcher": ai_matcher,
        "profile": profile,
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
    auto_enable: bool = True,
    validation_required: bool = False,
) -> JobQueueItem:
    """Build a SOURCE_DISCOVERY queue item for tests."""
    config = SourceDiscoveryConfig(
        url=url,
        type_hint=type_hint,
        company_id="company-123",
        company_name=company_name,
        auto_enable=auto_enable,
        validation_required=validation_required,
    )
    return JobQueueItem(
        id="queue-123",
        type=QueueItemType.SOURCE_DISCOVERY,
        url=url,
        company_name=company_name,
        source="user_submission",
        submitted_by="tester",
        retry_count=0,
        max_retries=0,
        source_discovery_config=config,
    )


class TestQueueRouting:
    def test_routes_source_discovery_items(self, processor: QueueItemProcessor, mock_dependencies):
        item = make_discovery_item(url="https://boards.greenhouse.io/stripe")

        with patch.object(
            processor.source_processor, "process_source_discovery", return_value=None
        ) as mocked:
            processor.process_item(item)

        mocked.assert_called_once_with(item)
        # First status update should move item to PROCESSING
        assert (
            mock_dependencies["queue_manager"].update_status.call_args_list[0][0][1]
            == QueueStatus.PROCESSING
        )

    def test_missing_config_only_sets_processing_status(
        self, processor: QueueItemProcessor, mock_dependencies
    ):
        item = make_discovery_item(url="https://boards.greenhouse.io/stripe")
        item.source_discovery_config = None

        processor.process_item(item)

        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        assert len(calls) == 1
        assert calls[0][0][0] == item.id
        assert calls[0][0][1] == QueueStatus.PROCESSING


class TestSourceDiscoverySuccess:
    """Test successful source discovery scenarios."""

    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_discovers_api_source(self, mock_discovery_class, source_processor, mock_dependencies):
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
        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "api"
        assert create_kwargs["discovery_confidence"] == "high"

        # Should mark as success
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS
        assert status_call[0][2] == "source-123"

        # Should spawn SCRAPE_SOURCE
        mock_dependencies["queue_manager"].add_item.assert_called_once()
        queue_item_arg = mock_dependencies["queue_manager"].add_item.call_args.args[0]
        assert queue_item_arg.type == QueueItemType.SCRAPE_SOURCE

    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_discovers_rss_source(self, mock_discovery_class, source_processor, mock_dependencies):
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

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "rss"
        assert create_kwargs["discovery_confidence"] == "high"

        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS

    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_discovers_html_source(self, mock_discovery_class, source_processor, mock_dependencies):
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

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "html"
        assert create_kwargs["discovery_confidence"] == "medium"  # HTML gets medium confidence

        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS


class TestSourceDiscoveryFailure:
    """Test source discovery failure scenarios."""

    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_handles_discovery_failure(
        self, mock_discovery_class, source_processor, mock_dependencies
    ):
        """Test handling when discovery returns None."""
        mock_discovery = Mock()
        mock_discovery.discover.return_value = None
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://example.com/invalid")
        source_processor.process_source_discovery(item)

        # Should mark as failed
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.FAILED
        assert "could not generate valid config" in status_call[0][2]

        # Should not spawn SCRAPE_SOURCE
        mock_dependencies["queue_manager"].add_item.assert_not_called()

    @patch("job_finder.ai.source_discovery.SourceDiscovery")
    def test_handles_discovery_exception(
        self, mock_discovery_class, source_processor, mock_dependencies
    ):
        """Test handling when discovery raises an exception."""
        mock_discovery = Mock()
        mock_discovery.discover.side_effect = Exception("API Error")
        mock_discovery_class.return_value = mock_discovery

        item = make_discovery_item(url="https://example.com/error")
        source_processor.process_source_discovery(item)

        # Should mark as failed
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.FAILED


class TestCompanyNameExtraction:
    """Test company name extraction from URL."""

    def test_extract_company_from_url(self, source_processor):
        """Test extracting company name from URL."""
        # Simple domain
        assert source_processor._extract_company_from_url("https://stripe.com/careers") == "Stripe"

        # Hyphenated
        result = source_processor._extract_company_from_url("https://tech-corp.com/jobs")
        assert result in ("TechCorp", "Tech Corp")

        # With www
        assert (
            source_processor._extract_company_from_url("https://www.example.com/jobs") == "Example"
        )

    def test_extract_company_from_invalid_url(self, source_processor):
        """Test handling invalid URLs."""
        assert source_processor._extract_company_from_url("not-a-url") == ""
        assert source_processor._extract_company_from_url("") == ""
