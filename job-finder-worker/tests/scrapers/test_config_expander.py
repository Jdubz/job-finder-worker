"""Tests for config_expander module."""

import pytest

from job_finder.scrapers.config_expander import (
    GREENHOUSE_FIELDS,
    RSS_FIELDS,
    expand_config,
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
