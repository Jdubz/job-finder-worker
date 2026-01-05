from unittest.mock import MagicMock, Mock, patch

import pytest

from job_finder.exceptions import (
    ScrapeBotProtectionError,
    ScrapeTransientError,
    ScrapeConfigError,
    ScrapeNotFoundError,
)
from job_finder.job_queue.models import JobQueueItem, ProcessorContext, QueueItemType, QueueStatus
from job_finder.job_queue.processors.source_processor import SourceProcessor


@pytest.fixture
def source_processor():
    queue_manager = MagicMock()
    config_loader = MagicMock()
    config_loader.get_prefilter_policy.return_value = None
    sources_manager = MagicMock()
    companies_manager = MagicMock()

    ctx = ProcessorContext(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=MagicMock(),
        job_listing_storage=MagicMock(),
        companies_manager=companies_manager,
        sources_manager=sources_manager,
        company_info_fetcher=MagicMock(),
        ai_matcher=MagicMock(),
    )
    return SourceProcessor(ctx)


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
def test_bot_protection_disables_source_with_tag(mock_scraper_cls, source_processor):
    """Bot protection errors should disable source with anti_bot tag."""
    blocked_exc = ScrapeBotProtectionError(
        "https://example.com/rss", "Bot protection detected (HTTP 403)", 403
    )
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
    source_processor.process_scrape_source(item)

    # Bot protection should call disable_source_with_tags with anti_bot tag
    source_processor.sources_manager.disable_source_with_tags.assert_called_once()
    args, kwargs = source_processor.sources_manager.disable_source_with_tags.call_args
    assert args[0] == source_record["id"]
    assert "Bot protection" in args[1]
    assert kwargs.get("tags") == ["anti_bot"]

    # Queue status should be FAILED
    source_processor.queue_manager.update_status.assert_called()
    last_call = source_processor.queue_manager.update_status.call_args
    assert last_call[0][1] == QueueStatus.FAILED


@patch("job_finder.job_queue.processors.source_processor.GenericScraper")
def test_config_error_spawns_recovery_task(mock_scraper_cls, source_processor):
    """Config errors (400) should disable source and spawn recovery task."""
    config_exc = ScrapeConfigError(
        "https://example.com/api", "HTTP 400: Bad Request - config error", 400
    )
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = config_exc
    mock_scraper_cls.return_value = scraper_instance

    source_record = {
        "id": "source-123",
        "name": "Example API",
        "sourceType": "api",
        "config": {
            "type": "api",
            "url": "https://example.com/api",
            "fields": {"title": "title", "url": "url"},
        },
    }

    source_processor.sources_manager.get_source_by_id.return_value = source_record

    item = make_scrape_item(source_record["id"])
    source_processor.process_scrape_source(item)

    # Config error should call disable_source_with_note (not with_tags)
    source_processor.sources_manager.disable_source_with_note.assert_called_once()
    args, _ = source_processor.sources_manager.disable_source_with_note.call_args
    assert args[0] == source_record["id"]
    assert "Config error" in args[1]

    # Recovery task should be spawned
    source_processor.queue_manager.spawn_item_safely.assert_called_once()


@patch("job_finder.job_queue.processors.source_processor.GenericScraper")
def test_transient_error_increments_failure_count(mock_scraper_cls, source_processor):
    """Transient errors should increment failure count but not immediately disable."""
    transient_exc = ScrapeTransientError(
        "https://example.com/api", "HTTP 503: Service Unavailable", 503
    )
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = transient_exc
    mock_scraper_cls.return_value = scraper_instance

    source_record = {
        "id": "source-123",
        "name": "Example API",
        "sourceType": "api",
        "config": {
            "type": "api",
            "url": "https://example.com/api",
            "fields": {"title": "title", "url": "url"},
            "consecutive_failures": 0,
        },
    }

    source_processor.sources_manager.get_source_by_id.return_value = source_record

    item = make_scrape_item(source_record["id"])
    source_processor.process_scrape_source(item)

    # Should update config with incremented failure count
    source_processor.sources_manager.update_source_config.assert_called()

    # Should NOT disable immediately (first failure)
    source_processor.sources_manager.disable_source_with_note.assert_not_called()

    # Queue status should be FAILED
    source_processor.queue_manager.update_status.assert_called()


@patch("job_finder.job_queue.processors.source_processor.GenericScraper")
def test_not_found_spawns_recovery_task(mock_scraper_cls, source_processor):
    """404 errors should disable source and spawn recovery task."""
    not_found_exc = ScrapeNotFoundError(
        "https://example.com/jobs", "HTTP 404: Not Found - endpoint not found", 404
    )
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = not_found_exc
    mock_scraper_cls.return_value = scraper_instance

    source_record = {
        "id": "source-123",
        "name": "Example Jobs",
        "sourceType": "html",
        "config": {
            "type": "html",
            "url": "https://example.com/jobs",
            "job_selector": ".job",
            "fields": {"title": ".title", "url": "a@href"},
        },
    }

    source_processor.sources_manager.get_source_by_id.return_value = source_record

    item = make_scrape_item(source_record["id"])
    source_processor.process_scrape_source(item)

    # 404 should call disable_source_with_note (not with_tags - it's recoverable)
    source_processor.sources_manager.disable_source_with_note.assert_called_once()
    args, _ = source_processor.sources_manager.disable_source_with_note.call_args
    assert args[0] == source_record["id"]
    assert "not found" in args[1].lower()

    # Recovery task should be spawned
    source_processor.queue_manager.spawn_item_safely.assert_called_once()


def test_scrape_skips_disabled_source(source_processor):
    """SCRAPE_SOURCE should respect disabled status and skip execution."""
    source_record = {
        "id": "source-123",
        "name": "Disabled Source",
        "sourceType": "api",
        "status": "disabled",
        "config": {
            "type": "api",
            "url": "https://example.com/api",
            "fields": {"title": "t", "url": "u"},
        },
    }
    source_processor.sources_manager.get_source_by_id.return_value = source_record

    item = make_scrape_item(source_record["id"])

    with patch.object(source_processor, "queue_manager") as qm:
        source_processor.process_scrape_source(item)
        assert qm.update_status.call_count == 2  # PROCESSING then FAILED
        args, _ = qm.update_status.call_args
        assert args[0] == item.id
        assert args[1] == QueueStatus.FAILED
        assert "disabled" in args[2].lower()
