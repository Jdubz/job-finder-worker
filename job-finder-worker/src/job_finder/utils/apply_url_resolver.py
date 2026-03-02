"""Multi-strategy resolver for job application URLs.

Aggregator sites (WeWorkRemotely, Remotive, RemoteOK, Jobicy) often set
apply_url to the company homepage instead of the actual application page.
This module resolves the real apply URL using a cheapest-first strategy chain:

1. ATS derivation — free, handles Greenhouse/Lever/Ashby/Workable
2. Description URL extraction — free, regex patterns from job text
3. Web search + heuristic scoring — 1 API call via search client
4. Company homepage fallback — existing behavior, last resort
"""

import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from job_finder.utils.url_utils import (
    AGGREGATOR_HOST_SUBSTRINGS,
    derive_apply_url,
)

logger = logging.getLogger(__name__)

# ATS domains that strongly indicate a real application page
ATS_DOMAINS = (
    "greenhouse.io",
    "lever.co",
    "ashbyhq.com",
    "workable.com",
    "myworkdayjobs.com",
    "smartrecruiters.com",
    "recruitee.com",
    "breezy.hr",
    "bamboohr.com",
    "icims.com",
    "jobvite.com",
    "applytojob.com",
    "dover.com",
    "rippling.com",
)

# Domains to exclude from search results (aggregators / generic boards)
EXCLUDED_DOMAINS = (
    "linkedin.com",
    "indeed.com",
    "glassdoor.com",
    "ziprecruiter.com",
    "monster.com",
    "dice.com",
    "careerbuilder.com",
    *AGGREGATOR_HOST_SUBSTRINGS,
)

# Path tokens that suggest a job/careers page
_CAREER_PATH_TOKENS = ("/jobs/", "/careers/", "/openings/", "/position/", "/vacancies/")

# Regex patterns for extracting apply URLs from description text
_DESCRIPTION_URL_PATTERNS = [
    # "URL: https://..." (WWR standard)
    re.compile(r"(?:^|\n)\s*URL:\s*(https?://\S+)", re.IGNORECASE),
    # "To apply: https://..."
    re.compile(r"(?:^|\n)\s*To\s+apply[:\s]+\s*(https?://\S+)", re.IGNORECASE),
    # "Apply at/here/now/via: https://..."
    re.compile(r"(?:^|\n)\s*Apply\s+(?:at|here|now|via)[:\s]+\s*(https?://\S+)", re.IGNORECASE),
    # "Application URL/link: https://..."
    re.compile(r"(?:^|\n)\s*Application\s+(?:URL|link)[:\s]+\s*(https?://\S+)", re.IGNORECASE),
]


@dataclass
class ApplyUrlResult:
    """Result of apply URL resolution."""

    url: Optional[str]
    method: str  # "ats_derived" | "description_extracted" | "search_resolved" | "company_fallback" | "none"
    confidence: str  # "high" | "medium" | "low"


def _is_valid_apply_url(url: str) -> bool:
    """Validate a candidate apply_url has an HTTP(S) scheme and isn't an aggregator."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        url_host = (parsed.hostname or "").lower()
        if any(agg in url_host for agg in AGGREGATOR_HOST_SUBSTRINGS):
            return False
        return bool(url_host)
    except Exception:
        return False


def _strip_trailing_punctuation(url: str) -> str:
    """Strip trailing punctuation commonly appended to URLs in plain text."""
    return url.rstrip(".,;)>]}")


def _extract_apply_url_from_description(description: Optional[str]) -> Optional[str]:
    """Extract an apply URL from job description text using known patterns."""
    if not description:
        return None

    for pattern in _DESCRIPTION_URL_PATTERNS:
        match = pattern.search(description)
        if match:
            candidate = _strip_trailing_punctuation(match.group(1))
            if _is_valid_apply_url(candidate):
                return candidate

    return None


def _company_name_slug(name: str) -> str:
    """Convert a company name to a URL-friendly slug for matching."""
    return re.sub(r"[^a-z0-9]+", "", name.lower())


def _score_search_result(url: str, title: str, snippet: str, company_slug: str) -> int:
    """Score a search result URL for likelihood of being a real apply page.

    Returns an integer score; higher is better. Negative means excluded.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return -1

    host = (parsed.hostname or "").lower()
    path = (parsed.path or "").lower()

    # Exclude aggregator / generic job board domains
    if any(excl in host for excl in EXCLUDED_DOMAINS):
        return -1

    score = 0

    # ATS domain bonus
    if any(ats in host for ats in ATS_DOMAINS):
        score += 2

    # Career/job path tokens
    if any(token in path for token in _CAREER_PATH_TOKENS):
        score += 1

    # Explicit /apply in path
    if "/apply" in path:
        score += 1

    # Company name slug appears in URL
    if company_slug and company_slug in url.lower():
        score += 1

    # "apply" in result title or snippet
    combined_text = f"{title} {snippet}".lower()
    if "apply" in combined_text:
        score += 1

    return score


def _search_for_apply_url(
    search_client: Any,
    company_name: str,
    job_title: str,
) -> Optional[ApplyUrlResult]:
    """Use web search to find the actual apply URL for a job.

    Args:
        search_client: SearchClient instance with .search() method.
        company_name: Company name for the query.
        job_title: Job title for the query.

    Returns:
        ApplyUrlResult if a suitable URL is found, None otherwise.
    """
    if not company_name or not job_title:
        return None

    query = f'"{company_name}" "{job_title}" apply'
    try:
        results = search_client.search(query, max_results=8)
    except Exception as e:
        logger.debug("Search failed for apply URL resolution: %s", e)
        return None

    if not results:
        return None

    company_slug = _company_name_slug(company_name)

    scored: List[tuple] = []
    for result in results:
        url = result.url
        title = result.title
        snippet = result.snippet

        if not url or not _is_valid_apply_url(url):
            continue

        score = _score_search_result(url, title, snippet, company_slug)
        if score >= 0:
            scored.append((score, url))

    if not scored:
        return None

    scored.sort(key=lambda x: x[0], reverse=True)
    best_score, best_url = scored[0]

    if best_score >= 3:
        confidence = "high"
    elif best_score >= 1:
        confidence = "medium"
    else:
        confidence = "low"

    return ApplyUrlResult(url=best_url, method="search_resolved", confidence=confidence)


def _fallback_company_website(
    job: Dict[str, Any],
    companies_manager: Any = None,
) -> ApplyUrlResult:
    """Fall back to the company homepage as the apply URL (last resort)."""
    # Try job-level company_website first
    candidate = job.get("company_website", "")
    if candidate and _is_valid_apply_url(candidate):
        return ApplyUrlResult(url=candidate, method="company_fallback", confidence="low")

    # Try companies table
    if companies_manager:
        company_name = (job.get("company") or "").strip()
        if company_name:
            try:
                company = companies_manager.get_company(company_name)
                if company and company.get("website"):
                    candidate = company["website"]
                    if _is_valid_apply_url(candidate):
                        logger.debug(
                            "Resolved apply_url from companies table for %s: %s",
                            company_name,
                            candidate,
                        )
                        return ApplyUrlResult(
                            url=candidate, method="company_fallback", confidence="low"
                        )
            except Exception as e:
                logger.debug("Companies table lookup failed for %s: %s", company_name, e)

    return ApplyUrlResult(url=None, method="none", confidence="low")


def resolve_apply_url(
    job_url: str,
    job: Dict[str, Any],
    search_client: Any = None,
    companies_manager: Any = None,
    is_aggregator: bool = False,
) -> ApplyUrlResult:
    """Resolve the best apply URL for a job listing.

    Uses a cheapest-first strategy chain:
    1. ATS derivation (free) — Greenhouse, Lever, Ashby, Workable
    2. Description URL extraction (free) — regex patterns in job text
    3. Web search + heuristic scoring (1 API call) — only for aggregator jobs
    4. Company homepage fallback (free) — last resort

    Args:
        job_url: The normalized job listing URL.
        job: Job dict with keys: company, title, description, company_website.
        search_client: Optional SearchClient for web search resolution.
        companies_manager: Optional CompaniesManager for DB lookups.
        is_aggregator: If True, enables description extraction and search strategies.

    Returns:
        ApplyUrlResult with the resolved URL, method used, and confidence level.
    """
    # Strategy 1: ATS derivation (always attempted, free)
    ats_url = derive_apply_url(job_url)
    if ats_url:
        return ApplyUrlResult(url=ats_url, method="ats_derived", confidence="high")

    # Strategy 2: Description URL extraction (aggregator only, free)
    if is_aggregator:
        description = job.get("description", "")
        desc_url = _extract_apply_url_from_description(description)
        if desc_url:
            return ApplyUrlResult(url=desc_url, method="description_extracted", confidence="high")

    # Strategy 3: Web search + heuristic scoring (aggregator only, 1 API call)
    if is_aggregator and search_client:
        company_name = (job.get("company") or "").strip()
        job_title = (job.get("title") or "").strip()
        search_result = _search_for_apply_url(search_client, company_name, job_title)
        if search_result:
            return search_result

    # Strategy 4: Company homepage fallback (aggregator only)
    if is_aggregator:
        return _fallback_company_website(job, companies_manager)

    # Non-aggregator with no ATS match: no apply_url
    return ApplyUrlResult(url=None, method="none", confidence="low")
