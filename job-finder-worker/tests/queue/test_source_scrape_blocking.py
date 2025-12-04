from unittest.mock import MagicMock, Mock, patch

import pytest

from job_finder.exceptions import ScrapeBlockedError
from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus
from job_finder.job_queue.processors.source_processor import SourceProcessor


@pytest.fixture
def source_processor():
    queue_manager = MagicMock()
    config_loader = MagicMock()
    config_loader.get_prefilter_policy.return_value = None
    sources_manager = MagicMock()
    companies_manager = MagicMock()

    return SourceProcessor(
        queue_manager=queue_manager,
        config_loader=config_loader,
        sources_manager=sources_manager,
        companies_manager=companies_manager,
    )


def make_scrape_item(source_id: str) -> JobQueueItem:
    return JobQueueItem(
        id="queue-item-1",
        type=QueueItemType.SCRAPE_SOURCE,
        url="",
        company_name="",
        company_id=None,
        source="automated_scan",
        scraped_data={"source_id": source_id},
    )


@patch("job_finder.job_queue.processors.source_processor.GenericScraper")
def test_scrape_block_disables_source(mock_scraper_cls, source_processor):
    blocked_exc = ScrapeBlockedError("https://example.com/rss", "HTTP 403: Forbidden")
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = blocked_exc
    mock_scraper_cls.return_value = scraper_instance

    # Minimal source definition to satisfy processor
    source_record = {
        "id": "source-123",
        "name": "Example RSS",
        "sourceType": "rss",
        "config": {
            "type": "rss",
            "url": "https://example.com/rss",
            "fields": {
                "title": "title",
                "url": "link",
                "description": "summary",
            },
        },
        "aggregatorDomain": "example.com",
    }

    source_processor.sources_manager.get_source_by_id.return_value = source_record

    item = make_scrape_item(source_record["id"])

    with patch.object(source_processor, "_update_item_status") as mock_update_status:
        source_processor.process_scrape_source(item)

    source_processor.sources_manager.disable_source_with_note.assert_called_once()
    args, kwargs = source_processor.sources_manager.disable_source_with_note.call_args
    assert args[0] == source_record["id"]
    assert "Blocked during scrape" in args[1]
    assert "HTTP 403" in args[1]

    mock_update_status.assert_called_once()
    status_args, status_kwargs = mock_update_status.call_args
    assert status_args[1] == QueueStatus.FAILED
    assert "blocked" in status_args[2].lower()
