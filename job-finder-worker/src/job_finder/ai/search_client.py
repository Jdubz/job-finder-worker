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
    """Search client that rotates through providers with rate limiting.

    Features:
    - Rotates between providers (round-robin) to spread load
    - Enforces minimum delay between API calls to prevent rate limits
    - Falls back to next provider on errors
    - Cooldown period for providers that hit rate limits
    """

    # Minimum delay between API calls (seconds) - prevents rate limiting
    MIN_CALL_DELAY_SECONDS = 1.0

    def __init__(self, clients: List[SearchClient]):
        """
        Initialize with a list of search clients to rotate through.

        Args:
            clients: List of SearchClient instances, rotated through
        """
        if not clients:
            raise ValueError("FallbackSearchClient requires at least one client")
        self._clients = clients
        self._failed_clients: Dict[str, float] = {}  # Track temporarily failed clients
        self._failure_cooldown_seconds = 300  # 5 minute cooldown for failed clients
        self._last_call_time: Dict[str, float] = {}  # Track last call per provider
        self._next_client_index = 0  # For round-robin rotation

    def _get_available_clients(self, current_time: float) -> List[SearchClient]:
        """Get list of clients not on cooldown, in rotation order."""
        available = []
        # Start from current rotation index
        for i in range(len(self._clients)):
            idx = (self._next_client_index + i) % len(self._clients)
            client = self._clients[idx]
            client_name = client.__class__.__name__

            # Skip clients on cooldown
            if client_name in self._failed_clients:
                fail_time = self._failed_clients[client_name]
                if current_time - fail_time < self._failure_cooldown_seconds:
                    logger.debug(
                        f"Skipping {client_name} (on cooldown, "
                        f"{int(self._failure_cooldown_seconds - (current_time - fail_time))}s remaining)"
                    )
                    continue
                else:
                    # Cooldown expired, remove from failed list
                    del self._failed_clients[client_name]

            available.append(client)
        return available

    def _wait_for_rate_limit(self, client_name: str) -> None:
        """Wait if needed to respect rate limits."""
        if client_name in self._last_call_time:
            elapsed = time.time() - self._last_call_time[client_name]
            if elapsed < self.MIN_CALL_DELAY_SECONDS:
                wait_time = self.MIN_CALL_DELAY_SECONDS - elapsed
                logger.debug(f"Rate limiting: waiting {wait_time:.2f}s before {client_name} call")
                time.sleep(wait_time)

    def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        """
        Search using rotating providers with rate limiting.

        Rotates between providers to spread load and enforces minimum delay
        between API calls to prevent rate limits. Falls back to other
        providers on errors.

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
        available_clients = self._get_available_clients(current_time)

        if not available_clients:
            # All clients on cooldown - wait for first one to be available
            # Find the one with shortest remaining cooldown
            if self._failed_clients:
                earliest_available = min(
                    (fail_time + self._failure_cooldown_seconds, name)
                    for name, fail_time in self._failed_clients.items()
                )
                wait_time = earliest_available[0] - current_time
                if wait_time > 0:
                    logger.warning(
                        f"All search providers on cooldown. "
                        f"Next available: {earliest_available[1]} in {wait_time:.1f}s"
                    )
            raise requests.exceptions.RequestException(
                "All search providers on cooldown due to rate limits"
            )

        for client in available_clients:
            client_name = client.__class__.__name__

            # Enforce rate limiting delay
            self._wait_for_rate_limit(client_name)

            try:
                results = client.search(query, max_results)
                # Record successful call time
                self._last_call_time[client_name] = time.time()
                # Advance rotation for next call
                self._next_client_index = (self._clients.index(client) + 1) % len(self._clients)
                return results
            except requests.exceptions.RequestException as e:
                error_msg = str(e)
                errors.append(f"{client_name}: {error_msg}")
                logger.warning(f"Search provider {client_name} failed: {error_msg}")

                # Record call time even on failure (for rate limiting)
                self._last_call_time[client_name] = time.time()

                # Check for quota/rate limit errors (don't retry these immediately)
                status_code = getattr(getattr(e, "response", None), "status_code", None)
                if status_code in (429, 432, 402, 403):
                    # Quota exceeded, rate limited, or payment required - cooldown
                    self._failed_clients[client_name] = time.time()
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
