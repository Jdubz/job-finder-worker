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


def test_enrich_smartrecruiters_detail(monkeypatch):
    """SmartRecruiters detail API should hydrate description/title/location/posted_date."""

    payload = {
        "name": "Sr Backend Engineer",
        "releasedDate": "2025-12-08T12:00:00Z",
        "location": {"fullLocation": "Remote, US"},
        "jobAd": {
            "sections": {
                "jobDescription": {"text": "<p>SR description</p>"},
                "qualifications": {"text": "<p>Reqs</p>"},
            }
        },
    }

    def fake_get(url, headers=None, timeout=None):
        class Resp:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self_inner):
                return payload

        return Resp()

    monkeypatch.setattr("job_finder.scrapers.generic_scraper.requests.get", fake_get)
    monkeypatch.setattr("job_finder.scrapers.generic_scraper.get_fetch_delay_seconds", lambda: 0)

    cfg = SourceConfig.from_dict(
        {
            "type": "api",
            "url": "https://api.smartrecruiters.com/v1/companies/acme/postings?limit=200",
            "response_path": "content",
            "fields": {
                "title": "name",
                "url": "ref",
                "description": "jobAd.sections.jobDescription.text",
            },
        }
    )
    scraper = GenericScraper(cfg)
    job = {
        "url": "https://api.smartrecruiters.com/v1/companies/acme/postings/123",
        "description": "",
    }

    enriched = scraper._enrich_from_detail(job)
    assert enriched["description"] == "<p>SR description</p>"
    assert enriched["title"] == "Sr Backend Engineer"
    assert enriched["location"] == "Remote, US"
    assert enriched["posted_date"] == "2025-12-08T12:00:00Z"


def test_enrich_workday_detail(monkeypatch):
    """Workday detail fetch should hydrate description via CXS API URL."""

    payload = {
        "jobPostingInfo": {
            "title": "Platform Engineer",
            "jobDescription": "<p>Build platforms</p>",
            "qualifications": "<p>5+ years</p>",
            "location": "San Francisco, CA",
            "postedOn": "2025-12-07",
        }
    }

    def fake_get(url, headers=None, timeout=None):
        class Resp:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self_inner):
                return payload

        fake_get.last_url = url
        return Resp()

    monkeypatch.setattr("job_finder.scrapers.generic_scraper.requests.get", fake_get)
    monkeypatch.setattr("job_finder.scrapers.generic_scraper.get_fetch_delay_seconds", lambda: 0)

    cfg = SourceConfig.from_dict(
        {
            "type": "api",
            "url": "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/careers/jobs",
            "base_url": "https://acme.wd5.myworkdayjobs.com/careers",
            "response_path": "jobPostings",
            "fields": {"title": "title", "url": "externalPath"},
        }
    )
    scraper = GenericScraper(cfg)
    job = {"url": "job/12345", "description": ""}

    enriched = scraper._enrich_from_detail(job)
    assert enriched["description"] == "<p>Build platforms</p>"
    assert enriched["title"] == "Platform Engineer"
    assert enriched["location"] == "San Francisco, CA"
    assert enriched["posted_date"] == "2025-12-07"
    # URL should be the human-readable URL, not the CXS API URL
    assert enriched["url"] == "https://acme.wd5.myworkdayjobs.com/careers/job/12345"
    # The fetch should have used the CXS API URL
    assert "/wday/cxs/acme/careers/job/12345" in fake_get.last_url


def test_enrich_workday_converts_absolute_human_url_to_cxs(monkeypatch):
    """Workday enrichment should convert absolute human URLs to CXS API URLs."""

    payload = {
        "jobPostingInfo": {
            "jobDescription": "<p>Full description from CXS API</p>",
        }
    }

    def fake_get(url, headers=None, timeout=None):
        class Resp:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self_inner):
                return payload

        fake_get.last_url = url
        return Resp()

    monkeypatch.setattr("job_finder.scrapers.generic_scraper.requests.get", fake_get)
    monkeypatch.setattr("job_finder.scrapers.generic_scraper.get_fetch_delay_seconds", lambda: 0)

    cfg = SourceConfig.from_dict(
        {
            "type": "api",
            "url": "https://gevernova.wd5.myworkdayjobs.com/wday/cxs/gevernova/Vernova_ExternalSite/jobs",
            "base_url": "https://gevernova.wd5.myworkdayjobs.com/Vernova_ExternalSite",
            "response_path": "jobPostings",
            "fields": {"title": "title", "url": "externalPath"},
        }
    )
    scraper = GenericScraper(cfg)
    # Simulate absolute human URL (as stored in job_listings)
    job = {
        "url": "https://gevernova.wd5.myworkdayjobs.com/vernova_externalsite/job/Remote/Senior-Engineer_R5032667",
        "description": "",
    }

    enriched = scraper._enrich_from_detail(job)
    assert enriched["description"] == "<p>Full description from CXS API</p>"
    # Fetch URL should be the CXS API format
    assert "/wday/cxs/gevernova/Vernova_ExternalSite/job/" in fake_get.last_url
    # Job URL should remain the human-readable URL
    assert (
        enriched["url"]
        == "https://gevernova.wd5.myworkdayjobs.com/vernova_externalsite/job/Remote/Senior-Engineer_R5032667"
    )


def test_enrich_workday_relative_url_with_cxs_config_derives_human_url(monkeypatch):
    """When base_url is not set and config.url is CXS, human URL should strip /wday/cxs/{tenant}."""

    payload = {
        "jobPostingInfo": {
            "jobDescription": "<p>Full job description</p>",
        }
    }

    def fake_get(url, headers=None, timeout=None):
        class Resp:
            status_code = 200

            def raise_for_status(self):
                return None

            def json(self_inner):
                return payload

        fake_get.last_url = url
        return Resp()

    monkeypatch.setattr("job_finder.scrapers.generic_scraper.requests.get", fake_get)
    monkeypatch.setattr("job_finder.scrapers.generic_scraper.get_fetch_delay_seconds", lambda: 0)

    # Config has NO base_url; url is a CXS endpoint
    cfg = SourceConfig.from_dict(
        {
            "type": "api",
            "url": "https://gevernova.wd5.myworkdayjobs.com/wday/cxs/gevernova/Vernova_ExternalSite/jobs",
            "response_path": "jobPostings",
            "fields": {"title": "title", "url": "externalPath"},
        }
    )
    scraper = GenericScraper(cfg)
    # Relative URL as returned by Workday API
    job = {
        "url": "job/Remote/Senior-Engineer_R5032667",
        "description": "",
    }

    enriched = scraper._enrich_from_detail(job)
    # Human URL should NOT contain /wday/cxs/
    assert "/wday/cxs/" not in enriched["url"]
    assert (
        enriched["url"]
        == "https://gevernova.wd5.myworkdayjobs.com/Vernova_ExternalSite/job/Remote/Senior-Engineer_R5032667"
    )
    assert enriched["description"] == "<p>Full job description</p>"


def test_should_enrich_rules(monkeypatch):
    cfg = SourceConfig.from_dict(
        {
            "type": "api",
            "url": "https://api.smartrecruiters.com/v1/companies/acme/postings?limit=200",
            "response_path": "content",
            "fields": {
                "title": "name",
                "url": "ref",
                "description": "jobAd.sections.jobDescription.text",
            },
        }
    )
    scraper = GenericScraper(cfg)
    # API sources only enrich when follow_detail is True
    assert scraper._should_enrich({"description": "", "posted_date": None}) is False
    # With description and posted_date -> still no enrichment for API without follow_detail
    assert scraper._should_enrich({"description": "d", "posted_date": "2025-01-01"}) is False
    scraper.config.follow_detail = True
    assert scraper._should_enrich({"description": "d", "posted_date": "2025-01-01"}) is True


class TestShouldEnrichDescriptionQualityGate:
    """Tests for description length quality gate in _should_enrich."""

    def test_rss_enriches_when_description_is_short(self):
        """RSS sources should trigger enrichment when description is too short."""
        cfg = SourceConfig.from_dict(
            {
                "type": "rss",
                "url": "https://example.com/feed.xml",
                "fields": {"title": "title", "url": "link", "description": "description"},
            }
        )
        scraper = GenericScraper(cfg)
        # Short description like ManTech's "- R63172" should trigger enrichment
        assert (
            scraper._should_enrich({"description": "- R63172", "posted_date": "2026-01-01"}) is True
        )

    def test_rss_does_not_enrich_when_description_is_adequate(self):
        """RSS sources should skip enrichment when description is long enough."""
        cfg = SourceConfig.from_dict(
            {
                "type": "rss",
                "url": "https://example.com/feed.xml",
                "fields": {"title": "title", "url": "link", "description": "description"},
            }
        )
        scraper = GenericScraper(cfg)
        long_desc = "A" * 200
        assert (
            scraper._should_enrich({"description": long_desc, "posted_date": "2026-01-01"}) is False
        )

    def test_html_enriches_when_description_is_empty(self):
        """HTML sources should trigger enrichment when description is empty."""
        cfg = SourceConfig.from_dict(
            {
                "type": "html",
                "url": "https://example.com/jobs",
                "job_selector": ".job",
                "fields": {"title": "h2", "url": "a@href"},
            }
        )
        scraper = GenericScraper(cfg)
        assert scraper._should_enrich({"description": "", "posted_date": "2026-01-01"}) is True

    def test_api_ignores_description_quality(self):
        """API sources should NOT auto-enrich based on description length."""
        cfg = SourceConfig.from_dict(
            {
                "type": "api",
                "url": "https://example.com/api/jobs",
                "response_path": "jobs",
                "fields": {"title": "title", "url": "url", "description": "desc"},
            }
        )
        scraper = GenericScraper(cfg)
        # Short description on API source should NOT trigger enrichment
        assert (
            scraper._should_enrich({"description": "- R63172", "posted_date": "2026-01-01"})
            is False
        )


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


class TestWorkdayDetailApiUrl:
    """Tests for converting Workday human URLs to CXS API URLs."""

    def _make_scraper(self, config_url, base_url=None):
        cfg = SourceConfig.from_dict(
            {
                "type": "api",
                "url": config_url,
                "base_url": base_url,
                "response_path": "jobPostings",
                "fields": {"title": "title", "url": "externalPath"},
            }
        )
        return GenericScraper(cfg)

    def test_converts_absolute_human_url_to_cxs(self):
        scraper = self._make_scraper(
            config_url="https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/careers/jobs",
            base_url="https://acme.wd5.myworkdayjobs.com/careers",
        )
        result = scraper._workday_detail_api_url(
            "https://acme.wd5.myworkdayjobs.com/careers/job/Remote/Engineer_R123"
        )
        assert (
            result
            == "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/careers/job/Remote/Engineer_R123"
        )

    def test_converts_relative_url_to_cxs(self):
        scraper = self._make_scraper(
            config_url="https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/careers/jobs",
            base_url="https://acme.wd5.myworkdayjobs.com/careers",
        )
        result = scraper._workday_detail_api_url("job/Remote/Engineer_R123")
        assert (
            result
            == "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/careers/job/Remote/Engineer_R123"
        )

    def test_already_cxs_url_returned_as_is(self):
        scraper = self._make_scraper(
            config_url="https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/careers/jobs",
        )
        cxs_url = "https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/careers/job/Engineer_R123"
        assert scraper._workday_detail_api_url(cxs_url) == cxs_url

    def test_fallback_when_config_url_not_cxs_format(self):
        """When config URL isn't in CXS format, derive tenant from hostname."""
        scraper = self._make_scraper(
            config_url="https://acme.wd5.myworkdayjobs.com/careers",
        )
        result = scraper._workday_detail_api_url(
            "https://acme.wd5.myworkdayjobs.com/careers/job/Engineer_R123"
        )
        assert "/wday/cxs/acme/" in result
        assert result.endswith("/job/Engineer_R123")

    def test_handles_language_prefix_in_fallback(self):
        """Fallback should strip language prefix like /en-US/ from site path."""
        scraper = self._make_scraper(
            config_url="https://acme.wd5.myworkdayjobs.com/en-US/careers",
        )
        result = scraper._workday_detail_api_url(
            "https://acme.wd5.myworkdayjobs.com/en-US/careers/job/Engineer_R123"
        )
        assert "/wday/cxs/acme/" in result
        assert "/en-US/" not in result
        assert result.endswith("/job/Engineer_R123")


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


class TestEnrichStaleListings:
    """Tests for graceful handling of 404/410 errors on stale job listings."""

    @pytest.fixture
    def scraper(self):
        """Create a scraper with follow_detail enabled."""
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

    @pytest.mark.parametrize("status_code", [403, 404, 410])
    def test_enrich_returns_job_unmodified_on_inaccessible_page(
        self, monkeypatch, scraper, status_code
    ):
        """Job should be returned unmodified when detail page returns 403, 404, or 410."""
        sleep_calls = []

        def fake_get(url, headers=None, timeout=None):
            return SimpleNamespace(status_code=status_code, text="Not Found")

        def fake_sleep(seconds):
            sleep_calls.append(seconds)

        monkeypatch.setattr("job_finder.scrapers.generic_scraper.requests.get", fake_get)
        monkeypatch.setattr(
            "job_finder.scrapers.generic_scraper.get_fetch_delay_seconds", lambda: 0.5
        )
        monkeypatch.setattr("job_finder.scrapers.generic_scraper.time.sleep", fake_sleep)

        original_job = {
            "title": "Software Engineer",
            "url": "https://example.com/job/123",
            "company": "Acme Corp",
        }
        job = original_job.copy()

        result = scraper._enrich_from_detail(job)

        # Job should be returned unmodified
        assert result == original_job
        # Rate limit delay should still be applied
        assert sleep_calls == [0.5]

    def test_enrich_still_raises_on_other_errors(self, monkeypatch, scraper):
        """Other HTTP errors (e.g., 500) should still propagate."""
        import requests

        def fake_get(url, headers=None, timeout=None):
            resp = SimpleNamespace(status_code=500, text="Internal Server Error")
            resp.raise_for_status = lambda: (_ for _ in ()).throw(
                requests.HTTPError("500 Server Error")
            )
            return resp

        monkeypatch.setattr("job_finder.scrapers.generic_scraper.requests.get", fake_get)
        monkeypatch.setattr(
            "job_finder.scrapers.generic_scraper.get_fetch_delay_seconds", lambda: 0
        )

        job = {"title": "Engineer", "url": "https://example.com/job/456"}

        with pytest.raises(requests.HTTPError):
            scraper._enrich_from_detail(job)


class TestExtractCompanyWebsiteFromDescription:
    """Tests for _extract_company_website_from_description."""

    @pytest.fixture
    def scraper(self):
        cfg = SourceConfig.from_dict(
            {
                "type": "rss",
                "url": "https://weworkremotely.com/remote-jobs.rss",
                "fields": {"title": "title", "url": "link", "description": "description"},
            }
        )
        return GenericScraper(cfg)

    def test_extracts_from_wwr_url_strong_pattern(self, scraper):
        """Should extract from WeWorkRemotely URL:</strong> format."""
        desc = (
            '<p>Some job description</p>'
            '<strong>URL:</strong> <a href="https://acme.com/careers">https://acme.com/careers</a>'
        )
        assert scraper._extract_company_website_from_description(desc) == "https://acme.com/careers"

    def test_fallback_extracts_first_external_href(self, scraper):
        """Should fall back to first external <a href> in RSS description."""
        desc = (
            '<p>We are hiring!</p>'
            '<a href="https://coolstartup.io/jobs">Apply here</a>'
            '<a href="https://other.com">Other link</a>'
        )
        assert (
            scraper._extract_company_website_from_description(desc) == "https://coolstartup.io/jobs"
        )

    def test_fallback_skips_aggregator_links(self, scraper):
        """Aggregator self-links should be skipped in fallback."""
        desc = (
            '<a href="https://weworkremotely.com/listings/some-job">View on WWR</a>'
            '<a href="https://company.com/careers">Company site</a>'
        )
        assert (
            scraper._extract_company_website_from_description(desc) == "https://company.com/careers"
        )

    def test_fallback_handles_href_not_first_attribute(self, scraper):
        """Should extract href even when it's not the first attribute on the tag."""
        desc = '<a target="_blank" href="https://example.com/apply">Apply</a>'
        assert (
            scraper._extract_company_website_from_description(desc) == "https://example.com/apply"
        )

    def test_fallback_handles_single_quotes(self, scraper):
        """Should extract href with single-quoted attribute values."""
        desc = "<a href='https://example.com/jobs'>Jobs</a>"
        assert (
            scraper._extract_company_website_from_description(desc) == "https://example.com/jobs"
        )

    def test_returns_none_for_empty_description(self, scraper):
        assert scraper._extract_company_website_from_description("") is None
        assert scraper._extract_company_website_from_description(None) is None

    def test_returns_none_when_only_aggregator_links(self, scraper):
        """Should return None when all links are from aggregator domains."""
        desc = (
            '<a href="https://weworkremotely.com/foo">WWR</a>'
            '<a href="https://remotive.com/bar">Remotive</a>'
        )
        assert scraper._extract_company_website_from_description(desc) is None
