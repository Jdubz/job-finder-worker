"""Tests for career page search functions in CompanyProcessor."""

from unittest.mock import Mock, patch

import pytest

from job_finder.ai.search_client import SearchResult
from job_finder.exceptions import NoAgentsAvailableError
from job_finder.job_queue.models import ProcessorContext
from job_finder.job_queue.processors.company_processor import CompanyProcessor


@pytest.fixture
def company_processor():
    """Create a CompanyProcessor with mocked dependencies."""
    queue_manager = Mock()
    config_loader = Mock()
    companies_manager = Mock()
    sources_manager = Mock()
    # Mock get_aggregator_domains to return ATS platforms from "database"
    sources_manager.get_aggregator_domains.return_value = [
        "greenhouse.io",
        "lever.co",
        "myworkdayjobs.com",
        "workday.com",
        "smartrecruiters.com",
        "ashbyhq.com",
        "breezy.hr",
        "jobvite.com",
        "icims.com",
    ]
    company_info_fetcher = Mock()

    ctx = ProcessorContext(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=Mock(),
        job_listing_storage=Mock(),
        companies_manager=companies_manager,
        sources_manager=sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=Mock(),
    )
    return CompanyProcessor(ctx)


class TestFindBestCareerUrl:
    """Tests for _find_best_career_url method."""

    def test_prioritizes_ats_platforms(self, company_processor):
        """Test that ATS platforms get highest priority."""
        results = [
            SearchResult(url="https://example.com/careers", title="Careers", snippet=""),
            SearchResult(url="https://boards.greenhouse.io/acme", title="Jobs", snippet=""),
            SearchResult(url="https://jobs.lever.co/acme", title="Jobs", snippet=""),
        ]

        url = company_processor._find_best_career_url(results, "Acme Corp")

        # Should return greenhouse or lever (ATS), not example.com
        assert "greenhouse.io" in url or "lever.co" in url

    def test_scores_career_paths(self, company_processor):
        """Test that /careers and /jobs paths get good scores."""
        results = [
            SearchResult(url="https://acme.com/about", title="About", snippet=""),
            SearchResult(url="https://acme.com/careers", title="Careers", snippet=""),
        ]

        url = company_processor._find_best_career_url(results, "Acme Corp")

        assert url == "https://acme.com/careers"

    def test_scores_career_subdomains(self, company_processor):
        """Test that careers.* subdomains get good scores."""
        results = [
            SearchResult(url="https://www.acme.com/about", title="About", snippet=""),
            SearchResult(url="https://careers.acme.com", title="Careers", snippet=""),
        ]

        url = company_processor._find_best_career_url(results, "Acme Corp")

        assert url == "https://careers.acme.com"

    def test_filters_aggregators(self, company_processor):
        """Test that job aggregator sites are filtered out."""
        results = [
            SearchResult(url="https://www.indeed.com/jobs/acme", title="Jobs", snippet=""),
            SearchResult(
                url="https://www.linkedin.com/company/acme/jobs",
                title="Jobs",
                snippet="",
            ),
            SearchResult(url="https://acme.com/careers", title="Careers", snippet=""),
        ]

        url = company_processor._find_best_career_url(results, "Acme Corp")

        # Should filter out indeed and linkedin
        assert "indeed.com" not in url
        assert "linkedin.com" not in url
        assert url == "https://acme.com/careers"

    def test_returns_none_for_empty_results(self, company_processor):
        """Test that None is returned when no results."""
        url = company_processor._find_best_career_url([], "Acme Corp")

        assert url is None

    def test_returns_none_when_all_filtered(self, company_processor):
        """Test that None is returned when all results are aggregators."""
        results = [
            SearchResult(url="https://www.indeed.com/jobs/acme", title="Jobs", snippet=""),
            SearchResult(url="https://www.glassdoor.com/acme", title="Jobs", snippet=""),
        ]

        url = company_processor._find_best_career_url(results, "Acme Corp")

        assert url is None

    def test_bonus_for_company_name_in_domain(self, company_processor):
        """Test that company name in domain adds bonus score."""
        results = [
            SearchResult(url="https://example.com/careers", title="Careers", snippet=""),
            SearchResult(url="https://acme.com/careers", title="Careers", snippet=""),
        ]

        url = company_processor._find_best_career_url(results, "Acme")

        # Should prefer acme.com since company name is in domain
        assert url == "https://acme.com/careers"


class TestSearchForCareerPage:
    """Tests for _search_for_career_page method."""

    @patch("job_finder.job_queue.processors.company_processor.get_search_client")
    def test_returns_none_when_no_search_client(self, mock_get_client, company_processor):
        """Test graceful handling when no search client available."""
        mock_get_client.return_value = None

        url = company_processor._search_for_career_page("Acme Corp")

        assert url is None

    @patch("job_finder.job_queue.processors.company_processor.get_search_client")
    def test_returns_none_on_empty_results(self, mock_get_client, company_processor):
        """Test handling of empty search results."""
        mock_client = Mock()
        mock_client.search.return_value = []
        mock_get_client.return_value = mock_client

        url = company_processor._search_for_career_page("Acme Corp")

        assert url is None

    @patch("job_finder.job_queue.processors.company_processor.get_search_client")
    def test_returns_best_career_url(self, mock_get_client, company_processor):
        """Test successful career page discovery."""
        mock_client = Mock()
        mock_client.search.return_value = [
            SearchResult(url="https://boards.greenhouse.io/acme", title="Jobs", snippet=""),
        ]
        mock_get_client.return_value = mock_client

        url = company_processor._search_for_career_page("Acme Corp")

        assert url == "https://boards.greenhouse.io/acme"
        mock_client.search.assert_called_once()
        # Verify search query includes company name
        call_args = mock_client.search.call_args
        assert "Acme Corp" in call_args[0][0]

    @patch("job_finder.job_queue.processors.company_processor.get_search_client")
    def test_handles_search_exception(self, mock_get_client, company_processor):
        """Test graceful handling of search API errors."""
        mock_client = Mock()
        mock_client.search.side_effect = Exception("API Error")
        mock_get_client.return_value = mock_client

        url = company_processor._search_for_career_page("Acme Corp")

        assert url is None


class TestAgentSelectCareerUrl:
    """Tests for _agent_select_career_url method."""

    def test_agent_overrides_heuristic(self, company_processor):
        """Agent result replaces heuristic choice."""
        company_processor.inference_client = Mock()
        company_processor.inference_client.execute.return_value = Mock(
            text='{"best_url":"https://boards.greenhouse.io/acme"}'
        )
        results = [
            SearchResult(url="https://example.com/careers", title="Careers", snippet="foo"),
            SearchResult(url="https://boards.greenhouse.io/acme", title="Jobs", snippet="bar"),
        ]

        url = company_processor._agent_select_career_url(
            "Acme", results, heuristic_choice="https://example.com/careers"
        )

        assert url == "https://boards.greenhouse.io/acme"
        company_processor.inference_client.execute.assert_called_once()

    def test_agent_unavailable_returns_none(self, company_processor):
        """NoAgentsAvailableError is handled gracefully."""
        company_processor.inference_client = Mock()
        company_processor.inference_client.execute.side_effect = NoAgentsAvailableError(
            "unavailable", task_type="extraction", tried_agents=[]
        )
        results = [SearchResult(url="https://example.com/jobs", title="Jobs", snippet="")]

        url = company_processor._agent_select_career_url(
            "Acme", results, heuristic_choice="https://example.com/jobs"
        )

        assert url == "https://example.com/jobs"

    def test_json_decode_error_warns_and_returns_none(self, company_processor, caplog):
        """Malformed agent response is warned and returns None."""
        caplog.set_level("WARNING")
        company_processor.inference_client = Mock()
        company_processor.inference_client.execute.return_value = Mock(text="not json")
        results = [SearchResult(url="https://example.com/jobs", title="Jobs", snippet="")]

        url = company_processor._agent_select_career_url(
            "Acme", results, heuristic_choice="https://example.com/jobs"
        )

        assert url == "https://example.com/jobs"
        assert any("Failed to decode agent JSON response" in rec.message for rec in caplog.records)

    def test_returns_none_when_no_agent(self, company_processor):
        """If inference client missing, returns None."""
        company_processor.inference_client = None
        results = [SearchResult(url="https://example.com/jobs", title="Jobs", snippet="")]

        url = company_processor._agent_select_career_url("Acme", results, heuristic_choice=None)

        assert url is None
