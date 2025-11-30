"""Heuristic extraction tests for CompanyInfoFetcher."""

from job_finder.company_info_fetcher import CompanyInfoFetcher


def test_extract_with_heuristics_captures_boolean_fields():
    """Test that _extract_with_heuristics detects remote-first and AI/ML focus."""
    text = """
    We are a remote-first, AI and machine learning driven company with over 500 employees.
    Headquarters operates on UTC-5 and we value distributed teams.
    """

    fetcher = CompanyInfoFetcher()
    result = fetcher._extract_with_heuristics(text)

    assert result["isRemoteFirst"] is True
    assert result["aiMlFocus"] is True
    assert result["employeeCount"] == 500
    # Note: timezoneOffset is not extracted by heuristics anymore (only by AI)
