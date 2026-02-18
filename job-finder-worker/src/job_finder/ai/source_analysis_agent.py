"""AI-powered source analysis agent for intelligent source classification.

This module replaces fragile pattern matching with an AI agent that understands
the entire source ecosystem and makes intelligent decisions about:
- Whether a URL is a job aggregator or company-specific source
- Whether a source can be scraped (including JS-rendered pages) or is bot-protected
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
from string import Template
from typing import Any, Dict, List, Optional, TYPE_CHECKING
from urllib.parse import urlparse

from job_finder.ai.response_parser import extract_json_from_response
from job_finder.scrapers.config_expander import normalize_source_type

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
- **Full JavaScript rendering** via headless Chromium (Playwright). Set `requires_js: true` in
  source_config and provide a `render_wait_for` CSS selector (job list container or first job card).
  This handles SPAs (React, Angular, Vue), enterprise ATS portals (SuccessFactors, Oracle Cloud HCM,
  Taleo, Bullhorn), and any page that loads jobs dynamically via XHR/fetch.
- Supports pagination for APIs with offset/page parameters
- **ATS API probing**: The system automatically probes known ATS providers before calling you.
  If ATS probe results are provided below, USE THEM - they are verified API responses.

**CRITICAL — JavaScript rendering is FULLY SUPPORTED.** NEVER claim the system cannot render
JavaScript. NEVER disable a source because it requires JavaScript. Instead, propose a config with
`requires_js: true`, `render_wait_for`, and appropriate CSS selectors. If the page is publicly
accessible, it can be scraped.
- Known ATS patterns (preferred when detected):
  - Greenhouse: GET https://boards-api.greenhouse.io/v1/boards/{{slug}}/jobs?content=true, response_path=jobs, fields.title=title, url=absolute_url, location=location.name, description=content, posted_date=updated_at
  - Lever: GET https://api.lever.co/v0/postings/{{slug}}?mode=json, fields.title=text, url=hostedUrl, location=categories.location, description=descriptionPlain, posted_date=createdAt
  - Ashby: GET https://api.ashbyhq.com/posting-api/job-board/{{slug}}, response_path=jobs, fields.title=title, url=jobUrl, description=descriptionHtml, location=location
  - Workday: See detailed Workday section below
  - RSS: if the URL is clearly an RSS feed, use type=rss and map title/link/description/pubDate

### WORKDAY ATS - SPECIAL HANDLING

Workday is complex because companies use highly variable board names:

**URL Pattern**: POST https://{{tenant}}.wd{{N}}.myworkdayjobs.com/wday/cxs/{{tenant}}/{{board}}/jobs
- Only wd1, wd3, wd5 subdomains exist (wd2, wd4, wd6 do NOT work)
- Board names are NOT standardized - they vary per company

**Common Board Name Patterns**:
- Generic: jobs, careers, External, Careers, ExternalCareers, Search
- Company name: ASCO, BMS, Genesys (slug or uppercase slug as board)
- Company name + suffix: insuletcareers, Vernova_ExternalSite
- Locale variants: en-US/Search

**Request Body**: {"limit": 50, "offset": 0}

**Response**: response_path=jobPostings
- fields: title=title, url=externalPath, location=locationsText, posted_date=postedOn
- IMPORTANT: externalPath is relative (e.g., "/job/Software-Engineer/123"). The scraper needs
  base_url set to construct full URLs: https://{{tenant}}.wd{{N}}.myworkdayjobs.com/{{board}}

**Example Config**:
```json
{
  "type": "api",
  "url": "https://gevernova.wd5.myworkdayjobs.com/wday/cxs/gevernova/Vernova_ExternalSite/jobs",
  "method": "POST",
  "post_body": {"limit": 50, "offset": 0},
  "response_path": "jobPostings",
  "base_url": "https://gevernova.wd5.myworkdayjobs.com/Vernova_ExternalSite",
  "headers": {"Content-Type": "application/json"},
  "fields": {"title": "title", "url": "externalPath", "location": "locationsText", "posted_date": "postedOn"}
}
```

When you see a myworkdayjobs.com URL, extract the tenant and board from the URL path.
If ATS probing found a working Workday endpoint, USE THAT EXACT URL in your config.

### CRITICAL: Slug Collision Detection

**The same ATS slug can match DIFFERENT companies on different providers!**

Example: The slug "profound" matches:
- Greenhouse: ProFound Therapeutics (biotech company in Boston, ~5 jobs)
- Ashby: A different tech company (64 jobs, NYC/SF locations)

When multiple ATS providers are found with the same slug:
1. **Verify company identity** by checking job titles, locations, and descriptions
2. **Check domain match** - does the job URL domain match the expected company domain?
3. **Do NOT assume** the provider with the most jobs is correct
4. Consider company characteristics: industry, location, typical role types

If ATS probe results show a potential slug collision (multiple providers found), you MUST
verify which provider actually belongs to the company in question.

### System Limitations (CRITICAL)
- **No authentication**: Cannot handle login-required or OAuth-protected sources
- **No CAPTCHA solving**: Will fail on bot-protected sites
- Most major aggregators (Indeed, LinkedIn, Glassdoor, ZipRecruiter) are bot-protected
- NOTE: JavaScript rendering is NOT a limitation — it is fully supported via Playwright

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
- Bot protection detected (Cloudflare, CAPTCHA, WAF - see HTTP Error Guide below)
- Authentication required (login wall, OAuth redirect)
- DNS resolution failure
- URL is a single job listing
- URL is an ATS provider's own site
- No discoverable API/RSS/HTML/JS-rendered endpoint for jobs

**NEVER disable because:**
- The page requires JavaScript — use `requires_js: true` instead
- The page is a Single Page Application (React/Angular/Vue) — Playwright handles these
- You see an empty HTML body or minimal server-rendered markup — this means JS rendering is needed
- Zero jobs were found — having 0 current openings is a valid state, not an error

### HTTP Error Classification Guide (CRITICAL)

When analyzing fetch results, classify errors correctly. DO NOT mislabel errors!

**HTTP 400 (Bad Request)** → Config error, NOT bot protection
- Cause: Wrong API parameters, invalid URL format, missing required fields, wrong site_id
- Example: Workday returns 400 when the board name in the URL is wrong
- Recovery: Find the correct URL or config parameters
- Tag: None (recoverable)

**HTTP 401 (Unauthorized)** → Authentication required
- Cause: API requires auth token, session expired
- Recovery: Not possible without credentials
- Tag: auth_required

**HTTP 403 (Forbidden)** → ANALYZE CONTENT before tagging
- If content contains Cloudflare/CAPTCHA markers → bot_protection
- If content shows login form → auth_required
- If just "Access Denied" with no markers → could be rate limit (transient, retry later)
- Tag: Depends on content analysis

**HTTP 404 (Not Found)** → Endpoint moved, NOT bot protection
- Cause: Company changed their careers page URL, removed board, renamed slug
- Example: Lever board returns 404 if company removed their job board
- Recovery: Search for new URL, try ATS probing with different slugs
- Tag: None (recoverable)
- CRITICAL: Never tag a 404 as "anti_bot" - it means "resource not found"

**HTTP 502/503 (Server Error)** → Transient, retry later
- Cause: Server overloaded, maintenance, deployment in progress
- Recovery: Retry automatically
- Tag: None

**Timeout Errors** → Transient or JS rendering issue
- Cause: Network issues, server slow, or page requires longer render time
- Recovery: Retry with longer timeout or requires_js configuration
- Tag: None

### Non-Recoverable Issues (disabled_tags)

When you detect issues that cannot be fixed through automated recovery, use these
disable_reason values which will mark the source as non-recoverable:

- **bot_protection** -> "anti_bot" tag: Cloudflare, CAPTCHA, WAF blocking detected
- **auth_required** -> "auth_required" tag: Login page, OAuth redirect, session cookie required

Sources with these tags will be marked as permanently non-recoverable, and users
will be informed that automated recovery cannot help. Only set these reasons when
you are confident the issue is systemic and unfixable without manual intervention.

### Known Aggregator Domains

These domains are known job platforms. If a URL contains one of these, it's likely
either an aggregator or a company board hosted on that aggregator:

$known_aggregators

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
    ats_probe_results: Optional[Dict[str, Any]] = None,
) -> str:
    """Build the prompt for source analysis.

    Args:
        url: The URL to analyze
        company_name: Optional company name from intake
        company_id: Optional company ID from intake
        fetch_result: Optional result from attempting to fetch the URL
        search_results: Optional search results about the URL/domain
        ats_probe_results: Optional ATS probe results from probe_all_ats_providers_detailed

    Returns:
        Formatted prompt string
    """
    # Format known aggregators for context
    aggregators_text = "\n".join(
        f"- {domain}: {desc}" for domain, desc in sorted(KNOWN_AGGREGATORS.items())
    )

    # Use string.Template (with $variable syntax) instead of str.format() to avoid
    # conflicts with JSON curly braces in the template. This prevents KeyError if
    # someone adds JSON examples like {"limit": 50} to SYSTEM_CONTEXT.
    context = Template(SYSTEM_CONTEXT).substitute(known_aggregators=aggregators_text)

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

    # Add ATS probe results if provided - CRITICAL for agent decision making
    if ats_probe_results:
        prompt_parts.append("\n### ATS Probe Results (VERIFIED API RESPONSES)\n")
        prompt_parts.append(
            "The system has already probed known ATS providers. These are real API responses:\n\n"
        )

        if ats_probe_results.get("has_slug_collision"):
            prompt_parts.append(
                "⚠️ **POTENTIAL SLUG COLLISION DETECTED** - Multiple providers found!\n"
                "You MUST verify which provider belongs to this company.\n\n"
            )

        all_results = ats_probe_results.get("all_results", [])
        if all_results:
            prompt_parts.append(f"Slugs tried: {ats_probe_results.get('slugs_tried', [])}\n")
            prompt_parts.append(
                f"Expected domain: {ats_probe_results.get('expected_domain', 'Unknown')}\n\n"
            )

            for result in all_results:
                domain_match = "✓ DOMAIN MATCH" if result.get("domain_matched") else ""
                prompt_parts.append(
                    f"- **{result.get('provider', 'unknown')}**: {result.get('job_count', 0)} jobs {domain_match}\n"
                )
                prompt_parts.append(f"  API URL: {result.get('api_url', 'N/A')}\n")
                if result.get("sample_job_domain"):
                    prompt_parts.append(f"  Job URL domain: {result.get('sample_job_domain')}\n")
                if result.get("sample_job"):
                    sample = result["sample_job"]
                    prompt_parts.append(f"  Sample job title: {sample.get('title', 'N/A')}\n")
                    if sample.get("location"):
                        prompt_parts.append(f"  Sample location: {sample.get('location')}\n")
                prompt_parts.append("\n")

            if ats_probe_results.get("best_result"):
                best = ats_probe_results["best_result"]
                prompt_parts.append(
                    f"**Recommended**: {best.get('provider')} (domain-matched or highest job count)\n"
                )
        else:
            prompt_parts.append("No ATS providers found for the derived slugs.\n")

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
    prompt_parts.append("""
### Response Format

Respond with a JSON object containing your analysis:

```json
{
  "classification": "company_specific|job_aggregator|single_job_listing|ats_provider_site|invalid",
  "aggregator_domain": "domain.com or null",
  "company_name": "Company Name or null",
  "should_disable": true/false,
  "disable_reason": "bot_protection|auth_required|dns_error|single_job|ats_provider|invalid_url|no_jobs_endpoint|discovery_failed or null",
  "disable_notes": "Human-readable explanation of why this source cannot be used",
  "confidence": 0.0-1.0,
  "reasoning": "Your detailed reasoning for this classification",
  "suggested_actions": ["List of suggested next steps"],
  "source_config": {
  "type": "api|rss|html",
  "url": "the jobs endpoint URL",
  "response_path": "path.to.jobs.array (for APIs)",
  "job_selector": "CSS selector (for HTML)",
  "requires_js": true|false,
  // "render_wait_for" is required only when "requires_js" is true
  "render_wait_for": "CSS selector for the job list container or first job card to wait for when requires_js is true",
  "fields": {
    "title": "path or selector",
    "url": "path or selector"
  }
}
}
```

If the source should be disabled, set `source_config` to null.
If you can determine a working config, include it in `source_config`.

CONFIG QUALITY CHECKLIST (follow this when proposing source_config):
- Prefer stable ATS APIs when present (Greenhouse/Lever/Ashby/Workday/SmartRecruiters).
- If content is JS-rendered but publicly accessible, set `requires_js: true`, provide `job_selector`, and `render_wait_for` (job list container or first job card). For `fields`, keep using CSS selectors as in normal HTML scraping.
- Make sure `type` is api|rss|html; include response_path for APIs (e.g., jobs or jobPostings).
- Include pagination hints only when supported (Workday/Greenhouse offset+limit).
- Do NOT output auth-gated or CAPTCHA-protected endpoints (LinkedIn/Indeed/Glassdoor/ZipRecruiter) or single-job URLs.
- For Workday: use the /wday/cxs/{{tenant}}/{{board}}/jobs POST endpoint with {"limit":50,"offset":0}; response_path=jobPostings; fields: title, url=externalPath, location=locationsText, posted_date=postedOn. CRITICAL: include base_url (https://{{tenant}}.wd{{N}}.myworkdayjobs.com/{{board}}) for relative externalPath URLs.
- For Greenhouse: https://boards-api.greenhouse.io/v1/boards/{{slug}}/jobs?content=true, response_path=jobs.
- For Lever: https://api.lever.co/v0/postings/{{slug}}?mode=json.
- For Ashby: https://api.ashbyhq.com/posting-api/job-board/{{slug}}, response_path=jobs.

IMPORTANT: Your response must be valid JSON only. No additional text.
""")

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

        # Normalize source_config type before it enters the system
        source_config = data.get("source_config")
        if isinstance(source_config, dict) and "type" in source_config:
            source_config["type"] = normalize_source_type(source_config["type"])

        return SourceAnalysisResult(
            classification=classification,
            aggregator_domain=data.get("aggregator_domain"),
            company_name=data.get("company_name"),
            should_disable=data.get("should_disable", False),
            disable_reason=disable_reason,
            disable_notes=data.get("disable_notes", ""),
            source_config=source_config,
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
        ats_probe_results: Optional[Dict[str, Any]] = None,
    ) -> SourceAnalysisResult:
        """Analyze a URL to determine source classification and usability.

        Args:
            url: The URL to analyze
            company_name: Optional company name from intake
            company_id: Optional company ID from intake
            fetch_result: Optional result from attempting to fetch the URL
            search_results: Optional search results about the URL/domain
            ats_probe_results: Optional ATS probe results for agent verification

        Returns:
            SourceAnalysisResult with classification and recommendations
        """
        prompt = _build_analysis_prompt(
            url=url,
            company_name=company_name,
            company_id=company_id,
            fetch_result=fetch_result,
            search_results=search_results,
            ats_probe_results=ats_probe_results,
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

        except Exception as fallback_exc:
            return SourceAnalysisResult(
                classification=SourceClassification.INVALID,
                should_disable=True,
                disable_reason=DisableReason.INVALID_URL,
                disable_notes=f"Fallback URL parsing failed: {fallback_exc}. Original error: {error}",
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
    ats_probe_results: Optional[Dict[str, Any]] = None,
) -> SourceAnalysisResult:
    """Convenience function to analyze a source.

    Args:
        url: The URL to analyze
        agent_manager: AgentManager for AI tasks
        company_name: Optional company name
        company_id: Optional company ID
        fetch_result: Optional fetch result
        search_results: Optional search results
        ats_probe_results: Optional ATS probe results for agent verification

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
        ats_probe_results=ats_probe_results,
    )
