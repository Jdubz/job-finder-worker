"""Tests for queue item processor."""

from unittest.mock import MagicMock, patch

import pytest

from job_finder.job_queue.models import (
    JobQueueItem,
    QueueItemType,
    QueueStatus,
    ScrapeConfig,
)
from job_finder.job_queue.processor import QueueItemProcessor


@pytest.fixture
def mock_managers():
    """Create mock managers for processor."""
    sources_manager = MagicMock()
    sources_manager.get_source_by_name.return_value = None

    # Config loader needs to return proper dicts for new hybrid pipeline
    config_loader = MagicMock()
    config_loader.get_title_filter.return_value = {
        "requiredKeywords": ["engineer", "developer"],
        "excludedKeywords": [],
    }
    config_loader.get_ai_settings.return_value = {
        "worker": {
            "selected": {
                "provider": "gemini",
                "interface": "api",
                "model": "gemini-2.0-flash",
            }
        },
        "documentGenerator": {
            "selected": {
                "provider": "gemini",
                "interface": "api",
                "model": "gemini-2.0-flash",
            }
        },
    }
    config_loader.get_prefilter_policy.return_value = {
        "title": {"requiredKeywords": [], "excludedKeywords": []},
        "freshness": {"maxAgeDays": 0},
        "workArrangement": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": True,
            "willRelocate": True,
            "userLocation": "Portland, OR",
        },
        "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
        "salary": {"minimum": None},
        "technology": {"rejected": []},
    }

    return {
        "queue_manager": MagicMock(has_company_task=MagicMock(return_value=False)),
        "config_loader": config_loader,
        "job_storage": MagicMock(),
        "job_listing_storage": MagicMock(),
        "companies_manager": MagicMock(),
        "sources_manager": sources_manager,
        "company_info_fetcher": MagicMock(),
        "ai_matcher": MagicMock(),
    }


@pytest.fixture
def processor(mock_managers):
    """Create processor with mocked dependencies."""
    # Patch ScrapeRunner and provider creation to avoid creating real instances
    with (
        patch(
            "job_finder.job_queue.processors.job_processor.ScrapeRunner"
        ) as mock_scrape_runner_class,
        patch(
            "job_finder.job_queue.processors.job_processor.create_provider_from_config"
        ) as mock_create_provider,
    ):
        mock_scrape_runner_instance = MagicMock()
        mock_scrape_runner_class.return_value = mock_scrape_runner_instance
        mock_create_provider.return_value = MagicMock()  # Mock provider

        processor_instance = QueueItemProcessor(**mock_managers)

        # Store reference to mock scrape_runner for tests to access
        # Note: After refactoring, scrape_runner is on job_processor
        processor_instance.scrape_runner = mock_scrape_runner_instance
        processor_instance.job_processor.scrape_runner = mock_scrape_runner_instance

        # Mock extractor and scoring engine to avoid real AI calls
        from job_finder.ai.extraction import JobExtractionResult
        from job_finder.scoring.engine import ScoreBreakdown

        class MockExtractor:
            def extract(self, title, description, location=None, posted_date=None):
                return JobExtractionResult(
                    seniority="senior",
                    work_arrangement="remote",
                    technologies=["python"],
                )

        class MockScoringEngine:
            def score(self, extraction, job_title, job_description, company_data=None):
                from job_finder.scoring.engine import ScoreAdjustment

                return ScoreBreakdown(
                    base_score=50,
                    final_score=85,
                    adjustments=[
                        ScoreAdjustment(category="mock", reason="Mock scoring", points=35)
                    ],
                    passed=True,
                )

        processor_instance.job_processor.extractor = MockExtractor()
        processor_instance.job_processor.scoring_engine = MockScoringEngine()

        # Set min_match_score on ai_matcher to avoid MagicMock comparison issues
        processor_instance.job_processor.ai_matcher.min_match_score = 60

        # Prevent _refresh_runtime_config from overwriting mocks
        processor_instance.job_processor._refresh_runtime_config = lambda: None

        return processor_instance


@pytest.fixture
def sample_job_item():
    """Create a sample job queue item."""
    return JobQueueItem(
        id="test-job-123",
        type=QueueItemType.JOB,
        url="https://example.com/job/123",
        company_name="Test Company",
        source="scraper",
    )


@pytest.fixture
def sample_company_item():
    """Create a sample company queue item."""
    return JobQueueItem(
        id="test-company-456",
        type=QueueItemType.COMPANY,
        url="https://testcompany.com",
        company_name="Test Company",
        source="scraper",
    )


def test_process_item_without_id(processor, mock_managers):
    """Test that items without ID are rejected."""
    item = JobQueueItem(
        id=None,
        type=QueueItemType.JOB,
        url="https://example.com/job",
        company_name="Test Corp",
        source="scraper",
    )

    processor.process_item(item)

    # Should not update status since ID is None
    mock_managers["queue_manager"].update_status.assert_not_called()


# NOTE: Stop list tests removed - stop lists were intentionally removed
# during hybrid scoring migration in favor of title filter + scoring engine.

# NOTE: test_process_job_already_exists was removed because job deduplication
# now happens in scraper_intake.submit_jobs(), not in processor.process_item().
# See tests/queue/test_scraper_intake.py for deduplication tests.


# Legacy company processing tests removed - see test_company_pipeline.py for granular pipeline tests


def test_handle_failure_retry(processor, mock_managers):
    """Test failure handling."""
    item = JobQueueItem(
        id="test-123",
        type=QueueItemType.JOB,
        url="https://example.com/job",
        company_name="Test Corp",
        source="scraper",
    )

    processor._handle_failure(item, "Test error")

    # Should mark failed immediately
    call_args = mock_managers["queue_manager"].update_status.call_args[0]
    assert call_args[1] == QueueStatus.FAILED
    assert "failed" in call_args[2].lower()


def test_handle_failure_max_retries(processor, mock_managers):
    """Test failure handling marks item as failed."""
    item = JobQueueItem(
        id="test-123",
        type=QueueItemType.JOB,
        url="https://example.com/job",
        company_name="Test Corp",
        source="scraper",
    )

    processor._handle_failure(item, "Test error")

    call_args = mock_managers["queue_manager"].update_status.call_args[0]
    assert call_args[1] == QueueStatus.FAILED
    assert "failed" in call_args[2].lower()


def test_single_task_pipeline_spawns_company_enrichment(processor, mock_managers, sample_job_item):
    """Single-task pipeline should spawn company enrichment in background (fire-and-forget)."""
    # Company exists but has incomplete data (no about/culture)
    incomplete_company = {
        "id": "comp-incomplete",
        "name": "Spawn Co",
        "about": "",  # Empty - triggers waiting for enrichment
        "culture": "",
    }
    mock_managers["companies_manager"].get_company.return_value = incomplete_company
    mock_managers["companies_manager"].has_good_company_data.return_value = False
    mock_managers["companies_manager"].create_company_stub.return_value = incomplete_company
    # No source resolution - fall through to direct company lookup
    mock_managers["sources_manager"].resolve_company_from_source.return_value = None

    # Provide scraped_data so we skip the scrape stage
    sample_job_item.scraped_data = {
        "title": "Senior Engineer",  # Must match title filter (contains "engineer")
        "company": "Spawn Co",
        "company_website": "https://spawn.example",
        "description": "A" * 200,
        "url": "https://spawn.example/job/123",
    }

    mock_managers["job_listing_storage"].get_or_create_listing.return_value = ("listing-123", True)

    processor.job_processor.process_job(sample_job_item)

    # Should spawn enrichment and requeue while waiting for richer data
    assert mock_managers["queue_manager"].spawn_item_safely.called
    mock_managers["queue_manager"].requeue_with_state.assert_called_once()
    requeue_call = mock_managers["queue_manager"].requeue_with_state.call_args
    assert "waiting_for_company_id" in requeue_call[0][1]


def test_single_task_pipeline_completes_to_match(processor, mock_managers, sample_job_item):
    """Single-task pipeline should complete all stages and save job match."""

    class DummyResult:
        match_score = 95

        def to_dict(self):
            return {
                "match_score": self.match_score,
            }

    complete_company = {
        "id": "comp-1",
        "name": "Ready Co",
        "about": "About text with enough content to pass the quality check",
        "culture": "Culture text with enough content",
    }

    # Mock source resolution to return None (no source match, use company lookup)
    mock_managers["sources_manager"].resolve_company_from_source.return_value = None

    # Data-based check: company has good data
    mock_managers["companies_manager"].get_company.return_value = complete_company
    mock_managers["companies_manager"].has_good_company_data.return_value = True
    processor.job_processor.ai_matcher.analyze_job = MagicMock(return_value=DummyResult())
    mock_managers["job_storage"].save_job_match.return_value = "match-456"
    mock_managers["job_listing_storage"].get_or_create_listing.return_value = ("listing-456", True)

    # Provide scraped_data so we skip the scrape stage
    sample_job_item.scraped_data = {
        "title": "Senior Engineer",  # Must match title filter
        "company": "Ready Co",
        "company_website": "https://ready.example",
        "description": "A" * 200,
        "url": "https://ready.example/job/456",
    }

    processor.job_processor.process_job(sample_job_item)

    # AI analysis should be called
    processor.job_processor.ai_matcher.analyze_job.assert_called_once()
    # Job match should be saved (single-task completes to save)
    mock_managers["job_storage"].save_job_match.assert_called_once()
    # Queue should be updated to SUCCESS
    success_calls = [
        call
        for call in mock_managers["queue_manager"].update_status.call_args_list
        if call[0][1] == QueueStatus.SUCCESS
    ]
    assert len(success_calls) == 1
    assert "match-456" in success_calls[0][0][2] or "95" in success_calls[0][0][2]


def test_single_task_pipeline_handles_aggregator_source_name(
    processor, mock_managers, sample_job_item
):
    """Aggregator source with source name as company (e.g., 'RemoteOK API') skips company creation."""

    # Provide scraped_data with source name as company (scraper bug scenario)
    sample_job_item.scraped_data = {
        "title": "Senior Engineer",  # Must match title filter
        "company": "RemoteOK API",  # This IS a source name, should be skipped
        "company_website": "https://remoteok.com",
        "description": "A" * 200,
        "url": "https://remoteok.com/job/123",
    }

    # Mock resolve_company_from_source for aggregator
    mock_managers["sources_manager"].resolve_company_from_source.return_value = {
        "company_id": None,
        "is_aggregator": True,
        "aggregator_domain": "remoteok.com",
        "source_id": "src_remoteok",
        "source_name": "RemoteOK API",
    }

    class DummyResult:
        match_score = 75

        def to_dict(self):
            return {
                "match_score": self.match_score,
            }

    processor.job_processor.ai_matcher.analyze_job = MagicMock(return_value=DummyResult())
    mock_managers["job_storage"].save_job_match.return_value = "match-789"
    mock_managers["job_listing_storage"].get_or_create_listing.return_value = ("listing-789", True)

    processor.job_processor.process_job(sample_job_item)

    # AI analysis should proceed even without company data
    processor.job_processor.ai_matcher.analyze_job.assert_called_once()
    # Should NOT create company stub for source names
    mock_managers["companies_manager"].create_company_stub.assert_not_called()
    # Should not try to update company_id on listing
    mock_managers["job_listing_storage"].update_company_id.assert_not_called()


def test_single_task_pipeline_spawns_company_for_real_company_from_aggregator(
    processor, mock_managers, sample_job_item
):
    """Aggregator source with REAL company name should create company stub and spawn COMPANY task."""

    # Provide scraped_data with a REAL company name (not the aggregator name)
    sample_job_item.scraped_data = {
        "title": "Senior Engineer",  # Must match title filter
        "company": "Speechify, Inc.",  # This is a REAL company, should be discovered
        "company_website": "https://speechify.com",
        "description": "A" * 200,
        "url": "https://remotive.com/job/123",
    }

    # Source is an aggregator (Remotive), but company is real (Speechify)
    mock_managers["sources_manager"].resolve_company_from_source.return_value = {
        "company_id": None,
        "is_aggregator": True,
        "aggregator_domain": "remotive.com",
        "source_id": "src_remotive",
        "source_name": "Remotive - Software Development",
    }

    # Company doesn't exist yet, will create stub
    incomplete_company = {
        "id": "comp-speechify",
        "name": "Speechify, Inc.",
        "about": "",
        "culture": "",
    }
    mock_managers["companies_manager"].get_company.return_value = None
    mock_managers["companies_manager"].create_company_stub.return_value = incomplete_company
    mock_managers["companies_manager"].has_good_company_data.return_value = False

    mock_managers["job_listing_storage"].get_or_create_listing.return_value = ("listing-agg", True)

    processor.job_processor.process_job(sample_job_item)

    # Should create company stub for real company
    mock_managers["companies_manager"].create_company_stub.assert_called_once()
    stub_call_args = mock_managers["companies_manager"].create_company_stub.call_args
    assert "Speechify" in stub_call_args[0][0]  # First positional arg is company name

    # Should spawn COMPANY task for enrichment and requeue to wait
    assert mock_managers["queue_manager"].spawn_item_safely.called
    mock_managers["queue_manager"].requeue_with_state.assert_called_once()


def test_build_company_info_string(processor):
    """Test company info string builder."""
    company_info = {
        "about": "We build great software",
        "culture": "Remote-first, collaborative",
        "mission": "To make work better",
    }

    from job_finder.utils.company_info import build_company_info_string

    result = build_company_info_string(company_info)

    assert "About: We build great software" in result
    assert "Culture: Remote-first, collaborative" in result
    assert "Mission: To make work better" in result


def test_build_company_info_string_partial(processor):
    """Test company info string with partial data."""
    company_info = {
        "about": "We build great software",
        "culture": "",
        "mission": None,
    }

    from job_finder.utils.company_info import build_company_info_string

    result = build_company_info_string(company_info)

    assert "About: We build great software" in result
    assert "Culture:" not in result
    assert "Mission:" not in result


# SCRAPE Queue Item Tests


@pytest.fixture
def sample_scrape_item():
    """Create a sample scrape queue item."""
    return JobQueueItem(
        id="test-scrape-789",
        type=QueueItemType.SCRAPE,
        source="user_submission",
        scrape_config=ScrapeConfig(
            target_matches=5,
            max_sources=20,
            source_ids=None,
        ),
    )


def test_process_scrape_with_default_config(processor, mock_managers, sample_scrape_item):
    """Test processing SCRAPE item with default configuration."""
    # Mock scrape runner
    processor.scrape_runner.run_scrape.return_value = {
        "sources_scraped": 3,
        "jobs_submitted": 5,
    }

    processor.process_item(sample_scrape_item)

    # Should call scrape runner with config values
    processor.scrape_runner.run_scrape.assert_called_once_with(
        target_matches=5, max_sources=20, source_ids=None
    )

    # Should update to SUCCESS
    call_args = mock_managers["queue_manager"].update_status.call_args_list
    success_call = None
    for call in call_args:
        if call[0][1] == QueueStatus.SUCCESS:
            success_call = call
            break

    assert success_call is not None
    assert "3 sources" in success_call[0][2]
    assert "5 jobs" in success_call[0][2]


def test_process_scrape_with_custom_config(processor, mock_managers):
    """Test processing SCRAPE item with custom configuration."""
    # Create scrape item with custom config
    scrape_item = JobQueueItem(
        id="test-scrape-custom",
        type=QueueItemType.SCRAPE,
        source="user_submission",
        scrape_config=ScrapeConfig(
            target_matches=10,
            max_sources=50,
            source_ids=["source-1", "source-2"],
        ),
    )

    # Mock scrape runner
    processor.scrape_runner.run_scrape.return_value = {
        "sources_scraped": 2,
        "jobs_submitted": 8,
    }

    processor.process_item(scrape_item)

    # Should call scrape runner with custom values
    processor.scrape_runner.run_scrape.assert_called_once_with(
        target_matches=10, max_sources=50, source_ids=["source-1", "source-2"]
    )

    # Should update to SUCCESS
    call_args = mock_managers["queue_manager"].update_status.call_args_list
    success_call = None
    for call in call_args:
        if call[0][1] == QueueStatus.SUCCESS:
            success_call = call
            break

    assert success_call is not None


def test_process_scrape_with_none_values(processor, mock_managers):
    """Test processing SCRAPE item with None values (unlimited)."""
    # Create scrape item with None values
    scrape_item = JobQueueItem(
        id="test-scrape-unlimited",
        type=QueueItemType.SCRAPE,
        source="automated_scan",
        scrape_config=ScrapeConfig(
            target_matches=None,  # Unlimited
            max_sources=None,  # Unlimited
            source_ids=None,
        ),
    )

    # Mock scrape runner
    processor.scrape_runner.run_scrape.return_value = {
        "sources_scraped": 100,
        "jobs_submitted": 25,
    }

    processor.process_item(scrape_item)

    # Should call scrape runner with None values
    processor.scrape_runner.run_scrape.assert_called_once_with(
        target_matches=None, max_sources=None, source_ids=None
    )


def test_process_scrape_no_config(processor, mock_managers):
    """Test processing SCRAPE item without scrape_config (should use defaults)."""
    # Create scrape item without config
    scrape_item = JobQueueItem(
        id="test-scrape-no-config",
        type=QueueItemType.SCRAPE,
        source="automated_scan",
        scrape_config=None,
    )

    # Mock scrape runner
    processor.scrape_runner.run_scrape.return_value = {
        "sources_scraped": 5,
        "jobs_submitted": 3,
    }

    processor.process_item(scrape_item)

    # Should call scrape runner with defaults (from ScrapeConfig())
    processor.scrape_runner.run_scrape.assert_called_once_with(
        target_matches=None, max_sources=None, source_ids=None
    )


def test_process_scrape_error_handling(processor, mock_managers):
    """Test error handling when scrape fails."""
    scrape_item = JobQueueItem(
        id="test-scrape-error",
        type=QueueItemType.SCRAPE,
        source="user_submission",
        scrape_config=ScrapeConfig(),
    )

    # Mock scrape runner to raise exception
    processor.scrape_runner.run_scrape.side_effect = Exception("Network error")

    # Mock queue settings
    mock_managers["config_loader"].get_queue_settings.return_value = {"maxRetries": 3}

    processor.process_item(scrape_item)

    # Should update to FAILED or PENDING for retry
    call_args = mock_managers["queue_manager"].update_status.call_args_list
    has_failure_or_retry = any(
        call[0][1] in [QueueStatus.FAILED, QueueStatus.PENDING] for call in call_args
    )
    assert has_failure_or_retry


def test_process_scrape_no_jobs_found(processor, mock_managers):
    """Test processing SCRAPE when no jobs are found."""
    scrape_item = JobQueueItem(
        id="test-scrape-none",
        type=QueueItemType.SCRAPE,
        source="automated_scan",
        scrape_config=ScrapeConfig(),
    )

    # Mock scrape runner with no results
    processor.scrape_runner.run_scrape.return_value = {
        "sources_scraped": 3,
        "jobs_submitted": 0,
    }

    processor.process_item(scrape_item)

    # Should still update to SUCCESS (no jobs is not an error)
    call_args = mock_managers["queue_manager"].update_status.call_args_list
    success_call = None
    for call in call_args:
        if call[0][1] == QueueStatus.SUCCESS:
            success_call = call
            break

    assert success_call is not None
    assert "0 jobs" in success_call[0][2]
