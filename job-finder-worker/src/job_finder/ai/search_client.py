"""Search API client for company discovery.

Provides web search results to AI agents during company enrichment
to reduce hallucination and improve data quality.
"""

import logging
import os
import time
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
            requests.exceptions.RequestException: If the search API request fails
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
                headers={
                    "X-Subscription-Token": self.api_key,
                    "Accept": "application/json",
                },
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


class FallbackSearchClient(SearchClient):
    """Search client that automatically falls back through multiple providers.

    If the primary provider fails (rate limits, quota exceeded, network errors),
    automatically tries the next provider in the chain.
    """

    def __init__(self, clients: List[SearchClient]):
        """
        Initialize with a list of search clients to try in order.

        Args:
            clients: List of SearchClient instances, tried in order
        """
        if not clients:
            raise ValueError("FallbackSearchClient requires at least one client")
        self._clients = clients
        self._failed_clients: Dict[str, float] = {}  # Track temporarily failed clients
        self._failure_cooldown_seconds = 300  # 5 minute cooldown for failed clients

    def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        """
        Search using the first available provider, falling back on errors.

        Args:
            query: Search query
            max_results: Maximum results to return

        Returns:
            List of SearchResult objects

        Raises:
            requests.exceptions.RequestException: If all providers fail
        """
        errors = []
        current_time = time.time()

        for client in self._clients:
            client_name = client.__class__.__name__

            # Skip clients that recently failed (cooldown period)
            if client_name in self._failed_clients:
                fail_time = self._failed_clients[client_name]
                if current_time - fail_time < self._failure_cooldown_seconds:
                    logger.debug(
                        f"Skipping {client_name} (failed {int(current_time - fail_time)}s ago)"
                    )
                    continue
                else:
                    # Cooldown expired, remove from failed list
                    del self._failed_clients[client_name]

            try:
                results = client.search(query, max_results)
                return results
            except requests.exceptions.RequestException as e:
                error_msg = str(e)
                errors.append(f"{client_name}: {error_msg}")
                logger.warning(f"Search provider {client_name} failed: {error_msg}")

                # Check for quota/rate limit errors (don't retry these immediately)
                status_code = getattr(getattr(e, "response", None), "status_code", None)
                if status_code in (429, 432, 402, 403):
                    # Quota exceeded, rate limited, or payment required - cooldown
                    self._failed_clients[client_name] = current_time
                    logger.info(
                        f"Search provider {client_name} hit rate/quota limit, "
                        f"cooling down for {self._failure_cooldown_seconds}s"
                    )

                # Continue to next provider
                continue

        # All providers failed
        all_errors = "; ".join(errors)
        logger.error(f"All search providers failed for '{query}': {all_errors}")
        raise requests.exceptions.RequestException(f"All search providers failed: {all_errors}")


def get_search_client() -> Optional[SearchClient]:
    """
    Get a configured search client with automatic fallback.

    Creates a FallbackSearchClient that tries providers in this order:
    1. Tavily (if TAVILY_API_KEY is set)
    2. Brave (if BRAVE_API_KEY is set)

    If a provider fails (rate limits, errors), automatically falls back to the next.

    Returns:
        SearchClient instance or None if no API keys configured
    """
    clients: List[SearchClient] = []

    # Add available providers in priority order
    if os.getenv("TAVILY_API_KEY"):
        try:
            clients.append(TavilySearchClient())
        except ValueError:
            pass  # Key not set

    if os.getenv("BRAVE_API_KEY"):
        try:
            clients.append(BraveSearchClient())
        except ValueError:
            pass  # Key not set

    if not clients:
        logger.warning("No search API keys configured (TAVILY_API_KEY or BRAVE_API_KEY)")
        return None

    # If only one client, return it directly
    if len(clients) == 1:
        return clients[0]

    # Multiple clients - wrap in fallback handler
    logger.info(
        f"Search client initialized with fallback chain: "
        f"{[c.__class__.__name__ for c in clients]}"
    )
    return FallbackSearchClient(clients)
