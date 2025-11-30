"""Company name normalization and cleaning utilities."""

import re
from typing import List


# NOTE: Order matters – handle separator variants before plain suffixes
JOB_BOARD_SUFFIX_PATTERNS: List[str] = [
    r"\s+-\s+careers?[\s.,;:]*$",  # " - Careers"
    r"\s+\|\s+careers?[\s.,;:]*$",  # " | Careers"
    r"\s+careers?[\s.,;:]*$",  # "Careers" or "Career"
    r"\s+jobs?[\s.,;:]*$",  # "Jobs" or "Job"
    r"\s+hiring[\s.,;:]*$",
    r"\s+opportunities[\s.,;:]*$",
    r"\s+employment[\s.,;:]*$",
    r"\s+work[\s.,;:]*$",
    r"\s+positions?[\s.,;:]*$",
    r"\s+openings?[\s.,;:]*$",
]

LEGAL_SUFFIX_PATTERNS: List[str] = [
    r"\s+incorporated$",
    r"\s+corp\.?$",
    r"\s+corporation$",
    r"\s+ltd\.?$",
    r"\s+limited$",
    r"\s+co\.?$",
    r"\s+company$",
    r",?\s+inc\.?$",
    r",?\s+llc\.?$",
]


def _remove_suffix_patterns(value: str, patterns: List[str]) -> str:
    """Strip regex suffix patterns from the end of a string."""
    stripped = value
    for pattern in patterns:
        stripped = re.sub(pattern, "", stripped, flags=re.IGNORECASE)
    return stripped


def clean_company_name(name: str) -> str:
    """
    Remove job-board style suffixes while keeping the original casing.

    Use this for display or persistence to avoid storing names like
    "Acme Careers" when the real company is "Acme".
    """
    if not name:
        return ""

    cleaned = name.strip()
    cleaned_after_suffix = _remove_suffix_patterns(cleaned, JOB_BOARD_SUFFIX_PATTERNS)
    suffix_removed = cleaned_after_suffix != cleaned
    cleaned = cleaned_after_suffix
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -|,")

    # Only strip trailing punctuation if we removed a suffix (e.g., "Careers,")
    if suffix_removed:
        cleaned = cleaned.rstrip(".,;:")

    return cleaned.strip()


def is_source_name(name: str) -> bool:
    """
    Check if a company name is actually a job source/aggregator name.

    This is a scraper bug where source names leak into company fields.
    Returns True if the name matches known source patterns.

    Examples:
        >>> is_source_name("RemoteOK API")
        True
        >>> is_source_name("We Work Remotely - DevOps")
        True
        >>> is_source_name("Google")
        False
        >>> is_source_name("Indeed")
        False
        >>> is_source_name("LinkedIn")
        False
    """
    if not name:
        return False

    name_lower = name.lower().strip()

    # Known source name patterns (scrapers, aggregators, job boards)
    # These patterns are specific to scraper output, not the companies themselves
    source_patterns = [
        # Specific aggregator/scraper names with identifying suffixes
        r"^remoteok\s+(api|remote)?\s*$",  # RemoteOK API, RemoteOK (exact)
        r"^remote\s*ok\s+(api)?\s*$",  # Remote OK, Remote OK API (exact)
        r"^we\s+work\s+remotely\b",  # We Work Remotely (with anything after)
        r"^himalayas\s+remote\b",  # Himalayas Remote
        r"^jobicy\s+remote\b",  # Jobicy Remote
        r"^remotive\b",  # Remotive (board name, not company)

        # Job board names WITH job-related suffixes (not the companies themselves)
        r"^indeed\s+(jobs?|api|prime)\b",  # Indeed Jobs, Indeed API (NOT just "Indeed")
        r"^linkedin\s+(jobs?|api)\b",  # LinkedIn Jobs, LinkedIn API (NOT just "LinkedIn")
        r"^glassdoor\s+(jobs?|api)\b",  # Glassdoor Jobs (NOT just "Glassdoor")

        # Other job boards
        r"^github\s+jobs\b",  # GitHub Jobs
        r"^stack\s+overflow\s+jobs\b",  # Stack Overflow Jobs
        r"^ziprecruiter\b",  # ZipRecruiter
        r"^careerbuilder\b",  # CareerBuilder

        # Scraper patterns: "SourceName - Category" (very specific)
        # Only match if it looks like a scraper categorization, not a division name
        r"^(remoteok|remote ok|we work remotely|himalayas|jobicy|remotive)\s+-\s+",
    ]

    return any(re.search(pattern, name_lower) for pattern in source_patterns)


def normalize_company_name(name: str) -> str:
    """
    Normalize company name for deduplication.

    Removes common suffixes and standardizes formatting to match companies
    that are essentially the same (e.g., "Cloudflare" and "Cloudflare Careers").

    Args:
        name: Company name

    Returns:
        Normalized company name

    Examples:
        >>> normalize_company_name("Cloudflare Careers")
        'cloudflare'
        >>> normalize_company_name("Google Jobs")
        'google'
        >>> normalize_company_name("Microsoft Corporation")
        'microsoft'
    """
    if not name or not name.strip():
        return ""

    # Lowercase first for stable comparisons
    normalized = name.lower().strip()

    # Remove job board and legal suffixes
    normalized = _remove_suffix_patterns(normalized, JOB_BOARD_SUFFIX_PATTERNS)
    normalized = _remove_suffix_patterns(normalized, LEGAL_SUFFIX_PATTERNS)

    # Normalize whitespace and trailing punctuation
    normalized = re.sub(r"\s+", " ", normalized).strip()
    normalized = normalized.rstrip(".,;:")

    return normalized
