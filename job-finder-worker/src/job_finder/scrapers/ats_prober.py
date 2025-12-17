"""Systematic ATS (Applicant Tracking System) prober.

This module probes known ATS API endpoints to determine which ATS provider
a company uses, eliminating the need for agents to guess.

Supported ATS Providers:
- Greenhouse (boards-api.greenhouse.io)
- Lever (api.lever.co)
- Ashby (api.ashbyhq.com)
- SmartRecruiters (api.smartrecruiters.com)
- Recruitee (SLUG.recruitee.com)
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
}


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

    return None


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

    # Derive slugs from company name
    if company_name:
        # Full slug (spaces/special chars removed)
        slugs_to_try.append(normalize_company_slug(company_name))

        # First word only (for "Acme Corp" -> "acme")
        first_word = company_name.split()[0].lower() if company_name else ""
        if first_word and len(first_word) > 2:
            clean_first = re.sub(r"[^a-z0-9]", "", first_word)
            if clean_first and clean_first not in slugs_to_try:
                slugs_to_try.append(clean_first)

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
    # Prioritize providers by likelihood of success
    provider_order = ["greenhouse", "lever", "ashby", "smartrecruiters", "recruitee"]

    for provider in provider_order:
        for slug in unique_slugs:
            result = probe_ats_provider(provider, slug)
            if result.found:
                return result

    # No provider found
    logger.debug(f"No ATS provider found for slugs: {unique_slugs}")
    return ATSProbeResult(found=False)
