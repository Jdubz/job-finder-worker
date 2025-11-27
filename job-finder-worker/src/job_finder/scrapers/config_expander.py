"""
Config expander for job sources.

Converts simple source configs into full scraper configs based on source_type.
This allows storing minimal config in the database while supporting full scraping.

The source_type column is the authoritative indicator of what type of source this is.
Config shapes by source_type:
- greenhouse: {"board_token": "xxx"} - expands to full Greenhouse API config
- rss: {"url": "xxx"} - expands to RSS config with standard field mappings
- api: Full config with url, response_path, fields
- html: Full config with url, job_selector, fields

The config_json should NOT contain a "type" field - that's redundant with source_type.
"""

from typing import Any, Dict

# Standard Greenhouse API field mappings
GREENHOUSE_FIELDS = {
    "title": "title",
    "location": "location.name",
    "description": "content",
    "url": "absolute_url",
    "posted_date": "updated_at",
}

# Standard RSS field mappings
RSS_FIELDS = {
    "title": "title",
    "description": "summary",
    "url": "link",
    "posted_date": "published",
}


def expand_config(source_type: str, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Expand a minimal config into a full scraper config.

    Args:
        source_type: The source type from the database (greenhouse, rss, api, html)
        config: The config_json from the database

    Returns:
        Full config ready for GenericScraper with 'type' derived from source_type
    """
    if source_type == "greenhouse":
        return _expand_greenhouse(config)
    elif source_type == "rss":
        return _expand_rss(config)
    elif source_type == "api":
        return _expand_api(config)
    elif source_type in ("html", "company-page"):
        return _expand_html(config)
    else:
        # Unknown type - return as-is with type field
        return {"type": "api", **config}


def _expand_greenhouse(config: Dict[str, Any]) -> Dict[str, Any]:
    """Expand greenhouse config from board_token to full API config."""
    # If already has full config (type, url, fields), return as-is
    if "url" in config and "fields" in config:
        expanded = {**config}
        # Ensure type is set for GenericScraper
        expanded["type"] = "api"
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
    """Expand generic API config."""
    # API configs should already be complete
    if "url" not in config:
        # Check for legacy base_url
        if "base_url" in config:
            config = {**config, "url": config.pop("base_url")}
        else:
            raise ValueError("API source missing url in config")

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
        return {
            "type": "html",
            "url": url,
            "job_selector": config.get("job_selector", ""),
            "fields": config.get("fields", {}),
            "company_name": config.get("company_name", ""),
        }

    # Unknown format - try to infer
    raise ValueError(f"Cannot expand company-page config: {config}")
