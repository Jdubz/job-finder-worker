"""Tests for search API client."""

import os
from unittest.mock import Mock, MagicMock, patch

import pytest

from job_finder.ai.search_client import (
    BraveSearchClient,
    SearchResult,
    TavilySearchClient,
    get_search_client,
)


class TestSearchResult:
    """Tests for SearchResult class."""

    def test_to_dict(self):
        result = SearchResult(title="Test", url="https://example.com", snippet="Test snippet")
        assert result.to_dict() == {
            "title": "Test",
            "url": "https://example.com",
            "snippet": "Test snippet",
        }

    def test_repr(self):
        result = SearchResult(title="Test", url="https://example.com", snippet="Test snippet")
        assert "Test" in repr(result)
        assert "https://example.com" in repr(result)


class TestTavilySearchClient:
    """Tests for Tavily search client."""

    def test_init_with_api_key(self):
        client = TavilySearchClient(api_key="test-key")
        assert client.api_key == "test-key"

    def test_init_without_api_key_raises(self):
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="TAVILY_API_KEY not set"):
                TavilySearchClient()

    @patch('requests.post')
    def test_search_success(self, mock_post):
        # Mock Tavily API response
        mock_response = Mock()
        mock_response.json.return_value = {
            "results": [
                {
                    "title": "Example Company",
                    "url": "https://example.com",
                    "content": "Example company description",
                },
                {
                    "title": "Example Company Careers",
                    "url": "https://example.com/careers",
                    "content": "Join our team",
                },
            ]
        }
        mock_post.return_value = mock_response

        client = TavilySearchClient(api_key="test-key")
        results = client.search("Example Company official website", max_results=5)

        assert len(results) == 2
        assert results[0].title == "Example Company"
        assert results[0].url == "https://example.com"
        assert results[0].snippet == "Example company description"

    @patch('requests.post')
    def test_search_api_error(self, mock_post):
        # Mock API error
        mock_response = Mock()
        mock_response.raise_for_status.side_effect = Exception("API Error")
        mock_post.return_value = mock_response

        client = TavilySearchClient(api_key="test-key")
        with pytest.raises(Exception):
            client.search("test query")


class TestBraveSearchClient:
    """Tests for Brave search client."""

    def test_init_with_api_key(self):
        client = BraveSearchClient(api_key="test-key")
        assert client.api_key == "test-key"

    def test_init_without_api_key_raises(self):
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="BRAVE_API_KEY not set"):
                BraveSearchClient()

    @patch('requests.get')
    def test_search_success(self, mock_get):
        # Mock Brave API response
        mock_response = Mock()
        mock_response.json.return_value = {
            "web": {
                "results": [
                    {
                        "title": "Example Company",
                        "url": "https://example.com",
                        "description": "Example company description",
                    }
                ]
            }
        }
        mock_get.return_value = mock_response

        client = BraveSearchClient(api_key="test-key")
        results = client.search("Example Company", max_results=5)

        assert len(results) == 1
        assert results[0].title == "Example Company"
        assert results[0].url == "https://example.com"
        assert results[0].snippet == "Example company description"


class TestGetSearchClient:
    """Tests for get_search_client factory function."""

    def test_returns_tavily_when_key_set(self):
        with patch.dict(os.environ, {"TAVILY_API_KEY": "test-key"}):
            client = get_search_client()
            assert isinstance(client, TavilySearchClient)

    def test_returns_brave_when_only_brave_key_set(self):
        with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}, clear=True):
            client = get_search_client()
            assert isinstance(client, BraveSearchClient)

    def test_returns_none_when_no_keys_set(self):
        with patch.dict(os.environ, {}, clear=True):
            client = get_search_client()
            assert client is None

    def test_prefers_tavily_over_brave(self):
        with patch.dict(os.environ, {"TAVILY_API_KEY": "tavily-key", "BRAVE_API_KEY": "brave-key"}):
            client = get_search_client()
            assert isinstance(client, TavilySearchClient)
