"""
Data-driven platform pattern registry for source discovery.

This module defines URL patterns and their corresponding API configurations
without hardcoding vendor-specific logic. Each pattern includes:
- URL regex to match
- URL transformation rule (to convert HTML to API URLs)
- Default config template
- Validation callback

New platforms can be added by extending PLATFORM_PATTERNS without code changes.
"""

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class PlatformPattern:
    """
    Defines how to detect and configure a job board platform.

    This is a data structure - no vendor-specific logic should be in this class.
    """

    name: str
    # Regex pattern to match URLs (use named groups for extraction)
    url_pattern: str
    # Template for transforming matched URL to API URL
    # Uses {group_name} placeholders from url_pattern
    api_url_template: str
    # HTTP method for the API
    method: str = "GET"
    # POST body template (for POST APIs)
    post_body_template: Dict[str, Any] = field(default_factory=dict)
    # Path to jobs array in response
    response_path: str = "jobs"
    # Field mappings (standard field -> source field path)
    fields: Dict[str, str] = field(default_factory=dict)
    # Optional base URL template for relative job URLs
    base_url_template: str = ""
    # Headers to include in requests
    headers: Dict[str, str] = field(default_factory=dict)
    # Expected key in response to validate API works (e.g., "jobs")
    validation_key: str = "jobs"


# Platform patterns registry - add new platforms here, not in code
PLATFORM_PATTERNS: List[PlatformPattern] = [
    PlatformPattern(
        name="greenhouse_api",
        url_pattern=r"boards-api\.greenhouse\.io/v1/boards/(?P<board_token>[^/]+)/jobs",
        api_url_template="https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true",
        response_path="jobs",
        fields={
            "title": "title",
            "location": "location.name",
            "description": "content",
            "url": "absolute_url",
            "posted_date": "updated_at",
        },
        validation_key="jobs",
    ),
    PlatformPattern(
        name="greenhouse_html",
        # Match jobs.greenhouse.io/company or boards.greenhouse.io/company
        url_pattern=r"(?:jobs|boards)\.greenhouse\.io/(?P<board_token>[^/?#]+)",
        api_url_template="https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true",
        response_path="jobs",
        fields={
            "title": "title",
            "location": "location.name",
            "description": "content",
            "url": "absolute_url",
            "posted_date": "updated_at",
        },
        validation_key="jobs",
    ),
    PlatformPattern(
        name="ashby_api",
        url_pattern=r"api\.ashbyhq\.com/posting-api/job-board/(?P<board_name>[^/?#]+)",
        api_url_template="https://api.ashbyhq.com/posting-api/job-board/{board_name}?includeCompensation=true",
        response_path="jobs",
        fields={
            "title": "title",
            "location": "location",
            "description": "descriptionHtml",
            "url": "jobUrl",
            "posted_date": "publishedAt",
        },
        validation_key="jobs",
    ),
    PlatformPattern(
        name="ashby_html",
        # Match jobs.ashbyhq.com/company
        url_pattern=r"jobs\.ashbyhq\.com/(?P<board_name>[^/?#]+)",
        api_url_template="https://api.ashbyhq.com/posting-api/job-board/{board_name}?includeCompensation=true",
        response_path="jobs",
        fields={
            "title": "title",
            "location": "location",
            "description": "descriptionHtml",
            "url": "jobUrl",
            "posted_date": "publishedAt",
        },
        validation_key="jobs",
    ),
    PlatformPattern(
        name="workday",
        # Match tenant.wdX.myworkdayjobs.com/site_id
        url_pattern=r"https?://(?P<tenant>[^.]+)\.(?P<wd_instance>wd\d+)\.myworkdayjobs\.com/(?P<site_id>[^/?#]+)",
        api_url_template="https://{tenant}.{wd_instance}.myworkdayjobs.com/wday/cxs/{tenant}/{site_id}/jobs",
        method="POST",
        post_body_template={"limit": 20, "offset": 0},
        response_path="jobPostings",
        base_url_template="https://{tenant}.{wd_instance}.myworkdayjobs.com/{site_id}",
        fields={
            "title": "title",
            "location": "locationsText",
            "url": "externalPath",
            "posted_date": "postedOn",
        },
        headers={"Content-Type": "application/json"},
        validation_key="jobPostings",
    ),
    PlatformPattern(
        name="lever",
        # Match jobs.lever.co/company
        url_pattern=r"jobs\.lever\.co/(?P<company>[^/?#]+)",
        api_url_template="https://api.lever.co/v0/postings/{company}?mode=json",
        response_path="",  # Lever returns array directly
        fields={
            "title": "text",
            "location": "categories.location",
            "description": "descriptionPlain",
            "url": "hostedUrl",
            "posted_date": "createdAt",
        },
        validation_key="",  # Array response, check for list
    ),
]


def match_platform(url: str) -> Optional[Tuple[PlatformPattern, Dict[str, str]]]:
    """
    Match a URL against known platform patterns.

    Args:
        url: URL to match

    Returns:
        Tuple of (matched pattern, extracted groups) or None
    """
    for pattern in PLATFORM_PATTERNS:
        match = re.search(pattern.url_pattern, url)
        if match:
            return pattern, match.groupdict()
    return None


def build_config_from_pattern(
    pattern: PlatformPattern,
    groups: Dict[str, str],
) -> Dict[str, Any]:
    """
    Build a source config from a matched platform pattern.

    Args:
        pattern: Matched platform pattern
        groups: Extracted groups from URL regex

    Returns:
        Source config dictionary
    """
    config: Dict[str, Any] = {
        "type": "api",
        "url": pattern.api_url_template.format(**groups),
        "response_path": pattern.response_path,
        "fields": pattern.fields.copy(),
    }

    if pattern.method != "GET":
        config["method"] = pattern.method

    if pattern.post_body_template:
        config["post_body"] = pattern.post_body_template.copy()

    if pattern.base_url_template:
        config["base_url"] = pattern.base_url_template.format(**groups)

    if pattern.headers:
        config["headers"] = pattern.headers.copy()

    return config
