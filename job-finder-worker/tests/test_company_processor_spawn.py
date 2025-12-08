"""End-to-end-ish tests for CompanyProcessor spawn/heal behavior."""

from unittest.mock import MagicMock, patch

from job_finder.job_queue.models import JobQueueItem, ProcessorContext, QueueItemType
from job_finder.job_queue.processors.company_processor import CompanyProcessor


def _make_processor():
    queue_manager = MagicMock()
    config_loader = MagicMock()
    config_loader.get_worker_settings.return_value = {"runtime": {}}

    companies_manager = MagicMock()
    sources_manager = MagicMock()
    sources_manager.get_aggregator_domains.return_value = ["greenhouse.io", "lever.co"]

    company_info_fetcher = MagicMock()

    ctx = ProcessorContext(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=MagicMock(),
        job_listing_storage=MagicMock(),
        companies_manager=companies_manager,
        sources_manager=sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=MagicMock(),
    )
    return CompanyProcessor(ctx)


def _company_item(name="Acme", cid=None, url="https://acme.com/jobs"):
    return JobQueueItem(
        id="item-1",
        type=QueueItemType.COMPANY,
        company_name=name,
        company_id=cid,
        url=url,
        tracking_id="t-123",
    )


def test_process_company_spawns_source_discovery_when_no_source():
    cp = _make_processor()

    cp.company_info_fetcher.fetch_company_info.return_value = {
        "website": "https://acme.com",
        "about": "a" * 120,
        "culture": "c" * 60,
    }
    cp.companies_manager.save_company.return_value = "c-1"
    cp.sources_manager.has_source_for_company.return_value = False
    cp.sources_manager.get_source_for_url.return_value = None
    cp.queue_manager.spawn_item_safely.return_value = "sd-1"

    with (
        patch.object(cp, "_detect_job_board_for_discovery", return_value=None),
        patch.object(
            cp,
            "_find_career_page_if_needed",
            return_value=("https://boards.greenhouse.io/acme", True),
        ),
    ):
        cp.process_company(_company_item())

    cp.queue_manager.spawn_item_safely.assert_called_once()
    call_kwargs = cp.queue_manager.spawn_item_safely.call_args.kwargs["new_item_data"]
    assert call_kwargs["type"] == QueueItemType.SOURCE_DISCOVERY
    assert call_kwargs["company_id"] == "c-1"
    assert "greenhouse.io" in call_kwargs["url"]


def test_process_company_heals_existing_source_without_fk():
    cp = _make_processor()

    cp.company_info_fetcher.fetch_company_info.return_value = {
        "website": "https://boards.greenhouse.io/acme",
        "about": "a" * 120,
        "culture": "c" * 60,
    }
    cp.companies_manager.save_company.return_value = "c-2"
    cp.sources_manager.has_source_for_company.return_value = False
    cp.sources_manager.get_source_for_url.return_value = {
        "id": "src-1",
        "companyId": None,
        "config": {"url": "https://boards.greenhouse.io/acme"},
    }

    with patch.object(cp, "_detect_job_board_for_discovery", return_value=None):
        with patch.object(cp, "_find_career_page_if_needed", return_value=(None, False)):
            cp.process_company(_company_item())

    cp.sources_manager.update_company_link.assert_called_once_with("src-1", "c-2")
    cp.queue_manager.spawn_item_safely.assert_not_called()


def test_process_company_skips_spawn_when_source_already_linked():
    cp = _make_processor()

    cp.company_info_fetcher.fetch_company_info.return_value = {
        "website": "https://boards.greenhouse.io/acme",
        "about": "a" * 120,
        "culture": "c" * 60,
    }
    cp.companies_manager.save_company.return_value = "c-3"
    cp.sources_manager.has_source_for_company.return_value = False
    cp.sources_manager.get_source_for_url.return_value = {
        "id": "src-2",
        "companyId": "c-3",
        "config": {"url": "https://boards.greenhouse.io/acme"},
    }

    with patch.object(cp, "_detect_job_board_for_discovery", return_value=None):
        with patch.object(cp, "_find_career_page_if_needed", return_value=(None, False)):
            cp.process_company(_company_item())

    cp.queue_manager.spawn_item_safely.assert_not_called()
    cp.sources_manager.update_company_link.assert_not_called()
