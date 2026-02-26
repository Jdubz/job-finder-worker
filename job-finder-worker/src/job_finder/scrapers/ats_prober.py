"""Systematic ATS (Applicant Tracking System) prober.

This module probes known ATS API endpoints to determine which ATS provider
a company uses, eliminating the need for agents to guess.

Supported ATS Providers:
- Greenhouse (boards-api.greenhouse.io)
- Lever (api.lever.co)
- Ashby (api.ashbyhq.com)
- SmartRecruiters (api.smartrecruiters.com)
- Recruitee (SLUG.recruitee.com)
- Breezy (SLUG.breezy.hr)
- Workable (apply.workable.com)
- Workday (SLUG.wd*.myworkdayjobs.com) - requires special handling
"""

import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

from job_finder.scrapers.platform_patterns import PLATFORM_PATTERNS

logger = logging.getLogger(__name__)

# Timeout for ATS probes (should be fast since these are direct API calls)
ATS_PROBE_TIMEOUT_SECONDS = 8


@dataclass
class ATSProbeResult:
    """Result from probing an ATS provider."""

    found: bool
    ats_provider: Optional[str] = None
    aggregator_domain: Optional[str] = None  # e.g., "greenhouse.io", "lever.co"
    api_url: Optional[str] = None
    job_count: int = 0
    sample_job: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None  # Ready-to-use scraper config
    sample_job_domain: Optional[str] = None  # Domain extracted from sample job URL


# Build field mappings from platform_patterns (single source of truth).
# The prober uses api_url (minimal, fast) for probing, and config_url (full params)
# for the stored config. Fields always come from platform_patterns.
_PLATFORM_PATTERNS_BY_NAME = {p.name: p for p in PLATFORM_PATTERNS}

_GH_PATTERN = _PLATFORM_PATTERNS_BY_NAME["greenhouse_api"]
_ASHBY_PATTERN = _PLATFORM_PATTERNS_BY_NAME["ashby_api"]
_LEVER_PATTERN = _PLATFORM_PATTERNS_BY_NAME["lever"]
_WORKABLE_PATTERN = _PLATFORM_PATTERNS_BY_NAME["workable_api"]

# Common ATS providers and their API patterns.
# Fields are sourced from platform_patterns.py to stay in sync.
ATS_PROVIDERS = {
    "greenhouse": {
        "api_url": "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
        "config_url": "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true",
        "response_path": "jobs",
        "aggregator_domain": "greenhouse.io",
        "fields": _GH_PATTERN.fields,
    },
    "lever": {
        "api_url": "https://api.lever.co/v0/postings/{slug}?mode=json",
        "response_path": "",  # Root is array
        "aggregator_domain": "lever.co",
        "fields": _LEVER_PATTERN.fields,
    },
    "ashby": {
        "api_url": "https://api.ashbyhq.com/posting-api/job-board/{slug}",
        "config_url": "https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true",
        "response_path": "jobs",
        "aggregator_domain": "ashbyhq.com",
        "fields": _ASHBY_PATTERN.fields,
        "salary_min_field": _ASHBY_PATTERN.salary_min_field,
        "salary_max_field": _ASHBY_PATTERN.salary_max_field,
    },
    "smartrecruiters": {
        "api_url": "https://api.smartrecruiters.com/v1/companies/{slug}/postings",
        "response_path": "content",
        "aggregator_domain": "smartrecruiters.com",
        "fields": {
            "title": "name",
            "url": "ref",
            "location": "location.city",
            "description": "jobAd.sections.companyDescription.text",
            "posted_date": "releasedDate",
        },
    },
    "recruitee": {
        "api_url": "https://{slug}.recruitee.com/api/offers",
        "response_path": "offers",
        "aggregator_domain": "recruitee.com",
        "fields": {
            "title": "title",
            "url": "careers_url",
            "location": "location",
            "description": "description",
            "posted_date": "published_at",
        },
    },
    "breezy": {
        "api_url": "https://{slug}.breezy.hr/json",
        "response_path": "",  # Root is array
        "aggregator_domain": "breezy.hr",
        "fields": {
            "title": "name",
            "url": "url",
            "location": "location.name",
            "description": "description",
            "posted_date": "published_date",
        },
    },
    "workable": {
        "api_url": "https://apply.workable.com/api/v1/widget/accounts/{slug}",
        "response_path": "jobs",
        "aggregator_domain": "workable.com",
        "fields": _WORKABLE_PATTERN.fields,
    },
}

# Workday requires special handling (POST request, variable wd* subdomain)
# Workday uses wd1, wd3, wd5 subdomains for different data centers/regions.
# wd2, wd4, wd6 were tested and do not exist (connection refused).
# The subdomain is usually consistent per company but we try all to be thorough.
# To find a company's subdomain, check their careers page URL or try each one.
WORKDAY_SUBDOMAINS = ["wd1", "wd3", "wd5"]

# Generic Workday board names (tried for all companies)
WORKDAY_GENERIC_BOARDS = [
    "jobs",
    "careers",
    "External",
    "Careers",
    "ExternalCareers",
    "external",
    "Search",
]


def generate_workday_board_variations(slug: str) -> List[str]:
    """Generate Workday board name variations based on company slug.

    Workday companies often use custom board names like:
    - Company name as board: "ASCO", "BMS", "Genesys"
    - Company name + suffix: "insuletcareers", "externalcareers"
    - Company name + underscore suffix: "Vernova_ExternalSite"

    Args:
        slug: Company slug (lowercase)

    Returns:
        List of board name variations to try
    """
    variations = []

    # Generic boards first (most common)
    variations.extend(WORKDAY_GENERIC_BOARDS)

    # Slug as board name (e.g., "genesys" -> "Genesys", "asco" -> "ASCO")
    variations.append(slug)
    variations.append(slug.upper())
    variations.append(slug.capitalize())

    # Slug + common suffixes
    variations.append(f"{slug}careers")
    variations.append(f"{slug}_careers")
    variations.append(f"{slug}_ExternalSite")
    variations.append(f"{slug}_External")
    variations.append(f"{slug.capitalize()}_ExternalSite")
    variations.append(f"{slug.upper()}_ExternalSite")

    # Short board names (e.g., "Ext" for Autodesk)
    variations.append("Ext")
    variations.append("ext")
    variations.append("Jobs")
    variations.append("Career")
    variations.append("External_Career")
    variations.append("External_Careers")
    variations.append("ExternalCareer")

    # en-US locale variant (seen in 3M)
    variations.append("en-US/Search")

    # Remove exact duplicates while preserving order
    # NOTE: Keep case variants since Workday board names are case-sensitive
    seen = set()
    unique = []
    for v in variations:
        if v not in seen:
            seen.add(v)
            unique.append(v)

    return unique


def discover_workday_board_from_careers_page(
    slug: str,
    timeout: int = ATS_PROBE_TIMEOUT_SECONDS,
) -> Optional[str]:
    """Discover Workday board name by fetching the careers page and extracting it.

    Workday careers pages often redirect to a URL containing the board name:
    - https://company.wd1.myworkdayjobs.com/ redirects to
    - https://company.wd1.myworkdayjobs.com/Ext (board is "Ext")

    This function also parses the HTML for embedded board names in scripts/links.

    Args:
        slug: Company slug (tenant name)
        timeout: Request timeout in seconds

    Returns:
        Board name if discovered, None otherwise
    """
    for wd_num in WORKDAY_SUBDOMAINS:
        base_host = f"https://{slug}.{wd_num}.myworkdayjobs.com"

        try:
            # Make request and follow redirects
            response = requests.get(
                base_host,
                timeout=timeout,
                allow_redirects=True,
                headers={"User-Agent": "JobFinderBot/1.0"},
            )

            if response.status_code != 200:
                continue

            # Check final URL for board name
            final_url = response.url
            if final_url != base_host and final_url.startswith(base_host):
                # Extract board from path: /BoardName or /BoardName/something
                path = final_url[len(base_host) :].strip("/")
                if path:
                    # Get first path segment
                    board = path.split("/")[0]
                    if board and board.lower() not in ("wday", "cxs", "jobs"):
                        logger.info(f"Discovered Workday board from redirect: {slug}/{board}")
                        return board

            # Also try to find board name in HTML content
            html = response.text
            # Look for patterns like: /wday/cxs/{slug}/{board}/jobs
            # NOTE: This regex assumes the standard Workday path structure.
            # If Workday changes this layout, this pattern will need updating.
            pattern = rf"/wday/cxs/{re.escape(slug)}/([^/]+)/jobs"
            matches = re.findall(pattern, html)
            if matches:
                # Return the first unique board name found
                for board in matches:
                    if board and not board.startswith("{{"):
                        logger.info(f"Discovered Workday board from HTML: {slug}/{board}")
                        return board

            # Look for board in window.jobBoard or similar JS variables
            js_patterns = [
                r'boardName["\']?\s*[:=]\s*["\']([^"\']+)["\']',
                r'jobBoard["\']?\s*[:=]\s*["\']([^"\']+)["\']',
                r'/([^/]+)/jobs["\']',
            ]
            for js_pattern in js_patterns:
                js_matches = re.findall(js_pattern, html)
                for board in js_matches:
                    if (
                        board
                        and len(board) >= 1
                        and len(board) < 50
                        and board.lower() not in ("wday", "cxs", slug.lower())
                        and not board.startswith("{")
                    ):
                        logger.info(f"Discovered Workday board from JS: {slug}/{board}")
                        return board

        except requests.exceptions.RequestException:
            continue

    return None


def generate_slug_variations(name: str) -> List[str]:
    """Generate multiple slug variations for a company name.

    Different ATS providers use different slug conventions:
    - "3Pillar Global" -> ["3pillarglobal", "3pillar-global", "3pillar"]
    - "Full Script" -> ["fullscript", "full-script"]

    Args:
        name: Company name

    Returns:
        List of unique slug variations to try
    """
    variations: List[str] = []

    # Clean the name first
    name_lower = name.lower().strip()

    # Remove common suffixes for cleaner slugs
    suffixes = [
        " inc",
        " inc.",
        " corp",
        " corp.",
        " llc",
        " ltd",
        " ltd.",
        " co",
        " co.",
        " company",
        " corporation",
        " group",
        " holdings",
        " technologies",
        " technology",
        " tech",
        " software",
        " solutions",
    ]
    for suffix in suffixes:
        if name_lower.endswith(suffix):
            name_lower = name_lower[: -len(suffix)]
            break

    # Variation 1: All alphanumeric joined (most common)
    slug1 = re.sub(r"[^a-z0-9]", "", name_lower)
    if slug1:
        variations.append(slug1)

    # Variation 2: Words joined with hyphens
    words = re.split(r"[^a-z0-9]+", name_lower)
    words = [w for w in words if w]
    if len(words) > 1:
        slug2 = "-".join(words)
        if slug2 not in variations:
            variations.append(slug2)

    # Variation 3: First word only (for "Acme Corp" -> "acme")
    if words:
        first_word = words[0]
        if len(first_word) > 2 and first_word not in variations:
            variations.append(first_word)

    # Variation 4: CamelCase to hyphenated (for "PostHog" -> "post-hog")
    camel_split = re.sub(r"([a-z])([A-Z])", r"\1-\2", name).lower()
    camel_slug = re.sub(r"[^a-z0-9-]", "", camel_split)
    if camel_slug and camel_slug not in variations:
        variations.append(camel_slug)

    return variations


def extract_slug_from_url(url: str) -> Optional[str]:
    """Try to extract a company slug from known ATS URL patterns.

    Examples:
        "https://boards.greenhouse.io/acmecorp" -> "acmecorp"
        "https://jobs.lever.co/fullscript" -> "fullscript"
        "https://acme.wd5.myworkdayjobs.com/..." -> "acme"
    """
    if not url:
        return None

    parsed = urlparse(url.lower())
    host = parsed.netloc
    path = parsed.path.strip("/")

    # Greenhouse: boards.greenhouse.io/SLUG or jobs.greenhouse.io/SLUG
    if "greenhouse.io" in host and path:
        parts = path.split("/")
        if parts:
            return parts[0]

    # Lever: jobs.lever.co/SLUG
    if "lever.co" in host and path:
        parts = path.split("/")
        if parts:
            return parts[0]

    # Ashby: jobs.ashbyhq.com/SLUG
    if "ashbyhq.com" in host and path:
        parts = path.split("/")
        if parts:
            return parts[0]

    # Workday: SLUG.wd*.myworkdayjobs.com
    if "myworkdayjobs.com" in host:
        # Extract subdomain: acme.wd5.myworkdayjobs.com -> acme
        parts = host.split(".")
        if len(parts) >= 4:
            return parts[0]

    # SmartRecruiters: jobs.smartrecruiters.com/SLUG
    if "smartrecruiters.com" in host and path:
        parts = path.split("/")
        if parts:
            return parts[0]

    # Recruitee: SLUG.recruitee.com
    if "recruitee.com" in host:
        parts = host.split(".")
        if len(parts) >= 3 and parts[0] != "www":
            return parts[0]

    # Breezy: SLUG.breezy.hr
    if "breezy.hr" in host:
        parts = host.split(".")
        if len(parts) >= 3 and parts[0] != "www":
            return parts[0]

    # Workable: apply.workable.com/SLUG or SLUG.workable.com
    if "workable.com" in host:
        if host.startswith("apply.") and path:
            parts = path.split("/")
            if parts:
                return parts[0]
        else:
            parts = host.split(".")
            if len(parts) >= 3 and parts[0] not in ("www", "apply"):
                return parts[0]

    return None


def extract_job_url_domain(job: Dict[str, Any], provider: str) -> Optional[str]:
    """Extract the company domain from a job's URL.

    Different ATS providers store the job URL in different fields.
    Some URLs point to the ATS domain, others to the company's own domain.

    Returns:
        The domain of the company's website (not the ATS domain), or None
    """
    url_fields = {
        "greenhouse": "absolute_url",
        "lever": "hostedUrl",
        "ashby": "jobUrl",
        "smartrecruiters": "ref",
        "recruitee": "careers_url",
        "breezy": "url",
        "workable": "url",
    }

    url_field = url_fields.get(provider)
    if not url_field:
        return None

    job_url = job.get(url_field, "")
    if not job_url:
        return None

    parsed = urlparse(job_url)
    domain = parsed.netloc.lower()

    # Skip ATS-hosted URLs - they don't tell us about the company
    ats_domains = [
        "greenhouse.io",
        "lever.co",
        "ashbyhq.com",
        "smartrecruiters.com",
        "recruitee.com",
        "breezy.hr",
        "workable.com",
    ]
    for ats in ats_domains:
        if ats in domain:
            return None

    return domain


def domains_match(domain1: str, domain2: str) -> bool:
    """Check if two domains belong to the same company.

    Handles cases like:
    - "www.example.com" vs "example.com"
    - "careers.example.com" vs "example.com"
    - "jobs.example.com" vs "example.com"
    - "company.co.uk" vs "jobs.company.co.uk" (multi-part TLDs)
    """
    from job_finder.utils.url_utils import get_root_domain

    if not domain1 or not domain2:
        return False

    # Normalize domains
    d1 = domain1.lower().replace("www.", "")
    d2 = domain2.lower().replace("www.", "")

    # Direct match
    if d1 == d2:
        return True

    # Check if root domains match (handles multi-part TLDs like .co.uk)
    root1 = get_root_domain(d1)
    root2 = get_root_domain(d2)
    if root1 and root2 and root1 == root2:
        return True

    return False


def probe_ats_provider(
    provider: str,
    slug: str,
    timeout: int = ATS_PROBE_TIMEOUT_SECONDS,
) -> ATSProbeResult:
    """Probe a specific ATS provider to check if company uses it.

    Args:
        provider: ATS provider name (greenhouse, lever, ashby, etc.)
        slug: Company slug to test
        timeout: Request timeout in seconds

    Returns:
        ATSProbeResult with found=True if jobs are available
    """
    if provider not in ATS_PROVIDERS:
        return ATSProbeResult(found=False)

    config = ATS_PROVIDERS[provider]
    api_url = config["api_url"].format(slug=slug)

    try:
        response = requests.get(
            api_url,
            headers={
                "User-Agent": "JobFinderBot/1.0",
                "Accept": "application/json",
            },
            timeout=timeout,
        )

        # 404 means company doesn't use this ATS
        if response.status_code == 404:
            return ATSProbeResult(found=False)

        # Other errors - log but return not found
        if response.status_code != 200:
            logger.debug(f"ATS probe {provider}/{slug} returned status {response.status_code}")
            return ATSProbeResult(found=False)

        data = response.json()

        # Navigate to jobs array
        response_path = config["response_path"]
        if response_path:
            for key in response_path.split("."):
                if isinstance(data, dict):
                    data = data.get(key, [])
                else:
                    break

        # Handle both dict with jobs array and direct array
        if isinstance(data, dict) and "jobs" in data:
            jobs = data["jobs"]
        elif isinstance(data, list):
            jobs = data
        else:
            jobs = []

        job_count = len(jobs)

        if job_count == 0:
            return ATSProbeResult(found=False)

        # Found jobs - build config
        # Use config_url (with full query params) if available, else api_url
        stored_url = config.get("config_url", config["api_url"]).format(slug=slug)
        sample_job = jobs[0] if jobs else None
        scraper_config = {
            "type": "api",
            "url": stored_url,
            "method": "GET",
            "response_path": config["response_path"],
            "fields": config["fields"].copy(),
        }
        if config.get("salary_min_field"):
            scraper_config["salary_min_field"] = config["salary_min_field"]
        if config.get("salary_max_field"):
            scraper_config["salary_max_field"] = config["salary_max_field"]

        # Extract sample job URL for domain verification
        sample_job_domain = None
        if sample_job:
            sample_job_domain = extract_job_url_domain(sample_job, provider)

        aggregator_domain = config.get("aggregator_domain")
        logger.info(f"ATS probe SUCCESS: {provider}/{slug} has {job_count} jobs")

        return ATSProbeResult(
            found=True,
            ats_provider=provider,
            aggregator_domain=aggregator_domain,
            api_url=api_url,
            job_count=job_count,
            sample_job=sample_job,
            config=scraper_config,
            sample_job_domain=sample_job_domain,
        )

    except requests.exceptions.Timeout:
        logger.debug(f"ATS probe {provider}/{slug} timed out")
        return ATSProbeResult(found=False)
    except requests.exceptions.RequestException as e:
        logger.debug(f"ATS probe {provider}/{slug} failed: {e}")
        return ATSProbeResult(found=False)
    except (ValueError, KeyError) as e:
        logger.debug(f"ATS probe {provider}/{slug} parse error: {e}")
        return ATSProbeResult(found=False)


def probe_workday(
    slug: str,
    timeout: int = ATS_PROBE_TIMEOUT_SECONDS,
) -> ATSProbeResult:
    """Probe Workday ATS which requires special handling.

    Workday uses POST requests and has variable URL patterns:
    - https://{slug}.wd{N}.myworkdayjobs.com/wday/cxs/{slug}/{board}/jobs

    Board names are highly variable - companies use:
    - Generic names: jobs, careers, External, Search
    - Company name as board: ASCO, BMS, Genesys
    - Company name + suffix: insuletcareers, Vernova_ExternalSite

    Note: Workday requires session cookies, so we pre-fetch the careers page
    before making API calls.

    Args:
        slug: Company slug to test
        timeout: Request timeout in seconds

    Returns:
        ATSProbeResult with found=True if jobs are available
    """
    # First, try to discover the board name from the careers page redirect
    discovered_board = discover_workday_board_from_careers_page(slug, timeout)

    # Generate all board variations to try for this company
    board_variations = generate_workday_board_variations(slug)

    # If we discovered a board name, prioritize it at the front
    if discovered_board:
        try:
            board_variations.remove(discovered_board)
        except ValueError:
            pass  # Not in list, which is fine
        board_variations.insert(0, discovered_board)

    for wd_num in WORKDAY_SUBDOMAINS:
        # Create session and establish cookies for this subdomain
        session = requests.Session()
        base_host = f"https://{slug}.{wd_num}.myworkdayjobs.com"

        # Pre-fetch to get session cookies (Workday requires this)
        try:
            session.get(base_host, timeout=timeout)
        except requests.exceptions.RequestException:
            # If GET fails, subdomain probably doesn't exist, skip it
            continue

        for board in board_variations:
            api_url = f"{base_host}/wday/cxs/{slug}/{board}/jobs"
            try:
                response = session.post(
                    api_url,
                    json={"limit": 50, "offset": 0},
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                    timeout=timeout,
                )

                if response.status_code == 404:
                    continue

                if response.status_code != 200:
                    continue

                data = response.json()
                job_postings = data.get("jobPostings", [])
                job_count = len(job_postings)

                if job_count == 0:
                    continue

                # Found jobs - build config
                _wd_pattern = _PLATFORM_PATTERNS_BY_NAME["workday"]
                sample_job = job_postings[0] if job_postings else None
                base_url = f"{base_host}/{board}"
                scraper_config = {
                    "type": "api",
                    "url": api_url,
                    "method": "POST",
                    "post_body": {"limit": 50, "offset": 0},
                    "response_path": "jobPostings",
                    "base_url": base_url,
                    "headers": {"Content-Type": "application/json"},
                    "fields": _wd_pattern.fields.copy(),
                    "follow_detail": True,
                }

                logger.info(
                    f"ATS probe SUCCESS: workday/{slug} ({wd_num}/{board}) has {job_count}+ jobs"
                )

                return ATSProbeResult(
                    found=True,
                    ats_provider="workday",
                    aggregator_domain="myworkdayjobs.com",
                    api_url=api_url,
                    job_count=data.get("total", job_count),
                    sample_job=sample_job,
                    config=scraper_config,
                )

            except requests.exceptions.Timeout:
                continue
            except requests.exceptions.RequestException:
                continue
            except (ValueError, KeyError):
                continue

    return ATSProbeResult(found=False)


@dataclass
class ATSProbeResultSet:
    """Collection of all ATS probe results for detailed analysis."""

    best_result: Optional[ATSProbeResult]
    all_results: List[ATSProbeResult]
    expected_domain: Optional[str]
    domain_matched_results: List[ATSProbeResult]
    has_slug_collision: bool  # True if multiple providers found with same slug
    slugs_tried: List[str]


def probe_all_ats_providers_detailed(
    company_name: Optional[str] = None,
    url: Optional[str] = None,
    additional_slugs: Optional[List[str]] = None,
) -> ATSProbeResultSet:
    """Probe all ATS providers and return detailed results for agent analysis.

    Returns ALL results (not just the best one) to help AI agents verify
    company identity and detect slug collisions.

    Args:
        company_name: Company name to derive slugs from
        url: URL to extract potential slugs from
        additional_slugs: Extra slugs to try

    Returns:
        ATSProbeResultSet with all results and collision detection info
    """
    # Build list of slugs to try
    slugs_to_try: List[str] = []

    url_slug = extract_slug_from_url(url or "")
    if url_slug:
        slugs_to_try.append(url_slug)

    if company_name:
        for variation in generate_slug_variations(company_name):
            if variation and variation not in slugs_to_try:
                slugs_to_try.append(variation)

    if url:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        parts = domain.replace("www.", "").split(".")
        if len(parts) >= 2:
            domain_slug = parts[0]
            if domain_slug and domain_slug not in slugs_to_try:
                slugs_to_try.append(domain_slug)

    if additional_slugs:
        for slug in additional_slugs:
            if slug and slug not in slugs_to_try:
                slugs_to_try.append(slug)

    seen = set()
    unique_slugs = []
    for slug in slugs_to_try:
        if slug not in seen:
            seen.add(slug)
            unique_slugs.append(slug)

    if not unique_slugs:
        return ATSProbeResultSet(
            best_result=None,
            all_results=[],
            expected_domain=None,
            domain_matched_results=[],
            has_slug_collision=False,
            slugs_tried=[],
        )

    # Probe all providers (always check all for detailed analysis)
    provider_order = [
        "greenhouse",
        "lever",
        "ashby",
        "smartrecruiters",
        "recruitee",
        "breezy",
        "workable",
    ]

    all_results: List[ATSProbeResult] = []

    for provider in provider_order:
        for slug in unique_slugs:
            result = probe_ats_provider(provider, slug)
            if result.found:
                all_results.append(result)

    # Also try Workday (probe all slugs like other providers)
    for slug in unique_slugs:
        result = probe_workday(slug)
        if result.found:
            all_results.append(result)

    # Determine expected domain
    expected_domain = None
    if url:
        parsed = urlparse(url)
        expected_domain = parsed.netloc.lower().replace("www.", "")

    # Find domain-matched results
    domain_matched_results = []
    if expected_domain:
        domain_matched_results = [
            r
            for r in all_results
            if r.sample_job_domain and domains_match(r.sample_job_domain, expected_domain)
        ]

    # Detect slug collision (same slug matches different companies on different providers)
    has_slug_collision = len(all_results) > 1 and len(domain_matched_results) < len(all_results)

    # Determine best result
    best_result = None
    if all_results:
        if domain_matched_results:
            best_result = max(domain_matched_results, key=lambda r: r.job_count)
        else:
            best_result = max(all_results, key=lambda r: r.job_count)

    return ATSProbeResultSet(
        best_result=best_result,
        all_results=all_results,
        expected_domain=expected_domain,
        domain_matched_results=domain_matched_results,
        has_slug_collision=has_slug_collision,
        slugs_tried=unique_slugs,
    )
