"""Tests for job_listings as single source of truth.

These tests verify that:
1. Job processor queries job_listings by listing_id (not scraped_data)
2. ScraperIntake does NOT duplicate job data in scraped_data
3. _build_final_scraped_data returns minimal summary only
4. _update_listing_status has correct signature (no analysis_result param)

This prevents regression of the data duplication issues fixed in the pipeline.
"""

import pytest
import sqlite3
import tempfile
import os
from unittest.mock import MagicMock, patch

from job_finder.job_queue.models import JobQueueItem, ProcessorContext, QueueItemType
from job_finder.job_queue.processors.job_processor import JobProcessor, PipelineContext
from job_finder.job_queue.scraper_intake import ScraperIntake
from job_finder.job_queue.manager import QueueManager
from job_finder.storage.job_listing_storage import JobListingStorage

# ============================================================
# FIXTURES
# ============================================================


@pytest.fixture
def temp_db():
    """Create a temporary SQLite database with required tables."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test.db")
        with sqlite3.connect(db_path) as conn:
            # Create job_queue table
            conn.execute("""
                CREATE TABLE job_queue (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    url TEXT,
                    tracking_id TEXT,
                    parent_item_id TEXT,
                    dedupe_key TEXT,
                    input TEXT,
                    output TEXT,
                    result_message TEXT,
                    error_details TEXT,
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    max_retries INTEGER NOT NULL DEFAULT 3,
                    last_error_category TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    processed_at TEXT,
                    completed_at TEXT
                )
            """)
            # Create job_listings table
            conn.execute("""
                CREATE TABLE job_listings (
                    id TEXT PRIMARY KEY,
                    url TEXT NOT NULL UNIQUE,
                    source_id TEXT,
                    company_id TEXT,
                    title TEXT NOT NULL,
                    company_name TEXT NOT NULL,
                    location TEXT,
                    salary_range TEXT,
                    description TEXT NOT NULL,
                    posted_date TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    filter_result TEXT,
                    match_score REAL,
                    content_fingerprint TEXT,
                    apply_url TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
        yield db_path


@pytest.fixture
def job_listing_storage(temp_db):
    """Create job listing storage with temp database."""
    return JobListingStorage(db_path=temp_db)


@pytest.fixture
def queue_manager(temp_db):
    """Create queue manager with temp database."""
    return QueueManager(db_path=temp_db)


@pytest.fixture
def mock_config_loader():
    """Create mock config loader with minimal config."""
    config_loader = MagicMock()
    config_loader.get_ai_settings.return_value = {
        "agents": {},
        "taskFallbacks": {"extraction": [], "analysis": []},
        "modelRates": {},
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
            "userLocation": "Test",
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
    return config_loader


@pytest.fixture
def job_processor(queue_manager, mock_config_loader, job_listing_storage):
    """Create job processor with real job_listing_storage."""
    with patch("job_finder.job_queue.processors.job_processor.InferenceClient"):
        with patch("job_finder.job_queue.processors.job_processor.JobExtractor"):
            with patch("job_finder.job_queue.processors.job_processor.ScrapeRunner"):
                ctx = ProcessorContext(
                    queue_manager=queue_manager,
                    config_loader=mock_config_loader,
                    job_storage=MagicMock(),
                    job_listing_storage=job_listing_storage,
                    companies_manager=MagicMock(),
                    sources_manager=MagicMock(),
                    company_info_fetcher=MagicMock(),
                    ai_matcher=MagicMock(),
                )
                processor = JobProcessor(ctx)
                return processor


# ============================================================
# TEST: _execute_scrape QUERIES job_listings BY listing_id
# ============================================================


class TestExecuteScrapeUsesJobListings:
    """Tests that _execute_scrape queries job_listings as source of truth."""

    def test_execute_scrape_queries_job_listings_by_listing_id(
        self, job_processor, job_listing_storage
    ):
        """Test that _execute_scrape fetches data from job_listings table."""
        # Create a job listing in the database
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/123",
            title="Senior Software Engineer",
            company_name="Acme Corp",
            description="Build amazing software with our team.",
            location="Remote",
            salary_range="$150k-$200k",
            posted_date="2025-01-15",
        )

        # Create queue item with listing_id in metadata (NO scraped_data)
        item = JobQueueItem(
            id="test-item-1",
            type=QueueItemType.JOB,
            url="https://example.com/job/123",
            metadata={"job_listing_id": listing_id},
            scraped_data=None,  # Explicitly None - data should come from job_listings
        )

        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id

        # Execute scrape stage
        result = job_processor._execute_scrape(ctx)

        # Should return data from job_listings
        assert result["title"] == "Senior Software Engineer"
        assert result["company"] == "Acme Corp"
        assert result["description"] == "Build amazing software with our team."
        assert result["location"] == "Remote"
        assert result["salary"] == "$150k-$200k"

    def test_execute_scrape_prefers_job_listings_over_scraped_data(
        self, job_processor, job_listing_storage
    ):
        """Test that job_listings takes priority over scraped_data."""
        # Create a job listing with correct data
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/456",
            title="Correct Title from DB",
            company_name="Correct Company",
            description="Correct description from database.",
        )

        # Create queue item with BOTH listing_id AND (stale) scraped_data
        item = JobQueueItem(
            id="test-item-2",
            type=QueueItemType.JOB,
            url="https://example.com/job/456",
            metadata={"job_listing_id": listing_id},
            scraped_data={
                "title": "Wrong Title from scraped_data",
                "company": "Wrong Company",
                "description": "Wrong description.",
            },
        )

        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id

        # Execute scrape stage
        result = job_processor._execute_scrape(ctx)

        # Should return data from job_listings, NOT scraped_data
        assert result["title"] == "Correct Title from DB"
        assert result["company"] == "Correct Company"
        assert result["description"] == "Correct description from database."

    def test_execute_scrape_falls_back_to_scraped_data_if_no_listing(self, job_processor):
        """Test legacy fallback: use scraped_data if no listing_id."""
        # Create queue item with scraped_data but NO listing_id (legacy job)
        item = JobQueueItem(
            id="test-item-3",
            type=QueueItemType.JOB,
            url="https://example.com/job/789",
            metadata={},  # No job_listing_id
            scraped_data={
                "title": "Legacy Job Title",
                "company": "Legacy Corp",
                "description": "Legacy description.",
            },
        )

        ctx = PipelineContext(item=item)
        ctx.listing_id = None

        # Execute scrape stage
        result = job_processor._execute_scrape(ctx)

        # Should fall back to scraped_data
        assert result["title"] == "Legacy Job Title"
        assert result["company"] == "Legacy Corp"

    def test_execute_scrape_raises_error_if_no_data_source(self, job_processor):
        """Test that ValueError is raised if neither listing nor scraped_data."""
        # Create queue item with NO listing_id and NO scraped_data
        item = JobQueueItem(
            id="test-item-4",
            type=QueueItemType.JOB,
            url="https://example.com/job/missing",
            metadata={},
            scraped_data=None,
        )

        ctx = PipelineContext(item=item)
        ctx.listing_id = None

        # Should raise ValueError
        with pytest.raises(ValueError, match="No job data found"):
            job_processor._execute_scrape(ctx)

    def test_execute_scrape_uses_manual_submission_first(self, job_processor):
        """Test that manual submission data takes highest priority."""
        # Create queue item with manual submission data
        item = JobQueueItem(
            id="test-item-5",
            type=QueueItemType.JOB,
            url="https://example.com/job/manual",
            metadata={
                "manualTitle": "Manually Submitted Job",
                "manualDescription": "User typed this description.",
                "manualCompanyName": "User Company",
                "manualLocation": "User Location",
            },
            scraped_data={
                "title": "Should be ignored",
            },
        )

        ctx = PipelineContext(item=item)
        ctx.listing_id = None

        # Execute scrape stage
        result = job_processor._execute_scrape(ctx)

        # Should return manual submission data
        assert result["title"] == "Manually Submitted Job"
        assert result["description"] == "User typed this description."
        assert result["company"] == "User Company"
        assert result["location"] == "User Location"


# ============================================================
# TEST: ScraperIntake DOES NOT DUPLICATE DATA
# ============================================================


class TestScraperIntakeNoDuplication:
    """Tests that ScraperIntake does not duplicate job data in scraped_data."""

    def test_submit_jobs_sets_scraped_data_to_none(self):
        """Test that scraped_data is None when queue item is created."""
        mock_queue_manager = MagicMock()
        mock_queue_manager.url_exists_in_queue.return_value = False
        mock_queue_manager.add_item.return_value = "doc-id"

        mock_job_listing_storage = MagicMock()
        mock_job_listing_storage.listing_exists.return_value = False  # Job doesn't exist yet
        mock_job_listing_storage.fingerprint_exists.return_value = False  # No content dupe
        mock_job_listing_storage.get_or_create_listing.return_value = ("listing-123", True)

        intake = ScraperIntake(
            queue_manager=mock_queue_manager,
            job_listing_storage=mock_job_listing_storage,
        )

        jobs = [
            {
                "title": "Software Engineer",
                "url": "https://example.com/job/1",
                "company": "Test Corp",
                "description": "Full job description here with lots of text.",
                "location": "Remote",
            }
        ]

        intake.submit_jobs(jobs, source="scraper", source_id="src-1")

        # Verify add_item was called
        assert mock_queue_manager.add_item.called

        # Get the JobQueueItem that was passed to add_item
        queue_item = mock_queue_manager.add_item.call_args[0][0]

        # scraped_data should be None (job data lives in job_listings)
        assert queue_item.scraped_data is None

    def test_submit_jobs_stores_listing_id_in_metadata(self):
        """Test that job_listing_id is stored in metadata."""
        mock_queue_manager = MagicMock()
        mock_queue_manager.url_exists_in_queue.return_value = False
        mock_queue_manager.add_item.return_value = "doc-id"

        mock_job_listing_storage = MagicMock()
        mock_job_listing_storage.listing_exists.return_value = False  # Job doesn't exist yet
        mock_job_listing_storage.fingerprint_exists.return_value = False  # No content dupe
        mock_job_listing_storage.get_or_create_listing.return_value = ("listing-456", True)

        intake = ScraperIntake(
            queue_manager=mock_queue_manager,
            job_listing_storage=mock_job_listing_storage,
        )

        jobs = [
            {
                "title": "Backend Engineer",
                "url": "https://example.com/job/2",
                "company": "Another Corp",
                "description": "Description here.",
            }
        ]

        intake.submit_jobs(jobs, source="scraper", source_label="test:source")

        queue_item = mock_queue_manager.add_item.call_args[0][0]

        # Metadata should contain job_listing_id
        assert queue_item.metadata is not None
        assert queue_item.metadata.get("job_listing_id") == "listing-456"

    def test_submit_jobs_creates_job_listing_with_full_data(self):
        """Test that full job data is stored in job_listings table."""
        mock_queue_manager = MagicMock()
        mock_queue_manager.url_exists_in_queue.return_value = False
        mock_queue_manager.add_item.return_value = "doc-id"

        mock_job_listing_storage = MagicMock()
        mock_job_listing_storage.listing_exists.return_value = False  # Job doesn't exist yet
        mock_job_listing_storage.fingerprint_exists.return_value = False  # No content dupe
        mock_job_listing_storage.get_or_create_listing.return_value = ("listing-789", True)

        intake = ScraperIntake(
            queue_manager=mock_queue_manager,
            job_listing_storage=mock_job_listing_storage,
        )

        jobs = [
            {
                "title": "Full Stack Developer",
                "url": "https://example.com/job/3",
                "company": "Tech Corp",
                "description": "This is the full job description with all details.",
                "location": "San Francisco",
                "salary": "$120k-$180k",
                "posted_date": "2025-01-10",
            }
        ]

        intake.submit_jobs(jobs, source="scraper", source_id="src-2", company_id="comp-1")

        # Verify get_or_create_listing was called with full data
        mock_job_listing_storage.get_or_create_listing.assert_called_once()
        call_kwargs = mock_job_listing_storage.get_or_create_listing.call_args[1]

        assert call_kwargs["title"] == "Full Stack Developer"
        assert call_kwargs["company_name"] == "Tech Corp"
        assert call_kwargs["description"] == "This is the full job description with all details."
        assert call_kwargs["location"] == "San Francisco"
        assert call_kwargs["salary_range"] == "$120k-$180k"


# ============================================================
# TEST: _build_final_scraped_data RETURNS MINIMAL SUMMARY
# ============================================================


class TestBuildFinalScrapedDataMinimal:
    """Tests that _build_final_scraped_data returns minimal summary only."""

    def test_returns_job_summary_not_full_data(self, job_processor):
        """Test that only summary fields are included, not full description."""
        ctx = PipelineContext(
            item=JobQueueItem(
                id="test-1",
                type=QueueItemType.JOB,
                url="https://example.com/job",
            )
        )
        ctx.job_data = {
            "title": "Software Engineer",
            "company": "Acme Corp",
            "location": "Remote",
            "description": "This is a very long description " * 100,  # Long description
            "url": "https://example.com/job",
            "salary": "$150k",
            "posted_date": "2025-01-15",
        }

        result = job_processor._build_final_scraped_data(ctx)

        # Should have job_data summary
        assert "job_data" in result
        assert result["job_data"]["title"] == "Software Engineer"
        assert result["job_data"]["company"] == "Acme Corp"
        assert result["job_data"]["location"] == "Remote"

        # Should NOT have full description or other fields
        assert "description" not in result["job_data"]
        assert "url" not in result["job_data"]
        assert "salary" not in result["job_data"]

    def test_includes_extraction_summary(self, job_processor):
        """Test that extraction summary is included."""
        ctx = PipelineContext(
            item=JobQueueItem(
                id="test-2",
                type=QueueItemType.JOB,
                url="https://example.com/job",
            )
        )
        ctx.job_data = {"title": "Engineer", "company": "Test", "location": "Remote"}

        # Mock extraction result
        mock_extraction = MagicMock()
        mock_extraction.seniority = "senior"
        mock_extraction.work_arrangement = "remote"
        ctx.extraction = mock_extraction

        result = job_processor._build_final_scraped_data(ctx)

        # Should have extraction summary
        assert "extraction" in result
        assert result["extraction"]["seniority"] == "senior"
        assert result["extraction"]["work_arrangement"] == "remote"

    def test_includes_match_score_from_match_result(self, job_processor):
        """Test that AI match score is included when available."""
        ctx = PipelineContext(
            item=JobQueueItem(
                id="test-3",
                type=QueueItemType.JOB,
                url="https://example.com/job",
            )
        )
        ctx.job_data = {"title": "Engineer", "company": "Test", "location": "Remote"}

        # Mock match result (AI analysis)
        mock_match = MagicMock()
        mock_match.match_score = 85
        ctx.match_result = mock_match

        result = job_processor._build_final_scraped_data(ctx)

        # Should have score from match_result
        assert result["score"] == 85

    def test_includes_deterministic_score_as_fallback(self, job_processor):
        """Test that deterministic score is used when no match_result."""
        ctx = PipelineContext(
            item=JobQueueItem(
                id="test-4",
                type=QueueItemType.JOB,
                url="https://example.com/job",
            )
        )
        ctx.job_data = {"title": "Engineer", "company": "Test", "location": "Remote"}

        # Mock score result (deterministic)
        mock_score = MagicMock()
        mock_score.final_score = 72
        ctx.score_result = mock_score
        ctx.match_result = None  # No AI match

        result = job_processor._build_final_scraped_data(ctx)

        # Should have score from score_result
        assert result["score"] == 72

    def test_does_not_include_analysis_result(self, job_processor):
        """Test that full analysis_result is NOT included (lives in job_matches)."""
        ctx = PipelineContext(
            item=JobQueueItem(
                id="test-5",
                type=QueueItemType.JOB,
                url="https://example.com/job",
            )
        )
        ctx.job_data = {"title": "Engineer", "company": "Test", "location": "Remote"}

        mock_match = MagicMock()
        mock_match.match_score = 90
        mock_match.to_dict.return_value = {"detailed": "analysis", "reasoning": "..."}
        ctx.match_result = mock_match

        mock_score = MagicMock()
        mock_score.to_dict.return_value = {"breakdown": "..."}
        ctx.score_result = mock_score

        result = job_processor._build_final_scraped_data(ctx)

        # Should NOT have analysis_result or filter_result keys
        assert "analysis_result" not in result
        assert "filter_result" not in result

    def test_returns_empty_dict_if_no_job_data(self, job_processor):
        """Test that empty dict is returned if no job_data."""
        ctx = PipelineContext(
            item=JobQueueItem(
                id="test-6",
                type=QueueItemType.JOB,
                url="https://example.com/job",
            )
        )
        ctx.job_data = None

        result = job_processor._build_final_scraped_data(ctx)

        # Should return empty dict
        assert result == {}


# ============================================================
# TEST: _update_listing_status CORRECT SIGNATURE
# ============================================================


class TestUpdateListingStatusSignature:
    """Tests that _update_listing_status has correct method signature."""

    def test_update_listing_status_accepts_three_params(self, job_processor):
        """Test that _update_listing_status works with listing_id, status, filter_result."""
        # Mock the job_listing_storage
        job_processor.job_listing_storage = MagicMock()

        # Should not raise - correct signature
        job_processor._update_listing_status(
            listing_id="listing-123",
            status="analyzing",
            filter_result={"extraction": {"seniority": "senior"}},
        )

        # Verify call was made with correct args
        job_processor.job_listing_storage.update_status.assert_called_once_with(
            "listing-123",
            "analyzing",
            {"extraction": {"seniority": "senior"}},
        )

    def test_update_listing_status_does_not_accept_analysis_result(self, job_processor):
        """Test that analysis_result parameter is not passed to storage."""
        job_processor.job_listing_storage = MagicMock()

        # Call _update_listing_status
        job_processor._update_listing_status(
            listing_id="listing-456",
            status="matched",
            filter_result={"extraction": {}},
        )

        # Get the call args
        call_args = job_processor.job_listing_storage.update_status.call_args

        # Should only have 3 positional args (listing_id, status, filter_result)
        assert len(call_args[0]) == 3
        assert call_args[0][0] == "listing-456"
        assert call_args[0][1] == "matched"
        assert call_args[0][2] == {"extraction": {}}

    def test_update_listing_status_handles_none_listing_id(self, job_processor):
        """Test that None listing_id is handled gracefully."""
        job_processor.job_listing_storage = MagicMock()

        # Should not raise and should not call storage
        job_processor._update_listing_status(
            listing_id=None,
            status="analyzing",
        )

        # Storage should NOT be called
        job_processor.job_listing_storage.update_status.assert_not_called()


# ============================================================
# INTEGRATION TEST: END-TO-END DATA FLOW
# ============================================================


class TestJobListingsSourceOfTruthIntegration:
    """Integration tests for job_listings as single source of truth."""

    def test_full_flow_data_in_job_listings_only(self, temp_db):
        """Test that job data is stored only in job_listings, not in queue."""
        # Setup
        queue_manager = QueueManager(db_path=temp_db)
        job_listing_storage = JobListingStorage(db_path=temp_db)

        intake = ScraperIntake(
            queue_manager=queue_manager,
            job_listing_storage=job_listing_storage,
        )

        # Submit a job
        jobs = [
            {
                "title": "Integration Test Engineer",
                "url": "https://example.com/integration-test",
                "company": "Integration Corp",
                "description": "This is the full description for integration testing.",
                "location": "Remote",
            }
        ]

        count = intake.submit_jobs(jobs, source="scraper")
        assert count == 1

        # Verify queue item has NO scraped_data
        with sqlite3.connect(temp_db) as conn:
            conn.row_factory = sqlite3.Row
            queue_row = conn.execute(
                "SELECT * FROM job_queue WHERE url = ?",
                ("https://example.com/integration-test",),
            ).fetchone()

        assert queue_row is not None
        # Output should not contain full job data
        import json

        output = json.loads(queue_row["output"]) if queue_row["output"] else {}
        assert output.get("scraped_data") is None or output.get("scraped_data") == {}

        # Verify job_listings HAS full data
        with sqlite3.connect(temp_db) as conn:
            conn.row_factory = sqlite3.Row
            listing_row = conn.execute(
                "SELECT * FROM job_listings WHERE url = ?",
                ("https://example.com/integration-test",),
            ).fetchone()

        assert listing_row is not None
        assert listing_row["title"] == "Integration Test Engineer"
        assert listing_row["company_name"] == "Integration Corp"
        assert listing_row["description"] == "This is the full description for integration testing."
        assert listing_row["location"] == "Remote"

        # Verify queue item metadata has job_listing_id
        input_data = json.loads(queue_row["input"]) if queue_row["input"] else {}
        metadata = input_data.get("metadata", {})
        assert metadata.get("job_listing_id") == listing_row["id"]
