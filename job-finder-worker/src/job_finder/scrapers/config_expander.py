"""
Config expander for job sources.

Converts simple source configs into full scraper configs based on source_type.
This allows storing minimal config in the database while supporting full scraping.

NEW SOURCES should store FULL configs directly (url, fields, response_path, etc.)
This module provides backwards compatibility for legacy minimal configs.

The source_type column indicates the SCRAPING METHOD, not the vendor:
- api: JSON API (includes Greenhouse, Ashby, Workday, and generic APIs)
- rss: RSS/Atom feeds
- html: HTML page scraping with CSS selectors

For API sources, the vendor is auto-detected from config contents:
- {"board_token": "xxx"} → Greenhouse API (legacy)
- {"board_name": "xxx"} → Ashby API (legacy)
- {"careers_url": "https://company.wd5.myworkdayjobs.com/..."} → Workday API (legacy)
- {"url": "...", "fields": {...}} → Full config (preferred)
"""

from typing import Any, Dict, Optional, Tuple

from job_finder.scrapers.platform_patterns import PLATFORM_PATTERNS, match_platform

# Build field mappings from platform_patterns (single source of truth)
_GREENHOUSE_PATTERN = next(p for p in PLATFORM_PATTERNS if p.name == "greenhouse_api")
_ASHBY_PATTERN = next(p for p in PLATFORM_PATTERNS if p.name == "ashby_api")
_WORKDAY_PATTERN = next(p for p in PLATFORM_PATTERNS if p.name == "workday")
_LEVER_PATTERN = next(p for p in PLATFORM_PATTERNS if p.name == "lever")

GREENHOUSE_FIELDS = _GREENHOUSE_PATTERN.fields
ASHBY_FIELDS = _ASHBY_PATTERN.fields
WORKDAY_FIELDS = _WORKDAY_PATTERN.fields
LEVER_FIELDS = _LEVER_PATTERN.fields

# Standard RSS field mappings (not in platform_patterns since RSS is format-based, not platform-based)
RSS_FIELDS = {
    "title": "title",
    "description": "summary",
    "url": "link",
    "posted_date": "published",
}


def parse_workday_url(url: str) -> Optional[Tuple[str, str, str]]:
    """
    Parse a Workday careers URL into its components.

    Uses the Workday pattern from platform_patterns.py (single source of truth).

    Args:
        url: Workday careers page URL

    Returns:
        Tuple of (tenant, wd_instance, site_id) or None if not a valid Workday URL
    """
    result = match_platform(url)
    if not result:
        return None

    pattern, groups = result
    if pattern.name != "workday":
        return None

    tenant = groups.get("tenant")
    wd_instance = groups.get("wd_instance")
    site_id = groups.get("site_id")

    if not tenant or not wd_instance or not site_id:
        return None

    return tenant, wd_instance, site_id


def expand_config(source_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Expand a minimal config into a full scraper config.

    For new sources, configs should already be complete (url, fields, etc.).
    This function provides backwards compatibility for legacy minimal configs.

    Args:
        source_type: The scraping method (api, rss, html)
        config: The config_json from the database

    Returns:
        Full config ready for GenericScraper with 'type' derived from source_type
    """
    # Auto-correct source_type when URL matches a known platform with a different
    # config_type.  This catches the #1 root cause of broken sources: API URLs
    # (e.g. boards-api.greenhouse.io) stored with source_type="html".
    url = config.get("url", "")
    if url:
        platform_result = match_platform(url)
        if platform_result:
            pattern, _groups = platform_result
            detected_type = pattern.config_type
            normalized_input = normalize_source_type(source_type)
            if detected_type != normalized_input:
                _logger.warning(
                    "Source type mismatch: source_type='%s' but URL matches "
                    "platform '%s' (config_type='%s'). Auto-correcting.",
                    source_type,
                    pattern.name,
                    detected_type,
                )
                source_type = detected_type

    # If config already has url and fields, enrich with standard fields for known
    # platforms (detected by URL pattern). This ensures sources created by the ATS
    # prober or AI agent always get the full field set from platform_patterns.
    if "url" in config and "fields" in config:
        expanded = {**config}
        expanded["type"] = normalize_source_type(expanded.get("type", source_type))
        # Use match_platform() as single source of truth for field enrichment
        platform_result = match_platform(expanded.get("url", ""))
        if platform_result:
            pattern, _groups = platform_result
            for key, value in pattern.fields.items():
                if key not in expanded["fields"]:
                    expanded["fields"][key] = value
            if pattern.follow_detail:
                expanded["follow_detail"] = True
        return expanded

    # Normalize source_type to scraping method before dispatch
    source_type = normalize_source_type(source_type)

    if source_type == "rss":
        return _expand_rss(config)
    elif source_type == "html":
        return _expand_html(config)
    elif source_type == "api":
        return _expand_api(config)
    else:
        # Fallback for any type _normalize_source_type doesn't cover
        return _expand_api(config)


# Map ATS vendor names and other non-standard type values back to the three
# valid source types: api, rss, html.  This is the single source of truth —
# all modules that need type normalization should call normalize_source_type().
_SOURCE_TYPE_MAP: Dict[str, str] = {
    "json": "api",
    "workday": "api",
    "icims": "api",
    "rippling": "api",
    "greenhouse": "api",
    "ashby": "api",
    "lever": "api",
    "smartrecruiters": "api",
    "breezy": "api",
    "jobvite": "api",
    "recruitee": "api",
    "workable": "api",
    "successfactors": "api",
    "oracle": "api",
    "taleo": "api",
    "company-page": "html",
    "company_page": "html",
}

_VALID_SOURCE_TYPES = frozenset(("api", "rss", "html"))

_logger = __import__("logging").getLogger(__name__)


def normalize_source_type(source_type: str) -> str:
    """Normalize a source type string to one of the valid values: api, rss, html.

    Handles ATS vendor names (workday, icims, lever, …), legacy aliases
    (company-page, json), and unknown values (defaults to api).
    """
    normalized = source_type.lower().strip()
    if normalized in _VALID_SOURCE_TYPES:
        return normalized
    mapped = _SOURCE_TYPE_MAP.get(normalized)
    if mapped:
        _logger.info("Normalized source type '%s' -> '%s'", source_type, mapped)
        return mapped
    # Unknown type — default to api since most ATS platforms are API-based
    _logger.warning("Unknown source type '%s', defaulting to 'api'", source_type)
    return "api"


def _expand_greenhouse(config: Dict[str, Any]) -> Dict[str, Any]:
    """Expand greenhouse config from board_token to full API config."""
    # If already has full config (type, url, fields), enrich with standard fields
    if "url" in config and "fields" in config:
        expanded = {**config}
        expanded["type"] = "api"
        # Merge standard Greenhouse fields into existing fields (don't overwrite)
        for key, value in GREENHOUSE_FIELDS.items():
            if key not in expanded["fields"]:
                expanded["fields"][key] = value
        return expanded

    # Simple config with just board_token
    board_token = config.get("board_token", "")
    if not board_token:
        raise ValueError("Greenhouse source missing board_token in config")

    return {
        "type": "api",
        "url": f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true",
        "response_path": "jobs",
        "fields": GREENHOUSE_FIELDS.copy(),
    }


def _expand_ashby(config: Dict[str, Any]) -> Dict[str, Any]:
    """Expand ashby config from board_name to full API config."""
    # If already has full config (type, url, fields), enrich with standard fields
    if "url" in config and "fields" in config:
        expanded = {**config}
        expanded["type"] = "api"
        # Merge standard Ashby fields into existing fields (don't overwrite)
        for key, value in ASHBY_FIELDS.items():
            if key not in expanded["fields"]:
                expanded["fields"][key] = value
        return expanded

    # Simple config with just board_name
    board_name = config.get("board_name", "")
    if not board_name:
        raise ValueError("Ashby source missing board_name in config")

    expanded = {
        "type": "api",
        "url": f"https://api.ashbyhq.com/posting-api/job-board/{board_name}?includeCompensation=true",
        "response_path": "jobs",
        "fields": ASHBY_FIELDS.copy(),
    }

    # Include salary fields from platform pattern
    if _ASHBY_PATTERN.salary_min_field:
        expanded["salary_min_field"] = _ASHBY_PATTERN.salary_min_field
    if _ASHBY_PATTERN.salary_max_field:
        expanded["salary_max_field"] = _ASHBY_PATTERN.salary_max_field

    return expanded


def _expand_workday(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Expand workday config from careers_url to full API config.

    Workday uses a POST API endpoint that can be derived from the careers page URL.

    URL Pattern: https://{tenant}.{wd_instance}.myworkdayjobs.com/{site_id}
    API Pattern: POST https://{tenant}.{wd_instance}.myworkdayjobs.com/wday/cxs/{tenant}/{site_id}/jobs

    The API returns job listings with relative URLs that need to be combined with
    the base careers URL to form full job URLs.
    """
    # If already has full config (type, url, fields), enrich with standard fields
    if "url" in config and "fields" in config:
        expanded = {**config}
        expanded["type"] = "api"
        # Merge standard Workday fields into existing fields (don't overwrite)
        for key, value in WORKDAY_FIELDS.items():
            if key not in expanded["fields"]:
                expanded["fields"][key] = value
        expanded["follow_detail"] = True
        return expanded

    # Extract careers URL
    careers_url = config.get("careers_url", "")
    if not careers_url:
        raise ValueError("Workday source missing careers_url in config")

    # Parse the URL into components
    parsed = parse_workday_url(careers_url)
    if not parsed:
        raise ValueError(f"Invalid Workday careers URL format: {careers_url}")

    tenant, wd_instance, site_id = parsed

    # Construct the API URL
    api_url = f"https://{tenant}.{wd_instance}.myworkdayjobs.com/wday/cxs/{tenant}/{site_id}/jobs"

    # Construct the base URL for job links
    base_url = f"https://{tenant}.{wd_instance}.myworkdayjobs.com/{site_id}"

    return {
        "type": "api",
        "url": api_url,
        "method": "POST",
        "post_body": {"limit": 20, "offset": 0},
        "response_path": "jobPostings",
        "fields": WORKDAY_FIELDS.copy(),
        "base_url": base_url,
        "follow_detail": True,
    }


def _expand_rss(config: Dict[str, Any]) -> Dict[str, Any]:
    """Expand RSS config with standard field mappings."""
    url = config.get("url", "")
    if not url:
        raise ValueError("RSS source missing url in config")

    # If already has full config, use it
    fields = config.get("fields")
    if fields:
        return {"type": "rss", "url": url, "fields": fields}

    # Legacy config with separate field names
    return {
        "type": "rss",
        "url": url,
        "fields": {
            "title": config.get("title_field", "title"),
            "description": config.get("description_field", "summary"),
            "url": config.get("link_field", "link"),
            "posted_date": "published",
        },
    }


def _expand_api(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Expand API config, auto-detecting vendor from config contents.

    Detection order:
    1. board_token → Greenhouse
    2. board_name → Ashby
    3. careers_url matching Workday pattern → Workday
    4. url + fields → Generic API (full config)
    """
    # Auto-detect vendor from config contents

    # Greenhouse: has board_token
    if "board_token" in config:
        return _expand_greenhouse(config)

    # Ashby: has board_name
    if "board_name" in config:
        return _expand_ashby(config)

    # Workday: has careers_url matching Workday pattern
    if "careers_url" in config:
        careers_url = config.get("careers_url", "")
        if parse_workday_url(careers_url):
            return _expand_workday(config)

    # Generic API: should have url
    if "url" not in config:
        # Check for legacy base_url
        if "base_url" in config:
            config = {**config, "url": config.pop("base_url")}
        else:
            raise ValueError(
                "API source config must have one of: board_token (Greenhouse), "
                "board_name (Ashby), careers_url (Workday), or url (generic API)"
            )

    expanded = {"type": "api", **config}

    # Ensure fields exist
    if "fields" not in expanded:
        expanded["fields"] = {"title": "title", "url": "url"}

    return expanded


def _expand_html(config: Dict[str, Any]) -> Dict[str, Any]:
    """Expand HTML/company-page config."""
    # Check if it's actually an API config masquerading as company-page
    if config.get("type") == "api" or "api_endpoint" in config:
        url = config.get("url") or config.get("api_endpoint", "")
        if not url:
            raise ValueError("HTML source missing url in config")
        return {
            "type": "api",
            "url": url,
            "response_path": config.get("response_path", ""),
            "fields": config.get("fields", {"title": "title", "url": "url"}),
        }

    # True HTML scraper config
    if config.get("type") == "html" or "job_selector" in config:
        url = config.get("url", "")
        if not url:
            raise ValueError("HTML source missing url in config")
        expanded = {
            "type": "html",
            "url": url,
            "job_selector": config.get("job_selector", ""),
            "fields": config.get("fields", {}),
            "company_name": config.get("company_name", ""),
        }
        # Preserve JS rendering settings for Playwright
        for key in ("requires_js", "render_wait_for", "render_timeout_ms"):
            if key in config:
                expanded[key] = config[key]
        return expanded

    # Unknown format - try to infer
    raise ValueError(f"Cannot expand company-page config: {config}")
