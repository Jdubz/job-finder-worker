"""Tests for GenericScraper."""

from unittest.mock import Mock, patch
import pytest

from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig


class TestSourceConfig:
    """Test SourceConfig dataclass."""

    def test_from_dict_basic(self):
        """Test creating SourceConfig from basic dict."""
        data = {
            "type": "api",
            "url": "https://api.example.com/jobs",
            "fields": {"title": "name", "url": "link"},
        }
        config = SourceConfig.from_dict(data)

        assert config.type == "api"
        assert config.url == "https://api.example.com/jobs"
        assert config.fields == {"title": "name", "url": "link"}

    def test_from_dict_with_company_override(self):
        """Test company name override."""
        data = {
            "type": "api",
            "url": "https://api.example.com/jobs",
            "fields": {"title": "name", "url": "link"},
            "company_name": "Original",
        }
        config = SourceConfig.from_dict(data, company_name="Override")

        assert config.company_name == "Override"

    def test_from_dict_full(self):
        """Test creating SourceConfig with all fields."""
        data = {
            "type": "api",
            "url": "https://api.example.com/jobs",
            "fields": {"title": "name", "url": "link"},
            "response_path": "data.jobs",
            "company_name": "Test Corp",
            "headers": {"Authorization": "Bearer token"},
            "api_key": "secret123",
            "auth_type": "bearer",
            "auth_param": "",
            "salary_min_field": "min_salary",
            "salary_max_field": "max_salary",
        }
        config = SourceConfig.from_dict(data)

        assert config.type == "api"
        assert config.response_path == "data.jobs"
        assert config.company_name == "Test Corp"
        assert config.headers == {"Authorization": "Bearer token"}
        assert config.api_key == "secret123"
        assert config.auth_type == "bearer"
        assert config.salary_min_field == "min_salary"
        assert config.salary_max_field == "max_salary"

    def test_to_dict(self):
        """Test converting SourceConfig to dict."""
        config = SourceConfig(
            type="rss",
            url="https://example.com/feed.xml",
            fields={"title": "title", "url": "link"},
            company_name="Test",
        )
        result = config.to_dict()

        assert result["type"] == "rss"
        assert result["url"] == "https://example.com/feed.xml"
        assert result["fields"] == {"title": "title", "url": "link"}
        assert result["company_name"] == "Test"
        # Empty fields should not be included
        assert "response_path" not in result
        assert "api_key" not in result

    def test_validate_valid_config(self):
        """Test validation passes for valid config."""
        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "name", "url": "link"},
        )
        config.validate()  # Should not raise

    def test_validate_invalid_type(self):
        """Test validation fails for invalid type."""
        config = SourceConfig(
            type="invalid",
            url="https://api.example.com/jobs",
            fields={"title": "name", "url": "link"},
        )
        with pytest.raises(ValueError, match="Invalid source type"):
            config.validate()

    def test_validate_missing_url(self):
        """Test validation fails without URL."""
        config = SourceConfig(
            type="api",
            url="",
            fields={"title": "name", "url": "link"},
        )
        with pytest.raises(ValueError, match="URL is required"):
            config.validate()

    def test_validate_missing_fields(self):
        """Test validation fails without fields."""
        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={},
        )
        with pytest.raises(ValueError, match="fields mapping is required"):
            config.validate()

    def test_validate_missing_required_fields(self):
        """Test validation fails without title and url fields."""
        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"company": "org"},
        )
        with pytest.raises(ValueError, match="must include at least 'title' and 'url'"):
            config.validate()

    def test_validate_html_missing_selector(self):
        """Test validation fails for HTML without job_selector."""
        config = SourceConfig(
            type="html",
            url="https://example.com/careers",
            fields={"title": ".title", "url": "a@href"},
            job_selector="",
        )
        with pytest.raises(ValueError, match="job_selector is required"):
            config.validate()


class TestGenericScraperAPI:
    """Test GenericScraper with API sources."""

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_success(self, mock_get):
        """Test successful API scraping."""
        mock_response = Mock()
        mock_response.json.return_value = {
            "jobs": [
                {
                    "title": "Software Engineer",
                    "link": "https://example.com/job/1",
                    "location": "Remote",
                }
            ]
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            response_path="jobs",
            fields={"title": "title", "url": "link", "location": "location"},
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert jobs[0]["title"] == "Software Engineer"
        assert jobs[0]["url"] == "https://example.com/job/1"
        assert jobs[0]["location"] == "Remote"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_with_auth_bearer(self, mock_get):
        """Test API scraping with bearer auth."""
        mock_response = Mock()
        mock_response.json.return_value = [{"title": "Job", "url": "https://example.com"}]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
            api_key="secret123",
            auth_type="bearer",
        )
        scraper = GenericScraper(config)
        scraper.scrape()

        # Check that Authorization header was set
        call_kwargs = mock_get.call_args[1]
        assert "Authorization" in call_kwargs["headers"]
        assert call_kwargs["headers"]["Authorization"] == "Bearer secret123"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_with_auth_query(self, mock_get):
        """Test API scraping with query param auth."""
        mock_response = Mock()
        mock_response.json.return_value = [{"title": "Job", "url": "https://example.com"}]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
            api_key="secret123",
            auth_type="query",
            auth_param="api_key",
        )
        scraper = GenericScraper(config)
        scraper.scrape()

        # Check that URL contains auth param
        call_args = mock_get.call_args[0]
        assert "api_key=secret123" in call_args[0]

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_nested_fields(self, mock_get):
        """Test API scraping with nested field paths."""
        mock_response = Mock()
        mock_response.json.return_value = {
            "data": {
                "results": [
                    {
                        "position": "Engineer",
                        "company": {"name": "TechCorp"},
                        "url": "https://example.com/job/1",
                    }
                ]
            }
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            response_path="data.results",
            fields={
                "title": "position",
                "company": "company.name",
                "url": "url",
            },
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert jobs[0]["title"] == "Engineer"
        assert jobs[0]["company"] == "TechCorp"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_array_slice(self, mock_get):
        """Test API scraping with array slice (like RemoteOK)."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {"legal": "notice"},  # First element to skip
            {"title": "Job 1", "url": "https://example.com/1"},
            {"title": "Job 2", "url": "https://example.com/2"},
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://remoteok.com/api",
            response_path="[1:]",
            fields={"title": "title", "url": "url"},
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 2
        assert jobs[0]["title"] == "Job 1"
        assert jobs[1]["title"] == "Job 2"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_with_salary_fields(self, mock_get):
        """Test API scraping with separate min/max salary fields."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {
                "title": "Engineer",
                "url": "https://example.com/1",
                "salary_min": 100000,
                "salary_max": 150000,
            }
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
            salary_min_field="salary_min",
            salary_max_field="salary_max",
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert jobs[0]["salary"] == "$100,000 - $150,000"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_company_override(self, mock_get):
        """Test that company_name config overrides extracted company."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {
                "title": "Engineer",
                "url": "https://example.com/1",
                "company": "Extracted Company",
            }
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url", "company": "company"},
            company_name="Override Company",
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert jobs[0]["company"] == "Override Company"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_error_handling(self, mock_get):
        """Test that API errors return empty list."""
        import requests

        mock_get.side_effect = requests.RequestException("API Error")

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert jobs == []


class TestGenericScraperRSS:
    """Test GenericScraper with RSS sources."""

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_rss_success(self, mock_get, mock_parse):
        """Test successful RSS scraping."""
        # Mock requests.get response
        mock_response = Mock()
        mock_response.text = "<rss><channel><item/></channel></rss>"
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        # Mock feedparser.parse response
        mock_entry = Mock()
        mock_entry.title = "Software Engineer at TechCorp"
        mock_entry.link = "https://example.com/job/1"
        mock_entry.summary = "Great opportunity"
        mock_entry.published = "Mon, 25 Oct 2025 10:00:00 GMT"

        mock_feed = Mock()
        mock_feed.bozo = False
        mock_feed.entries = [mock_entry]
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://example.com/jobs.rss",
            fields={
                "title": "title",
                "url": "link",
                "description": "summary",
                "posted_date": "published",
            },
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert "Software Engineer" in jobs[0]["title"]
        assert jobs[0]["url"] == "https://example.com/job/1"

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_rss_empty_feed(self, mock_get, mock_parse):
        """Test RSS scraping with empty feed."""
        # Mock requests.get response
        mock_response = Mock()
        mock_response.text = "<rss><channel></channel></rss>"
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        # Mock feedparser.parse response
        mock_feed = Mock()
        mock_feed.bozo = False
        mock_feed.entries = []
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://example.com/jobs.rss",
            fields={"title": "title", "url": "link"},
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert jobs == []


class TestGenericScraperHTML:
    """Test GenericScraper with HTML sources."""

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_html_success(self, mock_get):
        """Test successful HTML scraping."""
        mock_response = Mock()
        mock_response.text = """
        <html>
        <body>
            <div class="job-listing">
                <h2 class="job-title">Software Engineer</h2>
                <span class="location">Remote</span>
                <a href="https://example.com/apply/1">Apply</a>
            </div>
            <div class="job-listing">
                <h2 class="job-title">Product Manager</h2>
                <span class="location">NYC</span>
                <a href="https://example.com/apply/2">Apply</a>
            </div>
        </body>
        </html>
        """
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="html",
            url="https://example.com/careers",
            job_selector=".job-listing",
            fields={
                "title": ".job-title",
                "location": ".location",
                "url": "a@href",
            },
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 2
        assert jobs[0]["title"] == "Software Engineer"
        assert jobs[0]["location"] == "Remote"
        assert jobs[0]["url"] == "https://example.com/apply/1"
        assert jobs[1]["title"] == "Product Manager"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_html_attribute_selector(self, mock_get):
        """Test HTML scraping with attribute selectors."""
        mock_response = Mock()
        mock_response.text = """
        <html>
        <body>
            <div class="job" data-company="TechCorp">
                <h2 class="title">Engineer</h2>
                <a class="apply" href="/jobs/1">Apply</a>
            </div>
        </body>
        </html>
        """
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="html",
            url="https://example.com/careers",
            job_selector=".job",
            fields={
                "title": ".title",
                "url": "a.apply@href",
            },
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert jobs[0]["title"] == "Engineer"
        assert jobs[0]["url"] == "/jobs/1"


class TestGenericScraperEdgeCases:
    """Test edge cases and error handling."""

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_skips_jobs_missing_title(self, mock_get):
        """Test that jobs without title are skipped."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {"url": "https://example.com/1"},  # Missing title
            {"title": "Valid Job", "url": "https://example.com/2"},
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert jobs[0]["title"] == "Valid Job"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_skips_jobs_missing_url(self, mock_get):
        """Test that jobs without URL are skipped."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {"title": "Job 1"},  # Missing URL
            {"title": "Job 2", "url": "https://example.com/2"},
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert jobs[0]["url"] == "https://example.com/2"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_defaults_for_missing_fields(self, mock_get):
        """Test default values for missing optional fields."""
        mock_response = Mock()
        mock_response.json.return_value = [{"title": "Engineer", "url": "https://example.com/1"}]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        # Empty strings are used as defaults instead of "Unknown"
        assert jobs[0]["company"] == ""
        assert jobs[0]["location"] == ""
        assert jobs[0]["description"] == ""
        assert jobs[0]["company_website"] == ""

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_unix_timestamp_conversion(self, mock_get):
        """Test that Unix timestamps are converted to ISO format."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {
                "title": "Engineer",
                "url": "https://example.com/1",
                "date": 1700000000,  # Unix timestamp
            }
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url", "posted_date": "date"},
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        # Should be ISO format
        assert "2023" in jobs[0]["posted_date"]
        assert "T" in jobs[0]["posted_date"]


class TestAntiBlockDetection:
    """Test anti-bot detection in RSS scraping."""

    @pytest.mark.parametrize(
        "source_type,request_attr,config_kwargs",
        [
            (
                "api",
                "json",
                {
                    "type": "api",
                    "url": "https://api.example.com/jobs",
                    "fields": {"title": "title", "url": "url", "description": "desc"},
                },
            ),
            (
                "rss",
                "text",
                {
                    "type": "rss",
                    "url": "https://www.example.com/jobs.rss",
                    "fields": {"title": "title", "url": "link", "description": "summary"},
                },
            ),
            (
                "html",
                "text",
                {
                    "type": "html",
                    "url": "https://www.example.com/jobs",
                    "job_selector": "div.job",
                    "fields": {"title": "text", "url": "a.@href", "description": "text"},
                },
            ),
        ],
    )
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_http_errors_raise_scrape_blocked(
        self, mock_get, source_type, request_attr, config_kwargs
    ):
        """Any HTTP error should bubble up as ScrapeBlockedError so callers can disable sources."""
        from requests import HTTPError
        from job_finder.exceptions import ScrapeBlockedError

        mock_resp = Mock()
        mock_resp.status_code = 403
        mock_resp.reason = "Forbidden"
        error = HTTPError(response=mock_resp)
        mock_resp.raise_for_status.side_effect = error
        # Provide minimal attribute accessed by code path
        setattr(mock_resp, request_attr, Mock())
        mock_get.return_value = mock_resp

        config = SourceConfig(**config_kwargs)
        scraper = GenericScraper(config)

        with pytest.raises(ScrapeBlockedError) as exc:
            scraper.scrape()

        assert "HTTP 403" in exc.value.reason

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_detect_captcha_page(self, mock_get, mock_parse):
        """Test that CAPTCHA page is detected and raises ScrapeBlockedError."""
        from job_finder.exceptions import ScrapeBlockedError

        # Return HTML with captcha instead of RSS
        mock_response = Mock()
        mock_response.text = """
        <!DOCTYPE html>
        <html>
        <head><title>Security Check</title></head>
        <body>
            <div class="captcha-container">
                <p>Please verify you are not a robot</p>
            </div>
        </body>
        </html>
        """
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        # feedparser will fail to parse HTML as RSS
        mock_feed = Mock()
        mock_feed.bozo = True
        mock_feed.bozo_exception = Exception("not well-formed (invalid token)")
        mock_feed.entries = []
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://example.com/jobs.rss",
            fields={"title": "title", "url": "link"},
        )
        scraper = GenericScraper(config)

        with pytest.raises(ScrapeBlockedError) as exc_info:
            scraper.scrape()

        assert "CAPTCHA" in exc_info.value.reason

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_detect_cloudflare_challenge(self, mock_get, mock_parse):
        """Test that Cloudflare challenge page is detected."""
        from job_finder.exceptions import ScrapeBlockedError

        mock_response = Mock()
        mock_response.text = """
        <!DOCTYPE html>
        <html>
        <head><title>Just a moment...</title></head>
        <body>
            <p>Checking your browser before accessing example.com.</p>
        </body>
        </html>
        """
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        mock_feed = Mock()
        mock_feed.bozo = True
        mock_feed.bozo_exception = Exception("not well-formed")
        mock_feed.entries = []
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://example.com/jobs.rss",
            fields={"title": "title", "url": "link"},
        )
        scraper = GenericScraper(config)

        with pytest.raises(ScrapeBlockedError) as exc_info:
            scraper.scrape()

        assert "Cloudflare" in exc_info.value.reason

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_detect_generic_html_response(self, mock_get, mock_parse):
        """Test that generic HTML instead of RSS is detected."""
        from job_finder.exceptions import ScrapeBlockedError

        mock_response = Mock()
        mock_response.text = """
        <!DOCTYPE html>
        <html>
        <body><p>Some HTML page</p></body>
        </html>
        """
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        mock_feed = Mock()
        mock_feed.bozo = True
        mock_feed.bozo_exception = Exception("not well-formed")
        mock_feed.entries = []
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://example.com/jobs.rss",
            fields={"title": "title", "url": "link"},
        )
        scraper = GenericScraper(config)

        with pytest.raises(ScrapeBlockedError) as exc_info:
            scraper.scrape()

        assert "HTML page received" in exc_info.value.reason

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_valid_rss_with_bozo_does_not_raise(self, mock_get, mock_parse):
        """Test that bozo warnings don't raise if entries are present."""
        mock_response = Mock()
        mock_response.text = "<rss><channel><item/></channel></rss>"
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        mock_entry = Mock()
        mock_entry.title = "Test Job"
        mock_entry.link = "https://example.com/job/1"

        mock_feed = Mock()
        mock_feed.bozo = True  # Has issues but still has entries
        mock_feed.bozo_exception = Exception("minor issue")
        mock_feed.entries = [mock_entry]
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://example.com/jobs.rss",
            fields={"title": "title", "url": "link"},
        )
        scraper = GenericScraper(config)

        # Should NOT raise, should return jobs
        jobs = scraper.scrape()
        assert len(jobs) == 1
        assert jobs[0]["title"] == "Test Job"
