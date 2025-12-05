"""Tests for company name extraction from URLs.

These tests prevent regressions in _extract_company_from_url() which previously
returned incorrect names like "Jobs" for subdomain patterns like jobs.dropbox.com.
"""

import pytest
from unittest.mock import MagicMock

from job_finder.job_queue.processors.source_processor import SourceProcessor


@pytest.fixture
def source_processor():
    """Create a SourceProcessor with mocked dependencies."""
    config_loader = MagicMock()
    config_loader.get_prefilter_policy.return_value = {
        "title": {"requiredKeywords": [], "excludedKeywords": []},
        "freshness": {"maxAgeDays": 0},
        "workArrangement": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": True,
            "willRelocate": True,
            "userLocation": "Test Location",
        },
        "employmentType": {
            "allowFullTime": True,
            "allowPartTime": True,
            "allowContract": True,
        },
        "salary": {"minimum": None},
        "technology": {"rejected": []},
    }
    config_loader.get_title_filter.return_value = {
        "requiredKeywords": [],
        "excludedKeywords": [],
    }

    return SourceProcessor(
        queue_manager=MagicMock(),
        config_loader=config_loader,
        sources_manager=MagicMock(),
        companies_manager=MagicMock(),
    )


class TestExtractCompanyFromUrl:
    """Tests for _extract_company_from_url method."""

    # Greenhouse API URLs
    @pytest.mark.parametrize(
        "url,expected",
        [
            (
                "https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true",
                "Anthropic",
            ),
            (
                "https://boards-api.greenhouse.io/v1/boards/discord/jobs",
                "Discord",
            ),
            (
                "https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=true",
                "Vercel",
            ),
            (
                "https://boards-api.greenhouse.io/v1/boards/greenhouse/jobs?content=true",
                "Greenhouse",
            ),
            # Hyphenated company names
            (
                "https://boards-api.greenhouse.io/v1/boards/ge-vernova/jobs",
                "Ge Vernova",
            ),
        ],
    )
    def test_greenhouse_api_urls(self, source_processor, url, expected):
        """Test extraction from Greenhouse API URLs."""
        result = source_processor._extract_company_from_url(url)
        assert result == expected

    # Lever API URLs
    @pytest.mark.parametrize(
        "url,expected",
        [
            ("https://api.lever.co/v0/postings/binance?mode=json", "Binance"),
            ("https://api.lever.co/v0/postings/stripe", "Stripe"),
            ("https://api.lever.co/v0/postings/figma?mode=json", "Figma"),
        ],
    )
    def test_lever_api_urls(self, source_processor, url, expected):
        """Test extraction from Lever API URLs."""
        result = source_processor._extract_company_from_url(url)
        assert result == expected

    # SmartRecruiters API URLs
    @pytest.mark.parametrize(
        "url,expected",
        [
            (
                "https://api.smartrecruiters.com/v1/companies/Experian/postings?limit=200",
                "Experian",
            ),
            (
                "https://api.smartrecruiters.com/v1/companies/Nagarro1/postings",
                "Nagarro1",
            ),
        ],
    )
    def test_smartrecruiters_api_urls(self, source_processor, url, expected):
        """Test extraction from SmartRecruiters API URLs."""
        result = source_processor._extract_company_from_url(url)
        assert result == expected

    # Workday URLs
    @pytest.mark.parametrize(
        "url,expected",
        [
            (
                "https://gevernova.wd5.myworkdayjobs.com/wday/cxs/gevernova/Vernova_ExternalSite/jobs",
                "Gevernova",
            ),
            (
                "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
                "Nvidia",
            ),
        ],
    )
    def test_workday_urls(self, source_processor, url, expected):
        """Test extraction from Workday URLs."""
        result = source_processor._extract_company_from_url(url)
        assert result == expected

    # Subdomain patterns (jobs.X.com, careers.X.com)
    # This was the original bug - these returned "Jobs" instead of the company name
    @pytest.mark.parametrize(
        "url,expected",
        [
            ("https://jobs.dropbox.com/all-jobs", "Dropbox"),
            ("https://jobs.netflix.com/jobs", "Netflix"),
            ("https://careers.google.com/jobs", "Google"),
            ("https://careers.microsoft.com/us/en/search-results", "Microsoft"),
        ],
    )
    def test_subdomain_patterns(self, source_processor, url, expected):
        """Test extraction from jobs.X.com and careers.X.com patterns.

        This was the original bug - _extract_company_from_url() was returning
        'Jobs' or 'Careers' (the subdomain) instead of the actual company name.
        """
        result = source_processor._extract_company_from_url(url)
        assert result == expected

    # Direct company sites
    @pytest.mark.parametrize(
        "url,expected",
        [
            ("https://www.toggl.com/jobs/", "Toggl"),
            ("https://toggl.com/jobs/", "Toggl"),
            ("https://www.bitovi.com/about/jobs", "Bitovi"),
            ("https://www.cloudbeds.com/careers/", "Cloudbeds"),
            ("https://searchatlas.com/careers/", "Searchatlas"),
        ],
    )
    def test_direct_company_sites(self, source_processor, url, expected):
        """Test extraction from direct company websites."""
        result = source_processor._extract_company_from_url(url)
        assert result == expected

    # Edge cases - should NOT extract generic/invalid names
    @pytest.mark.parametrize(
        "url",
        [
            "https://www.greenhouse.io/jobs",  # Aggregator platform, not a company
            "https://www.lever.co/jobs",  # Aggregator platform
        ],
    )
    def test_aggregator_platforms_return_empty(self, source_processor, url):
        """Test that aggregator platform URLs don't extract a company name.

        These are job board platforms, not companies hiring.
        """
        result = source_processor._extract_company_from_url(url)
        # Should return empty or the platform name, not "Jobs"
        assert result != "Jobs"
        assert result != "Careers"


class TestFormatCompanyName:
    """Tests for _format_company_name helper method."""

    @pytest.mark.parametrize(
        "slug,expected",
        [
            ("anthropic", "Anthropic"),
            ("discord", "Discord"),
            ("ge-vernova", "Ge Vernova"),
            ("acme_corp", "Acme Corp"),
            ("my-awesome-company", "My Awesome Company"),
            ("", ""),
        ],
    )
    def test_format_company_name(self, source_processor, slug, expected):
        """Test formatting of URL slugs to company names."""
        result = source_processor._format_company_name(slug)
        assert result == expected
