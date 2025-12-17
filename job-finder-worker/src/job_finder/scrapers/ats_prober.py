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
    sample_job_url: Optional[str] = None  # URL of a sample job for verification


# Common ATS providers and their API patterns
ATS_PROVIDERS = {
    "greenhouse": {
        "api_url": "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
        "response_path": "jobs",
        "aggregator_domain": "greenhouse.io",
        "fields": {
            "title": "title",
            "url": "absolute_url",
            "location": "location.name",
            "description": "content",
            "posted_date": "updated_at",
        },
    },
    "lever": {
        "api_url": "https://api.lever.co/v0/postings/{slug}?mode=json",
        "response_path": "",  # Root is array
        "aggregator_domain": "lever.co",
        "fields": {
            "title": "text",
            "url": "hostedUrl",
            "location": "categories.location",
            "description": "descriptionPlain",
            "posted_date": "createdAt",
        },
    },
    "ashby": {
        "api_url": "https://api.ashbyhq.com/posting-api/job-board/{slug}",
        "response_path": "jobs",
        "aggregator_domain": "ashbyhq.com",
        "fields": {
            "title": "title",
            "url": "jobUrl",
            "location": "location",
            "description": "descriptionHtml",
        },
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
        "fields": {
            "title": "title",
            "url": "url",
            "location": "location.city",
            "description": "description",
        },
    },
}

# Workday requires special handling (POST request, variable wd* subdomain)
# Common Workday subdomain numbers
WORKDAY_SUBDOMAINS = ["wd1", "wd3", "wd5"]
# Common Workday board names
WORKDAY_BOARDS = ["jobs", "careers", "External", "Careers"]


def normalize_company_slug(name: str) -> str:
    """Convert company name to a typical ATS slug format.

    Examples:
        "Acme Corp" -> "acmecorp"
        "Full-Script Inc." -> "fullscript"
        "REI Co-op" -> "rei"
    """
    # Remove common suffixes
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
    name_lower = name.lower()
    for suffix in suffixes:
        if name_lower.endswith(suffix):
            name_lower = name_lower[: -len(suffix)]

    # Remove special characters and spaces
    slug = re.sub(r"[^a-z0-9]", "", name_lower)

    return slug


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
    """
    if not domain1 or not domain2:
        return False

    # Normalize domains
    d1 = domain1.lower().replace("www.", "")
    d2 = domain2.lower().replace("www.", "")

    # Direct match
    if d1 == d2:
        return True

    # Check if one is a subdomain of the other
    # Extract root domain (last 2 parts for .com, .io, etc.)
    parts1 = d1.split(".")
    parts2 = d2.split(".")

    if len(parts1) >= 2 and len(parts2) >= 2:
        root1 = ".".join(parts1[-2:])
        root2 = ".".join(parts2[-2:])
        if root1 == root2:
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
        sample_job = jobs[0] if jobs else None
        scraper_config = {
            "type": "api",
            "url": api_url,
            "method": "GET",
            "response_path": config["response_path"],
            "fields": config["fields"].copy(),
        }

        # Extract sample job URL for domain verification
        sample_job_url = None
        if sample_job:
            sample_job_url = extract_job_url_domain(sample_job, provider)

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
            sample_job_url=sample_job_url,
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

    Args:
        slug: Company slug to test
        timeout: Request timeout in seconds

    Returns:
        ATSProbeResult with found=True if jobs are available
    """
    for wd_num in WORKDAY_SUBDOMAINS:
        for board in WORKDAY_BOARDS:
            api_url = f"https://{slug}.{wd_num}.myworkdayjobs.com/wday/cxs/{slug}/{board}/jobs"
            try:
                response = requests.post(
                    api_url,
                    json={"limit": 20, "offset": 0},
                    headers={
                        "User-Agent": "JobFinderBot/1.0",
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
                sample_job = job_postings[0] if job_postings else None
                base_url = f"https://{slug}.{wd_num}.myworkdayjobs.com/{board}"
                scraper_config = {
                    "type": "api",
                    "url": api_url,
                    "method": "POST",
                    "post_body": {"limit": 50, "offset": 0},
                    "response_path": "jobPostings",
                    "base_url": base_url,
                    "headers": {"Content-Type": "application/json"},
                    "fields": {
                        "title": "title",
                        "url": "externalPath",
                        "location": "locationsText",
                        "posted_date": "postedOn",
                    },
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


def probe_all_ats_providers(
    company_name: Optional[str] = None,
    url: Optional[str] = None,
    additional_slugs: Optional[List[str]] = None,
) -> ATSProbeResult:
    """Probe all known ATS providers to find which one a company uses.

    Tries multiple slug variations derived from company name and URL.

    Args:
        company_name: Company name to derive slugs from
        url: URL to extract potential slugs from
        additional_slugs: Extra slugs to try (e.g., from domain name)

    Returns:
        ATSProbeResult with found=True if any provider has jobs
    """
    # Build list of slugs to try
    slugs_to_try: List[str] = []

    # Extract slug from URL (most reliable)
    url_slug = extract_slug_from_url(url or "")
    if url_slug:
        slugs_to_try.append(url_slug)

    # Derive multiple slug variations from company name
    if company_name:
        for variation in generate_slug_variations(company_name):
            if variation and variation not in slugs_to_try:
                slugs_to_try.append(variation)

    # Extract slug from domain
    if url:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        # Get root domain without TLD: "www.acme.com" -> "acme"
        parts = domain.replace("www.", "").split(".")
        if len(parts) >= 2:
            domain_slug = parts[0]
            if domain_slug and domain_slug not in slugs_to_try:
                slugs_to_try.append(domain_slug)

    # Add any additional slugs
    if additional_slugs:
        for slug in additional_slugs:
            if slug and slug not in slugs_to_try:
                slugs_to_try.append(slug)

    # De-duplicate while preserving order
    seen = set()
    unique_slugs = []
    for slug in slugs_to_try:
        if slug not in seen:
            seen.add(slug)
            unique_slugs.append(slug)

    if not unique_slugs:
        logger.debug("No slugs to probe for ATS")
        return ATSProbeResult(found=False)

    logger.debug(f"Probing ATS providers with slugs: {unique_slugs}")

    # Try each provider with each slug
    # Prioritize providers by likelihood of success (most common first)
    provider_order = [
        "greenhouse",
        "lever",
        "ashby",
        "smartrecruiters",
        "recruitee",
        "breezy",
        "workable",
    ]

    # Collect all successful results to return the best one
    all_results: List[ATSProbeResult] = []

    # If we have a URL, we need to check all providers for domain verification
    # to prevent slug collisions. Without URL, we can exit early for performance.
    need_domain_verification = url is not None

    for provider in provider_order:
        for slug in unique_slugs:
            result = probe_ats_provider(provider, slug)
            if result.found:
                all_results.append(result)
                # Early exit if we find a result with many jobs (unless we need domain verification)
                if not need_domain_verification and result.job_count >= 5:
                    break
        # If we found a good result for this provider, move on (unless we need domain verification)
        if not need_domain_verification and all_results and all_results[-1].job_count >= 5:
            break

    # Also try Workday (requires special handling)
    for slug in unique_slugs:
        result = probe_workday(slug)
        if result.found:
            all_results.append(result)
            break

    if not all_results:
        logger.debug(f"No ATS provider found for slugs: {unique_slugs}")
        return ATSProbeResult(found=False)

    # If we have an original URL, prefer results that match the company domain
    # This prevents slug collisions (e.g., "profound" matching wrong company)
    expected_domain = None
    if url:
        parsed = urlparse(url)
        expected_domain = parsed.netloc.lower().replace("www.", "")

    if expected_domain and len(all_results) > 1:
        # Filter results to those whose job URLs match the expected domain
        domain_matched_results = [
            r
            for r in all_results
            if r.sample_job_url and domains_match(r.sample_job_url, expected_domain)
        ]

        if domain_matched_results:
            # Return the domain-matched result with the most jobs
            best_result = max(domain_matched_results, key=lambda r: r.job_count)
            if len(all_results) > len(domain_matched_results):
                logger.info(
                    f"Found {len(all_results)} ATS providers, {len(domain_matched_results)} match "
                    f"domain {expected_domain}. Returning {best_result.ats_provider} "
                    f"with {best_result.job_count} jobs"
                )
            return best_result
        else:
            # No domain matches - log warning about potential slug collision
            logger.warning(
                f"Found {len(all_results)} ATS providers but none match expected domain "
                f"{expected_domain}. Potential slug collision. Returning result with most jobs."
            )

    # Return the result with the most jobs
    best_result = max(all_results, key=lambda r: r.job_count)
    if len(all_results) > 1:
        logger.info(
            f"Found {len(all_results)} ATS providers, returning best: "
            f"{best_result.ats_provider} with {best_result.job_count} jobs"
        )
    return best_result


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

    Unlike probe_all_ats_providers which returns only the best result, this
    function returns ALL results to help AI agents verify company identity
    and detect slug collisions.

    Args:
        company_name: Company name to derive slugs from
        url: URL to extract potential slugs from
        additional_slugs: Extra slugs to try

    Returns:
        ATSProbeResultSet with all results and collision detection info
    """
    # Build list of slugs to try (same logic as probe_all_ats_providers)
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

    # Also try Workday
    for slug in unique_slugs:
        result = probe_workday(slug)
        if result.found:
            all_results.append(result)
            break

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
            if r.sample_job_url and domains_match(r.sample_job_url, expected_domain)
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
