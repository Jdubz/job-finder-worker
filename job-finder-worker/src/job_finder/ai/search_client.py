"""Search API client for company discovery.

Provides web search results to AI agents during company enrichment
to reduce hallucination and improve data quality.
"""

import logging
import os
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

import requests

logger = logging.getLogger(__name__)


class SearchResult:
    """A single search result."""

    def __init__(self, title: str, url: str, snippet: str):
        self.title = title
        self.url = url
        self.snippet = snippet

    def to_dict(self) -> Dict[str, str]:
        return {"title": self.title, "url": self.url, "snippet": self.snippet}

    def __repr__(self) -> str:
        return f"SearchResult(title={self.title!r}, url={self.url!r})"


class SearchClient(ABC):
    """Abstract base class for search API clients."""

    @abstractmethod
    def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        """
        Search for a query and return results.

        Args:
            query: Search query string
            max_results: Maximum number of results to return

        Returns:
            List of SearchResult objects

        Raises:
            Exception: If the search API request fails
        """
        pass


class TavilySearchClient(SearchClient):
    """Tavily Search API client.

    Tavily provides LLM-optimized search results with high-quality snippets.
    Free tier: 1,000 requests/month
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Tavily client.

        Args:
            api_key: Tavily API key (defaults to TAVILY_API_KEY env var)
        """
        self.api_key = api_key or os.getenv("TAVILY_API_KEY")
        if not self.api_key:
            raise ValueError("TAVILY_API_KEY not set")

        self.base_url = "https://api.tavily.com/search"

    def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        """
        Search using Tavily API.

        Args:
            query: Search query
            max_results: Maximum results to return

        Returns:
            List of SearchResult objects
        """
        try:
            response = requests.post(
                self.base_url,
                json={
                    "api_key": self.api_key,
                    "query": query,
                    "max_results": max_results,
                    "include_answer": False,  # We only need raw results
                    "include_raw_content": False,  # Snippets are sufficient
                },
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("results", []):
                results.append(
                    SearchResult(
                        title=item.get("title", ""),
                        url=item.get("url", ""),
                        snippet=item.get("content", ""),
                    )
                )

            logger.info(f"Tavily search for '{query}' returned {len(results)} results")
            return results

        except requests.exceptions.RequestException as e:
            logger.error(f"Tavily search failed for '{query}': {e}")
            raise


class BraveSearchClient(SearchClient):
    """Brave Search API client.

    Brave provides independent search results with good coverage.
    Free tier: 2,000 requests/month
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Brave client.

        Args:
            api_key: Brave API key (defaults to BRAVE_API_KEY env var)
        """
        self.api_key = api_key or os.getenv("BRAVE_API_KEY")
        if not self.api_key:
            raise ValueError("BRAVE_API_KEY not set")

        self.base_url = "https://api.search.brave.com/res/v1/web/search"

    def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        """
        Search using Brave API.

        Args:
            query: Search query
            max_results: Maximum results to return

        Returns:
            List of SearchResult objects
        """
        try:
            response = requests.get(
                self.base_url,
                params={"q": query, "count": max_results},
                headers={"X-Subscription-Token": self.api_key, "Accept": "application/json"},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()

            results = []
            for item in data.get("web", {}).get("results", []):
                results.append(
                    SearchResult(
                        title=item.get("title", ""),
                        url=item.get("url", ""),
                        snippet=item.get("description", ""),
                    )
                )

            logger.info(f"Brave search for '{query}' returned {len(results)} results")
            return results

        except requests.exceptions.RequestException as e:
            logger.error(f"Brave search failed for '{query}': {e}")
            raise


def get_search_client() -> Optional[SearchClient]:
    """
    Get a configured search client based on available API keys.

    Returns Tavily client if TAVILY_API_KEY is set, otherwise Brave if
    BRAVE_API_KEY is set, otherwise None.

    Returns:
        SearchClient instance or None if no API keys configured
    """
    if os.getenv("TAVILY_API_KEY"):
        try:
            return TavilySearchClient()
        except ValueError:
            pass

    if os.getenv("BRAVE_API_KEY"):
        try:
            return BraveSearchClient()
        except ValueError:
            pass

    logger.warning("No search API keys configured (TAVILY_API_KEY or BRAVE_API_KEY)")
    return None
