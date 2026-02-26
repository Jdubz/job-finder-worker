"""Tests for _execute_scrape URL-only fallback with Playwright + AI extraction.

Verifies that:
1. Manual data (both title+desc) returns immediately without page extraction
2. Partial manual data (title only or desc only) falls through to page extraction
3. Page extraction results are merged with partial manual data
4. Failures in page extraction fall through to ValueError
5. NoAgentsAvailableError propagates correctly
"""

from unittest.mock import MagicMock, patch

import pytest

from job_finder.exceptions import NoAgentsAvailableError
from job_finder.job_queue.models import JobQueueItem, ProcessorContext, QueueItemType
from job_finder.job_queue.processors.job_processor import JobProcessor, PipelineContext


def _make_job_processor():
    qm = MagicMock()
    cl = MagicMock()
    cl.get_prefilter_policy.return_value = {
        "title": {"requiredKeywords": [], "excludedKeywords": []},
        "freshness": {"maxAgeDays": 0},
        "workArrangement": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": True,
            "willRelocate": True,
            "userLocation": "Portland, OR",
        },
    }
    js = MagicMock()
    jls = MagicMock()
    comp = MagicMock()
    srcs = MagicMock()
    cif = MagicMock()
    ai_matcher = MagicMock()

    with patch(
        "job_finder.job_queue.processors.job_processor.InferenceClient",
        return_value=MagicMock(),
    ):
        ctx = ProcessorContext(
            queue_manager=qm,
            config_loader=cl,
            job_storage=js,
            job_listing_storage=jls,
            companies_manager=comp,
            sources_manager=srcs,
            company_info_fetcher=cif,
            ai_matcher=ai_matcher,
            notifier=None,
        )
        processor = JobProcessor(ctx)

    processor._refresh_runtime_config = lambda: None
    return processor


def _make_item(url="https://example.com/job", metadata=None):
    return JobQueueItem(
        id="job-1",
        type=QueueItemType.JOB,
        url=url,
        company_name="",
        tracking_id="t-1",
        metadata=metadata,
    )


def _pipeline_ctx(item, listing_id=None):
    return PipelineContext(item=item, job_data={}, company_data=None, listing_id=listing_id)


class TestExecuteScrapeManualData:
    """Test manual data paths in _execute_scrape."""

    def test_returns_immediately_with_both_manual_fields(self):
        processor = _make_job_processor()
        item = _make_item(
            metadata={
                "manualTitle": "User Title",
                "manualDescription": "User Desc",
                "manualCompanyName": "UserCo",
            }
        )
        ctx = _pipeline_ctx(item)

        result = processor._execute_scrape(ctx)

        assert result["title"] == "User Title"
        assert result["description"] == "User Desc"
        assert result["company"] == "UserCo"

    def test_partial_manual_title_falls_through_to_page_extraction(self):
        processor = _make_job_processor()
        item = _make_item(metadata={"manualTitle": "User Title"})
        ctx = _pipeline_ctx(item)

        extracted = {
            "title": "Extracted Title",
            "description": "Extracted Desc",
            "company": "ExtractedCo",
            "url": item.url,
        }
        processor.page_data_extractor = MagicMock()
        processor.page_data_extractor.extract.return_value = extracted

        result = processor._execute_scrape(ctx)

        # Manual title takes priority, extracted desc fills the gap
        assert result["title"] == "User Title"
        assert result["description"] == "Extracted Desc"
        processor.page_data_extractor.extract.assert_called_once_with(item.url)

    def test_partial_manual_description_falls_through_to_page_extraction(self):
        processor = _make_job_processor()
        item = _make_item(metadata={"manualDescription": "User Desc"})
        ctx = _pipeline_ctx(item)

        extracted = {
            "title": "Extracted Title",
            "description": "Extracted Desc",
            "company": "ExtractedCo",
            "url": item.url,
        }
        processor.page_data_extractor = MagicMock()
        processor.page_data_extractor.extract.return_value = extracted

        result = processor._execute_scrape(ctx)

        assert result["title"] == "Extracted Title"
        assert result["description"] == "User Desc"  # Manual desc takes priority


class TestExecuteScrapePageExtractionFallback:
    """Test URL-only Playwright + AI page extraction fallback."""

    def test_url_only_extraction_success(self):
        processor = _make_job_processor()
        item = _make_item(metadata={})
        ctx = _pipeline_ctx(item)

        # No listing_id, no scraped_data
        processor.job_listing_storage = MagicMock()
        processor.job_listing_storage.get_by_id.return_value = None

        extracted = {
            "title": "Extracted Engineer",
            "description": "A great job posting",
            "company": "TechCo",
            "location": "Remote",
            "url": item.url,
        }
        processor.page_data_extractor = MagicMock()
        processor.page_data_extractor.extract.return_value = extracted

        result = processor._execute_scrape(ctx)

        assert result["title"] == "Extracted Engineer"
        assert result["description"] == "A great job posting"
        assert result["company"] == "TechCo"

    def test_extraction_returns_none_raises_value_error(self):
        processor = _make_job_processor()
        item = _make_item(metadata={})
        ctx = _pipeline_ctx(item)

        processor.page_data_extractor = MagicMock()
        processor.page_data_extractor.extract.return_value = None

        with pytest.raises(ValueError, match="No job data found"):
            processor._execute_scrape(ctx)

    def test_extraction_missing_title_raises_value_error(self):
        processor = _make_job_processor()
        item = _make_item(metadata={})
        ctx = _pipeline_ctx(item)

        processor.page_data_extractor = MagicMock()
        processor.page_data_extractor.extract.return_value = {
            "title": "",
            "description": "Some desc",
            "url": item.url,
        }

        with pytest.raises(ValueError, match="No job data found"):
            processor._execute_scrape(ctx)

    def test_extraction_exception_falls_through_to_value_error(self):
        processor = _make_job_processor()
        item = _make_item(metadata={})
        ctx = _pipeline_ctx(item)

        processor.page_data_extractor = MagicMock()
        processor.page_data_extractor.extract.side_effect = RuntimeError("Playwright crash")

        with pytest.raises(ValueError, match="No job data found"):
            processor._execute_scrape(ctx)

    def test_no_agents_available_falls_through_to_value_error(self):
        """NoAgentsAvailableError in page extraction should NOT stop the queue.

        Page extraction is opportunistic — failing one URL-only item shouldn't
        kill processing for items that have pre-scraped data.
        """
        processor = _make_job_processor()
        item = _make_item(metadata={})
        ctx = _pipeline_ctx(item)

        processor.page_data_extractor = MagicMock()
        processor.page_data_extractor.extract.side_effect = NoAgentsAvailableError("down")

        with pytest.raises(ValueError, match="No job data found"):
            processor._execute_scrape(ctx)

    def test_manual_location_merged_into_extracted(self):
        processor = _make_job_processor()
        item = _make_item(
            metadata={
                "manualLocation": "Portland, OR",
            }
        )
        ctx = _pipeline_ctx(item)

        extracted = {
            "title": "Engineer",
            "description": "A job",
            "company": "Co",
            "location": "Remote",
            "url": item.url,
        }
        processor.page_data_extractor = MagicMock()
        processor.page_data_extractor.extract.return_value = extracted

        result = processor._execute_scrape(ctx)

        assert result["location"] == "Portland, OR"  # Manual overrides extracted

    def test_manual_company_merged_into_extracted(self):
        processor = _make_job_processor()
        item = _make_item(
            metadata={
                "manualCompanyName": "UserCo",
            }
        )
        ctx = _pipeline_ctx(item)

        extracted = {
            "title": "Engineer",
            "description": "A job",
            "company": "ExtractedCo",
            "url": item.url,
        }
        processor.page_data_extractor = MagicMock()
        processor.page_data_extractor.extract.return_value = extracted

        result = processor._execute_scrape(ctx)

        assert result["company"] == "UserCo"
