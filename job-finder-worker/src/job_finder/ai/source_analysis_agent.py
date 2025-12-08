"""AI-powered source analysis agent for intelligent source classification.

This module replaces fragile pattern matching with an AI agent that understands
the entire source ecosystem and makes intelligent decisions about:
- Whether a URL is a job aggregator or company-specific source
- Whether a source can be scraped (or is JS-only/bot-protected)
- The best classification and reasoning
- Meaningful disable notes when a source cannot be used

The agent is given full context about system capabilities and limitations,
allowing it to make informed decisions and recover from bad intake data.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, TYPE_CHECKING
from urllib.parse import urlparse

from job_finder.ai.response_parser import extract_json_from_response

if TYPE_CHECKING:
    from job_finder.ai.agent_manager import AgentManager

logger = logging.getLogger(__name__)


class SourceClassification(str, Enum):
    """Classification types for job sources."""

    COMPANY_SPECIFIC = "company_specific"  # Source belongs to a single company
    JOB_AGGREGATOR = "job_aggregator"  # Platform hosting multiple companies' jobs
    SINGLE_JOB_LISTING = "single_job_listing"  # URL points to one job, not a board
    ATS_PROVIDER_SITE = "ats_provider_site"  # The ATS company's own careers page
    INVALID = "invalid"  # Cannot be used as a source


class DisableReason(str, Enum):
    """Standard reasons for disabling a source."""

    BOT_PROTECTION = "bot_protection"
    JS_ONLY = "js_only"  # Requires JavaScript rendering
    AUTH_REQUIRED = "auth_required"
    DNS_ERROR = "dns_error"
    SINGLE_JOB = "single_job"  # URL is a single listing, not a board
    ATS_PROVIDER = "ats_provider"  # URL is an ATS provider's own site
    INVALID_URL = "invalid_url"
    NO_JOBS_ENDPOINT = "no_jobs_endpoint"  # Could not find a scrapable jobs endpoint
    DISCOVERY_FAILED = "discovery_failed"


@dataclass
class SourceAnalysisResult:
    """Result from source analysis agent."""

    classification: SourceClassification
    aggregator_domain: Optional[str] = None  # e.g., "greenhouse.io", "ziprecruiter.com"
    company_name: Optional[str] = None  # Extracted or inferred company name
    should_disable: bool = False
    disable_reason: Optional[DisableReason] = None
    disable_notes: str = ""  # Human-readable explanation
    source_config: Optional[Dict[str, Any]] = None  # Scraper config if discoverable
    confidence: float = 0.0  # 0-1 confidence in the analysis
    reasoning: str = ""  # Agent's reasoning for the classification
    suggested_actions: List[str] = field(default_factory=list)  # What to do next


# Known job aggregator domains - used as reference for the agent
KNOWN_AGGREGATORS = {
    # ATS platforms (company-specific boards hosted on these domains)
    "greenhouse.io": "Greenhouse ATS - hosts company job boards",
    "lever.co": "Lever ATS - hosts company job boards",
    "ashbyhq.com": "Ashby ATS - hosts company job boards",
    "smartrecruiters.com": "SmartRecruiters ATS - hosts company job boards",
    "workable.com": "Workable ATS - hosts company job boards",
    "myworkdayjobs.com": "Workday ATS - hosts company job boards",
    "breezy.hr": "Breezy HR ATS - hosts company job boards",
    "recruitee.com": "Recruitee ATS - hosts company job boards",
    "applytojob.com": "ApplyToJob ATS - hosts company job boards",
    "jobvite.com": "Jobvite ATS - hosts company job boards",
    # Pure aggregators (list jobs from many companies)
    "linkedin.com": "LinkedIn Jobs - aggregator, requires auth",
    "indeed.com": "Indeed - aggregator, bot-protected",
    "glassdoor.com": "Glassdoor - aggregator, bot-protected",
    "ziprecruiter.com": "ZipRecruiter - aggregator, bot-protected",
    "monster.com": "Monster - aggregator, bot-protected",
    "dice.com": "Dice - tech jobs aggregator",
    "remoteok.io": "RemoteOK - remote jobs aggregator",
    "weworkremotely.com": "WeWorkRemotely - remote jobs aggregator",
    "builtin.com": "BuiltIn - tech jobs aggregator by city",
    "wellfound.com": "Wellfound (AngelList) - startup jobs",
    "ycombinator.com": "YC Work at a Startup - YC company jobs",
    "remotive.com": "Remotive - remote jobs aggregator",
    "jobicy.com": "Jobicy - remote jobs aggregator",
    "himalayas.app": "Himalayas - remote jobs aggregator",
}

# System capabilities and limitations context for the agent
SYSTEM_CONTEXT = """
## Job Finder Source Discovery System

You are analyzing a URL to determine if it can be used as a job source in an automated
job discovery system. Your analysis will determine how the source is classified and stored.

### System Capabilities
- Can scrape JSON APIs (REST endpoints returning job listings)
- Can parse RSS/Atom feeds
- Can scrape static HTML pages with CSS selectors
- Supports pagination for APIs with offset/page parameters

### System Limitations (CRITICAL)
- **NO JavaScript rendering**: Cannot scrape JS-only pages (React/Vue SPAs without SSR)
- **NO authentication**: Cannot handle login-required or OAuth-protected sources
- **NO CAPTCHA solving**: Will fail on bot-protected sites
- Most major aggregators (Indeed, LinkedIn, Glassdoor, ZipRecruiter) are bot-protected

### Source Classification Rules

1. **JOB_AGGREGATOR**: A platform that hosts jobs from MULTIPLE companies
   - Examples: Indeed, LinkedIn, ZipRecruiter, RemoteOK, WeWorkRemotely
   - Also includes ATS platforms (Greenhouse, Lever) when accessed at the platform level
   - These sources MUST have an `aggregator_domain` set (e.g., "ziprecruiter.com")
   - Company-specific boards ON aggregators still set aggregator_domain

2. **COMPANY_SPECIFIC**: A source that ONLY lists jobs from ONE company
   - Examples: company.com/careers, jobs.company.com
   - These sources MUST have a `company_id` or extractable company name
   - If on an ATS (e.g., boards.greenhouse.io/acme), it's company-specific WITH aggregator_domain

3. **SINGLE_JOB_LISTING**: URL points to ONE job posting, not a job board
   - Examples: remoteok.io/remote-jobs/specific-job-123
   - Should be DISABLED - we need job board URLs, not individual listings

4. **ATS_PROVIDER_SITE**: URL is the ATS provider's own careers page
   - Examples: greenhouse.com/careers, lever.co/jobs
   - Should be DISABLED - this is the vendor's jobs, not a customer board

5. **INVALID**: Cannot be used as a source for any reason

### When to Disable Sources

Always disable with clear notes explaining WHY:
- Bot protection detected (403, Cloudflare, etc.)
- JavaScript-only rendering required
- Authentication required
- DNS resolution failure
- URL is a single job listing
- URL is an ATS provider's own site
- No discoverable API/RSS/HTML endpoint for jobs

### Known Aggregator Domains

These domains are known job platforms. If a URL contains one of these, it's likely
either an aggregator or a company board hosted on that aggregator:

{known_aggregators}

### Your Task

Analyze the provided URL and context to determine:
1. What type of source this is (classification)
2. If it's on a known aggregator, what domain
3. If company-specific, what company
4. Whether it should be disabled and why
5. If usable, suggest the best scraping approach
"""


def _build_analysis_prompt(
    url: str,
    company_name: Optional[str] = None,
    company_id: Optional[str] = None,
    fetch_result: Optional[Dict[str, Any]] = None,
    search_results: Optional[List[Dict[str, str]]] = None,
) -> str:
    """Build the prompt for source analysis.

    Args:
        url: The URL to analyze
        company_name: Optional company name from intake
        company_id: Optional company ID from intake
        fetch_result: Optional result from attempting to fetch the URL
        search_results: Optional search results about the URL/domain

    Returns:
        Formatted prompt string
    """
    # Format known aggregators for context
    aggregators_text = "\n".join(
        f"- {domain}: {desc}" for domain, desc in sorted(KNOWN_AGGREGATORS.items())
    )

    context = SYSTEM_CONTEXT.format(known_aggregators=aggregators_text)

    # Build the specific analysis request
    prompt_parts = [
        context,
        "\n---\n",
        "## URL to Analyze\n",
        f"URL: {url}\n",
    ]

    # Add intake context if provided
    if company_name or company_id:
        prompt_parts.append("\n### Intake Context\n")
        if company_name:
            prompt_parts.append(f"Company Name (provided): {company_name}\n")
        if company_id:
            prompt_parts.append(f"Company ID (provided): {company_id}\n")

    # Add fetch results if available
    if fetch_result:
        prompt_parts.append("\n### Fetch Attempt Result\n")
        if fetch_result.get("success"):
            prompt_parts.append(f"Status: Success\n")
            prompt_parts.append(f"Content-Type: {fetch_result.get('content_type', 'unknown')}\n")
            if fetch_result.get("sample"):
                sample = fetch_result["sample"][:2000]
                prompt_parts.append(f"Sample Content (truncated):\n```\n{sample}\n```\n")
        else:
            prompt_parts.append(f"Status: Failed\n")
            prompt_parts.append(f"Error: {fetch_result.get('error', 'unknown')}\n")
            if fetch_result.get("status_code"):
                prompt_parts.append(f"HTTP Status: {fetch_result.get('status_code')}\n")

    # Add search results if available
    if search_results:
        prompt_parts.append("\n### Search Results About This Domain\n")
        for result in search_results[:5]:  # Limit to 5 results
            prompt_parts.append(f"- {result.get('title', 'No title')}\n")
            prompt_parts.append(f"  URL: {result.get('url', '')}\n")
            if result.get("snippet"):
                prompt_parts.append(f"  Snippet: {result.get('snippet')}\n")

    # Add the response format instructions
    prompt_parts.append(
        """
### Response Format

Respond with a JSON object containing your analysis:

```json
{
  "classification": "company_specific|job_aggregator|single_job_listing|ats_provider_site|invalid",
  "aggregator_domain": "domain.com or null",
  "company_name": "Company Name or null",
  "should_disable": true/false,
  "disable_reason": "bot_protection|js_only|auth_required|dns_error|single_job|ats_provider|invalid_url|no_jobs_endpoint|discovery_failed or null",
  "disable_notes": "Human-readable explanation of why this source cannot be used",
  "confidence": 0.0-1.0,
  "reasoning": "Your detailed reasoning for this classification",
  "suggested_actions": ["List of suggested next steps"],
  "source_config": {
    "type": "api|rss|html",
    "url": "the jobs endpoint URL",
    "response_path": "path.to.jobs.array (for APIs)",
    "job_selector": "CSS selector (for HTML)",
    "fields": {
      "title": "path or selector",
      "url": "path or selector"
    }
  }
}
```

If the source should be disabled, set `source_config` to null.
If you can determine a working config, include it in `source_config`.

IMPORTANT: Your response must be valid JSON only. No additional text.
"""
    )

    return "".join(prompt_parts)


def _parse_analysis_response(response: str) -> Optional[SourceAnalysisResult]:
    """Parse the agent's response into a SourceAnalysisResult.

    Args:
        response: The agent's text response

    Returns:
        SourceAnalysisResult or None if parsing fails
    """
    try:
        json_str = extract_json_from_response(response)
        data = json.loads(json_str)

        # Parse classification
        classification_str = data.get("classification", "invalid")
        try:
            classification = SourceClassification(classification_str)
        except ValueError:
            logger.warning(f"Unknown classification: {classification_str}, defaulting to invalid")
            classification = SourceClassification.INVALID

        # Parse disable reason if present
        disable_reason = None
        if data.get("disable_reason"):
            try:
                disable_reason = DisableReason(data["disable_reason"])
            except ValueError:
                logger.warning(f"Unknown disable reason: {data['disable_reason']}")
                disable_reason = DisableReason.DISCOVERY_FAILED

        return SourceAnalysisResult(
            classification=classification,
            aggregator_domain=data.get("aggregator_domain"),
            company_name=data.get("company_name"),
            should_disable=data.get("should_disable", False),
            disable_reason=disable_reason,
            disable_notes=data.get("disable_notes", ""),
            source_config=data.get("source_config"),
            confidence=float(data.get("confidence", 0.0)),
            reasoning=data.get("reasoning", ""),
            suggested_actions=data.get("suggested_actions", []),
        )

    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.error(f"Failed to parse analysis response: {e}")
        logger.debug(f"Response was: {response[:500]}")
        return None


class SourceAnalysisAgent:
    """AI agent for intelligent source analysis and classification.

    This agent replaces fragile pattern matching with intelligent reasoning
    about what a source is, whether it can be scraped, and why.
    """

    def __init__(self, agent_manager: "AgentManager"):
        """Initialize the source analysis agent.

        Args:
            agent_manager: AgentManager for executing AI tasks
        """
        self.agent_manager = agent_manager

    def analyze(
        self,
        url: str,
        company_name: Optional[str] = None,
        company_id: Optional[str] = None,
        fetch_result: Optional[Dict[str, Any]] = None,
        search_results: Optional[List[Dict[str, str]]] = None,
    ) -> SourceAnalysisResult:
        """Analyze a URL to determine source classification and usability.

        Args:
            url: The URL to analyze
            company_name: Optional company name from intake
            company_id: Optional company ID from intake
            fetch_result: Optional result from attempting to fetch the URL
            search_results: Optional search results about the URL/domain

        Returns:
            SourceAnalysisResult with classification and recommendations
        """
        prompt = _build_analysis_prompt(
            url=url,
            company_name=company_name,
            company_id=company_id,
            fetch_result=fetch_result,
            search_results=search_results,
        )

        try:
            result = self.agent_manager.execute(
                task_type="extraction",  # Reuse extraction fallback chain
                prompt=prompt,
                max_tokens=2000,
                temperature=0.1,  # Low temperature for consistent classification
            )

            analysis = _parse_analysis_response(result.text)
            if analysis:
                logger.info(
                    f"Source analysis complete: {url} -> {analysis.classification.value} "
                    f"(confidence={analysis.confidence:.2f})"
                )
                return analysis

            # Fallback if parsing fails - create safe disabled result
            logger.warning(f"Failed to parse analysis for {url}, creating fallback result")
            return self._create_fallback_result(url, "AI response parsing failed")

        except Exception as e:
            logger.error(f"Source analysis failed for {url}: {e}")
            return self._create_fallback_result(url, str(e))

    def _create_fallback_result(self, url: str, error: str) -> SourceAnalysisResult:
        """Create a safe fallback result when analysis fails.

        The fallback attempts to extract basic info from the URL to make
        the best classification possible without AI assistance.

        Args:
            url: The URL that was being analyzed
            error: The error message

        Returns:
            SourceAnalysisResult with conservative classification
        """
        try:
            parsed = urlparse(url.lower())
            host = parsed.netloc

            # Check against known aggregators
            for domain in KNOWN_AGGREGATORS:
                if host == domain or host.endswith("." + domain):
                    return SourceAnalysisResult(
                        classification=SourceClassification.JOB_AGGREGATOR,
                        aggregator_domain=domain,
                        should_disable=True,
                        disable_reason=DisableReason.DISCOVERY_FAILED,
                        disable_notes=f"Analysis failed ({error}), but domain is known aggregator: {domain}",
                        confidence=0.5,
                        reasoning=f"Fallback: matched known aggregator domain {domain}",
                    )

            # Default to disabled with discovery_failed
            return SourceAnalysisResult(
                classification=SourceClassification.INVALID,
                should_disable=True,
                disable_reason=DisableReason.DISCOVERY_FAILED,
                disable_notes=f"Source analysis failed: {error}",
                confidence=0.0,
                reasoning="Fallback: could not analyze source",
            )

        except Exception:
            return SourceAnalysisResult(
                classification=SourceClassification.INVALID,
                should_disable=True,
                disable_reason=DisableReason.INVALID_URL,
                disable_notes=f"Invalid URL or analysis error: {error}",
                confidence=0.0,
                reasoning="Fallback: URL parsing failed",
            )


def analyze_source(
    url: str,
    agent_manager: "AgentManager",
    company_name: Optional[str] = None,
    company_id: Optional[str] = None,
    fetch_result: Optional[Dict[str, Any]] = None,
    search_results: Optional[List[Dict[str, str]]] = None,
) -> SourceAnalysisResult:
    """Convenience function to analyze a source.

    Args:
        url: The URL to analyze
        agent_manager: AgentManager for AI tasks
        company_name: Optional company name
        company_id: Optional company ID
        fetch_result: Optional fetch result
        search_results: Optional search results

    Returns:
        SourceAnalysisResult with classification
    """
    agent = SourceAnalysisAgent(agent_manager)
    return agent.analyze(
        url=url,
        company_name=company_name,
        company_id=company_id,
        fetch_result=fetch_result,
        search_results=search_results,
    )
