"""Tests for config_expander module."""

import pytest

from job_finder.scrapers.config_expander import (
    ASHBY_FIELDS,
    GREENHOUSE_FIELDS,
    LEVER_FIELDS,
    WORKDAY_FIELDS,
    expand_config,
    normalize_source_type,
    parse_workday_url,
)


class TestExpandGreenhouse:
    """Tests for Greenhouse config expansion."""

    def test_simple_board_token_expands(self):
        """Simple board_token config expands to full API config."""
        config = {"board_token": "anthropic"}
        result = expand_config("greenhouse", config)

        assert result["type"] == "api"
        assert "boards-api.greenhouse.io" in result["url"]
        assert "anthropic" in result["url"]
        assert result["response_path"] == "jobs"
        assert result["fields"] == GREENHOUSE_FIELDS

    def test_full_config_preserved(self):
        """Full config with url and fields is preserved (type added)."""
        config = {
            "url": "https://boards-api.greenhouse.io/v1/boards/custom/jobs",
            "response_path": "jobs",
            "fields": {"title": "custom_title", "url": "custom_url"},
        }
        result = expand_config("greenhouse", config)

        assert result["type"] == "api"
        assert result["url"] == config["url"]
        assert result["fields"] == config["fields"]

    def test_missing_board_token_raises(self):
        """Missing board_token raises ValueError."""
        config = {}
        with pytest.raises(ValueError, match="board_token"):
            expand_config("greenhouse", config)


class TestExpandRSS:
    """Tests for RSS config expansion."""

    def test_simple_url_expands(self):
        """Simple url config expands with default fields."""
        config = {"url": "https://example.com/jobs.rss"}
        result = expand_config("rss", config)

        assert result["type"] == "rss"
        assert result["url"] == "https://example.com/jobs.rss"
        assert "fields" in result

    def test_legacy_field_names_converted(self):
        """Legacy field names are converted to new format."""
        config = {
            "url": "https://example.com/jobs.rss",
            "title_field": "custom_title",
            "description_field": "custom_desc",
            "link_field": "custom_link",
        }
        result = expand_config("rss", config)

        assert result["fields"]["title"] == "custom_title"
        assert result["fields"]["description"] == "custom_desc"
        assert result["fields"]["url"] == "custom_link"

    def test_full_fields_preserved(self):
        """Full fields config is preserved."""
        config = {
            "url": "https://example.com/jobs.rss",
            "fields": {"title": "title", "url": "link", "company": "author"},
        }
        result = expand_config("rss", config)

        assert result["fields"] == config["fields"]

    def test_missing_url_raises(self):
        """Missing url raises ValueError."""
        config = {}
        with pytest.raises(ValueError, match="url"):
            expand_config("rss", config)


class TestExpandAPI:
    """Tests for generic API config expansion."""

    def test_full_config_preserved(self):
        """Full API config is preserved with type added."""
        config = {
            "url": "https://api.example.com/jobs",
            "response_path": "data.jobs",
            "fields": {"title": "name", "url": "link"},
        }
        result = expand_config("api", config)

        assert result["type"] == "api"
        assert result["url"] == config["url"]
        assert result["response_path"] == config["response_path"]
        assert result["fields"] == config["fields"]

    def test_legacy_base_url_converted(self):
        """Legacy base_url is converted to url."""
        config = {
            "base_url": "https://api.example.com/jobs",
            "response_path": "jobs",
        }
        result = expand_config("api", config)

        assert result["url"] == "https://api.example.com/jobs"

    def test_auth_fields_preserved(self):
        """Auth fields are preserved."""
        config = {
            "url": "https://api.example.com/jobs",
            "api_key": "secret",
            "auth_type": "bearer",
        }
        result = expand_config("api", config)

        assert result["api_key"] == "secret"
        assert result["auth_type"] == "bearer"

    def test_missing_url_raises(self):
        """Missing url raises ValueError."""
        config = {"response_path": "jobs"}
        with pytest.raises(ValueError, match="url"):
            expand_config("api", config)


class TestExpandCompanyPage:
    """Tests for company-page config expansion."""

    def test_greenhouse_detected_and_converted(self):
        """Greenhouse URL in company-page is converted to simple board_token."""
        config = {
            "type": "api",
            "url": "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
            "response_path": "jobs",
            "fields": {"title": "title"},
        }
        result = expand_config("company-page", config)

        # Should be treated as greenhouse and simplified
        assert result["type"] == "api"  # expand_config adds type for scraper
        assert "boards-api.greenhouse.io" in result["url"]

    def test_html_scraper_preserved(self):
        """HTML scraper config is preserved."""
        config = {
            "type": "html",
            "url": "https://example.com/careers",
            "job_selector": ".job-listing",
            "fields": {"title": ".title", "url": "a@href"},
        }
        result = expand_config("company-page", config)

        assert result["type"] == "html"
        assert result["url"] == config["url"]
        assert result["job_selector"] == config["job_selector"]

    def test_api_endpoint_converted(self):
        """Legacy api_endpoint is converted to url."""
        config = {
            "api_endpoint": "https://api.example.com/jobs",
        }
        result = expand_config("company-page", config)

        assert result["type"] == "api"
        assert result["url"] == "https://api.example.com/jobs"


class TestExpandUnknownType:
    """Tests for unknown source type handling."""

    def test_unknown_type_gets_api_default(self):
        """Unknown source type defaults to api."""
        config = {"url": "https://example.com/jobs"}
        result = expand_config("custom_type", config)

        assert result["type"] == "api"
        assert result["url"] == "https://example.com/jobs"


class TestTypeFieldRemoval:
    """Tests that type field in config is handled correctly."""

    def test_greenhouse_type_field_not_duplicated(self):
        """Expanded greenhouse config has correct type field."""
        config = {"board_token": "test"}
        result = expand_config("greenhouse", config)

        # Should have exactly one type field set to "api"
        assert result["type"] == "api"
        assert "board_token" not in result  # Simplified to URL

    def test_rss_type_field_correct(self):
        """RSS config has type=rss."""
        config = {"url": "https://example.com/feed.rss"}
        result = expand_config("rss", config)

        assert result["type"] == "rss"


class TestJSRenderingSettings:
    """Tests for JS rendering settings preservation."""

    def test_requires_js_preserved_in_html_config(self):
        """JS rendering settings are preserved in HTML config expansion."""
        config = {
            "type": "html",
            "url": "https://example.com/careers",
            "job_selector": ".job-card",
            "fields": {"title": ".title", "url": "a@href"},
            "requires_js": True,
            "render_wait_for": ".job-list",
            "render_timeout_ms": 30000,
        }
        result = expand_config("html", config)

        assert result["type"] == "html"
        assert result["requires_js"] is True
        assert result["render_wait_for"] == ".job-list"
        assert result["render_timeout_ms"] == 30000

    def test_requires_js_not_added_when_missing(self):
        """requires_js is not added when not in original config."""
        config = {
            "url": "https://example.com/careers",
            "job_selector": ".job-card",
            "fields": {"title": ".title"},
        }
        result = expand_config("html", config)

        assert "requires_js" not in result

    def test_js_settings_preserved_with_company_page_type(self):
        """JS rendering settings work with company-page source type."""
        config = {
            "type": "html",
            "url": "https://example.com/careers",
            "job_selector": ".job-listing",
            "fields": {"title": ".title", "url": "a@href"},
            "requires_js": True,
            "render_wait_for": ".jobs-container",
            "render_timeout_ms": 25000,
        }
        result = expand_config("company-page", config)

        assert result["requires_js"] is True
        assert result["render_wait_for"] == ".jobs-container"
        assert result["render_timeout_ms"] == 25000


class TestNormalizeSourceType:
    """Tests for normalize_source_type — the single source of truth for type mapping."""

    @pytest.mark.parametrize("input_type", ["api", "rss", "html"])
    def test_valid_types_pass_through(self, input_type):
        assert normalize_source_type(input_type) == input_type

    @pytest.mark.parametrize("input_type", ["API", "Rss", "HTML"])
    def test_case_insensitive(self, input_type):
        assert normalize_source_type(input_type) == input_type.lower()

    @pytest.mark.parametrize(
        "vendor,expected",
        [
            ("workday", "api"),
            ("icims", "api"),
            ("rippling", "api"),
            ("greenhouse", "api"),
            ("ashby", "api"),
            ("lever", "api"),
            ("smartrecruiters", "api"),
            ("json", "api"),
            ("company-page", "html"),
            ("company_page", "html"),
        ],
    )
    def test_vendor_names_normalize_to_correct_type(self, vendor, expected):
        assert normalize_source_type(vendor) == expected

    def test_unknown_type_defaults_to_api(self):
        assert normalize_source_type("totally_unknown") == "api"

    def test_whitespace_stripped(self):
        assert normalize_source_type("  api  ") == "api"


class TestNormalizationInExpandConfig:
    """Tests that expand_config normalizes type in full configs."""

    def test_full_config_with_vendor_type_normalized(self):
        """A full config (url+fields) with type='json' should normalize to 'api'."""
        config = {
            "type": "json",
            "url": "https://example.com/api/jobs",
            "fields": {"title": "title", "url": "url"},
        }
        result = expand_config("json", config)
        assert result["type"] == "api"

    def test_full_config_with_workday_type_normalized(self):
        """A full config with type='workday' should normalize to 'api'."""
        config = {
            "type": "workday",
            "url": "https://company.wd5.myworkdayjobs.com/wday/cxs/company/board/jobs",
            "fields": {"title": "title", "url": "externalPath"},
            "method": "POST",
            "post_body": {"limit": 50, "offset": 0},
        }
        result = expand_config("workday", config)
        assert result["type"] == "api"

    def test_full_config_with_unknown_type_defaults_to_api(self):
        """A full config with an unknown type should default to 'api'."""
        config = {
            "type": "mystery_ats",
            "url": "https://example.com/jobs",
            "fields": {"title": "name"},
        }
        result = expand_config("mystery_ats", config)
        assert result["type"] == "api"

    def test_company_page_type_routes_to_html(self):
        """source_type='company_page' should dispatch to HTML expansion."""
        config = {
            "url": "https://example.com/careers",
            "job_selector": ".job-card",
            "fields": {"title": ".title", "url": "a@href"},
        }
        result = expand_config("company_page", config)
        assert result["type"] == "html"


class TestPlatformFieldEnrichment:
    """Tests for automatic field enrichment when url+fields configs match known platforms.

    The expand_config early-return path enriches configs with standard platform
    fields when the URL matches a known ATS (Greenhouse, Ashby, Workday, Lever).
    """

    def test_greenhouse_url_enriched_with_standard_fields(self):
        """Full config with Greenhouse URL gets missing standard fields added."""
        config = {
            "url": "https://boards-api.greenhouse.io/v1/boards/test/jobs",
            "fields": {"title": "custom_title", "url": "custom_url"},
        }
        result = expand_config("api", config)

        # Custom fields preserved
        assert result["fields"]["title"] == "custom_title"
        assert result["fields"]["url"] == "custom_url"
        # Standard Greenhouse fields added for missing keys
        for key, value in GREENHOUSE_FIELDS.items():
            assert key in result["fields"]

    def test_greenhouse_enrichment_does_not_overwrite_custom_fields(self):
        """Enrichment does not overwrite fields that already exist."""
        config = {
            "url": "https://boards-api.greenhouse.io/v1/boards/test/jobs",
            "fields": {"title": "my_title", "url": "my_url", "location": "my_loc"},
        }
        result = expand_config("api", config)

        assert result["fields"]["title"] == "my_title"
        assert result["fields"]["location"] == "my_loc"

    def test_ashby_url_enriched_with_standard_fields(self):
        """Full config with Ashby URL gets standard Ashby fields."""
        config = {
            "url": "https://api.ashbyhq.com/posting-api/job-board/test",
            "fields": {"title": "name"},
        }
        result = expand_config("api", config)

        for key in ASHBY_FIELDS:
            assert key in result["fields"]

    def test_workday_url_enriched_with_standard_fields_and_follow_detail(self):
        """Full config with Workday URL gets standard fields + follow_detail=True."""
        config = {
            "url": "https://company.wd5.myworkdayjobs.com/wday/cxs/company/board/jobs",
            "fields": {"title": "title"},
        }
        result = expand_config("api", config)

        for key in WORKDAY_FIELDS:
            assert key in result["fields"]
        assert result["follow_detail"] is True

    def test_lever_url_enriched_with_standard_fields(self):
        """Full config with Lever URL gets standard Lever fields."""
        config = {
            "url": "https://jobs.lever.co/test",
            "fields": {"title": "text"},
        }
        result = expand_config("api", config)

        for key in LEVER_FIELDS:
            assert key in result["fields"]

    def test_non_platform_url_not_enriched(self):
        """Config with unknown URL does not get platform fields added."""
        config = {
            "url": "https://example.com/api/jobs",
            "fields": {"title": "name", "url": "link"},
        }
        result = expand_config("api", config)

        # Only original fields, no enrichment
        assert result["fields"] == config["fields"]

    def test_workday_legacy_careers_url_expansion(self):
        """Legacy Workday config with careers_url expands to full API config."""
        config = {
            "careers_url": "https://company.wd5.myworkdayjobs.com/en-US/external",
        }
        result = expand_config("api", config)

        assert result["type"] == "api"
        assert result["method"] == "POST"
        assert "wday/cxs" in result["url"]
        assert result["follow_detail"] is True
        assert result["fields"] == WORKDAY_FIELDS


class TestParseWorkdayUrl:
    """Tests for parse_workday_url utility."""

    def test_standard_workday_url(self):
        """Standard Workday URL parses correctly."""
        result = parse_workday_url("https://company.wd5.myworkdayjobs.com/en-US/external")
        assert result is not None
        tenant, wd_instance, site_id = result
        assert tenant == "company"
        assert wd_instance == "wd5"

    def test_non_workday_url_returns_none(self):
        """Non-Workday URL returns None."""
        assert parse_workday_url("https://example.com/careers") is None

    def test_greenhouse_url_returns_none(self):
        """Greenhouse URL returns None (not Workday)."""
        assert parse_workday_url("https://boards-api.greenhouse.io/v1/boards/x/jobs") is None


class TestUrlTypeConsistency:
    """Tests for URL/source_type mismatch auto-correction.

    When a URL matches a known platform whose config_type differs from the
    passed source_type, expand_config() should auto-correct to the platform's
    config_type. This prevents API URLs stored as html from silently returning
    0 jobs forever.
    """

    def test_greenhouse_api_url_corrected_from_html(self):
        """Greenhouse API URL stored as html should be auto-corrected to api."""
        config = {
            "url": "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
            "fields": {"title": "title", "url": "absolute_url"},
            "response_path": "jobs",
        }
        result = expand_config("html", config)
        assert result["type"] == "api"

    def test_ashby_api_url_corrected_from_html(self):
        """Ashby API URL stored as html should be auto-corrected to api."""
        config = {
            "url": "https://api.ashbyhq.com/posting-api/job-board/testco",
            "fields": {"title": "title", "url": "jobUrl"},
            "response_path": "jobs",
        }
        result = expand_config("html", config)
        assert result["type"] == "api"

    def test_lever_html_url_corrected_from_html_to_api(self):
        """Lever HTML URL stored as html should be auto-corrected to api (lever pattern -> api)."""
        config = {
            "url": "https://jobs.lever.co/testcompany",
            "fields": {"title": "text", "url": "hostedUrl"},
        }
        result = expand_config("html", config)
        assert result["type"] == "api"

    def test_rss_url_corrected_from_api(self):
        """Avature RSS URL stored as api should be auto-corrected to rss."""
        config = {
            "url": "https://company.avature.net/en_US/careers/SearchJobs/feed/?jobRecordsPerPage=200",
            "fields": {"title": "title", "url": "link"},
        }
        result = expand_config("api", config)
        assert result["type"] == "rss"

    def test_unknown_url_left_unchanged(self):
        """URL that doesn't match any platform should keep the original source_type."""
        config = {
            "url": "https://example.com/custom-api/jobs",
            "fields": {"title": "name", "url": "link"},
        }
        result = expand_config("html", config)
        assert result["type"] == "html"

    def test_matching_type_not_changed(self):
        """URL matching a platform with the SAME config_type should not log a warning."""
        config = {
            "url": "https://boards-api.greenhouse.io/v1/boards/test/jobs",
            "fields": {"title": "title", "url": "absolute_url"},
        }
        result = expand_config("api", config)
        assert result["type"] == "api"

    def test_greenhouse_html_url_corrected_to_api(self):
        """Greenhouse HTML board URL (jobs.greenhouse.io) stored as html -> api."""
        config = {
            "url": "https://jobs.greenhouse.io/stripe",
            "fields": {"title": "title"},
        }
        result = expand_config("html", config)
        assert result["type"] == "api"
