"""Source configuration for generic scraper."""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional

DEFAULT_RENDER_TIMEOUT_MS = 20_000


@dataclass
class SourceConfig:
    """
    Configuration for a job source.

    Defines how to fetch and parse jobs from any source type (API, RSS, HTML).

    Attributes:
        type: Source type - "api" | "rss" | "html"
        url: Endpoint URL, RSS feed URL, or page URL
        fields: Mapping of job fields to extraction paths
                For api/rss: dot notation like "location.name"
                For html: CSS selectors like ".job-title" or "a@href" for attributes
        response_path: Path to jobs array in API response (e.g., "jobs", "data.results", "[1:]")
        job_selector: CSS selector for job items in HTML (e.g., ".job-listing")
        company_name: Override company name for all jobs from this source
        headers: Custom HTTP headers for requests
        api_key: API key for authenticated sources
        auth_type: Authentication type - "header" | "query" | "bearer"
        auth_param: Header name or query param name for auth (e.g., "X-API-Key", "api_key")
        salary_min_field: Path to minimum salary field in response
        salary_max_field: Path to maximum salary field in response
        requires_js: If True, fetch page via Playwright renderer
        render_wait_for: Optional CSS selector to wait for after JS load
        render_timeout_ms: Custom timeout for JS rendering
    """

    type: str  # "api" | "rss" | "html"
    url: str

    # Field mappings - path to each field in response
    fields: Dict[str, str] = field(default_factory=dict)

    # Optional
    response_path: str = ""
    job_selector: str = ""
    company_name: str = ""
    headers: Dict[str, str] = field(default_factory=dict)

    # Authentication
    api_key: str = ""
    auth_type: str = ""  # "header" | "query" | "bearer"
    auth_param: str = ""

    # Salary handling
    salary_min_field: str = ""
    salary_max_field: str = ""

    # HTTP method and body (for POST APIs like Workday)
    method: str = "GET"  # "GET" | "POST"
    post_body: Dict[str, Any] = field(default_factory=dict)

    # Base URL for constructing full URLs from relative paths (e.g., Workday)
    base_url: str = ""

    # Discovery hints
    disabled_notes: str = ""

    # Company extraction strategy
    # "from_title" - parse "Company: Job Title" format (common for aggregators like WeWorkRemotely)
    # "from_description" - extract company website URL from description HTML
    company_extraction: str = ""  # "" | "from_title" | "from_description"

    # Optional: fetch each job's detail page to enrich fields (e.g., description/location)
    follow_detail: bool = False

    # Remote source flag - if True, all jobs from this source are assumed remote
    # Use for remote-only job boards like RemoteOK, WeWorkRemotely, Remotive, etc.
    is_remote_source: bool = False

    # Company filter - only keep jobs from companies matching these names (case-insensitive)
    # Used for company-specific sources on aggregator feeds (e.g., "Lemon.io" on WeWorkRemotely)
    # Supports fuzzy matching: "Lemon.io" matches "Lemon.io", "Lemon", "lemon.io", etc.
    company_filter: str = ""
    # Query parameter name for server-side company filtering (e.g., "company_name" for Remotive)
    # When set along with company_filter, appends ?{param}={company} to the URL
    company_filter_param: str = ""

    # JS rendering
    requires_js: bool = False
    render_wait_for: str = ""
    render_timeout_ms: int = DEFAULT_RENDER_TIMEOUT_MS

    # Pagination
    pagination_type: str = ""  # "" | "page_num" | "offset" | "cursor" | "url_template"
    pagination_param: str = ""  # query/body param name (e.g. "page", "start", "pageToken")
    page_size: int = 0  # items per page (offset calc + stop detection; 0=no stop-on-undercount)
    max_pages: int = 50  # safety cap
    page_start: int = 1  # first page number (page_num/url_template types)
    cursor_response_path: str = ""  # dot-path to next cursor in JSON response
    cursor_send_in: str = "body"  # "body" | "query" — where to inject cursor value

    # Embedded JSON extraction for HTML sources
    embedded_json_selector: str = ""  # CSS selector for elements containing JSON text

    @classmethod
    def from_dict(cls, data: Dict[str, Any], company_name: Optional[str] = None) -> "SourceConfig":
        """
        Create SourceConfig from dictionary.

        Args:
            data: Configuration dictionary
            company_name: Optional company name override

        Returns:
            SourceConfig instance
        """
        return cls(
            type=data.get("type", "api"),
            url=data.get("url", ""),
            fields=data.get("fields", {}),
            response_path=data.get("response_path", ""),
            job_selector=data.get("job_selector", ""),
            company_name=company_name or data.get("company_name", ""),
            headers=data.get("headers", {}),
            api_key=data.get("api_key", ""),
            auth_type=data.get("auth_type", ""),
            auth_param=data.get("auth_param", ""),
            salary_min_field=data.get("salary_min_field", ""),
            salary_max_field=data.get("salary_max_field", ""),
            method=data.get("method", "GET"),
            post_body=data.get("post_body", {}),
            base_url=data.get("base_url", ""),
            disabled_notes=data.get("disabled_notes", ""),
            company_extraction=data.get("company_extraction", ""),
            follow_detail=bool(data.get("follow_detail", False)),
            is_remote_source=bool(data.get("is_remote_source", False)),
            company_filter=data.get("company_filter", ""),
            company_filter_param=data.get("company_filter_param", ""),
            requires_js=bool(data.get("requires_js", False)),
            render_wait_for=data.get("render_wait_for", ""),
            render_timeout_ms=int(data.get("render_timeout_ms", DEFAULT_RENDER_TIMEOUT_MS)),
            pagination_type=data.get("pagination_type", ""),
            pagination_param=data.get("pagination_param", ""),
            page_size=int(data.get("page_size", 0)),
            max_pages=int(data.get("max_pages", 50)),
            page_start=int(data.get("page_start", 1)),
            cursor_response_path=data.get("cursor_response_path", ""),
            cursor_send_in=data.get("cursor_send_in", "body"),
            embedded_json_selector=data.get("embedded_json_selector", ""),
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        result: Dict[str, Any] = {
            "type": self.type,
            "url": self.url,
            "fields": self.fields,
        }

        # Only include non-empty optional fields
        if self.response_path:
            result["response_path"] = self.response_path
        if self.job_selector:
            result["job_selector"] = self.job_selector
        if self.company_name:
            result["company_name"] = self.company_name
        if self.headers:
            result["headers"] = self.headers
        if self.api_key:
            result["api_key"] = self.api_key
        if self.auth_type:
            result["auth_type"] = self.auth_type
        if self.auth_param:
            result["auth_param"] = self.auth_param
        if self.salary_min_field:
            result["salary_min_field"] = self.salary_min_field
        if self.salary_max_field:
            result["salary_max_field"] = self.salary_max_field
        if self.method and self.method != "GET":
            result["method"] = self.method
        if self.post_body:
            result["post_body"] = self.post_body
        if self.base_url:
            result["base_url"] = self.base_url
        if self.disabled_notes:
            result["disabled_notes"] = self.disabled_notes
        if self.company_extraction:
            result["company_extraction"] = self.company_extraction
        if self.follow_detail:
            result["follow_detail"] = self.follow_detail
        if self.is_remote_source:
            result["is_remote_source"] = self.is_remote_source
        if self.company_filter:
            result["company_filter"] = self.company_filter
        if self.company_filter_param:
            result["company_filter_param"] = self.company_filter_param
        if self.requires_js:
            result["requires_js"] = self.requires_js
        if self.render_wait_for:
            result["render_wait_for"] = self.render_wait_for
        if self.render_timeout_ms and self.render_timeout_ms != DEFAULT_RENDER_TIMEOUT_MS:
            result["render_timeout_ms"] = self.render_timeout_ms
        if self.pagination_type:
            result["pagination_type"] = self.pagination_type
        if self.pagination_param:
            result["pagination_param"] = self.pagination_param
        if self.page_size:
            result["page_size"] = self.page_size
        if self.max_pages != 50:
            result["max_pages"] = self.max_pages
        if self.page_start != 1:
            result["page_start"] = self.page_start
        if self.cursor_response_path:
            result["cursor_response_path"] = self.cursor_response_path
        if self.cursor_send_in and self.cursor_send_in != "body":
            result["cursor_send_in"] = self.cursor_send_in
        if self.embedded_json_selector:
            result["embedded_json_selector"] = self.embedded_json_selector

        return result

    def validate(self) -> None:
        """
        Validate configuration.

        Raises:
            ValueError: If configuration is invalid
        """
        if self.type not in ("api", "rss", "html"):
            raise ValueError(f"Invalid source type: {self.type}. Must be 'api', 'rss', or 'html'")

        if not self.url:
            raise ValueError("URL is required")

        if self.type == "html" and not self.job_selector and not self.embedded_json_selector:
            raise ValueError("job_selector or embedded_json_selector is required for HTML sources")

        if not self.fields:
            raise ValueError("fields mapping is required")

        if "title" not in self.fields or "url" not in self.fields:
            raise ValueError("fields must include at least 'title' and 'url'")

        if self.auth_type and self.auth_type not in ("header", "query", "bearer"):
            raise ValueError(
                f"Invalid auth_type: {self.auth_type}. Must be 'header', 'query', or 'bearer'"
            )

        if self.auth_type == "header" and not self.auth_param:
            raise ValueError("auth_param is required when auth_type is 'header'")

        if self.auth_type == "query" and not self.auth_param:
            raise ValueError("auth_param is required when auth_type is 'query'")

        if self.requires_js and self.type != "html":
            raise ValueError("requires_js is only supported for HTML sources")

        if self.render_timeout_ms and self.render_timeout_ms < 1_000:
            raise ValueError("render_timeout_ms must be at least 1000 ms")

        valid_pagination_types = ("", "page_num", "offset", "cursor", "url_template")
        if self.pagination_type and self.pagination_type not in valid_pagination_types:
            raise ValueError(
                f"Invalid pagination_type: {self.pagination_type}. "
                f"Must be one of {valid_pagination_types}"
            )

        if self.pagination_type and self.type not in ("api", "html"):
            raise ValueError(
                f"pagination_type '{self.pagination_type}' is not supported for source type "
                f"'{self.type}'. Only 'api' and 'html' sources support pagination"
            )

        if self.pagination_type in ("page_num", "offset", "cursor") and not self.pagination_param:
            raise ValueError(
                f"pagination_param is required when pagination_type is '{self.pagination_type}'"
            )

        if self.pagination_type == "cursor" and not self.cursor_response_path:
            raise ValueError("cursor_response_path is required when pagination_type is 'cursor'")

        if self.pagination_type == "offset" and self.page_size <= 0:
            raise ValueError("page_size must be greater than 0 when pagination_type is 'offset'")

        if self.pagination_type == "url_template":
            if "{page}" not in self.url and "{offset}" not in self.url:
                raise ValueError(
                    "URL must contain {page} or {offset} placeholder "
                    "when pagination_type is 'url_template'"
                )
            if "{offset}" in self.url and self.page_size <= 0:
                raise ValueError(
                    "page_size must be greater than 0 when pagination_type is 'url_template' "
                    "and URL contains an {offset} placeholder"
                )

        if self.cursor_send_in not in ("body", "query"):
            raise ValueError(
                f"Invalid cursor_send_in: {self.cursor_send_in}. Must be 'body' or 'query'"
            )

        if self.pagination_type and self.type == "html" and not self.embedded_json_selector:
            if not self.job_selector:
                raise ValueError("job_selector is required for paginated HTML sources")
