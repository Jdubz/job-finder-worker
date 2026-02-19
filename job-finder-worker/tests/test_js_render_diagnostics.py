"""Tests for JS rendering pipeline diagnostics and resilience.

Covers:
1. Partial render returns HTML on selector timeout
2. Bot protection detection in JS-rendered pages
3. Auth wall detection in JS-rendered pages
4. Zero-match diagnostic logging (including page title + hint selectors)
5. Field extraction total failure logging
6. Scrape runner zero-jobs JS source warning
7. Partial render flows through to zero-match diagnostics (end-to-end)
8. Partial render with bot protection HTML still raises (end-to-end)
"""

import logging
from unittest.mock import MagicMock, Mock, patch

import pytest

from job_finder.exceptions import ScrapeAuthError, ScrapeBotProtectionError
from job_finder.rendering.playwright_renderer import (
    PlaywrightRenderer,
    PlaywrightTimeoutError,
    RenderRequest,
    RenderResult,
)
from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig
from job_finder.scrape_runner import ScrapeRunner

# ── Test 1: Partial render returns HTML on selector timeout ──


def test_partial_render_returns_html():
    """When wait_for_selector times out but page loaded, return partial HTML."""
    renderer = PlaywrightRenderer()

    mock_page = MagicMock()
    mock_page.content.return_value = "<html><body><h1>Loaded</h1></body></html>"
    mock_page.url = "https://example.com/jobs"
    mock_page.wait_for_selector.side_effect = PlaywrightTimeoutError(
        "Timeout 20000ms exceeded waiting for selector '.jobs-list'"
    )

    mock_context = MagicMock()
    mock_context.new_page.return_value = mock_page

    # Patch _ensure_browser and browser.new_context
    with (
        patch.object(renderer, "_ensure_browser"),
        patch.object(renderer, "_sem", MagicMock()),
        patch.object(renderer, "_browser", MagicMock()) as mock_browser,
    ):
        mock_browser.new_context.return_value = mock_context

        # Call _render_internal directly to avoid thread pool complexity
        req = RenderRequest(
            url="https://example.com/jobs",
            wait_for_selector=".jobs-list",
            wait_timeout_ms=20000,
        )
        render_context = {"context": None}
        result = renderer._render_internal(req, 20000, render_context)

    assert result.status == "partial"
    assert result.html == "<html><body><h1>Loaded</h1></body></html>"
    assert len(result.errors) == 1
    assert "wait_for_selector timeout" in result.errors[0]


# ── Test 2: Bot protection detected in JS-rendered HTML ──


def test_js_render_bot_protection_raises():
    """JS-rendered page returning bot protection markers should raise ScrapeBotProtectionError."""
    config = SourceConfig(
        type="html",
        url="https://example.com/careers",
        fields={"title": ".title", "url": "a@href"},
        job_selector=".job-card",
        requires_js=True,
    )
    scraper = GenericScraper(config)

    bot_html = (
        "<html><body>"
        "<div class='cf-browser-verification'>Checking your browser before accessing</div>"
        "<div id='challenge-platform'>Please wait...</div>"
        "</body></html>"
    )
    mock_result = MagicMock()
    mock_result.html = bot_html

    with patch("job_finder.scrapers.generic_scraper.get_renderer") as mock_get:
        mock_get.return_value.render.return_value = mock_result
        with pytest.raises(ScrapeBotProtectionError, match="Bot protection detected"):
            scraper._fetch_html_page("https://example.com/careers")


# ── Test 3: Auth wall detected in JS-rendered HTML ──


def test_js_render_auth_wall_raises():
    """JS-rendered page with login wall markers should raise ScrapeAuthError."""
    config = SourceConfig(
        type="html",
        url="https://example.com/careers",
        fields={"title": ".title", "url": "a@href"},
        job_selector=".job-card",
        requires_js=True,
    )
    scraper = GenericScraper(config)

    auth_html = (
        "<html><body>"
        "<h1>Sign in to continue</h1>"
        '<form><input type="password" name="password"></form>'
        "</body></html>"
    )
    mock_result = MagicMock()
    mock_result.html = auth_html

    with patch("job_finder.scrapers.generic_scraper.get_renderer") as mock_get:
        mock_get.return_value.render.return_value = mock_result
        with pytest.raises(ScrapeAuthError, match="Authentication wall detected"):
            scraper._fetch_html_page("https://example.com/careers")


# ── Test 4: Zero-match logs diagnostic warning with title and hints ──


def test_zero_match_logs_diagnostic(caplog):
    """When job_selector matches nothing on a JS page, log a diagnostic warning."""
    config = SourceConfig(
        type="html",
        url="https://example.com/careers",
        fields={"title": ".title", "url": "a@href"},
        job_selector=".nonexistent-selector",
        requires_js=True,
    )
    scraper = GenericScraper(config)

    # HTML that has job-related classes but NOT the configured selector
    valid_html = (
        "<html><head><title>Acme Corp - Careers</title></head><body>"
        '<div class="job-listing"><a href="/job/1">Engineer</a></div>'
        '<div class="job-listing"><a href="/job/2">Designer</a></div>'
        "</body></html>"
    )
    mock_result = MagicMock()
    mock_result.html = valid_html

    with patch("job_finder.scrapers.generic_scraper.get_renderer") as mock_get:
        mock_get.return_value.render.return_value = mock_result
        with caplog.at_level(logging.WARNING, logger="job_finder.scrapers.generic_scraper"):
            items = scraper._fetch_html_page("https://example.com/careers")

    assert items == []
    warning_msgs = [r.message for r in caplog.records if "js_render_zero_jobs" in r.message]
    assert len(warning_msgs) == 1
    msg = warning_msgs[0]
    # Should include page title for quick identification
    assert "Acme Corp - Careers" in msg
    # Should include hint about existing job-related selectors
    assert "job-listing" in msg


# ── Test 5: Field extraction total failure logs warning ──


def test_field_extraction_total_failure_logs_warning(caplog):
    """When all matched elements fail title+url extraction, log a warning."""
    config = SourceConfig(
        type="html",
        url="https://example.com/careers",
        fields={
            "title": ".wrong-title-selector",
            "url": ".wrong-url-selector@href",
        },
        job_selector=".job-card",
        requires_js=True,
    )
    scraper = GenericScraper(config)

    # HTML where .job-card matches but the field selectors don't
    html = (
        "<html><body>"
        '<div class="job-card"><span class="name">Engineer</span></div>'
        '<div class="job-card"><span class="name">Designer</span></div>'
        "</body></html>"
    )
    mock_result = MagicMock()
    mock_result.html = html

    with patch("job_finder.scrapers.generic_scraper.get_renderer") as mock_get:
        mock_get.return_value.render.return_value = mock_result
        with patch.object(scraper, "_should_enrich", return_value=False):
            with caplog.at_level(logging.WARNING, logger="job_finder.scrapers.generic_scraper"):
                jobs = scraper.scrape()

    assert jobs == []
    warning_msgs = [
        r.message for r in caplog.records if "field_extraction_total_failure" in r.message
    ]
    assert len(warning_msgs) == 1
    # Should include source_type for context
    assert "source_type=" in warning_msgs[0]


# ── Test 6: Scrape runner zero-jobs JS source warning ──


@patch("job_finder.scrape_runner.GenericScraper")
def test_scrape_runner_zero_jobs_js_warning(mock_scraper_cls, caplog):
    """Scrape runner should log WARNING for JS source returning 0 jobs."""
    scraper_instance = Mock()
    scraper_instance.scrape.return_value = []
    mock_scraper_cls.return_value = scraper_instance

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

    source = {
        "id": "js-source-1",
        "name": "JS Careers Page",
        "sourceType": "html",
        "config": {
            "type": "html",
            "url": "https://example.com/careers",
            "fields": {"title": ".title", "url": "a@href"},
            "job_selector": ".job-card",
            "requires_js": True,
            "render_wait_for": ".job-card",
        },
    }
    sources_manager.get_active_sources.return_value = [source]
    sources_manager.get_source_by_id.return_value = source

    with caplog.at_level(logging.WARNING, logger="job_finder.scrape_runner"):
        runner.run_scrape(source_ids=[source["id"]])

    assert any("zero_jobs_js_source" in record.message for record in caplog.records)
    warning_msgs = [r.message for r in caplog.records if "zero_jobs_js_source" in r.message]
    assert len(warning_msgs) == 1
    assert "JS Careers Page" in warning_msgs[0]
    assert ".job-card" in warning_msgs[0]


# ── Test 7: Partial render → scraper zero-match diagnostic (end-to-end) ──


def test_partial_render_triggers_zero_match_diagnostic(caplog):
    """When renderer returns partial HTML (selector timeout), the scraper should
    still parse it and fire the zero-match diagnostic when job_selector misses."""
    config = SourceConfig(
        type="html",
        url="https://example.com/careers",
        fields={"title": ".title", "url": "a@href"},
        job_selector=".job-card",
        requires_js=True,
        render_wait_for=".job-card",
    )
    scraper = GenericScraper(config)

    # Partial render: page loaded but has different selectors than expected
    partial_html = (
        "<html><head><title>Careers at WidgetCo</title></head><body>"
        '<div class="career-opening">Software Engineer</div>'
        "</body></html>"
    )
    partial_result = RenderResult(
        final_url="https://example.com/careers",
        status="partial",
        html=partial_html,
        duration_ms=20100,
        request_count=5,
        console_logs=[],
        errors=["wait_for_selector timeout (.job-card): Timeout 20000ms exceeded"],
    )

    with patch("job_finder.scrapers.generic_scraper.get_renderer") as mock_get:
        mock_get.return_value.render.return_value = partial_result
        with caplog.at_level(logging.WARNING, logger="job_finder.scrapers.generic_scraper"):
            items = scraper._fetch_html_page("https://example.com/careers")

    assert items == []
    # Zero-match diagnostic should have fired with page title and hints
    warning_msgs = [r.message for r in caplog.records if "js_render_zero_jobs" in r.message]
    assert len(warning_msgs) == 1
    msg = warning_msgs[0]
    assert "Careers at WidgetCo" in msg
    assert "career" in msg.lower()  # hint selector should find career-opening


# ── Test 8: Partial render with bot HTML still raises bot protection ──


def test_partial_render_with_bot_html_raises():
    """When renderer returns partial HTML that contains bot protection markers,
    the scraper should detect and raise ScrapeBotProtectionError."""
    config = SourceConfig(
        type="html",
        url="https://example.com/careers",
        fields={"title": ".title", "url": "a@href"},
        job_selector=".job-card",
        requires_js=True,
        render_wait_for=".job-card",
    )
    scraper = GenericScraper(config)

    # Selector timed out because the page is a Cloudflare challenge
    captcha_html = (
        "<html><head><title>Just a moment...</title></head><body>"
        '<div id="challenge-platform">Checking your browser before accessing</div>'
        '<div class="cf-browser-verification">Please wait</div>'
        "</body></html>"
    )
    partial_result = RenderResult(
        final_url="https://example.com/careers",
        status="partial",
        html=captcha_html,
        duration_ms=20100,
        request_count=3,
        console_logs=[],
        errors=["wait_for_selector timeout (.job-card): Timeout 20000ms exceeded"],
    )

    with patch("job_finder.scrapers.generic_scraper.get_renderer") as mock_get:
        mock_get.return_value.render.return_value = partial_result
        with pytest.raises(ScrapeBotProtectionError, match="Bot protection detected"):
            scraper._fetch_html_page("https://example.com/careers")


# ── Test 9: JSON-LD listing fallback extracts jobs when selector fails ──


def test_jsonld_listing_fallback_extracts_jobs():
    """When job_selector matches nothing but JSON-LD has JobPosting data, extract jobs."""
    from job_finder.scrapers.generic_scraper import PreExtractedJob

    config = SourceConfig(
        type="html",
        url="https://example.com/careers",
        fields={"title": ".title", "url": "a@href"},
        job_selector=".nonexistent-selector",
        requires_js=True,
    )
    scraper = GenericScraper(config)

    html_with_jsonld = (
        "<html><head><title>Careers</title></head><body>"
        '<script type="application/ld+json">'
        '[{"@type": "JobPosting", "title": "Engineer",'
        ' "url": "https://example.com/job/1",'
        ' "hiringOrganization": {"name": "Acme"},'
        ' "description": "Build things",'
        ' "jobLocation": {"address": {"addressLocality": "NYC", "addressRegion": "NY"}}},'
        ' {"@type": "JobPosting", "title": "Designer",'
        ' "url": "https://example.com/job/2",'
        ' "hiringOrganization": {"name": "Acme"},'
        ' "description": "Design things"}]'
        "</script>"
        "</body></html>"
    )
    mock_result = MagicMock()
    mock_result.html = html_with_jsonld

    with patch("job_finder.scrapers.generic_scraper.get_renderer") as mock_get:
        mock_get.return_value.render.return_value = mock_result
        items = scraper._fetch_html_page("https://example.com/careers")

    assert len(items) == 2
    assert all(isinstance(item, PreExtractedJob) for item in items)
    assert items[0].data["title"] == "Engineer"
    assert items[0].data["url"] == "https://example.com/job/1"
    assert items[1].data["title"] == "Designer"

    # Verify scrape() processes PreExtractedJob items into job dicts
    with patch("job_finder.scrapers.generic_scraper.get_renderer") as mock_get:
        mock_get.return_value.render.return_value = mock_result
        with patch.object(scraper, "_should_enrich", return_value=False):
            jobs = scraper.scrape()

    assert len(jobs) == 2
    assert jobs[0]["title"] == "Engineer"
    assert jobs[0]["url"] == "https://example.com/job/1"
    assert jobs[1]["title"] == "Designer"


# ── Test 10: JSON-LD fallback skipped when CSS selector matches ──


def test_jsonld_fallback_skipped_when_selector_matches():
    """When CSS selector matches elements, JSON-LD fallback should NOT be used."""
    config = SourceConfig(
        type="html",
        url="https://example.com/careers",
        fields={"title": ".title", "url": "a@href"},
        job_selector=".job-card",
        requires_js=True,
    )
    scraper = GenericScraper(config)

    # HTML with BOTH matching CSS elements AND JSON-LD data
    html_with_both = (
        "<html><head><title>Careers</title></head><body>"
        '<div class="job-card"><span class="title">Engineer</span>'
        '<a href="/job/1">Apply</a></div>'
        '<div class="job-card"><span class="title">Designer</span>'
        '<a href="/job/2">Apply</a></div>'
        '<script type="application/ld+json">'
        '[{"@type": "JobPosting", "title": "JSON-LD Job",'
        ' "url": "https://example.com/jsonld-job"}]'
        "</script>"
        "</body></html>"
    )
    mock_result = MagicMock()
    mock_result.html = html_with_both

    with patch("job_finder.scrapers.generic_scraper.get_renderer") as mock_get:
        mock_get.return_value.render.return_value = mock_result
        items = scraper._fetch_html_page("https://example.com/careers")

    # CSS selector results returned, not JSON-LD
    assert len(items) == 2
    from job_finder.scrapers.generic_scraper import PreExtractedJob

    assert not any(isinstance(item, PreExtractedJob) for item in items)
