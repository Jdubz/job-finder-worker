"""Tests for Wikipedia API client."""

from unittest.mock import Mock, patch

from job_finder.ai.wikipedia_client import (
    WikipediaClient,
    get_wikipedia_client,
)


class TestWikipediaClient:
    """Tests for WikipediaClient class."""

    def test_init_creates_session(self):
        client = WikipediaClient()
        assert client.session is not None
        assert "User-Agent" in client.session.headers

    @patch.object(WikipediaClient, "_find_company_page")
    @patch.object(WikipediaClient, "_get_page_summary")
    @patch.object(WikipediaClient, "_get_infobox_data")
    def test_search_company_success(self, mock_infobox, mock_summary, mock_find):
        """Test successful company search."""
        mock_find.return_value = "Microsoft"
        mock_summary.return_value = {
            "title": "Microsoft",
            "extract": "Microsoft Corporation is an American multinational technology company.",
        }
        mock_infobox.return_value = {
            "website": "https://microsoft.com",
            "headquarters": "Redmond, Washington",
            "industry": "Technology",
            "founded": "1975",
            "num_employees": "228000",
        }

        client = WikipediaClient()
        result = client.search_company("Microsoft")

        assert result is not None
        assert result["name"] == "Microsoft"
        assert "technology" in result["about"].lower()
        assert result["website"] == "https://microsoft.com"
        assert result["headquarters"] == "Redmond, Washington"
        assert result["industry"] == "Technology"
        assert result["founded"] == "1975"
        assert result["employeeCount"] == 228000

    @patch.object(WikipediaClient, "_find_company_page")
    def test_search_company_not_found(self, mock_find):
        """Test when company page is not found."""
        mock_find.return_value = None

        client = WikipediaClient()
        result = client.search_company("NonexistentCompany12345")

        assert result is None

    @patch.object(WikipediaClient, "_find_company_page")
    @patch.object(WikipediaClient, "_get_page_summary")
    def test_search_company_no_summary(self, mock_summary, mock_find):
        """Test when page summary fails."""
        mock_find.return_value = "SomeCompany"
        mock_summary.return_value = None

        client = WikipediaClient()
        result = client.search_company("SomeCompany")

        assert result is None


class TestWikipediaClientFindPage:
    """Tests for _find_company_page method."""

    @patch("requests.Session.get")
    def test_find_company_page_exact_match(self, mock_get):
        """Test finding company page with exact name match in results."""
        mock_response = Mock()
        mock_response.json.return_value = {
            "query": {
                "search": [
                    {"title": "Microsoft Corporation"},
                    {"title": "Microsoft Windows"},
                    {"title": "Microsoft Office"},
                ]
            }
        }
        mock_get.return_value = mock_response

        client = WikipediaClient()
        result = client._find_company_page("Microsoft")

        assert result == "Microsoft Corporation"

    @patch("requests.Session.get")
    def test_find_company_page_fallback_first_result(self, mock_get):
        """Test falling back to first result when no exact match."""
        mock_response = Mock()
        mock_response.json.return_value = {
            "query": {
                "search": [
                    {"title": "Technology industry"},
                    {"title": "Software development"},
                ]
            }
        }
        mock_get.return_value = mock_response

        client = WikipediaClient()
        result = client._find_company_page("TechStartup")

        assert result == "Technology industry"

    @patch("requests.Session.get")
    def test_find_company_page_no_results(self, mock_get):
        """Test when search returns no results."""
        mock_response = Mock()
        mock_response.json.return_value = {"query": {"search": []}}
        mock_get.return_value = mock_response

        client = WikipediaClient()
        result = client._find_company_page("NonexistentCompany12345")

        assert result is None

    def test_find_company_page_api_error(self):
        """Test handling API errors gracefully."""
        import requests

        client = WikipediaClient()
        # Patch the session's get method directly on the instance
        with patch.object(
            client.session, "get", side_effect=requests.RequestException("Network error")
        ):
            result = client._find_company_page("Microsoft")

        assert result is None


class TestWikipediaClientSummary:
    """Tests for _get_page_summary method."""

    @patch("requests.Session.get")
    def test_get_page_summary_success(self, mock_get):
        """Test successful summary retrieval."""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "title": "Microsoft",
            "extract": "Microsoft Corporation is a company.",
        }
        mock_get.return_value = mock_response

        client = WikipediaClient()
        result = client._get_page_summary("Microsoft")

        assert result["title"] == "Microsoft"
        assert "Microsoft Corporation" in result["extract"]

    @patch("requests.Session.get")
    def test_get_page_summary_not_found(self, mock_get):
        """Test handling 404 response."""
        mock_response = Mock()
        mock_response.status_code = 404
        mock_get.return_value = mock_response

        client = WikipediaClient()
        result = client._get_page_summary("NonexistentPage")

        assert result is None


class TestWikipediaClientWikidata:
    """Tests for Wikidata integration."""

    @patch("requests.Session.get")
    def test_get_infobox_data_success(self, mock_get):
        """Test successful Wikidata lookup."""
        # First call: get wikidata ID from Wikipedia
        wiki_response = Mock()
        wiki_response.json.return_value = {
            "query": {"pages": {"12345": {"pageprops": {"wikibase_item": "Q2283"}}}}
        }

        # Second call: get Wikidata properties
        wikidata_response = Mock()
        wikidata_response.json.return_value = {
            "entities": {
                "Q2283": {
                    "claims": {
                        "P856": [{"mainsnak": {"datavalue": {"value": "https://microsoft.com"}}}],
                        "P571": [
                            {
                                "mainsnak": {
                                    "datavalue": {"value": {"time": "+1975-04-04T00:00:00Z"}}
                                }
                            }
                        ],
                    }
                }
            }
        }

        mock_get.side_effect = [wiki_response, wikidata_response]

        client = WikipediaClient()
        result = client._get_infobox_data("Microsoft")

        assert result["website"] == "https://microsoft.com"
        assert result["founded"] == "1975"

    @patch("requests.Session.get")
    def test_get_infobox_data_no_wikidata_id(self, mock_get):
        """Test handling missing Wikidata ID."""
        mock_response = Mock()
        mock_response.json.return_value = {
            "query": {"pages": {"12345": {"pageprops": {}}}}  # No wikibase_item
        }
        mock_get.return_value = mock_response

        client = WikipediaClient()
        result = client._get_infobox_data("SomePage")

        assert result == {}


class TestWikipediaClientClaimParsing:
    """Tests for Wikidata claim value extraction."""

    def test_get_claim_value_string(self):
        """Test extracting string value."""
        claims = {"P856": [{"mainsnak": {"datavalue": {"value": "https://example.com"}}}]}

        client = WikipediaClient()
        result = client._get_claim_value(claims, "P856")

        assert result == "https://example.com"

    def test_get_claim_value_time(self):
        """Test extracting year from time value."""
        claims = {
            "P571": [{"mainsnak": {"datavalue": {"value": {"time": "+1975-04-04T00:00:00Z"}}}}]
        }

        client = WikipediaClient()
        result = client._get_claim_value(claims, "P571")

        assert result == "1975"

    def test_get_claim_value_amount(self):
        """Test extracting amount value (employee count)."""
        claims = {"P1128": [{"mainsnak": {"datavalue": {"value": {"amount": "+228000"}}}}]}

        client = WikipediaClient()
        result = client._get_claim_value(claims, "P1128")

        assert result == "228000"

    def test_get_claim_value_missing_property(self):
        """Test handling missing property."""
        claims = {}

        client = WikipediaClient()
        result = client._get_claim_value(claims, "P856")

        assert result == ""

    def test_get_claim_value_malformed(self):
        """Test handling malformed claim data."""
        claims = {"P856": [{}]}

        client = WikipediaClient()
        result = client._get_claim_value(claims, "P856")

        assert result == ""


class TestWikipediaClientEmployeeCount:
    """Tests for employee count parsing."""

    def test_parse_employee_count_simple(self):
        """Test parsing simple number."""
        client = WikipediaClient()
        assert client._parse_employee_count("228000") == 228000

    def test_parse_employee_count_with_commas(self):
        """Test parsing number with commas."""
        client = WikipediaClient()
        assert client._parse_employee_count("228,000") == 228000

    def test_parse_employee_count_with_plus(self):
        """Test parsing number with plus sign (Wikidata format)."""
        client = WikipediaClient()
        assert client._parse_employee_count("+228000") == 228000

    def test_parse_employee_count_empty(self):
        """Test parsing empty string."""
        client = WikipediaClient()
        assert client._parse_employee_count("") is None

    def test_parse_employee_count_none(self):
        """Test parsing None."""
        client = WikipediaClient()
        assert client._parse_employee_count(None) is None


class TestGetWikipediaClient:
    """Tests for get_wikipedia_client factory function."""

    def test_returns_client(self):
        """Test factory always returns a WikipediaClient instance."""
        client = get_wikipedia_client()
        assert isinstance(client, WikipediaClient)
