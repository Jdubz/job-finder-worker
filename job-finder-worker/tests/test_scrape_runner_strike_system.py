"""Tests for ScrapeRunner error handling and strike system.

Verifies that:
- Permanent errors (bot protection, auth, protected API) disable immediately with tags
- Recoverable errors (transient, config, not-found) use the 3-strike system
- Successful scrapes reset the consecutive failure counter
"""

from unittest.mock import MagicMock, Mock, patch

import pytest

from job_finder.exceptions import (
    ScrapeAuthError,
    ScrapeBotProtectionError,
    ScrapeConfigError,
    ScrapeNotFoundError,
    ScrapeProtectedApiError,
    ScrapeTransientError,
)
from job_finder.scrape_runner import (
    ScrapeRunner,
    TRANSIENT_FAILURE_THRESHOLD,
    ZERO_JOBS_RECOVERY_THRESHOLD,
)


@pytest.fixture
def scrape_runner():
    """Create ScrapeRunner with mocked dependencies."""
    queue_manager = MagicMock()
    job_listing_storage = MagicMock()
    job_listing_storage.db_path = ":memory:"
    companies_manager = MagicMock()
    sources_manager = MagicMock()

    runner = ScrapeRunner(
        queue_manager=queue_manager,
        job_listing_storage=job_listing_storage,
        companies_manager=companies_manager,
        sources_manager=sources_manager,
        title_filter=None,
    )
    return runner


def make_source(source_id="source-123", name="Example API", consecutive_failures=0):
    """Create a minimal source dict for testing."""
    config = {
        "url": "https://example.com/api",
        "fields": {"title": "title", "url": "url"},
    }
    if consecutive_failures > 0:
        config["consecutive_failures"] = consecutive_failures
    return {
        "id": source_id,
        "name": name,
        "sourceType": "api",
        "config": config,
    }


# ── Permanent errors: immediate disable with tags ──


@patch("job_finder.scrape_runner.GenericScraper")
def test_bot_protection_disables_immediately_with_tag(mock_scraper_cls, scrape_runner):
    """ScrapeBotProtectionError should disable source immediately with anti_bot tag."""
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = ScrapeBotProtectionError(
        "https://example.com/api", "Cloudflare challenge detected", 403
    )
    mock_scraper_cls.return_value = scraper_instance

    source = make_source()
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    stats = scrape_runner.run_scrape(source_ids=[source["id"]])

    scrape_runner.sources_manager.disable_source_with_tags.assert_called_once()
    args, kwargs = scrape_runner.sources_manager.disable_source_with_tags.call_args
    assert args[0] == source["id"]
    assert "Bot protection" in args[1]
    assert kwargs.get("tags") == ["anti_bot"]
    assert len(stats["errors"]) == 1


@patch("job_finder.scrape_runner.GenericScraper")
def test_auth_error_disables_immediately_with_tag(mock_scraper_cls, scrape_runner):
    """ScrapeAuthError should disable source immediately with auth_required tag."""
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = ScrapeAuthError(
        "https://example.com/api", "Login required", 401
    )
    mock_scraper_cls.return_value = scraper_instance

    source = make_source()
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.run_scrape(source_ids=[source["id"]])

    scrape_runner.sources_manager.disable_source_with_tags.assert_called_once()
    args, kwargs = scrape_runner.sources_manager.disable_source_with_tags.call_args
    assert args[0] == source["id"]
    assert "Authentication required" in args[1]
    assert kwargs.get("tags") == ["auth_required"]


@patch("job_finder.scrape_runner.GenericScraper")
def test_protected_api_disables_immediately_with_tag(mock_scraper_cls, scrape_runner):
    """ScrapeProtectedApiError should disable source immediately with protected_api tag."""
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = ScrapeProtectedApiError(
        "https://example.com/api", "API requires token", 401
    )
    mock_scraper_cls.return_value = scraper_instance

    source = make_source()
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.run_scrape(source_ids=[source["id"]])

    scrape_runner.sources_manager.disable_source_with_tags.assert_called_once()
    args, kwargs = scrape_runner.sources_manager.disable_source_with_tags.call_args
    assert args[0] == source["id"]
    assert "Protected API" in args[1]
    assert kwargs.get("tags") == ["protected_api"]


# ── Recoverable errors: strike system ──


@patch("job_finder.scrape_runner.GenericScraper")
def test_transient_error_increments_failure_count(mock_scraper_cls, scrape_runner):
    """First transient error should increment counter but NOT disable."""
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = ScrapeTransientError(
        "https://example.com/api", "HTTP 503: Service Unavailable", 503
    )
    mock_scraper_cls.return_value = scraper_instance

    source = make_source(consecutive_failures=0)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.run_scrape(source_ids=[source["id"]])

    # Should increment failure count
    scrape_runner.sources_manager.update_config.assert_called_once()
    call_args = scrape_runner.sources_manager.update_config.call_args
    updated_config = call_args[0][1]
    assert updated_config["consecutive_failures"] == 1

    # Should NOT disable (only 1 strike)
    scrape_runner.sources_manager.disable_source_with_note.assert_not_called()
    scrape_runner.sources_manager.disable_source_with_tags.assert_not_called()


@patch("job_finder.scrape_runner.GenericScraper")
def test_transient_error_at_threshold_disables_source(mock_scraper_cls, scrape_runner):
    """At TRANSIENT_FAILURE_THRESHOLD consecutive failures, source should be disabled."""
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = ScrapeTransientError(
        "https://example.com/api", "HTTP 503: Service Unavailable", 503
    )
    mock_scraper_cls.return_value = scraper_instance

    # Already at threshold - 1
    source = make_source(consecutive_failures=TRANSIENT_FAILURE_THRESHOLD - 1)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.run_scrape(source_ids=[source["id"]])

    # Should increment to threshold
    scrape_runner.sources_manager.update_config.assert_called_once()
    call_args = scrape_runner.sources_manager.update_config.call_args
    updated_config = call_args[0][1]
    assert updated_config["consecutive_failures"] == TRANSIENT_FAILURE_THRESHOLD

    # Should disable at threshold
    scrape_runner.sources_manager.disable_source_with_note.assert_called_once()
    args, _ = scrape_runner.sources_manager.disable_source_with_note.call_args
    assert args[0] == source["id"]
    assert "transient" in args[1].lower()


@patch("job_finder.scrape_runner.GenericScraper")
def test_config_error_uses_strike_system(mock_scraper_cls, scrape_runner):
    """ScrapeConfigError should use the strike system, not disable immediately."""
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = ScrapeConfigError(
        "https://example.com/api", "HTTP 400: Bad Request", 400
    )
    mock_scraper_cls.return_value = scraper_instance

    source = make_source(consecutive_failures=0)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.run_scrape(source_ids=[source["id"]])

    # Should increment, not disable
    scrape_runner.sources_manager.update_config.assert_called_once()
    scrape_runner.sources_manager.disable_source_with_note.assert_not_called()


@patch("job_finder.scrape_runner.GenericScraper")
def test_not_found_error_uses_strike_system(mock_scraper_cls, scrape_runner):
    """ScrapeNotFoundError should use the strike system, not disable immediately."""
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = ScrapeNotFoundError(
        "https://example.com/jobs", "HTTP 404: Not Found", 404
    )
    mock_scraper_cls.return_value = scraper_instance

    source = make_source(consecutive_failures=0)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.run_scrape(source_ids=[source["id"]])

    # Should increment, not disable
    scrape_runner.sources_manager.update_config.assert_called_once()
    scrape_runner.sources_manager.disable_source_with_note.assert_not_called()


@patch("job_finder.scrape_runner.GenericScraper")
def test_config_error_at_threshold_disables_with_note(mock_scraper_cls, scrape_runner):
    """ScrapeConfigError at threshold should disable with descriptive note."""
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = ScrapeConfigError(
        "https://example.com/api", "HTTP 400: Bad Request", 400
    )
    mock_scraper_cls.return_value = scraper_instance

    source = make_source(consecutive_failures=TRANSIENT_FAILURE_THRESHOLD - 1)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.run_scrape(source_ids=[source["id"]])

    scrape_runner.sources_manager.disable_source_with_note.assert_called_once()
    args, _ = scrape_runner.sources_manager.disable_source_with_note.call_args
    assert "Config error" in args[1]
    assert "consecutive" in args[1].lower()


# ── Success: reset counter ──


@patch("job_finder.scrape_runner.GenericScraper")
def test_successful_scrape_resets_consecutive_failures(mock_scraper_cls, scrape_runner):
    """Successful scrape should reset consecutive_failures to 0."""
    scraper_instance = Mock()
    scraper_instance.scrape.return_value = [
        {"title": "Software Engineer", "url": "https://example.com/job1"}
    ]
    mock_scraper_cls.return_value = scraper_instance

    source = make_source(consecutive_failures=2)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    # Mock scraper_intake to accept jobs
    scrape_runner.scraper_intake = MagicMock()
    scrape_runner.scraper_intake.submit_jobs.return_value = 1

    scrape_runner.run_scrape(source_ids=[source["id"]])

    # Should reset consecutive_failures to 0
    scrape_runner.sources_manager.update_config.assert_called_once()
    call_args = scrape_runner.sources_manager.update_config.call_args
    updated_config = call_args[0][1]
    assert updated_config["consecutive_failures"] == 0


@patch("job_finder.scrape_runner.GenericScraper")
def test_successful_scrape_skips_reset_when_no_prior_failures(mock_scraper_cls, scrape_runner):
    """Successful scrape with no prior failures should not call update_config."""
    scraper_instance = Mock()
    scraper_instance.scrape.return_value = [
        {"title": "Software Engineer", "url": "https://example.com/job1"}
    ]
    mock_scraper_cls.return_value = scraper_instance

    source = make_source(consecutive_failures=0)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.scraper_intake = MagicMock()
    scrape_runner.scraper_intake.submit_jobs.return_value = 1

    scrape_runner.run_scrape(source_ids=[source["id"]])

    # Should NOT call update_config (no failures to reset)
    scrape_runner.sources_manager.update_config.assert_not_called()


# ── 429 rate-limit awareness ──


@patch("job_finder.scrape_runner.GenericScraper")
def test_429_with_retry_after_skips_strike(mock_scraper_cls, scrape_runner):
    """429 with Retry-After should NOT increment consecutive_failures."""
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = ScrapeTransientError(
        "https://example.com/api", "HTTP 429: Too Many Requests - rate limited", 429, retry_after=60
    )
    mock_scraper_cls.return_value = scraper_instance

    source = make_source(consecutive_failures=0)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    stats = scrape_runner.run_scrape(source_ids=[source["id"]])

    # Should NOT increment consecutive_failures
    scrape_runner.sources_manager.update_config.assert_not_called()
    # Should NOT disable
    scrape_runner.sources_manager.disable_source_with_note.assert_not_called()
    scrape_runner.sources_manager.disable_source_with_tags.assert_not_called()
    # Should NOT record as "success" (the scrape didn't actually succeed)
    scrape_runner.sources_manager.update_scrape_status.assert_not_called()
    # Error should still be recorded
    assert len(stats["errors"]) == 1


@patch("job_finder.scrape_runner.GenericScraper")
def test_429_without_retry_after_still_counts_strike(mock_scraper_cls, scrape_runner):
    """429 without Retry-After should still use the normal strike system."""
    scraper_instance = Mock()
    scraper_instance.scrape.side_effect = ScrapeTransientError(
        "https://example.com/api",
        "HTTP 429: Too Many Requests - rate limited",
        429,
        retry_after=None,
    )
    mock_scraper_cls.return_value = scraper_instance

    source = make_source(consecutive_failures=0)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.run_scrape(source_ids=[source["id"]])

    # Should increment consecutive_failures (normal strike behavior)
    scrape_runner.sources_manager.update_config.assert_called_once()
    call_args = scrape_runner.sources_manager.update_config.call_args
    updated_config = call_args[0][1]
    assert updated_config["consecutive_failures"] == 1


# ── Zero-job JS source recovery ──


def make_js_source(source_id="js-source-1", name="JS Careers Page", consecutive_zero_jobs=0):
    """Create a minimal JS source dict for testing."""
    config = {
        "type": "html",
        "url": "https://example.com/careers",
        "fields": {"title": ".title", "url": "a@href"},
        "job_selector": ".job-card",
        "requires_js": True,
        "render_wait_for": ".job-card",
    }
    if consecutive_zero_jobs > 0:
        config["consecutive_zero_jobs"] = consecutive_zero_jobs
    return {
        "id": source_id,
        "name": name,
        "sourceType": "html",
        "config": config,
    }


@patch("job_finder.scrape_runner.GenericScraper")
def test_zero_jobs_js_spawns_recovery_at_threshold(mock_scraper_cls, scrape_runner):
    """JS source hitting ZERO_JOBS_RECOVERY_THRESHOLD should spawn SOURCE_RECOVER."""
    scraper_instance = Mock()
    scraper_instance.scrape.return_value = []
    mock_scraper_cls.return_value = scraper_instance

    # One below threshold — this scrape should push it to threshold
    source = make_js_source(consecutive_zero_jobs=ZERO_JOBS_RECOVERY_THRESHOLD - 1)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.run_scrape(source_ids=[source["id"]])

    # Should have updated config with incremented consecutive_zero_jobs
    scrape_runner.sources_manager.update_config.assert_called()
    config_calls = scrape_runner.sources_manager.update_config.call_args_list
    # Find the call that sets consecutive_zero_jobs
    zero_job_configs = [c[0][1] for c in config_calls if "consecutive_zero_jobs" in c[0][1]]
    assert len(zero_job_configs) >= 1
    assert zero_job_configs[0]["consecutive_zero_jobs"] == ZERO_JOBS_RECOVERY_THRESHOLD

    # Should have spawned SOURCE_RECOVER via queue_manager.add_item
    scrape_runner.queue_manager.add_item.assert_called_once()
    queued_item = scrape_runner.queue_manager.add_item.call_args[0][0]
    item_type = queued_item.type
    assert (item_type.value if hasattr(item_type, "value") else item_type) == "source_recover"
    assert queued_item.source_id == "js-source-1"
    assert queued_item.input["error_reason"] == "zero_jobs_js_source"


@patch("job_finder.scrape_runner.GenericScraper")
def test_zero_jobs_js_does_not_re_spawn_above_threshold(mock_scraper_cls, scrape_runner):
    """Above ZERO_JOBS_RECOVERY_THRESHOLD, recovery should NOT be spawned again."""
    scraper_instance = Mock()
    scraper_instance.scrape.return_value = []
    mock_scraper_cls.return_value = scraper_instance

    # Already AT threshold — next run is above, should NOT spawn again
    source = make_js_source(consecutive_zero_jobs=ZERO_JOBS_RECOVERY_THRESHOLD)
    scrape_runner.sources_manager.get_active_sources.return_value = [source]
    scrape_runner.sources_manager.get_source_by_id.return_value = source

    scrape_runner.run_scrape(source_ids=[source["id"]])

    # Config should still be updated (count incremented)
    scrape_runner.sources_manager.update_config.assert_called()

    # But no recovery task should be spawned
    scrape_runner.queue_manager.add_item.assert_not_called()
