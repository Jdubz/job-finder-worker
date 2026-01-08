"""Tests for GenericScraper."""

from unittest.mock import Mock, patch
import pytest
import sqlite3

from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig
from job_finder.rendering.playwright_renderer import RenderResult


@pytest.fixture(autouse=True)
def temp_db_env(tmp_path, monkeypatch):
    """Ensure SQLITE_DB_PATH points to a real temp db for scraper tests."""
    db_path = tmp_path / "test.db"
    sqlite3.connect(db_path).close()
    monkeypatch.setenv("SQLITE_DB_PATH", str(db_path))
    yield


@pytest.fixture(autouse=True)
def disable_enrich(monkeypatch):
    """Avoid hitting detail pages in unit tests."""
    monkeypatch.setattr(GenericScraper, "_should_enrich", lambda self, job: False)


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

    def test_validate_requires_js_only_for_html(self):
        """requires_js should only be allowed on HTML sources."""
        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "name", "url": "link"},
            requires_js=True,
        )
        with pytest.raises(ValueError, match="requires_js is only supported"):
            config.validate()

    def test_validate_render_timeout_floor(self):
        """render_timeout_ms must not be too low."""
        config = SourceConfig(
            type="html",
            url="https://example.com",
            fields={"title": ".title", "url": "a@href"},
            job_selector=".job",
            requires_js=True,
            render_timeout_ms=500,
        )
        with pytest.raises(ValueError, match="at least 1000 ms"):
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
                    "posted_date": "2024-01-01T00:00:00Z",
                    "description": "Great role",
                }
            ]
        }
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            response_path="jobs",
            fields={
                "title": "title",
                "url": "link",
                "location": "location",
                "posted_date": "posted_date",
                "description": "description",
            },
        )
        scraper = GenericScraper(config)
        scraper._should_enrich = lambda job: False  # avoid detail fetch in unit test
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert jobs[0]["title"] == "Software Engineer"
        assert jobs[0]["url"] == "https://example.com/job/1"
        assert jobs[0]["location"] == "Remote"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_with_auth_bearer(self, mock_get):
        """Test API scraping with bearer auth."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {"title": "Job", "url": "https://example.com", "posted_date": "2024-01-01"}
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url", "posted_date": "posted_date"},
            api_key="secret123",
            auth_type="bearer",
        )
        scraper = GenericScraper(config)
        scraper._should_enrich = lambda job: False
        scraper.scrape()

        # Check that Authorization header was set
        call_kwargs = mock_get.call_args[1]
        assert "Authorization" in call_kwargs["headers"]
        assert call_kwargs["headers"]["Authorization"] == "Bearer secret123"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_with_auth_query(self, mock_get):
        """Test API scraping with query param auth."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {"title": "Job", "url": "https://example.com", "posted_date": "2024-01-01"}
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url", "posted_date": "posted_date"},
            api_key="secret123",
            auth_type="query",
            auth_param="api_key",
        )
        scraper = GenericScraper(config)
        scraper._should_enrich = lambda job: False
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
                        "posted_date": "2024-01-01",
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
                "posted_date": "posted_date",
            },
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert jobs[0]["title"] == "Engineer"
        assert jobs[0]["company"] == "TechCorp"

    @patch("job_finder.scrapers.generic_scraper.requests.post")
    def test_scrape_api_post_paginates_on_offset_limit(self, mock_post):
        """POST APIs with offset/limit in body should auto-paginate (e.g., Workday)."""
        first = Mock()
        first.json.return_value = {
            "jobPostings": [{"title": "A", "externalPath": "job/1", "postedOn": "2024-01-01"}]
        }
        first.raise_for_status = Mock()

        second = Mock()
        second.json.return_value = {
            "jobPostings": [{"title": "B", "externalPath": "job/2", "postedOn": "2024-01-02"}]
        }
        second.raise_for_status = Mock()

        # Empty third page to stop pagination
        third = Mock()
        third.json.return_value = {"jobPostings": []}
        third.raise_for_status = Mock()

        mock_post.side_effect = [first, second, third]

        config = SourceConfig(
            type="api",
            url="https://tenant.wd1.myworkdayjobs.com/wday/cxs/tenant/site/jobs",
            response_path="jobPostings",
            method="POST",
            post_body={"limit": 1, "offset": 0},
            base_url="https://tenant.wd1.myworkdayjobs.com/site",
            fields={"title": "title", "url": "externalPath", "posted_date": "postedOn"},
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 2
        # offsets should be 0, 1, 2 (incremented by limit=1 each iteration)
        assert mock_post.call_count == 3
        assert mock_post.call_args_list[0].kwargs["json"]["offset"] == 0
        assert mock_post.call_args_list[1].kwargs["json"]["offset"] == 1
        assert mock_post.call_args_list[2].kwargs["json"]["offset"] == 2
        assert jobs[0]["url"] == "https://tenant.wd1.myworkdayjobs.com/site/job/1"
        assert jobs[1]["url"] == "https://tenant.wd1.myworkdayjobs.com/site/job/2"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_base_url_prefixes_relative_paths(self, mock_get):
        """Relative URLs should be prefixed with base_url."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {"title": "Engineer", "externalPath": "job/123", "posted_date": "2024-01-01"}
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            response_path="",
            fields={"title": "title", "url": "externalPath", "posted_date": "posted_date"},
            base_url="https://tenant.wd1.myworkdayjobs.com/site",
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert jobs[0]["url"] == "https://tenant.wd1.myworkdayjobs.com/site/job/123"

    @patch("job_finder.scrapers.generic_scraper.requests.post")
    def test_scrape_api_post_stops_when_first_page_under_limit(self, mock_post):
        """Pagination should stop when first page has fewer than limit items."""
        first = Mock()
        first.json.return_value = {
            "jobPostings": [{"title": "Solo", "externalPath": "job/1", "postedOn": "2024-01-01"}]
        }
        first.raise_for_status = Mock()
        mock_post.side_effect = [first]

        config = SourceConfig(
            type="api",
            url="https://tenant.wd1.myworkdayjobs.com/wday/cxs/tenant/site/jobs",
            response_path="jobPostings",
            method="POST",
            post_body={"limit": 5, "offset": 0},
            base_url="https://tenant.wd1.myworkdayjobs.com/site",
            fields={"title": "title", "url": "externalPath", "posted_date": "postedOn"},
        )
        jobs = GenericScraper(config).scrape()

        assert len(jobs) == 1
        assert mock_post.call_count == 1  # stops after first short page

    @patch("job_finder.scrapers.generic_scraper.requests.post")
    def test_scrape_api_post_raises_on_later_page_error(self, mock_post):
        """HTTP errors mid-pagination should raise ScrapeBlockedError."""
        import requests
        from job_finder.exceptions import ScrapeBlockedError

        ok = Mock()
        ok.json.return_value = {"jobPostings": [{"title": "Page1", "externalPath": "job/1"}]}
        ok.raise_for_status = Mock()

        bad = Mock()
        bad.raise_for_status.side_effect = requests.HTTPError(
            response=Mock(status=403, reason="Forbidden")
        )

        mock_post.side_effect = [ok, bad]

        config = SourceConfig(
            type="api",
            url="https://tenant.wd1.myworkdayjobs.com/wday/cxs/tenant/site/jobs",
            response_path="jobPostings",
            method="POST",
            post_body={"limit": 1, "offset": 0},
            fields={"title": "title", "url": "externalPath"},
        )

        with pytest.raises(ScrapeBlockedError):
            GenericScraper(config).scrape()

    @patch("job_finder.scrapers.generic_scraper.requests.post")
    def test_scrape_api_post_honors_bearer_auth(self, mock_post):
        """Bearer auth should be applied to paginated POST requests."""
        first = Mock()
        first.json.return_value = {"jobPostings": []}
        first.raise_for_status = Mock()
        mock_post.side_effect = [first]

        config = SourceConfig(
            type="api",
            url="https://tenant.wd1.myworkdayjobs.com/wday/cxs/tenant/site/jobs",
            response_path="jobPostings",
            method="POST",
            post_body={"limit": 1, "offset": 0},
            fields={"title": "title", "url": "externalPath"},
            api_key="token123",
            auth_type="bearer",
        )
        GenericScraper(config).scrape()

        headers = mock_post.call_args.kwargs["headers"]
        assert headers["Authorization"] == "Bearer token123"

    @patch("job_finder.scrapers.generic_scraper.requests.post")
    @patch("job_finder.scrapers.generic_scraper.logger")
    def test_scrape_api_post_logs_when_max_pages_hit(self, mock_logger, mock_post):
        """Warn when pagination reaches the safety cap."""
        page = Mock()
        page.json.return_value = {
            "jobPostings": [{"title": "A", "externalPath": "job/x", "postedOn": "2024-01-01"}]
        }
        page.raise_for_status = Mock()
        mock_post.side_effect = [page] * 50

        config = SourceConfig(
            type="api",
            url="https://tenant.wd1.myworkdayjobs.com/wday/cxs/tenant/site/jobs",
            response_path="jobPostings",
            method="POST",
            post_body={"limit": 1, "offset": 0},
            fields={"title": "title", "url": "externalPath", "posted_date": "postedOn"},
        )
        GenericScraper(config).scrape()

        mock_logger.warning.assert_called()

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_array_slice(self, mock_get):
        """Test API scraping with array slice (like RemoteOK)."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {"legal": "notice"},  # First element to skip
            {"title": "Job 1", "url": "https://example.com/1", "posted_date": "2024-01-01"},
            {"title": "Job 2", "url": "https://example.com/2", "posted_date": "2024-01-01"},
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://remoteok.com/api",
            response_path="[1:]",
            fields={"title": "title", "url": "url", "posted_date": "posted_date"},
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
                "posted_date": "2024-01-01",
            }
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url", "posted_date": "posted_date"},
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
                "posted_date": "2024-01-01",
            }
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={
                "title": "title",
                "url": "url",
                "company": "company",
                "posted_date": "posted_date",
            },
            company_name="Override Company",
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert jobs[0]["company"] == "Override Company"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_scrape_api_error_handling(self, mock_get):
        """Test that API errors propagate (fail loud, fail early)."""
        import requests

        mock_get.side_effect = requests.RequestException("API Error")

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
        )
        scraper = GenericScraper(config)

        with pytest.raises(requests.RequestException, match="API Error"):
            scraper.scrape()


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
                <span class="date">2025-01-15</span>
                <a href="https://example.com/apply/1">Apply</a>
            </div>
            <div class="job-listing">
                <h2 class="job-title">Product Manager</h2>
                <span class="location">NYC</span>
                <span class="date">2025-01-14</span>
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
                "posted_date": ".date",
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
                <span class="posted">2025-01-15</span>
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
                "posted_date": ".posted",
            },
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert jobs[0]["title"] == "Engineer"
        assert jobs[0]["url"] == "/jobs/1"

    @patch("job_finder.scrapers.generic_scraper.get_renderer")
    def test_scrape_html_with_js_renderer(self, mock_get_renderer):
        """JS-required sources should delegate HTML fetch to Playwright renderer."""
        renderer = Mock()
        renderer.render.return_value = RenderResult(
            final_url="https://example.com/careers",
            status="ok",
            html="""
            <html>
              <body>
                <div class="job">
                  <span class="title">JS Job</span>
                  <a class="apply" href="/js-job">Apply</a>
                </div>
              </body>
            </html>
            """,
            duration_ms=100,
            request_count=3,
            console_logs=[],
            errors=[],
        )
        mock_get_renderer.return_value = renderer

        config = SourceConfig(
            type="html",
            url="https://example.com/careers",
            job_selector=".job",
            fields={
                "title": ".title",
                "url": "a.apply@href",
            },
            requires_js=True,
            render_wait_for=".job",
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        renderer.render.assert_called_once()
        assert len(jobs) == 1
        assert jobs[0]["title"] == "JS Job"
        assert jobs[0]["url"] == "/js-job"


class TestGenericScraperEdgeCases:
    """Test edge cases and error handling."""

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_skips_jobs_missing_title(self, mock_get):
        """Test that jobs without title are skipped."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {"url": "https://example.com/1", "posted_date": "2025-01-15"},  # Missing title
            {"title": "Valid Job", "url": "https://example.com/2", "posted_date": "2025-01-15"},
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url", "posted_date": "posted_date"},
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
            {"title": "Job 1", "posted_date": "2025-01-15"},  # Missing URL
            {"title": "Job 2", "url": "https://example.com/2", "posted_date": "2025-01-15"},
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url", "posted_date": "posted_date"},
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1
        assert jobs[0]["url"] == "https://example.com/2"

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_defaults_for_missing_fields(self, mock_get):
        """Test default values for missing optional fields."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {"title": "Engineer", "url": "https://example.com/1", "posted_date": "2025-01-15"}
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url", "posted_date": "posted_date"},
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
        mock_entry.published = "Mon, 25 Oct 2025 10:00:00 GMT"

        mock_feed = Mock()
        mock_feed.bozo = True  # Has issues but still has entries
        mock_feed.bozo_exception = Exception("minor issue")
        mock_feed.entries = [mock_entry]
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://example.com/jobs.rss",
            fields={"title": "title", "url": "link", "posted_date": "published"},
        )
        scraper = GenericScraper(config)

        # Should NOT raise, should return jobs
        jobs = scraper.scrape()
        assert len(jobs) == 1
        assert jobs[0]["title"] == "Test Job"


class TestCompanyFiltering:
    """Test company filtering for aggregator sources."""

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_company_filter_matches_exact(self, mock_get, mock_parse):
        """Test that company_filter matches exact company names."""
        mock_response = Mock()
        mock_response.text = "<rss><channel></channel></rss>"
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        # Create mock entries with different companies
        entries = []
        for company, title in [
            ("Lemon.io", "Senior Developer"),
            ("Toptal", "Backend Engineer"),
            ("Lemon.io", "Frontend Developer"),
        ]:
            entry = Mock()
            entry.title = f"{company}: {title}"
            entry.link = f"https://example.com/job/{title.lower().replace(' ', '-')}"
            entry.published = "Mon, 25 Oct 2025 10:00:00 GMT"
            entries.append(entry)

        mock_feed = Mock()
        mock_feed.bozo = False
        mock_feed.entries = entries
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://weworkremotely.com/remote-jobs.rss",
            fields={"title": "title", "url": "link", "posted_date": "published"},
            company_extraction="from_title",
            company_filter="Lemon.io",
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        # Should only return Lemon.io jobs
        assert len(jobs) == 2
        assert all(job["company"] == "Lemon.io" for job in jobs)

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_company_filter_case_insensitive(self, mock_get, mock_parse):
        """Test that company_filter is case-insensitive."""
        mock_response = Mock()
        mock_response.text = "<rss><channel></channel></rss>"
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        entry = Mock()
        entry.title = "LEMON.IO: Developer"
        entry.link = "https://example.com/job/1"
        entry.published = "Mon, 25 Oct 2025 10:00:00 GMT"

        mock_feed = Mock()
        mock_feed.bozo = False
        mock_feed.entries = [entry]
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://weworkremotely.com/remote-jobs.rss",
            fields={"title": "title", "url": "link", "posted_date": "published"},
            company_extraction="from_title",
            company_filter="lemon.io",  # lowercase
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 1

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_company_filter_strips_suffixes(self, mock_get, mock_parse):
        """Test that company_filter matches despite .io, Inc, etc. suffixes."""
        mock_response = Mock()
        mock_response.text = "<rss><channel></channel></rss>"
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        entry = Mock()
        entry.title = "Lemon: Developer"  # No .io suffix
        entry.link = "https://example.com/job/1"
        entry.published = "Mon, 25 Oct 2025 10:00:00 GMT"

        mock_feed = Mock()
        mock_feed.bozo = False
        mock_feed.entries = [entry]
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://weworkremotely.com/remote-jobs.rss",
            fields={"title": "title", "url": "link", "posted_date": "published"},
            company_extraction="from_title",
            company_filter="Lemon.io",  # With .io suffix
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        # Should match "Lemon" with filter "Lemon.io"
        assert len(jobs) == 1

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_company_filter_partial_match(self, mock_get, mock_parse):
        """Test that filter matches when one contains the other."""
        mock_response = Mock()
        mock_response.text = "<rss><channel></channel></rss>"
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        entry = Mock()
        entry.title = "Proxify AB: Full Stack Developer"
        entry.link = "https://example.com/job/1"
        entry.published = "Mon, 25 Oct 2025 10:00:00 GMT"

        mock_feed = Mock()
        mock_feed.bozo = False
        mock_feed.entries = [entry]
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://weworkremotely.com/remote-jobs.rss",
            fields={"title": "title", "url": "link", "posted_date": "published"},
            company_extraction="from_title",
            company_filter="Proxify",  # Filter without "AB"
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        # Should match "Proxify AB" with filter "Proxify"
        assert len(jobs) == 1

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_company_filter_no_match_returns_empty(self, mock_get, mock_parse):
        """Test that non-matching company filter returns empty list."""
        mock_response = Mock()
        mock_response.text = "<rss><channel></channel></rss>"
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        entry = Mock()
        entry.title = "Toptal: Developer"
        entry.link = "https://example.com/job/1"
        entry.published = "Mon, 25 Oct 2025 10:00:00 GMT"

        mock_feed = Mock()
        mock_feed.bozo = False
        mock_feed.entries = [entry]
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://weworkremotely.com/remote-jobs.rss",
            fields={"title": "title", "url": "link", "posted_date": "published"},
            company_extraction="from_title",
            company_filter="Lemon.io",
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        assert len(jobs) == 0

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_company_filter_with_api_source(self, mock_get):
        """Test that company_filter works with API sources too."""
        mock_response = Mock()
        mock_response.json.return_value = [
            {
                "title": "Dev at Acme",
                "url": "https://example.com/1",
                "company": "Acme Inc",
                "posted_date": "2025-01-01",
            },
            {
                "title": "Dev at Other",
                "url": "https://example.com/2",
                "company": "Other Corp",
                "posted_date": "2025-01-01",
            },
            {
                "title": "Engineer at Acme",
                "url": "https://example.com/3",
                "company": "Acme",
                "posted_date": "2025-01-01",
            },
        ]
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={
                "title": "title",
                "url": "url",
                "company": "company",
                "posted_date": "posted_date",
            },
            company_filter="Acme",
        )
        scraper = GenericScraper(config)
        jobs = scraper.scrape()

        # Should match both "Acme Inc" and "Acme"
        assert len(jobs) == 2

    def test_normalize_company_name(self):
        """Test _normalize_company_name helper function."""
        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
        )
        scraper = GenericScraper(config)

        # Test suffix removal
        assert scraper._normalize_company_name("Acme Inc.") == "acme"
        assert scraper._normalize_company_name("TechCorp LLC") == "techcorp"
        assert scraper._normalize_company_name("Widget Ltd") == "widget"

        # Test domain suffix removal
        assert scraper._normalize_company_name("Lemon.io") == "lemon"
        assert scraper._normalize_company_name("Example.com") == "example"
        assert scraper._normalize_company_name("AI.dev") == "ai"

        # Test case normalization
        assert scraper._normalize_company_name("ACME") == "acme"
        assert scraper._normalize_company_name("TechCorp") == "techcorp"

        # Test punctuation removal
        assert scraper._normalize_company_name("Tech-Corp!") == "techcorp"
        # Ampersand removed, multiple spaces collapsed
        assert scraper._normalize_company_name("Acme & Sons") == "acme sons"

        # Test empty/None handling
        assert scraper._normalize_company_name("") == ""
        assert scraper._normalize_company_name(None) == ""

    def test_source_config_company_filter_in_to_dict(self):
        """Test that company_filter is included in to_dict output."""
        config = SourceConfig(
            type="rss",
            url="https://example.com/feed.rss",
            fields={"title": "title", "url": "link"},
            company_filter="Acme",
        )
        result = config.to_dict()

        assert result["company_filter"] == "Acme"

    def test_source_config_company_filter_from_dict(self):
        """Test that company_filter is loaded from dict."""
        data = {
            "type": "rss",
            "url": "https://example.com/feed.rss",
            "fields": {"title": "title", "url": "link"},
            "company_filter": "Acme",
        }
        config = SourceConfig.from_dict(data)

        assert config.company_filter == "Acme"

    def test_company_filter_rejects_false_positives(self):
        """Test that short filter names don't cause false positive matches."""
        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
            company_filter="AI",
        )
        scraper = GenericScraper(config)

        # "AI" should NOT match "RAIL Company" (contains "ai" substring but not word boundary)
        assert not scraper._matches_company_filter({"company": "RAIL Company"})
        # "AI" should NOT match "Ukraine AI Solutions" (contains "ai" but mid-word)
        assert not scraper._matches_company_filter({"company": "Ukraine AI Solutions"})
        # "AI" SHOULD match exact "AI" company
        assert scraper._matches_company_filter({"company": "AI"})
        # "AI" SHOULD match "AI Inc" (exact with suffix)
        assert scraper._matches_company_filter({"company": "AI Inc"})

    def test_company_filter_word_boundary_matching(self):
        """Test that partial matches respect word boundaries."""
        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
            company_filter="Lemon",
        )
        scraper = GenericScraper(config)

        # Should match: starts with filter
        assert scraper._matches_company_filter({"company": "Lemon.io"})
        assert scraper._matches_company_filter({"company": "Lemon Inc"})

        # Should NOT match: filter appears mid-word
        assert not scraper._matches_company_filter({"company": "WaterLemon Co"})

    def test_company_filter_empty_company_returns_false(self):
        """Test that jobs with empty company field don't match filter."""
        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
            company_filter="Acme",
        )
        scraper = GenericScraper(config)

        assert not scraper._matches_company_filter({"company": ""})
        assert not scraper._matches_company_filter({"company": None})
        assert not scraper._matches_company_filter({})  # No company key


class TestServerSideFiltering:
    """Test server-side company filtering via URL query parameters."""

    def test_get_effective_url_no_filter(self):
        """Test that URL is unchanged when no filter is set."""
        config = SourceConfig(
            type="api",
            url="https://remotive.com/api/remote-jobs",
            fields={"title": "title", "url": "url"},
        )
        scraper = GenericScraper(config)

        assert scraper._get_effective_url() == "https://remotive.com/api/remote-jobs"

    def test_get_effective_url_with_filter_no_param(self):
        """Test that URL is unchanged when filter is set but param is not."""
        config = SourceConfig(
            type="api",
            url="https://remotive.com/api/remote-jobs",
            fields={"title": "title", "url": "url"},
            company_filter="Acme",  # Filter set but no param
        )
        scraper = GenericScraper(config)

        # No company_filter_param, so URL unchanged
        assert scraper._get_effective_url() == "https://remotive.com/api/remote-jobs"

    def test_get_effective_url_with_filter_and_param(self):
        """Test that URL includes filter when both filter and param are set."""
        config = SourceConfig(
            type="api",
            url="https://remotive.com/api/remote-jobs",
            fields={"title": "title", "url": "url"},
            company_filter="Acme Inc",
            company_filter_param="company_name",
        )
        scraper = GenericScraper(config)

        url = scraper._get_effective_url()
        assert "company_name=Acme+Inc" in url or "company_name=Acme%20Inc" in url

    def test_get_effective_url_preserves_existing_params(self):
        """Test that existing query params are preserved when adding filter."""
        config = SourceConfig(
            type="api",
            url="https://remotive.com/api/remote-jobs?limit=50",
            fields={"title": "title", "url": "url"},
            company_filter="Acme",
            company_filter_param="company_name",
        )
        scraper = GenericScraper(config)

        url = scraper._get_effective_url()
        assert "limit=50" in url
        assert "company_name=Acme" in url

    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_fetch_json_uses_effective_url(self, mock_get):
        """Test that _fetch_json uses the effective URL with filters."""
        mock_response = Mock()
        mock_response.json.return_value = {"jobs": []}
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        config = SourceConfig(
            type="api",
            url="https://remotive.com/api/remote-jobs",
            response_path="jobs",
            fields={"title": "title", "url": "url"},
            company_filter="Lemon.io",
            company_filter_param="company_name",
        )
        scraper = GenericScraper(config)
        scraper._fetch_json()

        # Check that the URL passed to requests.get includes the filter
        called_url = mock_get.call_args[0][0]
        assert "company_name=Lemon.io" in called_url

    def test_source_config_company_filter_param_from_dict(self):
        """Test that company_filter_param is loaded from dict."""
        data = {
            "type": "api",
            "url": "https://remotive.com/api/remote-jobs",
            "fields": {"title": "title", "url": "url"},
            "company_filter_param": "company_name",
        }
        config = SourceConfig.from_dict(data)

        assert config.company_filter_param == "company_name"

    def test_source_config_company_filter_param_in_to_dict(self):
        """Test that company_filter_param is included in to_dict output."""
        config = SourceConfig(
            type="api",
            url="https://remotive.com/api/remote-jobs",
            fields={"title": "title", "url": "url"},
            company_filter_param="company_name",
        )
        result = config.to_dict()

        assert result["company_filter_param"] == "company_name"

    @patch("job_finder.scrapers.generic_scraper.feedparser.parse")
    @patch("job_finder.scrapers.generic_scraper.requests.get")
    def test_fetch_rss_uses_effective_url(self, mock_get, mock_parse):
        """Test that _fetch_rss uses the effective URL with filters."""
        mock_response = Mock()
        mock_response.text = "<rss><channel></channel></rss>"
        mock_response.raise_for_status = Mock()
        mock_get.return_value = mock_response

        mock_feed = Mock()
        mock_feed.bozo = False
        mock_feed.entries = []
        mock_parse.return_value = mock_feed

        config = SourceConfig(
            type="rss",
            url="https://example.com/feed.rss",
            fields={"title": "title", "url": "link"},
            company_filter="Acme",
            company_filter_param="company",
        )
        scraper = GenericScraper(config)
        scraper._fetch_rss()

        # Check that the URL passed to requests.get includes the filter
        called_url = mock_get.call_args[0][0]
        assert "company=Acme" in called_url

    def test_get_effective_url_handles_special_characters(self):
        """Test that company names with special characters are properly URL-encoded."""
        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
            company_filter="A&B Company",
            company_filter_param="company_name",
        )
        scraper = GenericScraper(config)

        url = scraper._get_effective_url()
        # & should be encoded as %26
        assert (
            "company_name=A%26B" in url or "company_name=A&B" not in url.split("?")[1].split("&")[0]
        )


class TestNormalizeDateTimestamps:
    """Tests for _normalize_date millisecond timestamp handling."""

    @pytest.fixture
    def scraper(self):
        """Create a scraper instance for testing."""
        config = SourceConfig(
            type="api",
            url="https://api.example.com/jobs",
            fields={"title": "title", "url": "url"},
        )
        return GenericScraper(config)

    def test_normalize_date_seconds_timestamp(self, scraper):
        """Test that 10-digit second timestamps are handled correctly."""
        # Jan 1, 2024 00:00:00 UTC
        result = scraper._normalize_date(1704067200)
        assert result == "2024-01-01T00:00:00+00:00"

    def test_normalize_date_milliseconds_timestamp_int(self, scraper):
        """Test that 13-digit millisecond timestamps (int) are converted correctly."""
        # Lever API timestamp: 1752761621698 ms = July 17, 2025
        result = scraper._normalize_date(1752761621698)
        assert "2025-07-17" in result

    def test_normalize_date_milliseconds_timestamp_float(self, scraper):
        """Test that 13-digit millisecond timestamps (float) are converted correctly."""
        # Same timestamp as float
        result = scraper._normalize_date(1752761621698.0)
        assert "2025-07-17" in result

    def test_normalize_date_boundary_10_digit(self, scraper):
        """Test timestamp at exactly 10 digits (max seconds timestamp before ms detection)."""
        # 9999999999 seconds = Nov 20, 2286 - should be treated as seconds
        result = scraper._normalize_date(9999999999)
        assert "2286" in result

    def test_normalize_date_boundary_11_digit(self, scraper):
        """Test timestamp at exactly 11 digits (min value treated as milliseconds)."""
        # 10000000000 = should be treated as milliseconds = 10000000 seconds
        # 10000000 seconds from epoch = April 26, 1970
        result = scraper._normalize_date(10000000000)
        assert "1970" in result

    def test_normalize_date_none(self, scraper):
        """Test that None returns empty string."""
        assert scraper._normalize_date(None) == ""

    def test_normalize_date_string_iso(self, scraper):
        """Test ISO format string passes through."""
        result = scraper._normalize_date("2025-01-15T10:30:00Z")
        # Should parse and return ISO format
        assert "2025-01-15" in result

    def test_normalize_date_string_common_format(self, scraper):
        """Test common date string format."""
        result = scraper._normalize_date("January 15, 2025")
        assert "2025-01-15" in result


class TestRssFieldNormalization:
    """Tests for _rss_access RSS field name normalization."""

    @pytest.fixture
    def scraper(self):
        """Create a scraper instance for testing."""
        config = SourceConfig(
            type="rss",
            url="https://example.com/feed.rss",
            fields={"title": "title", "url": "link"},
        )
        return GenericScraper(config)

    def test_rss_access_pubDate_normalized(self, scraper):
        """Test that pubDate is normalized to published."""
        entry = Mock()
        entry.published = "Mon, 14 Apr 2025 00:00:00 +0000"
        # Ensure pubDate attribute doesn't exist (like real feedparser)
        del entry.pubDate

        result = scraper._rss_access(entry, "pubDate")
        assert result == "Mon, 14 Apr 2025 00:00:00 +0000"

    def test_rss_access_pubdate_lowercase(self, scraper):
        """Test that lowercase pubdate is also normalized."""
        entry = Mock()
        entry.published = "Mon, 14 Apr 2025 00:00:00 +0000"

        result = scraper._rss_access(entry, "pubdate")
        assert result == "Mon, 14 Apr 2025 00:00:00 +0000"

    def test_rss_access_dc_date(self, scraper):
        """Test that dc:date is normalized to published."""
        entry = Mock()
        entry.published = "2025-04-14T00:00:00Z"

        result = scraper._rss_access(entry, "dc:date")
        assert result == "2025-04-14T00:00:00Z"

    def test_rss_access_guid_normalized(self, scraper):
        """Test that guid is normalized to id."""
        entry = Mock()
        entry.id = "https://example.com/job/123"
        # Ensure guid attribute doesn't exist
        if hasattr(entry, "guid"):
            del entry.guid

        result = scraper._rss_access(entry, "guid")
        assert result == "https://example.com/job/123"

    def test_rss_access_direct_attribute(self, scraper):
        """Test that non-mapped attributes are accessed directly."""
        entry = Mock()
        entry.title = "Software Engineer"

        result = scraper._rss_access(entry, "title")
        assert result == "Software Engineer"

    def test_rss_access_fallback_for_posted_date(self, scraper):
        """Test fallback chain for posted_date field."""
        # Use spec to prevent Mock from returning mock objects for undefined attrs
        entry = Mock(spec=["published", "updated", "created"])
        entry.published = None
        entry.updated = "2025-04-14T00:00:00Z"
        entry.created = None

        # When accessing posted_date and published is None, should fall back to updated
        result = scraper._rss_access(entry, "posted_date")
        assert result == "2025-04-14T00:00:00Z"

    def test_rss_access_missing_attribute(self, scraper):
        """Test that missing attributes return None."""
        entry = Mock(spec=[])  # Empty spec means no attributes

        result = scraper._rss_access(entry, "nonexistent")
        assert result is None

    def test_rss_to_feedparser_map_is_class_constant(self):
        """Test that _RSS_TO_FEEDPARSER_MAP is defined as a class constant."""
        assert hasattr(GenericScraper, "_RSS_TO_FEEDPARSER_MAP")
        assert isinstance(GenericScraper._RSS_TO_FEEDPARSER_MAP, dict)
        assert "pubDate" in GenericScraper._RSS_TO_FEEDPARSER_MAP
        assert GenericScraper._RSS_TO_FEEDPARSER_MAP["pubDate"] == "published"
