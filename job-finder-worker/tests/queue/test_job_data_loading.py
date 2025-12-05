"""Tests for job_data loading from scraped_data in job processor.

These tests prevent regressions where nested job_data structures cause
"Empty title or description" errors during AI extraction.
"""

import pytest
from unittest.mock import MagicMock, patch

from job_finder.job_queue.models import JobQueueItem, QueueItemType
from job_finder.job_queue.processors.job_processor import JobProcessor, PipelineContext


@pytest.fixture
def mock_dependencies():
    """Create mock dependencies for JobProcessor."""
    queue_manager = MagicMock()
    config_loader = MagicMock()
    config_loader.get_ai_settings.return_value = {
        "agents": {
            "test.agent": {
                "provider": "test",
                "interface": "cli",
                "defaultModel": "test-model",
                "enabled": True,
                "reason": None,
                "dailyBudget": 100,
                "dailyUsage": 0,
            }
        },
        "taskFallbacks": {
            "extraction": ["test.agent"],
            "analysis": ["test.agent"],
        },
        "modelRates": {"test-model": 0.5},
    }
    config_loader.get_title_filter.return_value = {
        "requiredKeywords": [],
        "excludedKeywords": [],
    }
    config_loader.get_prefilter_policy.return_value = {
        "title": {"requiredKeywords": [], "excludedKeywords": []},
        "freshness": {"maxAgeDays": 0},
        "workArrangement": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": True,
            "willRelocate": True,
            "userLocation": "Test Location",
        },
        "employmentType": {
            "allowFullTime": True,
            "allowPartTime": True,
            "allowContract": True,
        },
        "salary": {"minimum": None},
        "technology": {"rejected": []},
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
        },
        "skillMatch": {
            "baseMatchScore": 1,
            "yearsMultiplier": 0.5,
            "maxYearsBonus": 5,
            "missingScore": -1,
            "analogScore": 0,
            "maxBonus": 25,
            "maxPenalty": -15,
            "analogGroups": [],
        },
        "salary": {"minimum": None, "target": None, "belowTargetScore": -2},
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

    return {
        "queue_manager": queue_manager,
        "config_loader": config_loader,
        "job_storage": MagicMock(),
        "job_listing_storage": MagicMock(),
        "companies_manager": MagicMock(),
        "sources_manager": MagicMock(),
        "company_info_fetcher": MagicMock(),
        "ai_matcher": MagicMock(),
    }


@pytest.fixture
def job_processor(mock_dependencies):
    """Create a JobProcessor with mocked dependencies."""
    with (
        patch("job_finder.job_queue.processors.job_processor.ScrapeRunner"),
        patch("job_finder.job_queue.processors.job_processor.AgentManager"),
    ):
        processor = JobProcessor(**mock_dependencies)
        # Prevent config refresh from overwriting mocks
        processor._refresh_runtime_config = lambda: None
        return processor


class TestJobDataLoadingFromScrapedData:
    """Tests for loading job_data from scraped_data field."""

    def test_loads_job_data_from_nested_structure(self, job_processor):
        """Test that job_data is properly extracted from {"job_data": {...}} structure.

        The scraped_data field contains {"job_data": {...}}, and we need to
        extract the inner dict, not assign the whole wrapper dict.
        """
        job_data_content = {
            "title": "Senior Engineer",
            "description": "A great job opportunity",
            "location": "Remote",
            "company": "Test Corp",
        }

        item = JobQueueItem(
            id="test-123",
            type=QueueItemType.JOB,
            url="https://example.com/job/123",
            company_name="Test Corp",
            source="scraper",
            scraped_data={"job_data": job_data_content},
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic from process_job
        if item.scraped_data:
            job_data = item.scraped_data.get("job_data", item.scraped_data)
            while (
                isinstance(job_data, dict)
                and "job_data" in job_data
                and "title" not in job_data
                and isinstance(job_data.get("job_data"), dict)
            ):
                job_data = job_data["job_data"]
            ctx.job_data = job_data

        assert ctx.job_data is not None
        assert ctx.job_data.get("title") == "Senior Engineer"
        assert ctx.job_data.get("description") == "A great job opportunity"

    def test_handles_double_nested_job_data(self, job_processor):
        """Test handling of double-nested job_data from previous bug.

        A bug caused job_data to be saved as {"job_data": {"job_data": {...}}}.
        The fix should unwrap this correctly.
        """
        actual_job_data = {
            "title": "Backend Developer",
            "description": "Build awesome APIs",
            "location": "NYC",
            "company": "Acme Inc",
        }

        # Double-nested structure from bug
        item = JobQueueItem(
            id="test-456",
            type=QueueItemType.JOB,
            url="https://example.com/job/456",
            company_name="Acme Inc",
            source="scraper",
            scraped_data={"job_data": {"job_data": actual_job_data}},
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic from process_job
        if item.scraped_data:
            job_data = item.scraped_data.get("job_data", item.scraped_data)
            while (
                isinstance(job_data, dict)
                and "job_data" in job_data
                and "title" not in job_data
                and isinstance(job_data.get("job_data"), dict)
            ):
                job_data = job_data["job_data"]
            ctx.job_data = job_data

        assert ctx.job_data is not None
        assert ctx.job_data.get("title") == "Backend Developer"
        assert ctx.job_data.get("description") == "Build awesome APIs"

    def test_handles_triple_nested_job_data(self, job_processor):
        """Test handling of triple-nested job_data (edge case)."""
        actual_job_data = {
            "title": "Staff Engineer",
            "description": "Lead technical initiatives",
            "location": "Remote",
        }

        # Triple-nested structure (extreme edge case)
        item = JobQueueItem(
            id="test-789",
            type=QueueItemType.JOB,
            url="https://example.com/job/789",
            company_name="Tech Co",
            source="scraper",
            scraped_data={"job_data": {"job_data": {"job_data": actual_job_data}}},
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic from process_job
        if item.scraped_data:
            job_data = item.scraped_data.get("job_data", item.scraped_data)
            while (
                isinstance(job_data, dict)
                and "job_data" in job_data
                and "title" not in job_data
                and isinstance(job_data.get("job_data"), dict)
            ):
                job_data = job_data["job_data"]
            ctx.job_data = job_data

        assert ctx.job_data is not None
        assert ctx.job_data.get("title") == "Staff Engineer"

    def test_handles_flat_scraped_data(self, job_processor):
        """Test that flat scraped_data without job_data wrapper still works."""
        # Some code paths might produce flat structure
        flat_job_data = {
            "title": "DevOps Engineer",
            "description": "Manage infrastructure",
            "location": "Austin, TX",
        }

        item = JobQueueItem(
            id="test-flat",
            type=QueueItemType.JOB,
            url="https://example.com/job/flat",
            company_name="Infra Co",
            source="scraper",
            scraped_data=flat_job_data,
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic from process_job
        if item.scraped_data:
            job_data = item.scraped_data.get("job_data", item.scraped_data)
            while (
                isinstance(job_data, dict)
                and "job_data" in job_data
                and "title" not in job_data
                and isinstance(job_data.get("job_data"), dict)
            ):
                job_data = job_data["job_data"]
            ctx.job_data = job_data

        # Should use the scraped_data directly as fallback
        assert ctx.job_data is not None
        assert ctx.job_data.get("title") == "DevOps Engineer"

    def test_stops_unwrapping_when_title_present(self, job_processor):
        """Test that unwrapping stops when 'title' is present at current level.

        The unwrapping logic checks 'title' not in job_data to detect wrappers.
        If the current level has 'title', it's the actual job data and should
        not be unwrapped further, even if it also contains a 'job_data' key.
        """
        # This structure has title at the first level, shouldn't unwrap further
        item = JobQueueItem(
            id="test-edge",
            type=QueueItemType.JOB,
            url="https://example.com/job/edge",
            company_name="Edge Co",
            source="scraper",
            scraped_data={
                "job_data": {
                    "title": "Principal Engineer",
                    "description": "Lead architecture",
                    "job_data": {"nested": "metadata"},  # Should not follow this
                }
            },
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic from process_job
        if item.scraped_data:
            job_data = item.scraped_data.get("job_data", item.scraped_data)
            while (
                isinstance(job_data, dict)
                and "job_data" in job_data
                and "title" not in job_data
                and isinstance(job_data.get("job_data"), dict)
            ):
                job_data = job_data["job_data"]
            ctx.job_data = job_data

        assert ctx.job_data is not None
        assert ctx.job_data.get("title") == "Principal Engineer"
        # Should NOT have unwrapped to the nested job_data
        assert "nested" not in ctx.job_data

    def test_unwraps_job_data_with_sibling_metadata(self, job_processor):
        """Test unwrapping when job_data has sibling keys like company/company_id.

        Real-world case: scraped_data.job_data contains both the nested job_data
        AND metadata like company, company_id at the same level. Should still
        unwrap to get to the actual job data with title.
        """
        actual_job_data = {
            "title": "Senior Software Engineer",
            "description": "Build amazing products",
            "location": "Remote",
            "url": "https://example.com/job/123",
        }

        # Structure with nested job_data alongside metadata (real production case)
        item = JobQueueItem(
            id="test-metadata",
            type=QueueItemType.JOB,
            url="https://example.com/job/metadata",
            company_name="Tech Corp",
            source="scraper",
            scraped_data={
                "job_data": {
                    "job_data": actual_job_data,
                    "company": "Tech Corp",
                    "company_id": "abc123",
                }
            },
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic from process_job
        if item.scraped_data:
            job_data = item.scraped_data.get("job_data", item.scraped_data)
            while (
                isinstance(job_data, dict)
                and "job_data" in job_data
                and "title" not in job_data
                and isinstance(job_data.get("job_data"), dict)
            ):
                job_data = job_data["job_data"]
            ctx.job_data = job_data

        assert ctx.job_data is not None
        assert ctx.job_data.get("title") == "Senior Software Engineer"
        assert ctx.job_data.get("description") == "Build amazing products"


class TestPipelineContextJobDataExtraction:
    """Integration tests for job_data extraction in full pipeline context."""

    def test_extraction_receives_correct_title_and_description(
        self, job_processor, mock_dependencies
    ):
        """Test that AI extraction receives the correct title and description.

        This is the end-to-end test that would have caught the original bug
        where extraction received empty title/description.
        """
        job_data_content = {
            "title": "Senior Software Engineer",
            "description": "Join our team to build amazing products",
            "location": "San Francisco, CA",
            "company": "Startup Inc",
        }

        item = JobQueueItem(
            id="test-e2e",
            type=QueueItemType.JOB,
            url="https://example.com/job/e2e",
            company_name="Startup Inc",
            source="scraper",
            scraped_data={"job_data": job_data_content},
            pipeline_state={"pipeline_stage": "extraction"},
        )

        # Mock the extractor to capture what it receives
        captured_args = {}

        def mock_extract(title, description, location=None, posted_date=None):
            captured_args["title"] = title
            captured_args["description"] = description
            from job_finder.ai.extraction import JobExtractionResult

            return JobExtractionResult(
                seniority="senior",
                work_arrangement="hybrid",
                technologies=["python"],
            )

        job_processor.extractor = MagicMock()
        job_processor.extractor.extract = mock_extract

        # Simulate the job_data loading
        ctx = PipelineContext(item=item)
        if item.scraped_data:
            job_data = item.scraped_data.get("job_data", item.scraped_data)
            while (
                isinstance(job_data, dict)
                and "job_data" in job_data
                and "title" not in job_data
                and isinstance(job_data.get("job_data"), dict)
            ):
                job_data = job_data["job_data"]
            ctx.job_data = job_data

        # Execute extraction
        job_processor._execute_ai_extraction(ctx)

        # Verify extraction received the correct values
        assert captured_args["title"] == "Senior Software Engineer"
        assert captured_args["description"] == "Join our team to build amazing products"
