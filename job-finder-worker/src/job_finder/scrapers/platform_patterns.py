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
    # Whether this platform requires auth (creates disabled stub)
    auth_required: bool = False
    # Config type: api | rss | html
    config_type: str = "api"
    # Salary field paths (for structured compensation data)
    salary_min_field: str = ""
    salary_max_field: str = ""


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
            "employment_type": "employmentType",
            "is_remote": "isRemote",
            "department": "department",
            "team": "team",
        },
        salary_min_field="compensation.summaryComponents[compensationType=Salary].minValue",
        salary_max_field="compensation.summaryComponents[compensationType=Salary].maxValue",
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
            "employment_type": "employmentType",
            "is_remote": "isRemote",
            "department": "department",
            "team": "team",
        },
        salary_min_field="compensation.summaryComponents[compensationType=Salary].minValue",
        salary_max_field="compensation.summaryComponents[compensationType=Salary].maxValue",
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
    PlatformPattern(
        name="remotive_api",
        url_pattern=r"remotive\.(?:com|io)",
        api_url_template="https://remotive.com/api/remote-jobs",
        response_path="jobs",
        fields={
            "title": "title",
            "company": "company_name",
            "location": "candidate_required_location",
            "description": "description",
            "url": "url",
            "posted_date": "publication_date",
        },
        validation_key="jobs",
    ),
    PlatformPattern(
        name="remoteok_api",
        url_pattern=r"remoteok\.(?:io|com)",
        api_url_template="https://remoteok.com/api",
        response_path="",  # array of jobs
        fields={
            "title": "position",
            "company": "company",
            "location": "location",
            "description": "description",
            "url": "url",
            "posted_date": "date",
        },
        validation_key="",  # validate list
        headers={"Accept": "application/json"},
    ),
    PlatformPattern(
        name="monster_rss",
        url_pattern=r"monster\.com/jobs/rss\.aspx(?P<query>.*)",
        api_url_template="https://www.monster.com/jobs/rss.aspx{query}",
        response_path="items",
        fields={
            "title": "title",
            "url": "link",
            "description": "description",
            "posted_date": "pubDate",
        },
        validation_key="items",
        config_type="rss",
    ),
    PlatformPattern(
        name="indeed_partner_api",
        url_pattern=r"apis\.indeed\.com",
        api_url_template="https://apis.indeed.com/graphql",
        method="POST",
        post_body_template={},
        response_path="data.jobs",
        fields={
            "title": "title",
            "company": "company",
            "location": "location",
            "description": "description",
            "url": "jobUrl",
        },
        headers={"Content-Type": "application/json"},
        validation_key="data",
        auth_required=True,
    ),
    PlatformPattern(
        name="indeed_rss",
        url_pattern=r"https?://(?P<domain>[^/]*indeed\.[^/]+)/rss(?P<query>.*)",
        api_url_template="https://{domain}/rss{query}",
        response_path="items",
        fields={
            "title": "title",
            "url": "link",
            "description": "description",
            "posted_date": "pubDate",
        },
        validation_key="items",
        config_type="rss",
    ),
    PlatformPattern(
        name="linkedin_stub",
        url_pattern=r"linkedin\.com",
        api_url_template="https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search",
        response_path="",  # returns HTML fragments; treat as auth/anti-Bot sensitive
        fields={
            "title": "title",
            "url": "url",
            "description": "description",
        },
        headers={"User-Agent": "Mozilla/5.0"},
        validation_key="",  # will likely fail without params; flagged auth_required
        auth_required=True,
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
    original_url: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a source config from a matched platform pattern.

    Args:
        pattern: Matched platform pattern
        groups: Extracted groups from URL regex

    Returns:
        Source config dictionary
    """
    template_kwargs = dict(groups)
    if original_url:
        template_kwargs.setdefault("original_url", original_url)

    config: Dict[str, Any] = {
        "type": pattern.config_type,
        "url": pattern.api_url_template.format(**template_kwargs),
        "fields": pattern.fields.copy(),
    }

    if pattern.config_type != "rss":
        config["response_path"] = pattern.response_path

    if pattern.auth_required:
        config["auth_required"] = True

    if pattern.method != "GET" and pattern.config_type == "api":
        config["method"] = pattern.method

    if pattern.post_body_template and pattern.config_type == "api":
        config["post_body"] = pattern.post_body_template.copy()

    if pattern.salary_min_field:
        config["salary_min_field"] = pattern.salary_min_field

    if pattern.salary_max_field:
        config["salary_max_field"] = pattern.salary_max_field

    if pattern.base_url_template:
        config["base_url"] = pattern.base_url_template.format(**groups)

    if pattern.headers:
        config["headers"] = pattern.headers.copy()

    return config
