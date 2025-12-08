"""AI-powered job matching and analysis."""

from job_finder.ai.agent_manager import AgentManager, AgentResult
from job_finder.ai.extraction import JobExtractionResult, JobExtractor
from job_finder.ai.matcher import AIJobMatcher, JobMatchResult
from job_finder.ai.providers import (
    AIProvider,
    ClaudeProvider,
    ClaudeCLIProvider,
    CodexCLIProvider,
    GeminiCLIProvider,
    GeminiProvider,
    OpenAIProvider,
)
from job_finder.ai.search_client import (
    BraveSearchClient,
    SearchClient,
    SearchResult,
    TavilySearchClient,
    get_search_client,
)
from job_finder.ai.source_analysis_agent import (
    DisableReason,
    SourceAnalysisAgent,
    SourceAnalysisResult,
    SourceClassification,
)

__all__ = [
    "AgentManager",
    "AgentResult",
    "AIJobMatcher",
    "JobMatchResult",
    "JobExtractor",
    "JobExtractionResult",
    "AIProvider",
    "ClaudeProvider",
    "ClaudeCLIProvider",
    "CodexCLIProvider",
    "GeminiCLIProvider",
    "GeminiProvider",
    "OpenAIProvider",
    "SourceAnalysisAgent",
    "SourceAnalysisResult",
    "SourceClassification",
    "DisableReason",
    "SearchClient",
    "SearchResult",
    "TavilySearchClient",
    "BraveSearchClient",
    "get_search_client",
]
