"""Tests for config_expander module."""

from job_finder.scrapers.config_expander import expand_config


class TestExpandConfigPaginationPropagation:
    """Tests that pagination fields propagate from platform patterns."""

    def test_smartrecruiters_gets_pagination_from_pattern(self):
        """SmartRecruiters sources with url+fields should get pagination config."""
        config = {
            "url": "https://api.smartrecruiters.com/v1/companies/acme/postings?limit=100",
            "fields": {"title": "name", "url": "ref"},
        }
        expanded = expand_config("api", config)

        assert expanded["pagination_type"] == "offset"
        assert expanded["pagination_param"] == "offset"
        assert expanded["page_size"] == 100

    def test_greenhouse_does_not_get_pagination(self):
        """Greenhouse sources should not get pagination (no pagination defined)."""
        config = {
            "url": "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true",
            "fields": {"title": "title", "url": "absolute_url"},
        }
        expanded = expand_config("api", config)

        assert "pagination_type" not in expanded

    def test_existing_pagination_not_overwritten(self):
        """If config already has pagination_type, pattern should not overwrite it."""
        config = {
            "url": "https://api.smartrecruiters.com/v1/companies/acme/postings?limit=100",
            "fields": {"title": "name", "url": "ref"},
            "pagination_type": "cursor",
            "pagination_param": "next",
            "page_size": 50,
        }
        expanded = expand_config("api", config)

        # Should keep the original values
        assert expanded["pagination_type"] == "cursor"
        assert expanded["pagination_param"] == "next"
        assert expanded["page_size"] == 50
