"""AI-powered job matching and analysis."""

from job_finder.ai.matcher import AIJobMatcher, JobMatchResult
from job_finder.ai.providers import (
    AIProvider,
    ClaudeProvider,
    CodexCLIProvider,
    GeminiProvider,
    OpenAIProvider,
    create_provider_from_config,
)
from job_finder.ai.search_client import (
    BraveSearchClient,
    SearchClient,
    SearchResult,
    TavilySearchClient,
    get_search_client,
)
from job_finder.ai.source_discovery import SourceDiscovery

__all__ = [
    "AIJobMatcher",
    "JobMatchResult",
    "AIProvider",
    "ClaudeProvider",
    "CodexCLIProvider",
    "GeminiProvider",
    "OpenAIProvider",
    "SourceDiscovery",
    "SearchClient",
    "SearchResult",
    "TavilySearchClient",
    "BraveSearchClient",
    "get_search_client",
    "create_provider_from_config",
]
