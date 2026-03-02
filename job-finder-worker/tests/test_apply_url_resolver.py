"""Tests for the apply URL resolver module."""

from dataclasses import dataclass
from typing import List
from unittest.mock import MagicMock

import pytest

from job_finder.utils.apply_url_resolver import (
    ApplyUrlResult,
    _company_name_slug,
    _extract_apply_url_from_description,
    _is_valid_apply_url,
    _score_search_result,
    _strip_trailing_punctuation,
    resolve_apply_url,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@dataclass
class FakeSearchResult:
    title: str
    url: str
    snippet: str


def _make_search_client(results: List[FakeSearchResult]) -> MagicMock:
    client = MagicMock()
    client.search.return_value = results
    return client


# ---------------------------------------------------------------------------
# _strip_trailing_punctuation
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "input_url, expected",
    [
        ("https://example.com/apply.", "https://example.com/apply"),
        ("https://example.com/apply,", "https://example.com/apply"),
        ("https://example.com/apply;", "https://example.com/apply"),
        ("https://example.com/apply)", "https://example.com/apply"),
        ("https://example.com/apply>", "https://example.com/apply"),
        ("https://example.com/apply", "https://example.com/apply"),
    ],
)
def test_strip_trailing_punctuation(input_url, expected):
    assert _strip_trailing_punctuation(input_url) == expected


# ---------------------------------------------------------------------------
# _is_valid_apply_url
# ---------------------------------------------------------------------------


class TestIsValidApplyUrl:
    def test_valid_https(self):
        assert _is_valid_apply_url("https://acme.com/careers") is True

    def test_valid_http(self):
        assert _is_valid_apply_url("http://acme.com/careers") is True

    def test_rejects_ftp(self):
        assert _is_valid_apply_url("ftp://acme.com/file") is False

    def test_rejects_mailto(self):
        assert _is_valid_apply_url("mailto:jobs@acme.com") is False

    def test_rejects_aggregator_weworkremotely(self):
        assert _is_valid_apply_url("https://weworkremotely.com/jobs/123") is False

    def test_rejects_aggregator_remotive(self):
        assert _is_valid_apply_url("https://remotive.com/remote-jobs/456") is False

    def test_rejects_empty_host(self):
        assert _is_valid_apply_url("https://") is False

    def test_rejects_empty_string(self):
        assert _is_valid_apply_url("") is False


# ---------------------------------------------------------------------------
# _extract_apply_url_from_description
# ---------------------------------------------------------------------------


class TestExtractApplyUrlFromDescription:
    def test_url_pattern(self):
        desc = "Some info\nURL: https://acme.com/careers\nMore info"
        assert _extract_apply_url_from_description(desc) == "https://acme.com/careers"

    def test_to_apply_pattern(self):
        desc = "Great job!\nTo apply: https://boards.greenhouse.io/acme/jobs/123\nThanks"
        assert (
            _extract_apply_url_from_description(desc)
            == "https://boards.greenhouse.io/acme/jobs/123"
        )

    def test_apply_at_pattern(self):
        desc = "Description\nApply at: https://jobs.lever.co/acme/abc-123"
        assert (
            _extract_apply_url_from_description(desc)
            == "https://jobs.lever.co/acme/abc-123"
        )

    def test_apply_here_pattern(self):
        desc = "Description\nApply here: https://acme.com/apply"
        assert _extract_apply_url_from_description(desc) == "https://acme.com/apply"

    def test_apply_via_pattern(self):
        desc = "Info\nApply via: https://acme.com/jobs/senior-dev"
        assert _extract_apply_url_from_description(desc) == "https://acme.com/jobs/senior-dev"

    def test_application_url_pattern(self):
        desc = "Info\nApplication URL: https://acme.com/apply/123"
        assert _extract_apply_url_from_description(desc) == "https://acme.com/apply/123"

    def test_application_link_pattern(self):
        desc = "Info\nApplication link: https://acme.com/careers/apply"
        assert _extract_apply_url_from_description(desc) == "https://acme.com/careers/apply"

    def test_strips_trailing_punctuation(self):
        desc = "Apply here: https://acme.com/apply."
        assert _extract_apply_url_from_description(desc) == "https://acme.com/apply"

    def test_rejects_aggregator_url(self):
        desc = "URL: https://weworkremotely.com/remote-jobs/acme-dev"
        assert _extract_apply_url_from_description(desc) is None

    def test_empty_description(self):
        assert _extract_apply_url_from_description("") is None

    def test_none_description(self):
        assert _extract_apply_url_from_description(None) is None

    def test_no_matching_pattern(self):
        desc = "We're looking for a great engineer. Check our website."
        assert _extract_apply_url_from_description(desc) is None

    def test_case_insensitive(self):
        desc = "url: https://acme.com/careers"
        assert _extract_apply_url_from_description(desc) == "https://acme.com/careers"


# ---------------------------------------------------------------------------
# _company_name_slug
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name, expected",
    [
        ("Acme Corp", "acmecorp"),
        ("My-Company, Inc.", "mycompanyinc"),
        ("  Spaces  ", "spaces"),
        ("ALL CAPS", "allcaps"),
    ],
)
def test_company_name_slug(name, expected):
    assert _company_name_slug(name) == expected


# ---------------------------------------------------------------------------
# _score_search_result
# ---------------------------------------------------------------------------


class TestScoreSearchResult:
    def test_ats_domain_scores_high(self):
        score = _score_search_result(
            "https://boards.greenhouse.io/acme/jobs/123",
            "Software Engineer at Acme",
            "Apply now",
            "acme",
        )
        # +2 (ATS) +1 (/jobs/) +1 (company slug) +1 ("apply" in text) = 5
        assert score >= 3

    def test_lever_domain(self):
        score = _score_search_result(
            "https://jobs.lever.co/acme/abc-123",
            "Software Engineer",
            "Description",
            "acme",
        )
        # +2 (ATS) +1 (company slug) = 3
        assert score >= 2

    def test_excluded_domain_linkedin(self):
        score = _score_search_result(
            "https://www.linkedin.com/jobs/view/123",
            "Software Engineer",
            "Apply",
            "acme",
        )
        assert score == -1

    def test_excluded_domain_indeed(self):
        score = _score_search_result(
            "https://www.indeed.com/viewjob?jk=abc",
            "Software Engineer",
            "Apply",
            "acme",
        )
        assert score == -1

    def test_excluded_domain_aggregator(self):
        score = _score_search_result(
            "https://weworkremotely.com/remote-jobs/acme-dev",
            "Dev at Acme",
            "Apply",
            "acme",
        )
        assert score == -1

    def test_career_path_token(self):
        score = _score_search_result(
            "https://acme.com/careers/software-engineer",
            "Software Engineer",
            "Description",
            "acme",
        )
        # +1 (/careers/) +1 (company slug) = 2
        assert score >= 2

    def test_apply_in_path(self):
        score = _score_search_result(
            "https://acme.com/apply",
            "Jobs",
            "Description",
            "acme",
        )
        # +1 (/apply) +1 (company slug) = 2
        assert score >= 2

    def test_apply_in_title_snippet(self):
        score = _score_search_result(
            "https://acme.com/some-page",
            "Apply for Software Engineer",
            "Description",
            "acme",
        )
        # +1 (company slug) +1 ("apply" in text) = 2
        assert score >= 1

    def test_generic_url_low_score(self):
        score = _score_search_result(
            "https://otherdomain.com/about",
            "About Page",
            "Information about the company",
            "acme",
        )
        assert score == 0

    def test_empty_company_slug(self):
        # Should not crash with empty slug
        score = _score_search_result(
            "https://acme.com/careers/engineer",
            "Engineer",
            "Apply",
            "",
        )
        assert score >= 0


# ---------------------------------------------------------------------------
# resolve_apply_url — integration
# ---------------------------------------------------------------------------


class TestResolveApplyUrl:
    def test_ats_derived_greenhouse(self):
        """ATS derivation should short-circuit everything else."""
        result = resolve_apply_url(
            job_url="https://boards.greenhouse.io/acme/jobs/123",
            job={"title": "Engineer", "company": "Acme", "description": ""},
            is_aggregator=True,
        )
        assert result.method == "ats_derived"
        assert result.confidence == "high"
        assert result.url == "https://boards.greenhouse.io/acme/jobs/123#app"

    def test_ats_derived_lever(self):
        result = resolve_apply_url(
            job_url="https://jobs.lever.co/acme/abc-123",
            job={"title": "Engineer", "company": "Acme", "description": ""},
        )
        assert result.method == "ats_derived"
        assert result.url == "https://jobs.lever.co/acme/abc-123/apply"

    def test_description_extraction_before_search(self):
        """Description extraction should be tried before search for aggregator jobs."""
        search_client = _make_search_client([
            FakeSearchResult(
                url="https://boards.greenhouse.io/acme/jobs/999",
                title="Engineer at Acme",
                snippet="Apply",
            ),
        ])

        result = resolve_apply_url(
            job_url="https://weworkremotely.com/remote-jobs/acme-eng",
            job={
                "title": "Engineer",
                "company": "Acme",
                "description": "Great role\nURL: https://acme.com/careers/apply\nThanks",
            },
            search_client=search_client,
            is_aggregator=True,
        )
        assert result.method == "description_extracted"
        assert result.url == "https://acme.com/careers/apply"
        # Search should NOT have been called
        search_client.search.assert_not_called()

    def test_search_resolution(self):
        """Search should be used when ATS and description fail."""
        search_client = _make_search_client([
            FakeSearchResult(
                url="https://boards.greenhouse.io/acme/jobs/456",
                title="Software Engineer at Acme - Apply",
                snippet="Apply for this role at Acme",
            ),
        ])

        result = resolve_apply_url(
            job_url="https://weworkremotely.com/remote-jobs/acme-eng",
            job={
                "title": "Software Engineer",
                "company": "Acme",
                "description": "Build cool stuff",
            },
            search_client=search_client,
            is_aggregator=True,
        )
        assert result.method == "search_resolved"
        assert "greenhouse.io" in result.url

    def test_no_search_client_degrades_gracefully(self):
        """Without a search client, should fall through to company fallback."""
        result = resolve_apply_url(
            job_url="https://weworkremotely.com/remote-jobs/acme-eng",
            job={
                "title": "Engineer",
                "company": "Acme",
                "description": "Build stuff",
                "company_website": "https://acme.com",
            },
            search_client=None,
            is_aggregator=True,
        )
        assert result.method == "company_fallback"
        assert result.url == "https://acme.com"
        assert result.confidence == "low"

    def test_company_fallback_from_companies_manager(self):
        """Companies manager should be used when company_website is empty."""
        companies_manager = MagicMock()
        companies_manager.get_company.return_value = {
            "id": "c1",
            "website": "https://acme.com",
        }

        result = resolve_apply_url(
            job_url="https://weworkremotely.com/remote-jobs/acme-eng",
            job={
                "title": "Engineer",
                "company": "Acme",
                "description": "Build stuff",
            },
            companies_manager=companies_manager,
            is_aggregator=True,
        )
        assert result.method == "company_fallback"
        assert result.url == "https://acme.com"

    def test_all_strategies_fail_returns_none(self):
        """When everything fails, should return url=None."""
        search_client = _make_search_client([])

        result = resolve_apply_url(
            job_url="https://weworkremotely.com/remote-jobs/acme-eng",
            job={
                "title": "Engineer",
                "company": "Acme",
                "description": "Build stuff",
            },
            search_client=search_client,
            is_aggregator=True,
        )
        assert result.url is None
        assert result.method == "none"

    def test_non_aggregator_skips_description_and_search(self):
        """Non-aggregator jobs should only try ATS derivation."""
        search_client = _make_search_client([
            FakeSearchResult(
                url="https://boards.greenhouse.io/acme/jobs/456",
                title="Engineer at Acme",
                snippet="Apply",
            ),
        ])

        result = resolve_apply_url(
            job_url="https://acme.com/careers/engineer",
            job={
                "title": "Engineer",
                "company": "Acme",
                "description": "URL: https://acme.com/apply",
                "company_website": "https://acme.com",
            },
            search_client=search_client,
            is_aggregator=False,
        )
        # Non-aggregator, non-ATS URL → no resolution
        assert result.url is None
        assert result.method == "none"
        search_client.search.assert_not_called()

    def test_search_failure_degrades_gracefully(self):
        """Search API errors should not crash the resolver."""
        search_client = MagicMock()
        search_client.search.side_effect = Exception("API error")

        result = resolve_apply_url(
            job_url="https://weworkremotely.com/remote-jobs/acme-eng",
            job={
                "title": "Engineer",
                "company": "Acme",
                "description": "Build stuff",
                "company_website": "https://acme.com",
            },
            search_client=search_client,
            is_aggregator=True,
        )
        # Should fall through to company fallback
        assert result.method == "company_fallback"
        assert result.url == "https://acme.com"

    def test_search_picks_highest_scored_result(self):
        """Search should return the highest-scored result."""
        search_client = _make_search_client([
            FakeSearchResult(
                url="https://acme.com/about",
                title="About Acme",
                snippet="Learn about us",
            ),
            FakeSearchResult(
                url="https://boards.greenhouse.io/acme/jobs/789",
                title="Software Engineer at Acme - Apply Now",
                snippet="Apply for this role",
            ),
            FakeSearchResult(
                url="https://acme.com/blog/hiring",
                title="We're hiring",
                snippet="Read about our team",
            ),
        ])

        result = resolve_apply_url(
            job_url="https://remotive.com/remote-jobs/acme-engineer",
            job={
                "title": "Software Engineer",
                "company": "Acme",
                "description": "Build things",
            },
            search_client=search_client,
            is_aggregator=True,
        )
        assert result.method == "search_resolved"
        assert "greenhouse.io" in result.url

    def test_search_excludes_aggregator_results(self):
        """Search results from aggregator domains should be excluded."""
        search_client = _make_search_client([
            FakeSearchResult(
                url="https://weworkremotely.com/remote-jobs/acme-eng",
                title="Engineer at Acme - Apply",
                snippet="Apply now",
            ),
            FakeSearchResult(
                url="https://acme.com/careers/apply",
                title="Apply at Acme",
                snippet="Submit your application",
            ),
        ])

        result = resolve_apply_url(
            job_url="https://weworkremotely.com/remote-jobs/acme-eng",
            job={
                "title": "Engineer",
                "company": "Acme",
                "description": "Build stuff",
            },
            search_client=search_client,
            is_aggregator=True,
        )
        assert result.method == "search_resolved"
        assert "acme.com" in result.url
        assert "weworkremotely" not in result.url
