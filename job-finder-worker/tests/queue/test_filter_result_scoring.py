"""Tests for scoring data in filter_result.

These tests verify that scoring breakdown data is properly saved to filter_result
in all pipeline finalization paths, enabling the UI to display WHY jobs were
scored/skipped/failed.

This prevents regression of the bug where scoring data was only saved for
matched jobs but not for skipped/failed jobs.
"""

import json
import os
import sqlite3
import tempfile
from typing import Any, Dict, Optional
from unittest.mock import MagicMock, patch

import pytest

from job_finder.ai.extraction import JobExtractionResult
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import JobQueueItem, ProcessorContext, QueueItemType
from job_finder.job_queue.processors.job_processor import JobProcessor, PipelineContext
from job_finder.scoring.engine import ScoreAdjustment, ScoreBreakdown
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
            conn.execute(
                """
                CREATE TABLE job_queue (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    url TEXT UNIQUE,
                    tracking_id TEXT,
                    parent_item_id TEXT,
                    input TEXT,
                    output TEXT,
                    result_message TEXT,
                    error_details TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    processed_at TEXT,
                    completed_at TEXT
                )
            """
            )
            # Create job_listings table
            conn.execute(
                """
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
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """
            )
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
            "unknownTimezoneScore": -5,
            "remoteScore": 5,
            "relocationScore": -50,
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
            "equityScore": 5,
            "contractScore": -15,
            "missingSalaryScore": -5,
            "meetsTargetScore": 5,
        },
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
    return config_loader


@pytest.fixture
def job_processor(queue_manager, mock_config_loader, job_listing_storage):
    """Create job processor with real job_listing_storage."""
    with patch("job_finder.job_queue.processors.job_processor.AgentManager"):
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


@pytest.fixture
def sample_extraction() -> JobExtractionResult:
    """Create a sample extraction result for testing."""
    return JobExtractionResult(
        seniority="senior",
        work_arrangement="remote",
        timezone=-8.0,
        city=None,
        salary_min=150000,
        salary_max=200000,
        experience_min=5,
        experience_max=10,
        technologies=["python", "react", "aws"],
        employment_type="full_time",
        days_old=2,
        is_repost=False,
        relocation_required=False,
        includes_equity=True,
        is_contract=False,
        is_management=False,
        is_lead=False,
        role_types=["backend", "fullstack"],
    )


@pytest.fixture
def sample_score_passed() -> ScoreBreakdown:
    """Create a sample passing score breakdown."""
    return ScoreBreakdown(
        base_score=50,
        final_score=75,
        adjustments=[
            ScoreAdjustment(category="seniority", reason="Preferred seniority 'senior'", points=15),
            ScoreAdjustment(category="location", reason="Remote position", points=5),
            ScoreAdjustment(category="skills", reason="Matched: python (3.0y -> +2.5)", points=5),
        ],
        passed=True,
        rejection_reason=None,
    )


@pytest.fixture
def sample_score_failed() -> ScoreBreakdown:
    """Create a sample failing score breakdown."""
    return ScoreBreakdown(
        base_score=50,
        final_score=45,
        adjustments=[
            ScoreAdjustment(category="seniority", reason="Acceptable seniority 'mid'", points=0),
            ScoreAdjustment(category="location", reason="Unknown timezone", points=-5),
            ScoreAdjustment(category="skills", reason="Missing: golang, kubernetes", points=-10),
        ],
        passed=False,
        rejection_reason="Score 45 below threshold 60",
    )


def get_filter_result_from_db(db_path: str, listing_id: str) -> Optional[Dict[str, Any]]:
    """Helper to fetch and parse filter_result from database."""
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT filter_result FROM job_listings WHERE id = ?", (listing_id,)
        ).fetchone()
        if row and row["filter_result"]:
            return json.loads(row["filter_result"])
        return None


# ============================================================
# TEST: _finalize_skipped INCLUDES SCORING DATA
# ============================================================


class TestFinalizeSkippedIncludesScoring:
    """Tests that _finalize_skipped saves scoring data to filter_result."""

    def test_finalize_skipped_includes_scoring_breakdown(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_failed
    ):
        """Test that skipped jobs have scoring data in filter_result."""
        # Create a job listing
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/skipped-1",
            title="Software Engineer",
            company_name="Test Corp",
            description="Test job description",
        )

        # Create pipeline context with extraction and scoring
        item = JobQueueItem(
            id="test-skipped-1",
            type=QueueItemType.JOB,
            url="https://example.com/job/skipped-1",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = sample_score_failed
        ctx.job_data = {"title": "Software Engineer", "company": "Test Corp"}

        # Execute finalize_skipped
        job_processor._finalize_skipped(ctx, "Score 45 below threshold 60")

        # Verify filter_result includes scoring
        filter_result = get_filter_result_from_db(temp_db, listing_id)
        assert filter_result is not None
        assert "scoring" in filter_result
        assert filter_result["scoring"]["baseScore"] == 50
        assert filter_result["scoring"]["finalScore"] == 45
        assert filter_result["scoring"]["passed"] is False
        assert len(filter_result["scoring"]["adjustments"]) == 3

    def test_finalize_skipped_includes_all_score_adjustments(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_failed
    ):
        """Test that all score adjustments are preserved in filter_result."""
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/skipped-2",
            title="Backend Developer",
            company_name="Acme Inc",
            description="Build backend services",
        )

        item = JobQueueItem(
            id="test-skipped-2",
            type=QueueItemType.JOB,
            url="https://example.com/job/skipped-2",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = sample_score_failed
        ctx.job_data = {"title": "Backend Developer"}

        job_processor._finalize_skipped(ctx, "Test skip reason")

        filter_result = get_filter_result_from_db(temp_db, listing_id)
        adjustments = filter_result["scoring"]["adjustments"]

        # Verify each adjustment has category, reason, and points
        for adj in adjustments:
            assert "category" in adj
            assert "reason" in adj
            assert "points" in adj

        # Verify specific adjustments
        categories = [adj["category"] for adj in adjustments]
        assert "seniority" in categories
        assert "location" in categories
        assert "skills" in categories

    def test_finalize_skipped_includes_extraction_data(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_failed
    ):
        """Test that extraction data is also preserved alongside scoring."""
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/skipped-3",
            title="Full Stack Engineer",
            company_name="Tech Startup",
            description="Join our team",
        )

        item = JobQueueItem(
            id="test-skipped-3",
            type=QueueItemType.JOB,
            url="https://example.com/job/skipped-3",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = sample_score_failed
        ctx.job_data = {"title": "Full Stack Engineer"}

        job_processor._finalize_skipped(ctx, "Below threshold")

        filter_result = get_filter_result_from_db(temp_db, listing_id)

        # Verify both extraction AND scoring are present
        assert "extraction" in filter_result
        assert "scoring" in filter_result
        assert "skip_reason" in filter_result

        # Verify extraction data
        assert filter_result["extraction"]["seniority"] == "senior"
        assert filter_result["extraction"]["workArrangement"] == "remote"
        assert "python" in filter_result["extraction"]["technologies"]

    def test_finalize_skipped_handles_missing_score_result(
        self, job_processor, job_listing_storage, temp_db, sample_extraction
    ):
        """Test that skipped jobs without score_result still work (scoring=None)."""
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/skipped-no-score",
            title="Early Skip Job",
            company_name="Test Corp",
            description="Skipped before scoring",
        )

        item = JobQueueItem(
            id="test-no-score",
            type=QueueItemType.JOB,
            url="https://example.com/job/skipped-no-score",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = None  # No scoring performed
        ctx.job_data = {"title": "Early Skip Job"}

        job_processor._finalize_skipped(ctx, "Skipped before scoring stage")

        filter_result = get_filter_result_from_db(temp_db, listing_id)
        assert filter_result is not None
        assert "extraction" in filter_result
        assert filter_result["scoring"] is None
        assert filter_result["skip_reason"] == "Skipped before scoring stage"


# ============================================================
# TEST: _finalize_failed INCLUDES SCORING DATA
# ============================================================


class TestFinalizeFailedIncludesScoring:
    """Tests that _finalize_failed saves scoring data when available."""

    def test_finalize_failed_includes_scoring_when_available(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_passed
    ):
        """Test that failed jobs preserve scoring data if available."""
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/failed-1",
            title="ML Engineer",
            company_name="AI Corp",
            description="Build ML pipelines",
        )

        item = JobQueueItem(
            id="test-failed-1",
            type=QueueItemType.JOB,
            url="https://example.com/job/failed-1",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = sample_score_passed  # Had scoring before failure
        ctx.job_data = {"title": "ML Engineer"}

        job_processor._finalize_failed(ctx, "AI analysis timeout")

        filter_result = get_filter_result_from_db(temp_db, listing_id)
        assert filter_result is not None
        assert "scoring" in filter_result
        assert filter_result["scoring"]["finalScore"] == 75
        assert filter_result["error"] == "AI analysis timeout"

    def test_finalize_failed_without_scoring(
        self, job_processor, job_listing_storage, temp_db, sample_extraction
    ):
        """Test that failed jobs without scoring still save extraction."""
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/failed-2",
            title="DevOps Engineer",
            company_name="Cloud Inc",
            description="Manage infrastructure",
        )

        item = JobQueueItem(
            id="test-failed-2",
            type=QueueItemType.JOB,
            url="https://example.com/job/failed-2",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = None  # Failed before scoring
        ctx.job_data = {"title": "DevOps Engineer"}

        job_processor._finalize_failed(ctx, "Extraction failed")

        filter_result = get_filter_result_from_db(temp_db, listing_id)
        assert filter_result is not None
        assert "extraction" in filter_result
        assert "scoring" not in filter_result  # No scoring key when None
        assert filter_result["error"] == "Extraction failed"

    def test_finalize_failed_preserves_all_data(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_failed
    ):
        """Test that all available data is preserved on failure."""
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/failed-3",
            title="Platform Engineer",
            company_name="Scale Corp",
            description="Build platform services",
        )

        item = JobQueueItem(
            id="test-failed-3",
            type=QueueItemType.JOB,
            url="https://example.com/job/failed-3",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = sample_score_failed
        ctx.job_data = {"title": "Platform Engineer"}

        job_processor._finalize_failed(ctx, "Database connection error")

        filter_result = get_filter_result_from_db(temp_db, listing_id)

        # All three keys should be present
        assert "extraction" in filter_result
        assert "scoring" in filter_result
        assert "error" in filter_result

        # Verify data integrity
        assert filter_result["extraction"]["seniority"] == "senior"
        assert filter_result["scoring"]["finalScore"] == 45
        assert filter_result["error"] == "Database connection error"


# ============================================================
# TEST: _execute_save_match INCLUDES SCORING DATA
# ============================================================


class TestExecuteSaveMatchIncludesScoring:
    """Tests that matched jobs have scoring data in filter_result."""

    def test_execute_save_match_includes_scoring(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_passed
    ):
        """Test that matched jobs include scoring breakdown."""
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/matched-1",
            title="Senior Python Developer",
            company_name="Great Company",
            description="Amazing opportunity",
        )

        item = JobQueueItem(
            id="test-matched-1",
            type=QueueItemType.JOB,
            url="https://example.com/job/matched-1",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = sample_score_passed

        # Mock the match result and job storage
        ctx.match_result = MagicMock()
        ctx.match_result.match_score = 85
        job_processor.job_storage.save_job_match.return_value = "match-doc-id"

        # Execute save match
        job_processor._execute_save_match(ctx)

        # Verify scoring is in filter_result
        filter_result = get_filter_result_from_db(temp_db, listing_id)
        assert filter_result is not None
        assert "scoring" in filter_result
        assert filter_result["scoring"]["baseScore"] == 50
        assert filter_result["scoring"]["finalScore"] == 75
        assert filter_result["scoring"]["passed"] is True


# ============================================================
# TEST: SCORING DATA FORMAT MATCHES UI EXPECTATIONS
# ============================================================


class TestScoringDataFormatMatchesUI:
    """Tests that scoring data format matches what the UI expects."""

    def test_scoring_data_uses_camelcase_keys(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_failed
    ):
        """Test that scoring uses camelCase keys for frontend compatibility."""
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/format-test",
            title="Format Test Job",
            company_name="Test Corp",
            description="Testing format",
        )

        item = JobQueueItem(
            id="format-test",
            type=QueueItemType.JOB,
            url="https://example.com/job/format-test",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = sample_score_failed
        ctx.job_data = {"title": "Format Test Job"}

        job_processor._finalize_skipped(ctx, "Test")

        filter_result = get_filter_result_from_db(temp_db, listing_id)
        scoring = filter_result["scoring"]

        # UI expects camelCase keys (from ScoreBreakdown.to_dict())
        assert "baseScore" in scoring  # Not base_score
        assert "finalScore" in scoring  # Not final_score
        assert "adjustments" in scoring
        assert "passed" in scoring
        assert "rejectionReason" in scoring  # Not rejection_reason

    def test_adjustment_format_matches_ui(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_failed
    ):
        """Test that adjustments have the format expected by UI components."""
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/adj-format-test",
            title="Adjustment Format Test",
            company_name="Test Corp",
            description="Testing adjustment format",
        )

        item = JobQueueItem(
            id="adj-format-test",
            type=QueueItemType.JOB,
            url="https://example.com/job/adj-format-test",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = sample_score_failed
        ctx.job_data = {"title": "Adjustment Format Test"}

        job_processor._finalize_skipped(ctx, "Test")

        filter_result = get_filter_result_from_db(temp_db, listing_id)
        adjustments = filter_result["scoring"]["adjustments"]

        # UI iterates over adjustments expecting these exact keys
        for adj in adjustments:
            assert set(adj.keys()) == {"category", "reason", "points"}
            assert isinstance(adj["category"], str)
            assert isinstance(adj["reason"], str)
            assert isinstance(adj["points"], (int, float))


# ============================================================
# TEST: REGRESSION PREVENTION
# ============================================================


class TestScoringDataRegression:
    """Tests specifically designed to catch regressions in scoring data storage."""

    def test_skipped_job_has_scoring_not_just_skip_reason(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_failed
    ):
        """
        REGRESSION TEST: Ensure skipped jobs include scoring breakdown.

        Previously, _finalize_skipped only saved extraction and skip_reason,
        omitting the scoring breakdown. This test catches that regression.
        """
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/regression-1",
            title="Regression Test Job",
            company_name="Test Corp",
            description="Prevents regression",
        )

        item = JobQueueItem(
            id="regression-1",
            type=QueueItemType.JOB,
            url="https://example.com/job/regression-1",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = sample_score_failed
        ctx.job_data = {"title": "Regression Test Job"}

        job_processor._finalize_skipped(ctx, sample_score_failed.rejection_reason)

        filter_result = get_filter_result_from_db(temp_db, listing_id)

        # This assertion would have failed before the fix
        assert filter_result.get("scoring") is not None, (
            "REGRESSION: Skipped jobs must include scoring data so UI can show "
            "why the job was skipped. Found only: " + str(filter_result.keys())
        )

    def test_all_finalization_paths_include_available_scoring(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_passed
    ):
        """
        REGRESSION TEST: All finalization paths must include scoring when available.

        Tests all three finalization methods to ensure consistency:
        - _finalize_skipped
        - _finalize_failed
        - _execute_save_match
        """
        # Test skipped path
        listing_id_skipped = job_listing_storage.create_listing(
            url="https://example.com/job/path-skipped",
            title="Skipped Path",
            company_name="Test",
            description="Test",
        )
        ctx_skipped = PipelineContext(
            item=JobQueueItem(
                id="path-skipped",
                type=QueueItemType.JOB,
                url="https://example.com/job/path-skipped",
            )
        )
        ctx_skipped.listing_id = listing_id_skipped
        ctx_skipped.extraction = sample_extraction
        ctx_skipped.score_result = sample_score_passed
        ctx_skipped.job_data = {"title": "Skipped Path"}
        job_processor._finalize_skipped(ctx_skipped, "Test skip")

        # Test failed path
        listing_id_failed = job_listing_storage.create_listing(
            url="https://example.com/job/path-failed",
            title="Failed Path",
            company_name="Test",
            description="Test",
        )
        ctx_failed = PipelineContext(
            item=JobQueueItem(
                id="path-failed", type=QueueItemType.JOB, url="https://example.com/job/path-failed"
            )
        )
        ctx_failed.listing_id = listing_id_failed
        ctx_failed.extraction = sample_extraction
        ctx_failed.score_result = sample_score_passed
        ctx_failed.job_data = {"title": "Failed Path"}
        job_processor._finalize_failed(ctx_failed, "Test error")

        # Test matched path
        listing_id_matched = job_listing_storage.create_listing(
            url="https://example.com/job/path-matched",
            title="Matched Path",
            company_name="Test",
            description="Test",
        )
        ctx_matched = PipelineContext(
            item=JobQueueItem(
                id="path-matched",
                type=QueueItemType.JOB,
                url="https://example.com/job/path-matched",
            )
        )
        ctx_matched.listing_id = listing_id_matched
        ctx_matched.extraction = sample_extraction
        ctx_matched.score_result = sample_score_passed
        ctx_matched.match_result = MagicMock()
        ctx_matched.match_result.match_score = 85
        job_processor.job_storage.save_job_match.return_value = "match-id"
        job_processor._execute_save_match(ctx_matched)

        # Verify all three have scoring
        for listing_id, path_name in [
            (listing_id_skipped, "skipped"),
            (listing_id_failed, "failed"),
            (listing_id_matched, "matched"),
        ]:
            filter_result = get_filter_result_from_db(temp_db, listing_id)
            assert (
                filter_result.get("scoring") is not None
            ), f"REGRESSION: {path_name} path must include scoring data"
            assert (
                filter_result["scoring"]["finalScore"] == 75
            ), f"REGRESSION: {path_name} path has wrong finalScore"

    def test_ui_can_render_scoring_breakdown_from_filter_result(
        self, job_processor, job_listing_storage, temp_db, sample_extraction, sample_score_failed
    ):
        """
        REGRESSION TEST: Verify filter_result structure matches UI expectations.

        The UI component (JobListingModalContent.tsx) expects:
        - listing.filterResult?.scoring.baseScore
        - listing.filterResult?.scoring.finalScore
        - listing.filterResult?.scoring.adjustments[].category
        - listing.filterResult?.scoring.adjustments[].reason
        - listing.filterResult?.scoring.adjustments[].points
        """
        listing_id = job_listing_storage.create_listing(
            url="https://example.com/job/ui-render-test",
            title="UI Render Test",
            company_name="Test Corp",
            description="Testing UI rendering",
        )

        item = JobQueueItem(
            id="ui-render-test",
            type=QueueItemType.JOB,
            url="https://example.com/job/ui-render-test",
        )
        ctx = PipelineContext(item=item)
        ctx.listing_id = listing_id
        ctx.extraction = sample_extraction
        ctx.score_result = sample_score_failed
        ctx.job_data = {"title": "UI Render Test"}

        job_processor._finalize_skipped(ctx, "Below threshold")

        filter_result = get_filter_result_from_db(temp_db, listing_id)

        # Simulate what the UI does
        scoring = filter_result.get("scoring")
        assert scoring is not None, "UI would show 'No scoring data available'"

        # These are the exact paths the UI accesses
        base_score = scoring.get("baseScore")
        final_score = scoring.get("finalScore")
        adjustments = scoring.get("adjustments", [])

        assert base_score is not None, "UI needs baseScore"
        assert final_score is not None, "UI needs finalScore"
        assert len(adjustments) > 0, "UI should display adjustments"

        # UI iterates adjustments like: adj.category, adj.reason, adj.points
        for adj in adjustments:
            assert adj.get("category"), "UI needs adj.category"
            assert adj.get("reason"), "UI needs adj.reason"
            assert "points" in adj, "UI needs adj.points"
