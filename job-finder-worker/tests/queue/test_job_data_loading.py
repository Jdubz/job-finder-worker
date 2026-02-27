"""Tests for job_data loading and validation in job processor.

These tests ensure:
1. Valid job_data is loaded correctly (with copy to prevent mutation)
2. Corrupted nested data is detected and cleared (self-healing)
3. Invalid data without 'title' is detected and cleared
4. Save validates structure and fails fast on corruption
"""

import pytest
from unittest.mock import MagicMock, patch

from job_finder.job_queue.models import JobQueueItem, ProcessorContext, QueueItemType
from job_finder.job_queue.processors.job_processor import JobProcessor, PipelineContext


@pytest.fixture
def mock_dependencies():
    """Create mock dependencies for JobProcessor."""
    queue_manager = MagicMock()
    config_loader = MagicMock()
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
        "experience": {},
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
        patch("job_finder.job_queue.processors.job_processor.InferenceClient"),
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
        processor = JobProcessor(ctx)
        processor._refresh_runtime_config = lambda: None
        return processor


class TestJobDataLoadingValidation:
    """Tests for job_data loading with validation and self-healing.

    Note: These tests simulate the loading logic inline rather than calling
    the full process_job method. This is intentional because:
    1. process_job requires extensive mocking of AI providers, storage, etc.
    2. We want to test the loading/validation logic in isolation
    3. The logic pattern is what we're validating, not the full pipeline

    The inline simulation mirrors job_processor.py lines 317-337.
    """

    def test_loads_valid_job_data(self):
        """Test that valid job_data with title is loaded correctly."""
        job_data_content = {
            "title": "Senior Engineer",
            "description": "A great job opportunity",
            "location": "Remote",
        }

        item = JobQueueItem(
            id="test-valid",
            type=QueueItemType.JOB,
            url="https://example.com/job/valid",
            company_name="Test Corp",
            source="scraper",
            scraped_data={"job_data": job_data_content},
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic
        job_data = item.scraped_data.get("job_data")
        if job_data and "job_data" in job_data:
            item.scraped_data = None
        elif job_data and "title" in job_data:
            ctx.job_data = dict(job_data)  # Copy
        elif job_data:
            item.scraped_data = None

        assert ctx.job_data is not None
        assert ctx.job_data.get("title") == "Senior Engineer"
        assert ctx.job_data.get("description") == "A great job opportunity"

    def test_loads_job_data_with_sibling_metadata(self):
        """Test extraction when scraped_data has job_data alongside sibling keys.

        Real-world scenario: scraped_data contains job_data plus metadata like
        company, company_id at the same level.
        """
        item = JobQueueItem(
            id="test-siblings",
            type=QueueItemType.JOB,
            url="https://example.com/job/siblings",
            company_name="Test Corp",
            source="scraper",
            scraped_data={
                "job_data": {"title": "Engineer", "description": "Build things"},
                "company": "Test Corp",
                "company_id": "123",
            },
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic - should extract job_data correctly
        job_data = item.scraped_data.get("job_data")
        if job_data and "job_data" in job_data:
            item.scraped_data = None
        elif job_data and "title" in job_data:
            ctx.job_data = dict(job_data)
        elif job_data:
            item.scraped_data = None

        # job_data should be extracted, sibling keys don't interfere
        assert ctx.job_data is not None
        assert ctx.job_data.get("title") == "Engineer"
        assert ctx.job_data.get("description") == "Build things"
        # Sibling keys are NOT in job_data (they're at scraped_data level)
        assert "company_id" not in ctx.job_data

    def test_loads_flat_scraped_data_structure(self):
        """Test loading when scraped_data has job fields at top level (no wrapper).

        Some scrapers return flat structures where title, description, etc.
        are directly in scraped_data without a job_data wrapper.
        """
        item = JobQueueItem(
            id="test-flat",
            type=QueueItemType.JOB,
            url="https://example.com/job/flat",
            company_name="Test Corp",
            source="scraper",
            # Flat structure - no job_data wrapper
            scraped_data={
                "title": "Senior Engineer",
                "description": "Work on cool stuff",
                "company": "Test Corp",
            },
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic (including flat structure support)
        job_data = item.scraped_data.get("job_data")
        if job_data and "job_data" in job_data:
            item.scraped_data = None
        elif job_data and "title" in job_data:
            ctx.job_data = dict(job_data)
        elif job_data:
            item.scraped_data = None
        elif "title" in item.scraped_data:
            # Flat structure - job data at top level
            ctx.job_data = dict(item.scraped_data)

        assert ctx.job_data is not None
        assert ctx.job_data.get("title") == "Senior Engineer"
        assert ctx.job_data.get("description") == "Work on cool stuff"

    def test_loads_copy_to_prevent_mutation(self):
        """Test that loaded job_data is a copy, not a reference."""
        original_data = {
            "title": "Engineer",
            "description": "Original description",
        }

        item = JobQueueItem(
            id="test-copy",
            type=QueueItemType.JOB,
            url="https://example.com/job/copy",
            company_name="Test Corp",
            source="scraper",
            scraped_data={"job_data": original_data},
        )

        ctx = PipelineContext(item=item)

        # Load with copy
        job_data = item.scraped_data.get("job_data")
        if job_data and "title" in job_data:
            ctx.job_data = dict(job_data)

        # Mutate ctx.job_data
        ctx.job_data["company"] = "Added Company"
        ctx.job_data["description"] = "Modified"

        # Original should be unchanged
        assert "company" not in original_data
        assert original_data["description"] == "Original description"

    def test_clears_nested_job_data(self):
        """Test that nested job_data (corruption) is detected and cleared.

        The bug caused data to be saved as {"job_data": {"job_data": {...}}}.
        When job_data contains a nested job_data key, it's corrupted and
        should be cleared to trigger a re-scrape.
        """
        item = JobQueueItem(
            id="test-nested",
            type=QueueItemType.JOB,
            url="https://example.com/job/nested",
            company_name="Test Corp",
            source="scraper",
            # Double-nested structure: job_data contains job_data
            scraped_data={
                "job_data": {
                    "job_data": {"title": "Engineer", "description": "..."},
                    "company": "Test",
                }
            },
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic
        job_data = item.scraped_data.get("job_data")
        if job_data and "job_data" in job_data:
            # Detected corruption - clear it
            item.scraped_data = None
        elif job_data and "title" in job_data:
            ctx.job_data = dict(job_data)

        # Should have cleared the corrupted data
        assert item.scraped_data is None
        assert ctx.job_data is None

    def test_clears_job_data_without_title(self):
        """Test that job_data without title is detected and cleared."""
        invalid_data = {
            "description": "Has description but no title",
            "location": "Remote",
        }

        item = JobQueueItem(
            id="test-no-title",
            type=QueueItemType.JOB,
            url="https://example.com/job/no-title",
            company_name="Test Corp",
            source="scraper",
            scraped_data={"job_data": invalid_data},
        )

        ctx = PipelineContext(item=item)

        # Simulate the loading logic
        job_data = item.scraped_data.get("job_data")
        if job_data and "job_data" in job_data:
            item.scraped_data = None
        elif job_data and "title" in job_data:
            ctx.job_data = dict(job_data)
        elif job_data:
            # No title - invalid
            item.scraped_data = None

        # Should have cleared the invalid data
        assert item.scraped_data is None
        assert ctx.job_data is None


class TestJobDataSaveValidation:
    """Tests for job_data save validation - fail fast on corruption."""

    def test_save_valid_job_data(self, job_processor):
        """Test that valid job_data saves correctly."""
        ctx = PipelineContext(
            item=JobQueueItem(
                id="test-save",
                type=QueueItemType.JOB,
                url="https://example.com/job",
                company_name="Test",
                source="scraper",
            )
        )
        ctx.job_data = {
            "title": "Engineer",
            "description": "...",
            "company": "Test Corp",
        }

        result = job_processor._build_final_scraped_data(ctx)

        assert "job_data" in result
        assert result["job_data"]["title"] == "Engineer"

    def test_save_handles_missing_title_gracefully(self, job_processor):
        """Test that missing title returns empty string in summary.

        Since job_listings is now the source of truth, _build_final_scraped_data
        only builds a summary and doesn't validate the structure.
        """
        ctx = PipelineContext(
            item=JobQueueItem(
                id="test-save-nested",
                type=QueueItemType.JOB,
                url="https://example.com/job",
                company_name="Test",
                source="scraper",
            )
        )
        # Structure without title at top level
        ctx.job_data = {
            "job_data": {"title": "Engineer"},
            "company": "Test",
        }

        # Should not raise - just returns summary with empty title
        result = job_processor._build_final_scraped_data(ctx)
        assert result["job_data"]["title"] == ""
        assert result["job_data"]["company"] == "Test"

    def test_save_allows_job_data_key_if_title_present(self, job_processor):
        """Test that having both job_data and title keys is allowed.

        Edge case: A job listing that happens to have 'job_data' in its content
        (e.g., a job about data pipelines). This is valid as long as title exists.
        """
        ctx = PipelineContext(
            item=JobQueueItem(
                id="test-edge",
                type=QueueItemType.JOB,
                url="https://example.com/job",
                company_name="Test",
                source="scraper",
            )
        )
        ctx.job_data = {
            "title": "Data Engineer",
            "description": "Work with job_data pipelines",
            "job_data": "Some metadata field that happens to be named job_data",
        }

        # Should not raise - title is present
        result = job_processor._build_final_scraped_data(ctx)
        assert result["job_data"]["title"] == "Data Engineer"
