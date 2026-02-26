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
    # CSS selector for HTML job listings (config_type == "html")
    job_selector: str = ""
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
    # Whether the scraper should follow job detail links for enrichment
    follow_detail: bool = False
    # Whether this is a remote-only job board (all jobs treated as remote)
    is_remote_source: bool = False
    # Company extraction method: "" | "from_title" | "from_description"
    # "from_title" - parse "Company: Job Title" format (common for aggregators)
    company_extraction: str = ""
    # Query parameter name for server-side company filtering (e.g., "company_name" for Remotive)
    # When set, the scraper will append ?{param}={company} to the URL
    company_filter_param: str = ""
    # Whether this platform hosts jobs from MANY companies in a single feed.
    # True for aggregators like Remotive, RemoteOK, WeWorkRemotely, BuiltIn.
    # False (default) for single-company platforms like Greenhouse, Lever, Ashby.
    # Used by scrape_runner to decide whether company_filter should be applied.
    is_multi_company: bool = False


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
            "first_published": "first_published",
            "requisition_id": "requisition_id",
            "departments": "departments",
            "offices": "offices",
            "metadata": "metadata",
        },
        validation_key="jobs",
    ),
    PlatformPattern(
        name="greenhouse_html",
        # Match various Greenhouse board URLs:
        # - jobs.greenhouse.io/company
        # - boards.greenhouse.io/company
        # - job-boards.greenhouse.io/company
        # - job-boards.eu.greenhouse.io/company (regional)
        # Regional codes can be 2+ chars (eu, uk, etc.)
        url_pattern=r"(?:jobs|boards|job-boards)(?:\.[a-z]{2,})?\.greenhouse\.io/(?P<board_token>[^/?#]+)",
        api_url_template="https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true",
        response_path="jobs",
        fields={
            "title": "title",
            "location": "location.name",
            "description": "content",
            "url": "absolute_url",
            "posted_date": "updated_at",
            "first_published": "first_published",
            "requisition_id": "requisition_id",
            "departments": "departments",
            "offices": "offices",
            "metadata": "metadata",
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
        # Match tenant.wdX.myworkdayjobs.com/[lang]/site_id
        # Language prefix (e.g., en-US/, fr-FR/) is optional
        # Uses strict format: lowercase lang (2 chars) + optional uppercase country (2 chars)
        url_pattern=r"https?://(?P<tenant>[^.]+)\.(?P<wd_instance>wd\d+)\.myworkdayjobs\.com/(?:[a-z]{2}(?:-[A-Z]{2})?/)?(?P<site_id>[^/?#]+)",
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
        follow_detail=True,
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
            "category": "category",
            "tags": "tags",
            "job_type": "job_type",
            "salary": "salary",
        },
        validation_key="jobs",
        is_remote_source=True,
        company_filter_param="company_name",  # Remotive supports ?company_name= for server-side filtering
        is_multi_company=True,
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
            "tags": "tags",  # Tech stack tags for technology filtering
        },
        salary_min_field="salary_min",
        salary_max_field="salary_max",
        validation_key="",  # validate list
        headers={"Accept": "application/json"},
        is_remote_source=True,
        is_multi_company=True,
    ),
    PlatformPattern(
        name="jobicy_api",
        url_pattern=r"jobicy\.com",
        api_url_template="https://jobicy.com/api/v2/remote-jobs",
        response_path="jobs",
        fields={
            "title": "jobTitle",
            "company": "companyName",
            "location": "jobGeo",
            "description": "jobDescription",
            "url": "url",
            "posted_date": "pubDate",
            "job_level": "jobLevel",  # Senior/Midweight/Junior/Any
            "job_type": "jobType",  # ["Full-Time"], ["Part-Time"], etc.
            "industry": "jobIndustry",
        },
        salary_min_field="salaryMin",
        salary_max_field="salaryMax",
        validation_key="jobs",
        is_remote_source=True,
        is_multi_company=True,
    ),
    PlatformPattern(
        name="smartrecruiters_api",
        # Match SmartRecruiters hosted career sites
        url_pattern=r"(?:(?:api|www)\.)?smartrecruiters\.com/(?:v1/companies/)?(?P<company>[^/?#]+)",
        api_url_template="https://api.smartrecruiters.com/v1/companies/{company}/postings?limit=200",
        response_path="content",
        fields={
            "title": "name",
            "company": "company.name",
            "location": "location.fullLocation",
            "url": "ref",
            "posted_date": "releasedDate",
            "job_type": "typeOfEmployment.label",
            "department": "department.label",
            # SmartRecruiters stores HTML in jobAd.sections.jobDescription.text.
            "description": "jobAd.sections.jobDescription.text",
        },
        validation_key="content",
        follow_detail=True,
    ),
    PlatformPattern(
        name="avature_rss",
        # Avature career portals expose an RSS feed via SearchJobs/feed
        url_pattern=r"(?P<subdomain>[^/]+)\.avature\.net/(?P<lang>[a-zA-Z_]+)/(?P<site>[^/]+)/SearchJobs",
        api_url_template="https://{subdomain}.avature.net/{lang}/{site}/SearchJobs/feed/?jobRecordsPerPage=200",
        response_path="items",
        fields={
            "title": "title",
            "url": "link",
            "description": "description",
            "posted_date": "pubDate",
        },
        validation_key="items",
        config_type="rss",
        is_multi_company=True,
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
        is_multi_company=True,
    ),
    PlatformPattern(
        name="weworkremotely_rss",
        # Match weworkremotely.com - uses RSS feed for all jobs
        # Title format: "Company Name: Job Title" - extracted via company_extraction
        url_pattern=r"weworkremotely\.com",
        api_url_template="https://weworkremotely.com/remote-jobs.rss",
        response_path="items",
        fields={
            "title": "title",
            "location": "region",
            "description": "description",
            "url": "link",
            "posted_date": "pubDate",
            "category": "category",
            "job_type": "type",
        },
        validation_key="items",
        config_type="rss",
        is_remote_source=True,
        company_extraction="from_title",
        follow_detail=True,
        is_multi_company=True,
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
        is_multi_company=True,
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
        is_multi_company=True,
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
    PlatformPattern(
        name="builtin_html",
        # Match builtin.com/jobs or builtin.com/company/xxx/jobs
        url_pattern=r"builtin\.com/(?:jobs|company/[^/]+/jobs)",
        api_url_template="https://builtin.com/jobs",
        response_path="",
        fields={
            "title": "a[data-id=job-card-title]",
            "company": "div.left-side-tile-item-1 a",
            "url": "a[data-id=job-card-title]@href",
        },
        job_selector="[data-id=job-card]",
        config_type="html",
        base_url_template="https://builtin.com",
        validation_key="",
        follow_detail=True,
        is_multi_company=True,
    ),
    PlatformPattern(
        name="breezy_api",
        # Match company.breezy.hr career pages
        # API endpoint: {company}.breezy.hr/json
        url_pattern=r"https?://(?P<company>[^.]+)\.breezy\.hr",
        api_url_template="https://{company}.breezy.hr/json",
        response_path="",  # Returns array directly
        fields={
            "title": "name",
            "location": "location.name",
            "url": "url",
            "posted_date": "published_date",
            "department": "department",
            "job_type": "type.name",
        },
        validation_key="",  # Array response
    ),
    PlatformPattern(
        name="workable_api",
        # Match apply.workable.com/company career pages
        # API endpoint: apply.workable.com/api/v1/widget/accounts/{company}
        url_pattern=r"apply\.workable\.com/(?:api/v1/widget/accounts/)?(?P<company>[^/?#]+)",
        api_url_template="https://apply.workable.com/api/v1/widget/accounts/{company}",
        response_path="jobs",
        fields={
            "title": "title",
            "location": "location",
            "url": "url",
            "department": "department",
        },
        validation_key="jobs",
    ),
    PlatformPattern(
        name="recruitee_api",
        # Match company.recruitee.com career pages
        # API endpoint: {company}.recruitee.com/api/offers
        url_pattern=r"https?://(?P<company>[^.]+)\.recruitee\.com",
        api_url_template="https://{company}.recruitee.com/api/offers",
        response_path="offers",
        fields={
            "title": "title",
            "location": "location",
            "description": "description",
            "url": "careers_url",
            "posted_date": "published_at",
            "department": "department",
        },
        validation_key="offers",
    ),
    PlatformPattern(
        name="jazzhr_stub",
        # Match JazzHR/ApplyToJob career pages (requires API key)
        # These return HTML pages that require JS rendering
        url_pattern=r"https?://(?P<company>[^.]+)\.applytojob\.com",
        api_url_template="https://{company}.applytojob.com/apply/",
        response_path="",
        fields={
            "title": "title",
            "url": "url",
        },
        validation_key="",
        auth_required=True,  # JazzHR API requires authentication
    ),
    PlatformPattern(
        name="teamtailor_html",
        # Match {company}.teamtailor.com or {company}.{region}.teamtailor.com
        url_pattern=r"https?://(?P<company>[^.]+)(?:\.[a-z]{2,4})?\.teamtailor\.com",
        api_url_template="https://{company}.teamtailor.com/jobs",
        response_path="",
        fields={
            "title": "a[href*='/jobs/']",
            "url": "a[href*='/jobs/']@href",
            "location": ".mt-1.text-md span:nth-child(3)",
            "department": ".mt-1.text-md span:first-child",
        },
        job_selector="li.w-full:has(a[href*='/jobs/'])",
        config_type="html",
        validation_key="",
    ),
    PlatformPattern(
        name="personio_xml",
        # Match {company}.jobs.personio.{tld} (both .com and .de)
        url_pattern=r"https?://(?P<company>[^.]+)\.jobs\.personio\.(?P<tld>com|de)",
        api_url_template="https://{company}.jobs.personio.{tld}/xml",
        response_path="",
        fields={
            "title": "name",
            "location": "office",
            "department": "department",
            "url": "id",  # Will need URL construction in post-processing
        },
        job_selector="position",
        config_type="html",  # Parsed as HTML (BS4 handles XML too)
        base_url_template="https://{company}.jobs.personio.{tld}/job/",
        validation_key="",
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


def is_single_company_platform(url: str) -> bool:
    """
    Check if a URL belongs to a single-company platform.

    Single-company platforms (Lever, Ashby, Greenhouse, Breezy, etc.) host
    one company's jobs per board/URL.  Multi-company aggregators (Remotive,
    WeWorkRemotely, BuiltIn, etc.) host jobs from many companies in one feed.

    Used by the scrape runner to decide whether company_filter should be
    applied: single-company platforms don't include a per-job company field,
    so filtering by company name would incorrectly reject every job.

    Args:
        url: Source URL to check

    Returns:
        True if the URL belongs to a known single-company platform
    """
    result = match_platform(url)
    if not result:
        return False
    pattern, _ = result
    return not pattern.is_multi_company


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

    if pattern.job_selector:
        config["job_selector"] = pattern.job_selector

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

    if pattern.follow_detail:
        config["follow_detail"] = True

    if pattern.is_remote_source:
        config["is_remote_source"] = True

    if pattern.company_extraction:
        config["company_extraction"] = pattern.company_extraction

    if pattern.company_filter_param:
        config["company_filter_param"] = pattern.company_filter_param

    return config
