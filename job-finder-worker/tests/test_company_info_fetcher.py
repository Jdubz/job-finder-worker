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


def test_merge_company_info_prefers_longer_text():
    """Test that _merge_company_info prefers longer text for descriptive fields."""
    fetcher = CompanyInfoFetcher()

    # Wikipedia provides short description
    primary = {
        "about": "Microsoft is a tech company.",
        "culture": "",
        "mission": "Short mission.",
        "website": "https://microsoft.com",
        "industry": "Technology",
    }

    # Web search provides longer descriptions
    secondary = {
        "about": "Microsoft Corporation is an American multinational technology company that develops software and hardware.",
        "culture": "Microsoft has a growth mindset culture focused on learning and innovation.",
        "mission": "To empower every person and every organization on the planet to achieve more.",
        "website": "https://example.com",  # Should not override valid website
        "industry": "Software",  # Should not override non-empty value
    }

    result = fetcher._merge_company_info(primary, secondary)

    # Longer text should win for text fields
    assert "multinational" in result["about"]  # Secondary is longer
    assert "growth mindset" in result["culture"]  # Secondary fills empty
    assert "empower every person" in result["mission"]  # Secondary is longer

    # Website should not change (primary is valid)
    assert result["website"] == "https://microsoft.com"

    # Industry should not change (primary is non-empty)
    assert result["industry"] == "Technology"


def test_merge_company_info_keeps_longer_primary():
    """Test that merge keeps primary text if it's longer."""
    fetcher = CompanyInfoFetcher()

    primary = {
        "about": "This is a very long and detailed description of the company with lots of information.",
        "culture": "",
    }

    secondary = {
        "about": "Short desc.",
        "culture": "Team culture.",
    }

    result = fetcher._merge_company_info(primary, secondary)

    # Primary about is longer, should be kept
    assert "very long and detailed" in result["about"]
    # Culture was empty, should be filled
    assert result["culture"] == "Team culture."


def test_normalize_url_adds_scheme_and_trims():
    fetcher = CompanyInfoFetcher()
    assert fetcher._normalize_url("example.com") == "https://example.com"
    assert fetcher._normalize_url("  https://example.com/path  ") == "https://example.com/path"
    assert fetcher._normalize_url("") == ""


def test_choose_best_website_prefers_wiki_when_candidate_missing(monkeypatch):
    fetcher = CompanyInfoFetcher()
    # No need to hit network in homepage probe
    monkeypatch.setattr(fetcher, "_homepage_mentions_brand", lambda *_args, **_kwargs: False)
    monkeypatch.setattr(fetcher, "_is_job_board_url", lambda url: False)
    monkeypatch.setattr(fetcher, "_is_search_engine_url", lambda url: False)

    result = fetcher._choose_best_website(
        candidate=None, wiki_website="https://wiki-site.com", company_name="Acme"
    )
    assert result == "https://wiki-site.com"


def test_choose_best_website_uses_candidate_when_wiki_invalid(monkeypatch):
    fetcher = CompanyInfoFetcher()

    # Mark wiki as job board, candidate as valid and brand-confirmed
    def is_job_board(url):
        return url and "wiki-bad" in url

    monkeypatch.setattr(fetcher, "_is_job_board_url", is_job_board)
    monkeypatch.setattr(fetcher, "_is_search_engine_url", lambda url: False)
    monkeypatch.setattr(fetcher, "_homepage_mentions_brand", lambda *_args, **_kwargs: True)

    result = fetcher._choose_best_website(
        candidate="https://acme.com",
        wiki_website="https://wiki-bad.com",
        company_name="Acme",
    )
    assert result == "https://acme.com"
