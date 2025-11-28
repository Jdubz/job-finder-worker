"""Source configuration for generic scraper."""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


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
    # Discovery/runtime hints (optional, backward compatible)
    validation_policy: str = "fail_on_empty"  # "fail_on_empty" | "allow_empty"
    content_strategy: str = ""  # e.g., "static_html", "embedded_json", "remote_api"
    disabled_notes: str = ""

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
            validation_policy=data.get("validation_policy", "fail_on_empty"),
            content_strategy=data.get("content_strategy", data.get("strategy", "")),
            disabled_notes=data.get("disabled_notes", ""),
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
        if self.validation_policy:
            result["validation_policy"] = self.validation_policy
        if self.content_strategy:
            result["content_strategy"] = self.content_strategy
        if self.disabled_notes:
            result["disabled_notes"] = self.disabled_notes

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

        if self.type == "html" and not self.job_selector:
            raise ValueError("job_selector is required for HTML sources")

        if not self.fields:
            raise ValueError("fields mapping is required")

        if "title" not in self.fields or "url" not in self.fields:
            raise ValueError("fields must include at least 'title' and 'url'")

        if self.validation_policy not in ("fail_on_empty", "allow_empty"):
            raise ValueError(
                f"Invalid validation_policy: {self.validation_policy}. "
                "Must be 'fail_on_empty' or 'allow_empty'"
            )

        if self.auth_type and self.auth_type not in ("header", "query", "bearer"):
            raise ValueError(
                f"Invalid auth_type: {self.auth_type}. Must be 'header', 'query', or 'bearer'"
            )

        if self.auth_type == "header" and not self.auth_param:
            raise ValueError("auth_param is required when auth_type is 'header'")

        if self.auth_type == "query" and not self.auth_param:
            raise ValueError("auth_param is required when auth_type is 'query'")
