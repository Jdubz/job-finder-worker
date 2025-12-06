from unittest.mock import MagicMock, create_autospec

from job_finder.job_queue.processors.job_processor import JobProcessor
from job_finder.storage.job_listing_storage import JobListingStorage


def _build_processor(job_listing_storage):
    queue_manager = MagicMock()
    config_loader = MagicMock()
    config_loader.get_prefilter_policy.return_value = {
        "title": {},
        "freshness": {"maxAgeDays": 0},
        "workArrangement": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": True,
            "willRelocate": False,
            "userLocation": "Portland, OR",
        },
    }
    job_storage = MagicMock()
    companies_manager = MagicMock()
    sources_manager = MagicMock()
    company_info_fetcher = MagicMock()
    ai_matcher = MagicMock()

    return JobProcessor(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=job_storage,
        job_listing_storage=job_listing_storage,
        companies_manager=companies_manager,
        sources_manager=sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=ai_matcher,
    )


def test_update_listing_status_calls_storage_with_expected_signature():
    storage = create_autospec(JobListingStorage)
    storage.update_status.return_value = True

    processor = _build_processor(storage)

    processor._update_listing_status("listing-1", "matched", {"foo": "bar"})

    storage.update_status.assert_called_once_with("listing-1", "matched", {"foo": "bar"})


def test_update_listing_status_noop_when_missing_listing_id():
    storage = create_autospec(JobListingStorage)

    processor = _build_processor(storage)

    processor._update_listing_status(None, "matched", {"foo": "bar"})

    storage.update_status.assert_not_called()
