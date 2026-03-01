"""Utilities for URL normalization and deduplication."""

import hashlib
import logging
from typing import Optional
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

logger = logging.getLogger(__name__)

# Job-board aggregator host substrings used to filter self-referencing links
# when extracting company URLs from descriptions and gating apply_url fallbacks.
AGGREGATOR_HOST_SUBSTRINGS = ("weworkremotely", "remotive", "remoteok", "jobicy")

# Optional import: more accurate public-suffix parsing if available
try:  # pragma: no cover - optional dependency
    import tldextract
except Exception:  # noqa: BLE001
    tldextract = None


def get_root_domain(host: str) -> str:
    """
    Return the registrable root domain for a host.

    Uses tldextract when available to handle multi-part TLDs (e.g., co.uk).
    Falls back to a simple last-two-labels join if tldextract is not installed.
    """
    if not host:
        return host

    host = host.strip().lower()

    # Prefer robust parsing when the library is present
    if tldextract:
        ext = tldextract.extract(host)
        if ext.domain and ext.suffix:
            return f"{ext.domain}.{ext.suffix}"
        return host

    parts = host.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return host


# ATS domains whose URL paths are verified case-insensitive.
# Workday is intentionally excluded — board names are case-sensitive.
_CASE_INSENSITIVE_PATH_HOSTS = (
    "ashbyhq.com",
    "greenhouse.io",
    "lever.co",
    "workable.com",
)


def _host_has_case_insensitive_paths(netloc: str) -> bool:
    """Check if a host belongs to an ATS with case-insensitive URL paths."""
    return any(netloc.endswith(h) for h in _CASE_INSENSITIVE_PATH_HOSTS)


def normalize_url(url: str) -> str:
    """
    Normalize URL for consistent comparison and deduplication.

    Performs the following normalizations:
    - Lower case domain and scheme
    - Remove trailing slashes (preserving single slash for domain)
    - Sort query parameters alphabetically
    - Remove tracking parameters (utm_*, fbclid, msclkid, etc)
    - Remove URL fragments
    - Decode percent-encoded characters

    Args:
        url: URL to normalize

    Returns:
        Normalized URL string

    Examples:
        >>> normalize_url("https://example.com/job/123/")
        "https://example.com/job/123"

        >>> normalize_url("https://EXAMPLE.COM/job/123?foo=1&bar=2")
        "https://example.com/job/123?bar=2&foo=1"

        >>> normalize_url("https://example.com/job/123?utm_source=google")
        "https://example.com/job/123"
    """
    if not url:
        return ""

    try:
        # Parse URL components
        parsed = urlparse(url)

        # Normalize scheme and netloc (domain) to lowercase
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()

        # Lowercase paths for ATS platforms verified to be case-insensitive.
        # Workday board names are case-sensitive (e.g. /Ext vs /ext are
        # distinct boards), so Workday paths are preserved as-is.
        if _host_has_case_insensitive_paths(netloc):
            path = parsed.path.lower()
        else:
            path = parsed.path

        # Remove trailing slash from path unless it's the root
        if path != "/" and path.endswith("/"):
            path = path.rstrip("/")

        # Parse query parameters
        query_params = parse_qs(parsed.query, keep_blank_values=True)

        # Filter out tracking parameters
        tracking_params = {
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_content",
            "utm_term",
            "fbclid",
            "msclkid",
            "gclid",
            "gclsrc",
            "dclid",
            "_ga",
            "_gid",
            "_gat",
            "ref",  # Generic referrer tracking
            "source",  # Generic source tracking
            "t",  # Greenhouse and other job board tracking tokens
        }

        filtered_params = {
            k: v for k, v in query_params.items() if k.lower() not in tracking_params
        }

        # Sort parameters alphabetically and reconstruct query string
        sorted_params = sorted(filtered_params.items())
        # Flatten the list of lists (parse_qs returns lists for each value)
        flat_params = [(k, v[0] if isinstance(v, list) and v else v) for k, v in sorted_params]
        query = urlencode(flat_params) if flat_params else ""

        # Reconstruct URL without fragment
        # Note: fragment is not included (intentionally removed for dedup purposes)
        normalized = urlunparse((scheme, netloc, path, "", query, ""))

        return normalized

    except Exception as e:
        logger.warning(f"Error normalizing URL '{url}': {e}")
        # Return original URL if normalization fails
        return url


def get_url_hash(url: str) -> str:
    """
    Get SHA256 hash of normalized URL for fast comparison.

    Args:
        url: URL to hash

    Returns:
        Hex-encoded SHA256 hash

    Examples:
        >>> hash1 = get_url_hash("https://example.com/job/123")
        >>> hash2 = get_url_hash("https://example.com/job/123/")
        >>> hash1 == hash2
        True
    """
    normalized = normalize_url(url)
    return hashlib.sha256(normalized.encode()).hexdigest()


def urls_are_equivalent(url1: str, url2: str) -> bool:
    """
    Check if two URLs are equivalent after normalization.

    Args:
        url1: First URL
        url2: Second URL

    Returns:
        True if URLs normalize to the same value

    Examples:
        >>> urls_are_equivalent("https://example.com/job/123", "https://example.com/job/123/")
        True

        >>> urls_are_equivalent(
        ...     "https://example.com/job/123?utm_source=google",
        ...     "https://example.com/job/123"
        ... )
        True
    """
    return normalize_url(url1) == normalize_url(url2)


def normalize_job_url(url: str) -> str:
    """
    Normalize a job URL for duplicate detection and storage.

    This is an alias for normalize_url() with job-specific documentation.
    Used throughout the codebase to ensure consistent URL handling for job postings.

    Args:
        url: Job posting URL to normalize

    Returns:
        Normalized URL string

    Examples:
        >>> normalize_job_url("https://boards.greenhouse.io/company/jobs/123?t=abc")
        "https://boards.greenhouse.io/company/jobs/123"

        >>> normalize_job_url(
        ...     "https://example.myworkdayjobs.com/en-US/Careers/job/Software-Engineer_123/"
        ... )
        "https://example.myworkdayjobs.com/en-US/Careers/job/Software-Engineer_123"
    """
    return normalize_url(url)


def compute_content_fingerprint(title: str, company: str, description: str) -> str:
    """Compute a content-based fingerprint for semantic duplicate detection.

    Two listings with the same fingerprint but different URLs are duplicates
    (multi-location postings, re-scraped with rotated ATS IDs, etc.).

    The fingerprint is based on:
    - Normalized title (lowered, punctuation collapsed)
    - Normalized company name (domain/legal suffixes stripped)
    - First 500 chars of description (stable portion; location-specific
      boilerplate tends to appear at the end)

    Args:
        title: Job title.
        company: Company name.
        description: Job description text.

    Returns:
        SHA256 hex digest.
    """
    from job_finder.utils.company_name_utils import normalize_company_name, normalize_title

    norm_title = normalize_title(title)
    norm_company = normalize_company_name(company)
    desc_prefix = (description[:500].lower().strip()) if description else ""

    content = f"{norm_title}|{norm_company}|{desc_prefix}"
    return hashlib.sha256(content.encode()).hexdigest()


def derive_apply_url(listing_url: str) -> Optional[str]:
    """Derive the direct application URL from a job listing URL.

    For known ATS platforms, constructs the apply URL from the listing URL.
    Returns ``None`` if the platform is unknown (caller should fall back to
    the listing URL).

    Examples:
        >>> derive_apply_url("https://boards.greenhouse.io/acme/jobs/123")
        'https://boards.greenhouse.io/acme/jobs/123#app'
        >>> derive_apply_url("https://jobs.lever.co/acme/abc-123")
        'https://jobs.lever.co/acme/abc-123/apply'
    """
    if not listing_url:
        return None

    parsed = urlparse(listing_url)
    host = (parsed.hostname or "").lower()

    # Greenhouse: append #app fragment to reach the application form
    if "greenhouse.io" in host:
        return f"{listing_url}#app"

    # Lever: append /apply path suffix
    if "lever.co" in host:
        clean = listing_url.rstrip("/")
        if not clean.endswith("/apply"):
            return f"{clean}/apply"
        return listing_url

    # Ashby: the job URL IS the application page (embedded form)
    if "ashbyhq.com" in host:
        return listing_url

    # Workable: append /apply path suffix
    if "workable.com" in host:
        clean = listing_url.rstrip("/")
        if not clean.endswith("/apply"):
            return f"{clean}/apply"
        return listing_url

    return None
