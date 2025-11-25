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


class TestGreenhouseDiscovery:
    @patch("requests.get")
    def test_discovers_greenhouse_source(self, mock_get, source_processor, mock_dependencies):
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"jobs": [{"id": 1}, {"id": 2}]}
        mock_get.return_value = mock_response

        item = make_discovery_item(url="https://boards.greenhouse.io/stripe")
        source_processor.process_source_discovery(item)

        mock_get.assert_called_once()
        mock_dependencies["sources_manager"].create_from_discovery.assert_called_once()
        # Last update should mark the queue item as SUCCESS with the created source id
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][0] == item.id
        assert status_call[0][1] == QueueStatus.SUCCESS
        assert status_call[0][2] == "source-123"
        mock_dependencies["queue_manager"].add_item.assert_called_once()

    @patch("requests.get")
    def test_handles_greenhouse_404(self, mock_get, source_processor, mock_dependencies):
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response

        item = make_discovery_item(url="https://boards.greenhouse.io/unknown")
        source_processor.process_source_discovery(item)

        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.FAILED
        assert "Greenhouse" in status_call[0][2]


class TestWorkdayDiscovery:
    def test_requires_manual_validation(self, source_processor, mock_dependencies):
        item = make_discovery_item(url="https://netflix.wd1.myworkdayjobs.com/External")

        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "workday"
        assert create_kwargs["validation_required"] is True


class TestRSSDiscovery:
    @patch("feedparser.parse")
    def test_discovers_rss_source(self, mock_parse, source_processor, mock_dependencies):
        feed = Mock()
        feed.bozo = False
        feed.entries = [{"title": "Job"}]
        mock_parse.return_value = feed

        item = make_discovery_item(url="https://example.com/jobs.xml")
        source_processor.process_source_discovery(item)

        mock_dependencies["sources_manager"].create_from_discovery.assert_called_once()
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS
        mock_dependencies["queue_manager"].add_item.assert_called_once()
        queue_item_arg = mock_dependencies["queue_manager"].add_item.call_args.args[0]
        assert queue_item_arg.type == QueueItemType.SCRAPE_SOURCE
        assert queue_item_arg.source == "automated_scan"

    @patch("feedparser.parse")
    def test_handles_invalid_rss_source(self, mock_parse, source_processor, mock_dependencies):
        feed = Mock()
        feed.bozo = True
        feed.bozo_exception = ValueError("bad feed")
        mock_parse.return_value = feed

        item = make_discovery_item(url="https://example.com/rss")
        source_processor.process_source_discovery(item)

        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.FAILED
        assert "Invalid RSS" in status_call[0][2]


class TestGenericDiscovery:
    @patch("job_finder.ai.selector_discovery.SelectorDiscovery")
    @patch("requests.get")
    def test_discovers_generic_source(
        self, mock_get, mock_selector, source_processor, mock_dependencies
    ):
        response = Mock()
        response.text = "<html></html>"
        response.raise_for_status = Mock()
        mock_get.return_value = response

        selector_instance = Mock()
        selector_instance.discover_selectors.return_value = {
            "selectors": {"title": ".job"},
            "confidence": "medium",
        }
        mock_selector.return_value = selector_instance

        item = make_discovery_item(url="https://example.com/careers")
        source_processor.process_source_discovery(item)

        create_kwargs = mock_dependencies["sources_manager"].create_from_discovery.call_args.kwargs
        assert create_kwargs["source_type"] == "generic"
        assert create_kwargs["config"]["discovered_by_ai"] is True
        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.SUCCESS
        mock_dependencies["queue_manager"].add_item.assert_called_once()

    @patch("job_finder.ai.selector_discovery.SelectorDiscovery")
    @patch("requests.get")
    def test_generic_selector_failure_marks_failed(
        self, mock_get, mock_selector, source_processor, mock_dependencies
    ):
        response = Mock()
        response.text = "<html></html>"
        response.raise_for_status = Mock()
        mock_get.return_value = response

        selector_instance = Mock()
        selector_instance.discover_selectors.return_value = None
        mock_selector.return_value = selector_instance

        item = make_discovery_item(url="https://example.com/careers")
        source_processor.process_source_discovery(item)

        status_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert status_call[0][1] == QueueStatus.FAILED
        assert "AI selector discovery failed" in status_call[0][2]
