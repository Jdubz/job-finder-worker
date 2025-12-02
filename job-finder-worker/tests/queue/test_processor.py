"""Tests for queue item processor."""

from unittest.mock import MagicMock, patch

import pytest

from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus, ScrapeConfig
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
    config_loader.get_scoring_config.return_value = {
        "minScore": 60,
        "weights": {"skillMatch": 40, "experienceMatch": 30, "seniorityMatch": 30},
        "seniority": {
            "preferred": ["senior"],
            "acceptable": ["mid"],
            "rejected": ["junior"],
            "preferredBonus": 15,
            "acceptablePenalty": 0,
            "rejectedPenalty": -100,
        },
        "location": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": False,
            "userTimezone": -8,
            "maxTimezoneDiffHours": 4,
            "perHourPenalty": 3,
            "hybridSameCityBonus": 10,
        },
        "technology": {
            "required": [],
            "preferred": [],
            "disliked": [],
            "rejected": [],
            "requiredBonus": 10,
            "preferredBonus": 5,
            "dislikedPenalty": -5,
        },
    }
    config_loader.get_ai_settings.return_value = {
        "worker": {
            "selected": {"provider": "gemini", "interface": "api", "model": "gemini-2.0-flash"}
        },
        "documentGenerator": {
            "selected": {"provider": "gemini", "interface": "api", "model": "gemini-2.0-flash"}
        },
    }

    return {
        "queue_manager": MagicMock(),
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
    with patch(
        "job_finder.job_queue.processors.job_processor.ScrapeRunner"
    ) as mock_scrape_runner_class, patch(
        "job_finder.job_queue.processors.job_processor.create_provider_from_config"
    ) as mock_create_provider:
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
            def extract(self, title, description, location):
                return JobExtractionResult(
                    seniority="senior",
                    work_arrangement="remote",
                    technologies=["python"],
                )

        class MockScoringEngine:
            def score(self, extraction, title, description):
                return ScoreBreakdown(
                    base_score=50,
                    final_score=85,
                    adjustments=["Mock scoring"],
                    passed=True,
                )

        processor_instance.job_processor.extractor = MockExtractor()
        processor_instance.job_processor.scoring_engine = MockScoringEngine()

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


def test_job_analyze_spawns_company_dependency(processor, mock_managers, sample_job_item):
    """Job analyze should spawn company enrichment in background but proceed with analysis."""
    # Company exists but has incomplete data (no about/culture)
    incomplete_company = {
        "id": "comp-incomplete",
        "name": "Spawn Co",
        "about": "",  # Empty - triggers background enrichment
        "culture": "",
    }
    mock_managers["companies_manager"].get_company.return_value = incomplete_company
    mock_managers["companies_manager"].has_good_company_data.return_value = False
    # No source resolution - fall through to direct company lookup
    mock_managers["sources_manager"].resolve_company_from_source.return_value = None

    sample_job_item.pipeline_state = {
        "job_data": {
            "title": "Engineer",
            "company": "Spawn Co",
            "company_website": "https://spawn.example",
            "description": "A" * 200,
        },
        "filter_result": {"passed": True},
    }

    class DummyResult:
        match_score = 85
        application_priority = "Medium"

        def to_dict(self):
            return {
                "match_score": self.match_score,
                "application_priority": self.application_priority,
            }

    processor.job_processor.ai_matcher.analyze_job = MagicMock(return_value=DummyResult())

    processor.job_processor._do_job_analyze(sample_job_item)

    # Should spawn company task in background and wait for enrichment
    assert mock_managers["queue_manager"].spawn_item_safely.called
    processor.job_processor.ai_matcher.analyze_job.assert_not_called()
    mock_managers["queue_manager"].requeue_with_state.assert_called_once()
    _, updated_state = mock_managers["queue_manager"].requeue_with_state.call_args[0]
    assert updated_state.get("awaiting_company") is True


def test_job_analyze_resumes_after_company_ready(processor, mock_managers, sample_job_item):
    """Job analyze should proceed when company has good data and requeue for save stage."""

    class DummyResult:
        match_score = 95
        application_priority = "High"

        def to_dict(self):
            return {
                "match_score": self.match_score,
                "application_priority": self.application_priority,
            }

    complete_company = {
        "id": "comp-1",
        "name": "Ready Co",
        "about": "About text with enough content to pass the quality check",
        "culture": "Culture text with enough content",
    }

    # Mock source resolution to return None (no source match, use company lookup)
    mock_managers["sources_manager"].resolve_company_from_source.return_value = None

    # Data-based check: company has good data, so proceed with analysis
    mock_managers["companies_manager"].get_company.return_value = complete_company
    mock_managers["companies_manager"].has_good_company_data.return_value = True
    processor.job_processor.ai_matcher.analyze_job = MagicMock(return_value=DummyResult())

    sample_job_item.pipeline_state = {
        "job_data": {
            "title": "Engineer",
            "company": "Ready Co",
            "company_website": "https://ready.example",
            "description": "A" * 200,
        },
        "filter_result": {"passed": True},
    }

    processor.job_processor._do_job_analyze(sample_job_item)

    # AI analysis should be called
    processor.job_processor.ai_matcher.analyze_job.assert_called_once()
    # Pipeline requeues for save stage (not direct save)
    mock_managers["queue_manager"].requeue_with_state.assert_called_once()
    # Verify match_result is in the updated state
    _, updated_state = mock_managers["queue_manager"].requeue_with_state.call_args[0]
    assert "match_result" in updated_state
    assert updated_state["match_result"]["match_score"] == 95


@pytest.mark.parametrize(
    "source_company_id, should_update_listing",
    [
        (None, False),
        ("comp_remoteok", True),
    ],
)
def test_job_analyze_skips_company_when_source_name(
    processor, mock_managers, sample_job_item, source_company_id, should_update_listing
):
    """If company name matches a known source, skip spawning company tasks.

    When source is an aggregator (no company_id), proceed with analysis without enrichment.
    When source has a linked company, use that company and update the listing.
    """

    sample_job_item.pipeline_state = {
        "job_listing_id": "test-listing-123",
        "job_data": {
            "title": "Engineer",
            "company": "RemoteOK API",
            "company_website": "https://remoteok.com",
            "description": "A" * 200,
        },
        "filter_result": {"passed": True},
    }

    # Mock resolve_company_from_source (used by _ensure_company_dependency)
    mock_managers["sources_manager"].resolve_company_from_source.return_value = {
        "company_id": source_company_id,
        "is_aggregator": source_company_id is None,
        "aggregator_domain": "remoteok.com" if source_company_id is None else None,
        "source_id": "src_remoteok",
        "source_name": "RemoteOK API",
    }

    # If source has linked company, mock company lookup
    if source_company_id:
        mock_managers["companies_manager"].get_company_by_id.return_value = {
            "id": source_company_id,
            "name": "RemoteOK Inc",
            "about": "Enough content for good data check",
            "culture": "Remote-first culture",
        }
        mock_managers["companies_manager"].has_good_company_data.return_value = True

    class DummyResult:
        match_score = 75
        application_priority = "Medium"

        def to_dict(self):
            return {
                "match_score": self.match_score,
                "application_priority": self.application_priority,
            }

    processor.job_processor.ai_matcher.analyze_job = MagicMock(return_value=DummyResult())

    processor.job_processor._do_job_analyze(sample_job_item)

    # Should not spawn new company task (source resolution handles it)
    mock_managers["queue_manager"].spawn_item_safely.assert_not_called()
    # AI analysis should proceed
    processor.job_processor.ai_matcher.analyze_job.assert_called_once()

    if should_update_listing:
        mock_managers["job_listing_storage"].update_company_id.assert_called_once_with(
            "test-listing-123", source_company_id
        )
    else:
        mock_managers["job_listing_storage"].update_company_id.assert_not_called()


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
            min_match_score=None,
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
            min_match_score=70,
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
            min_match_score=None,
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
