import json
from types import SimpleNamespace

import pytest
from bs4 import BeautifulSoup

from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig


def _make_resp(html: str):
    return SimpleNamespace(status_code=200, text=html, raise_for_status=lambda: None)


@pytest.fixture(autouse=True)
def stub_requests(monkeypatch):
    calls = {}

    def fake_get(url, headers=None, timeout=None):
        calls.setdefault("urls", []).append(url)
        return _make_resp(fake_get.payloads[url])

    fake_get.payloads = {}
    monkeypatch.setattr("job_finder.scrapers.generic_scraper.requests.get", fake_get)
    # Mock the fetch delay to avoid needing database in tests
    monkeypatch.setattr("job_finder.scrapers.generic_scraper.get_fetch_delay_seconds", lambda: 0)
    return fake_get


def test_enrich_from_detail_uses_jsonld_graph(monkeypatch, stub_requests):
    cfg = SourceConfig.from_dict(
        {
            "type": "html",
            "url": "https://builtin.com/jobs",
            "job_selector": "[data-id=job-card]",
            "fields": {"title": "h2", "url": "a@href"},
            "follow_detail": True,
        }
    )

    jsonld = {
        "@graph": [
            {"@type": "BreadcrumbList"},
            {
                "@type": "JobPosting",
                "title": "Backend Engineer",
                "description": "<p>Great job</p>",
                "hiringOrganization": {"name": "Acme"},
                "jobLocation": {
                    "@type": "Place",
                    "address": {
                        "addressLocality": "NYC",
                        "addressRegion": "NY",
                        "addressCountry": "USA",
                    },
                },
                "datePosted": "2025-12-01",
            },
        ]
    }
    stub_requests.payloads["https://detail"] = (
        '<script type="application/ld+json">' + json.dumps(jsonld) + "</script>"
    )

    scraper = GenericScraper(cfg)

    job = {
        "title": "Backend Engineer",
        "url": "https://detail",
        # leave company/description/location absent to allow enrichment to fill them
    }

    enriched = scraper._enrich_from_detail(job)
    assert enriched["company"] == "Acme"
    assert enriched["description"].startswith("<p>Great job")
    assert enriched["location"] == "NYC, NY, USA"
    assert enriched["posted_date"] == "2025-12-01"


def test_enrich_from_detail_handles_bad_json(monkeypatch, stub_requests):
    cfg = SourceConfig.from_dict(
        {
            "type": "html",
            "url": "https://builtin.com/jobs",
            "job_selector": "[data-id=job-card]",
            "fields": {"title": "h2", "url": "a@href"},
            "follow_detail": True,
        }
    )

    # Malformed JSON-LD should be ignored without raising
    stub_requests.payloads["https://detail"] = '<script type="application/ld+json">{</script>'

    scraper = GenericScraper(cfg)
    job = {"title": "T", "url": "https://detail", "description": ""}
    enriched = scraper._enrich_from_detail(job)
    assert enriched == job


def test_enrich_from_detail_skips_when_no_url():
    cfg = SourceConfig.from_dict(
        {
            "type": "html",
            "url": "https://builtin.com/jobs",
            "job_selector": "[data-id=job-card]",
            "fields": {"title": "h2", "url": "a@href"},
            "follow_detail": True,
        }
    )
    scraper = GenericScraper(cfg)
    job = {"title": "T", "description": ""}
    assert scraper._enrich_from_detail(job) == job


# ============================================================
# Tests for HTML date extraction fallback strategies
# ============================================================


@pytest.fixture
def scraper():
    """Create a scraper instance for testing extraction methods."""
    cfg = SourceConfig.from_dict(
        {
            "type": "html",
            "url": "https://example.com/jobs",
            "job_selector": ".job",
            "fields": {"title": "h2", "url": "a@href"},
            "follow_detail": True,
        }
    )
    return GenericScraper(cfg)


class TestExtractDateFromMeta:
    """Tests for meta tag date extraction."""

    def test_extracts_article_published_time(self, scraper):
        html = '<meta property="article:published_time" content="2025-11-15T10:00:00Z">'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_meta(soup) == "2025-11-15T10:00:00Z"

    def test_extracts_og_article_published_time(self, scraper):
        html = '<meta property="og:article:published_time" content="2025-11-14">'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_meta(soup) == "2025-11-14"

    def test_extracts_dc_date(self, scraper):
        html = '<meta name="DC.date" content="2025-11-13">'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_meta(soup) == "2025-11-13"

    def test_extracts_itemprop_dateposted(self, scraper):
        html = '<meta itemprop="datePosted" content="2025-11-12">'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_meta(soup) == "2025-11-12"

    def test_returns_none_when_no_meta_tags(self, scraper):
        html = "<html><body><p>No meta tags here</p></body></html>"
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_meta(soup) is None

    def test_skips_invalid_date_content(self, scraper):
        html = '<meta property="article:published_time" content="not-a-date">'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_meta(soup) is None


class TestExtractDateFromTimeElements:
    """Tests for <time> element date extraction."""

    def test_extracts_from_time_datetime_attr(self, scraper):
        html = '<time datetime="2025-11-10T09:00:00Z">November 10</time>'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_time_elements(soup) == "2025-11-10T09:00:00Z"

    def test_prioritizes_job_related_context(self, scraper):
        html = """
        <div class="sidebar"><time datetime="2025-01-01">Old date</time></div>
        <div class="posted-date"><time datetime="2025-11-20">Posted date</time></div>
        """
        soup = BeautifulSoup(html, "html.parser")
        # Should return the one in job-related context
        assert scraper._extract_date_from_time_elements(soup) == "2025-11-20"

    def test_falls_back_to_first_valid_time(self, scraper):
        html = """
        <div class="random"><time datetime="2025-11-05">First</time></div>
        <div class="other"><time datetime="2025-11-06">Second</time></div>
        """
        soup = BeautifulSoup(html, "html.parser")
        # No job-related context, should return first valid
        assert scraper._extract_date_from_time_elements(soup) == "2025-11-05"

    def test_returns_none_when_no_time_elements(self, scraper):
        html = "<html><body><p>No time elements</p></body></html>"
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_time_elements(soup) is None

    def test_skips_time_without_datetime_attr(self, scraper):
        html = "<time>November 10, 2025</time>"
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_time_elements(soup) is None

    def test_checks_multiple_parent_levels(self, scraper):
        """Test that job-related context is found in higher-level parents."""
        html = """
        <div class="job-posting-date">
            <div class="wrapper">
                <span><time datetime="2025-11-18">Nov 18</time></span>
            </div>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        # Should find job-related context in grandparent div
        assert scraper._extract_date_from_time_elements(soup) == "2025-11-18"


class TestExtractDateFromSelectors:
    """Tests for CSS selector-based date extraction."""

    def test_extracts_from_posted_date_class(self, scraper):
        html = '<div class="posted-date">2025-11-08</div>'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_selectors(soup) == "2025-11-08"

    def test_extracts_from_job_date_class(self, scraper):
        html = '<span class="job-date">November 7, 2025</span>'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_selectors(soup) == "November 7, 2025"

    def test_extracts_datetime_attr_from_selector(self, scraper):
        html = '<div class="date-posted" datetime="2025-11-06">6 days ago</div>'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_selectors(soup) == "2025-11-06"

    def test_extracts_from_data_testid(self, scraper):
        html = '<span data-testid="posting-date">2025-11-05</span>'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_selectors(soup) == "2025-11-05"

    def test_returns_none_when_no_matching_selectors(self, scraper):
        html = '<div class="unrelated">Some content</div>'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_selectors(soup) is None


class TestExtractDateFromTextPatterns:
    """Tests for text pattern-based date extraction."""

    def test_extracts_days_ago(self, scraper):
        html = '<div class="meta">Posted 3 days ago</div>'
        soup = BeautifulSoup(html, "html.parser")
        result = scraper._extract_date_from_text_patterns(soup)
        assert result == "3 days ago"

    def test_extracts_weeks_ago(self, scraper):
        html = '<div class="job-info">Listed 2 weeks ago</div>'
        soup = BeautifulSoup(html, "html.parser")
        result = scraper._extract_date_from_text_patterns(soup)
        assert result == "2 weeks ago"

    def test_extracts_today(self, scraper):
        html = '<span class="meta">Posted today</span>'
        soup = BeautifulSoup(html, "html.parser")
        result = scraper._extract_date_from_text_patterns(soup)
        assert result == "today"

    def test_extracts_yesterday(self, scraper):
        html = '<div class="info">Added yesterday</div>'
        soup = BeautifulSoup(html, "html.parser")
        result = scraper._extract_date_from_text_patterns(soup)
        assert result == "yesterday"

    def test_extracts_with_colon_format(self, scraper):
        html = '<div class="details">Posted: 5 days ago</div>'
        soup = BeautifulSoup(html, "html.parser")
        result = scraper._extract_date_from_text_patterns(soup)
        assert result == "5 days ago"

    def test_returns_none_when_no_patterns_match(self, scraper):
        html = '<div class="content">No date information here</div>'
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_date_from_text_patterns(soup) is None


class TestExtractPostedDateFromHtml:
    """Tests for the combined HTML date extraction with fallbacks."""

    def test_uses_meta_first(self, scraper):
        html = """
        <meta property="article:published_time" content="2025-11-01">
        <time datetime="2025-10-01">October</time>
        <div class="posted-date">2025-09-01</div>
        """
        soup = BeautifulSoup(html, "html.parser")
        # Meta should take priority
        assert scraper._extract_posted_date_from_html(soup) == "2025-11-01"

    def test_falls_back_to_time_elements(self, scraper):
        html = """
        <time datetime="2025-10-15">October 15</time>
        <div class="posted-date">2025-09-01</div>
        """
        soup = BeautifulSoup(html, "html.parser")
        # No meta, should use time element
        assert scraper._extract_posted_date_from_html(soup) == "2025-10-15"

    def test_falls_back_to_selectors(self, scraper):
        html = '<div class="posted-date">2025-09-20</div>'
        soup = BeautifulSoup(html, "html.parser")
        # No meta or time, should use selector
        assert scraper._extract_posted_date_from_html(soup) == "2025-09-20"

    def test_falls_back_to_text_patterns(self, scraper):
        html = '<div class="meta">Posted 7 days ago</div>'
        soup = BeautifulSoup(html, "html.parser")
        # No meta, time, or selector matches, should use text pattern
        assert scraper._extract_posted_date_from_html(soup) == "7 days ago"

    def test_returns_none_when_all_strategies_fail(self, scraper):
        html = "<html><body><p>No date information anywhere</p></body></html>"
        soup = BeautifulSoup(html, "html.parser")
        assert scraper._extract_posted_date_from_html(soup) is None


class TestEnrichFromDetailHtmlFallback:
    """Integration tests for HTML fallback when JSON-LD is missing."""

    def test_uses_meta_when_no_jsonld(self, scraper, stub_requests):
        html = """
        <html>
        <head><meta property="article:published_time" content="2025-11-25"></head>
        <body><h1>Job Title</h1></body>
        </html>
        """
        stub_requests.payloads["https://example.com/job/123"] = html

        job = {"title": "Engineer", "url": "https://example.com/job/123"}
        enriched = scraper._enrich_from_detail(job)
        assert enriched["posted_date"] == "2025-11-25"

    def test_uses_time_element_when_no_jsonld(self, scraper, stub_requests):
        html = """
        <html><body>
        <div class="job-header">
            <time datetime="2025-11-20">Nov 20</time>
        </div>
        </body></html>
        """
        stub_requests.payloads["https://example.com/job/456"] = html

        job = {"title": "Developer", "url": "https://example.com/job/456"}
        enriched = scraper._enrich_from_detail(job)
        assert enriched["posted_date"] == "2025-11-20"

    def test_uses_selector_when_no_jsonld(self, scraper, stub_requests):
        html = """
        <html><body>
        <div class="posted-date">December 1, 2025</div>
        </body></html>
        """
        stub_requests.payloads["https://example.com/job/789"] = html

        job = {"title": "Manager", "url": "https://example.com/job/789"}
        enriched = scraper._enrich_from_detail(job)
        assert enriched["posted_date"] == "December 1, 2025"

    def test_uses_text_pattern_when_no_jsonld(self, scraper, stub_requests):
        html = """
        <html><body>
        <div class="job-meta">Posted 2 days ago</div>
        </body></html>
        """
        stub_requests.payloads["https://example.com/job/abc"] = html

        job = {"title": "Analyst", "url": "https://example.com/job/abc"}
        enriched = scraper._enrich_from_detail(job)
        assert enriched["posted_date"] == "2 days ago"

    def test_jsonld_takes_priority_over_html(self, scraper, stub_requests):
        jsonld = {
            "@type": "JobPosting",
            "title": "Engineer",
            "datePosted": "2025-12-01",
        }
        html = f"""
        <html>
        <head>
            <meta property="article:published_time" content="2025-11-01">
            <script type="application/ld+json">{json.dumps(jsonld)}</script>
        </head>
        <body><div class="posted-date">2025-10-01</div></body>
        </html>
        """
        stub_requests.payloads["https://example.com/job/priority"] = html

        job = {"title": "Engineer", "url": "https://example.com/job/priority"}
        enriched = scraper._enrich_from_detail(job)
        # JSON-LD date should take priority
        assert enriched["posted_date"] == "2025-12-01"


class TestFetchDelaySettings:
    """Tests for configurable fetch delay between detail page requests."""

    def test_get_fetch_delay_seconds_returns_configured_value(self, monkeypatch):
        """Test that fetch delay is read from config."""
        from job_finder import settings

        def mock_get_scraping_settings(db_path=None):
            return {"fetchDelaySeconds": 2.5, "requestTimeoutSeconds": 30}

        monkeypatch.setattr(settings, "get_scraping_settings", mock_get_scraping_settings)
        settings.clear_settings_cache()

        delay = settings.get_fetch_delay_seconds()
        assert delay == 2.5

    def test_get_fetch_delay_seconds_defaults_to_one(self, monkeypatch):
        """Test that fetch delay defaults to 1 second when not configured."""
        from job_finder import settings

        def mock_get_scraping_settings(db_path=None):
            return {"requestTimeoutSeconds": 30}  # No fetchDelaySeconds

        monkeypatch.setattr(settings, "get_scraping_settings", mock_get_scraping_settings)
        settings.clear_settings_cache()

        delay = settings.get_fetch_delay_seconds()
        assert delay == 1.0

    def test_get_fetch_delay_seconds_handles_zero(self, monkeypatch):
        """Test that fetch delay of 0 disables delay."""
        from job_finder import settings

        def mock_get_scraping_settings(db_path=None):
            return {"fetchDelaySeconds": 0, "requestTimeoutSeconds": 30}

        monkeypatch.setattr(settings, "get_scraping_settings", mock_get_scraping_settings)
        settings.clear_settings_cache()

        delay = settings.get_fetch_delay_seconds()
        assert delay == 0.0
