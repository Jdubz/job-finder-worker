"""AI-powered job matching and analysis."""

from job_finder.ai.inference_client import InferenceClient, AgentResult
from job_finder.ai.task_router import get_model_for_task
from job_finder.ai.extraction import JobExtractionResult, JobExtractor
from job_finder.ai.matcher import AIJobMatcher, JobMatchResult
from job_finder.ai.search_client import (
    BraveSearchClient,
    SearchClient,
    SearchResult,
    TavilySearchClient,
    get_search_client,
)
from job_finder.ai.wikipedia_client import (
    WikipediaClient,
    get_wikipedia_client,
)
from job_finder.ai.source_analysis_agent import (
    DisableReason,
    SourceAnalysisAgent,
    SourceAnalysisResult,
    SourceClassification,
)

__all__ = [
    "InferenceClient",
    "AgentResult",
    "get_model_for_task",
    "AIJobMatcher",
    "JobMatchResult",
    "JobExtractor",
    "JobExtractionResult",
    "SourceAnalysisAgent",
    "SourceAnalysisResult",
    "SourceClassification",
    "DisableReason",
    "SearchClient",
    "SearchResult",
    "TavilySearchClient",
    "BraveSearchClient",
    "get_search_client",
    "WikipediaClient",
    "get_wikipedia_client",
]
