"""Heuristic extraction tests for CompanyInfoFetcher."""

from job_finder.company_info_fetcher import CompanyInfoFetcher


def test_extract_company_info_heuristics_capture_new_fields():
    text = """
    We are a remote-first, AI and machine learning driven company with over 500 employees.
    Headquarters operates on UTC-5 and we value distributed teams.
    """

    fetcher = CompanyInfoFetcher()
    result = fetcher._extract_company_info(text, "ExampleCo")

    assert result["isRemoteFirst"] is True
    assert result["aiMlFocus"] is True
    assert result["employeeCount"] == 500
    assert result["timezoneOffset"] == -5
