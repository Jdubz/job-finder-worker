"""Generic scraper for all job source types."""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import feedparser
import requests
from bs4 import BeautifulSoup

from job_finder.exceptions import ScrapeBlockedError
from job_finder.scrapers.source_config import SourceConfig
from job_finder.scrapers.text_sanitizer import (
    sanitize_company_name,
    sanitize_html_description,
    sanitize_title,
)
from job_finder.utils.date_utils import parse_job_date

logger = logging.getLogger(__name__)

# Default headers for requests
DEFAULT_HEADERS = {
    "User-Agent": "JobFinderBot/1.0",
    "Accept": "application/json, text/html, */*",
}


class GenericScraper:
    """
    Generic scraper that works with any job source type.

    Supports:
    - api: JSON APIs with configurable response paths
    - rss: RSS/Atom feeds parsed with feedparser
    - html: HTML pages parsed with CSS selectors

    Usage:
        config = SourceConfig.from_dict({
            "type": "api",
            "url": "https://api.example.com/jobs",
            "response_path": "jobs",
            "fields": {"title": "name", "url": "link"}
        })
        scraper = GenericScraper(config)
        jobs = scraper.scrape()
    """

    def __init__(self, config: SourceConfig):
        """
        Initialize generic scraper.

        Args:
            config: Source configuration
        """
        self.config = config

    def scrape(self) -> List[Dict[str, Any]]:
        """
        Scrape jobs from the configured source.

        Returns:
            List of standardized job dictionaries
        """
        try:
            logger.info(f"Scraping {self.config.type} source: {self.config.url}")

            # Fetch data based on source type
            if self.config.type == "api":
                data = self._fetch_json()
            elif self.config.type == "rss":
                data = self._fetch_rss()
            elif self.config.type == "html":
                data = self._fetch_html()
            else:
                logger.error(f"Unknown source type: {self.config.type}")
                return []

            # Parse each item into standardized job format
            jobs = []
            for item in data:
                try:
                    job = self._extract_fields(item)
                    if job.get("title") and job.get("url"):
                        jobs.append(job)
                except Exception as e:
                    logger.warning(f"Error parsing item: {e}")
                    continue

            logger.info(f"Scraped {len(jobs)} jobs from {self.config.url}")
            return jobs

        except ScrapeBlockedError:
            # Let blocking errors propagate so the caller can disable the source
            raise
        except requests.RequestException as e:
            logger.error(f"Request error scraping {self.config.url}: {e}")
            return []
        except Exception as e:
            logger.error(f"Error scraping {self.config.url}: {e}")
            return []

    def _fetch_json(self) -> List[Dict[str, Any]]:
        """
        Fetch JSON API with optional authentication.

        Supports both GET and POST requests.

        Returns:
            List of job items from API response
        """
        url = self.config.url
        headers = {**DEFAULT_HEADERS, **self.config.headers}

        # Apply authentication
        if self.config.api_key:
            if self.config.auth_type == "bearer":
                headers["Authorization"] = f"Bearer {self.config.api_key}"
            elif self.config.auth_type == "header":
                headers[self.config.auth_param] = self.config.api_key
            elif self.config.auth_type == "query":
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}{self.config.auth_param}={self.config.api_key}"

        # Make request based on method
        if self.config.method.upper() == "POST":
            headers["Content-Type"] = "application/json"
            response = requests.post(url, headers=headers, json=self.config.post_body, timeout=30)
        else:
            response = requests.get(url, headers=headers, timeout=30)

        response.raise_for_status()
        data = response.json()

        # Navigate to jobs array using response_path
        return self._navigate_path(data, self.config.response_path)

    def _fetch_rss(self) -> List[Any]:
        """
        Fetch and parse RSS/Atom feed.

        Returns:
            List of feed entries

        Raises:
            ScrapeBlockedError: If the response appears to be an anti-bot page
        """
        # Fetch with requests first to get raw content for anti-bot detection
        headers = {**DEFAULT_HEADERS, **self.config.headers}
        response = requests.get(self.config.url, headers=headers, timeout=30)
        response.raise_for_status()

        content = response.text
        feed = feedparser.parse(content)

        # Check for anti-bot blocking when feed parsing fails
        if feed.bozo and not feed.entries:
            blocked_reason = self._detect_blocked_response(content, feed.bozo_exception)
            if blocked_reason:
                raise ScrapeBlockedError(self.config.url, blocked_reason)
            # Log warning for non-blocking parse issues
            logger.warning(f"RSS feed has issues: {feed.bozo_exception}")

        return feed.entries

    def _detect_blocked_response(self, content: str, bozo_exception: Any) -> Optional[str]:
        """
        Detect if a response is an anti-bot/blocked page instead of valid feed.

        Args:
            content: Raw response content
            bozo_exception: The feedparser exception that occurred

        Returns:
            Reason string if blocked, None if not blocked
        """
        content_lower = content.lower()

        # Check for HTML response (RSS should be XML, not HTML)
        html_indicators = ["<!doctype html", "<html", "<head>", "<body>"]
        is_html = any(ind in content_lower for ind in html_indicators)

        if is_html:
            # Check for specific anti-bot indicators
            antibot_indicators = [
                ("captcha", "CAPTCHA challenge detected"),
                ("recaptcha", "reCAPTCHA challenge detected"),
                ("hcaptcha", "hCaptcha challenge detected"),
                ("challenge-platform", "Cloudflare challenge detected"),
                ("cf-browser-verification", "Cloudflare verification detected"),
                ("just a moment", "Cloudflare waiting page detected"),
                ("robot", "Robot detection page"),
                ("blocked", "Access blocked"),
                ("access denied", "Access denied"),
                ("rate limit", "Rate limited"),
                ("too many requests", "Too many requests"),
                ("403 forbidden", "403 Forbidden response"),
                ("please verify", "Verification required"),
            ]

            for indicator, reason in antibot_indicators:
                if indicator in content_lower:
                    return reason

            # Generic HTML response where RSS was expected
            return f"HTML page received instead of RSS feed (parse error: {bozo_exception})"

        return None

    def _fetch_html(self) -> List[Any]:
        """
        Fetch HTML page and select job elements.

        Returns:
            List of BeautifulSoup elements matching job_selector
        """
        headers = {**DEFAULT_HEADERS, **self.config.headers}
        response = requests.get(self.config.url, headers=headers, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        if not self.config.job_selector:
            logger.error("job_selector is required for HTML sources")
            return []

        return soup.select(self.config.job_selector)

    def _extract_fields(self, item: Any) -> Dict[str, Any]:
        """
        Extract fields from item using config mappings.

        Args:
            item: Raw item (dict for api/rss, element for html)

        Returns:
            Standardized job dictionary
        """
        job: Dict[str, Any] = {}

        for field, path in self.config.fields.items():
            value = self._get_value(item, path)

            # Post-process based on field type
            if field == "posted_date" and value:
                value = self._normalize_date(value)
            elif field == "title" and value:
                value = sanitize_title(str(value))
            elif field == "company" and value:
                value = sanitize_company_name(str(value))
            elif field == "description" and value:
                value = sanitize_html_description(str(value))
            elif field == "departments" and value:
                value = self._extract_names_from_list(value)
            elif field == "offices" and value:
                value = self._extract_names_from_list(value)
            elif field == "metadata" and value:
                value = self._metadata_to_dict(value)
            elif field == "tags" and value:
                # Tags might be a list of strings or objects - normalize to strings
                value = self._normalize_tags(value)

            job[field] = value

        # Handle salary min/max fields
        if self.config.salary_min_field:
            min_val = self._get_value(item, self.config.salary_min_field)
            max_val = (
                self._get_value(item, self.config.salary_max_field)
                if self.config.salary_max_field
                else None
            )
            if min_val:
                job["salary"] = self._format_salary(min_val, max_val)

        # Override company name if specified
        if self.config.company_name:
            job["company"] = self.config.company_name

        # Construct full URL from relative path if base_url is specified
        if self.config.base_url and job.get("url"):
            url = job["url"]
            if url.startswith("/"):
                job["url"] = f"{self.config.base_url}{url}"

        # Apply company extraction strategy if company is still empty
        if not job.get("company") and self.config.company_extraction:
            if self.config.company_extraction == "from_title" and job.get("title"):
                extracted = self._extract_company_from_title(job["title"])
                if extracted:
                    company_name, job_title = extracted
                    job["company"] = sanitize_company_name(company_name)
                    job["title"] = sanitize_title(job_title)

        # Extract company website from description if configured
        if (
            self.config.company_extraction in ("from_title", "from_description")
            and not job.get("company_website")
            and job.get("description")
        ):
            website = self._extract_company_website_from_description(job["description"])
            if website:
                job["company_website"] = website

        # Ensure required fields have defaults (empty string, not "Unknown")
        if not job.get("company"):
            job["company"] = ""
        if not job.get("location"):
            job["location"] = ""
        if not job.get("description"):
            job["description"] = ""

        # Add company_website if not present
        if "company_website" not in job:
            job["company_website"] = ""

        return job

    def _extract_company_from_title(self, title: str) -> Optional[tuple]:
        """
        Extract company name from 'Company: Job Title' format.

        Common in aggregator feeds like WeWorkRemotely, where titles are
        formatted as "Toptal: Android Developer".

        Args:
            title: Full title string

        Returns:
            Tuple of (company_name, job_title) if pattern matches, None otherwise
        """
        if not title or ":" not in title:
            return None

        # Split on first colon only
        parts = title.split(":", 1)
        if len(parts) != 2:
            return None

        company = parts[0].strip()
        job_title = parts[1].strip()

        # Validate we got reasonable values
        if not company or not job_title:
            return None

        # Avoid false positives - company names are typically short
        # If "company" part is very long, it's probably not a company name
        if len(company) > 100:
            return None

        return (company, job_title)

    def _extract_company_website_from_description(self, description: str) -> Optional[str]:
        """
        Extract company website URL from description HTML.

        WeWorkRemotely descriptions contain company URLs in format:
        <strong>URL:</strong> <a href="https://company.com">https://company.com</a>

        Args:
            description: HTML description text

        Returns:
            Company website URL if found, None otherwise
        """
        if not description:
            return None

        # Pattern to match URL field in WeWorkRemotely format
        # Handles both encoded (&lt;) and decoded (<) HTML
        patterns = [
            r'URL:</strong>\s*<a\s+href="(https?://[^"]+)"',
            r"URL:&lt;/strong&gt;\s*&lt;a\s+href=&quot;(https?://[^&]+)&quot;",
            r'URL:</strong>\s*<a href="(https?://[^"]+)"',
        ]

        for pattern in patterns:
            match = re.search(pattern, description, re.IGNORECASE)
            if match:
                url = match.group(1)
                # Validate URL structure using urlparse
                try:
                    parsed = urlparse(url)
                    if parsed.scheme in ("http", "https") and parsed.netloc:
                        return url
                except Exception:
                    pass

        return None

    def _get_value(self, item: Any, path: str) -> Optional[Any]:
        """
        Get value using appropriate extraction method.

        Args:
            item: Source item
            path: Extraction path (dot notation or CSS selector)

        Returns:
            Extracted value or None
        """
        if self.config.type == "html":
            return self._css_select(item, path)
        elif self.config.type == "rss":
            return self._rss_access(item, path)
        else:
            return self._dot_access(item, path)

    def _dot_access(self, item: Any, path: str) -> Optional[Any]:
        """
        Navigate nested dict with dot notation and array filtering.

        Supports:
            - Simple dot notation: "location.name"
            - Array index: "items.0.name" (access first element)
            - Array filter: "items[type=Salary].value" (find element where type=Salary)

        Examples:
            _dot_access({"a": {"b": 1}}, "a.b") -> 1
            _dot_access({"name": "test"}, "name") -> "test"
            _dot_access({"items": [{"x": 1}, {"x": 2}]}, "items.0.x") -> 1
            _dot_access({"items": [{"type": "A"}, {"type": "B", "val": 5}]},
                        "items[type=B].val") -> 5

        Args:
            item: Dictionary to navigate
            path: Dot-separated path with optional array access

        Returns:
            Value at path or None
        """
        if not path:
            return None

        current = item
        # Split on dots but preserve array filter brackets
        # e.g., "a.b[x=y].c" -> ["a", "b[x=y]", "c"]
        parts = re.split(r"\.(?![^\[]*\])", path)

        for part in parts:
            if current is None:
                return None

            # Check for array filter syntax: field[key=value]
            filter_match = re.match(r"^([^\[]+)\[([^=]+)=([^\]]+)\]$", part)
            if filter_match:
                field_name, filter_key, filter_value = filter_match.groups()
                if isinstance(current, dict):
                    current = current.get(field_name)
                if isinstance(current, list):
                    # Find element where filter_key equals filter_value
                    current = next(
                        (
                            el
                            for el in current
                            if isinstance(el, dict) and el.get(filter_key) == filter_value
                        ),
                        None,
                    )
                else:
                    return None
            elif isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list):
                # Support numeric index access
                try:
                    idx = int(part)
                    current = current[idx] if 0 <= idx < len(current) else None
                except (ValueError, IndexError):
                    return None
            else:
                return None

        return current

    def _rss_access(self, entry: Any, path: str) -> Optional[Any]:
        """
        Access feedparser entry attributes.

        Handles common RSS field names and fallbacks.

        Args:
            entry: Feedparser entry
            path: Attribute name

        Returns:
            Attribute value or None
        """
        # Direct attribute access
        value = getattr(entry, path, None)

        # Handle common fallbacks
        if value is None:
            # Try alternate field names
            fallbacks = {
                "description": ["summary", "content"],
                "url": ["link", "id"],
                "posted_date": ["published", "updated", "created"],
            }
            for fallback in fallbacks.get(path, []):
                value = getattr(entry, fallback, None)
                if value is not None:
                    break

            # Handle content list
            if value is None and path in ("description", "content"):
                content = getattr(entry, "content", None)
                if content and isinstance(content, list) and len(content) > 0:
                    value = content[0].get("value")

        return value

    def _css_select(self, element: Any, selector: str) -> Optional[str]:
        """
        Extract value using CSS selector.

        Supports attribute extraction with "@" syntax:
            "a@href" -> Get href attribute from <a> element
            ".title@data-id" -> Get data-id from .title element

        Args:
            element: BeautifulSoup element
            selector: CSS selector, optionally with @attribute

        Returns:
            Text content or attribute value
        """
        if "@" in selector:
            # Attribute selector: "a@href" or ".link@data-url"
            parts = selector.split("@")
            sel = parts[0]
            attr = parts[1]

            if sel:
                el = element.select_one(sel)
            else:
                el = element

            if el:
                return el.get(attr)
            return None
        else:
            # Text content selector
            el = element.select_one(selector)
            if el:
                return el.get_text(strip=True)
            return None

    def _navigate_path(self, data: Any, path: str) -> List[Any]:
        """
        Navigate to jobs array in API response.

        Supports:
            - Empty path: return data as list
            - Dot notation: "jobs", "data.results"
            - Array slice: "[1:]", "[0]"

        Args:
            data: API response data
            path: Navigation path

        Returns:
            List of job items
        """
        if not path:
            if isinstance(data, list):
                return data
            return [data] if data else []

        # Array slice notation
        if path.startswith("[") and path.endswith("]"):
            try:
                slice_str = path[1:-1]
                if ":" in slice_str:
                    # Handle slices like [1:], [:5], [1:5]
                    parts = slice_str.split(":")
                    start = int(parts[0]) if parts[0] else None
                    end = int(parts[1]) if len(parts) > 1 and parts[1] else None
                    return data[start:end] if isinstance(data, list) else []
                else:
                    # Handle index like [0], [1]
                    idx = int(slice_str)
                    item = data[idx] if isinstance(data, list) and len(data) > idx else None
                    return [item] if item else []
            except (ValueError, IndexError) as e:
                logger.warning(f"Error parsing array path '{path}': {e}")
                return []

        # Dot notation
        result = self._dot_access(data, path)
        if result is None:
            return []
        if isinstance(result, list):
            return result
        return [result]

    def _normalize_date(self, value: Any) -> str:
        """
        Normalize date value to ISO format string.

        Handles:
            - Unix timestamps (int/float)
            - ISO format strings
            - Various date string formats

        Args:
            value: Raw date value

        Returns:
            ISO format date string or empty string
        """
        if value is None:
            return ""

        # Unix timestamp
        if isinstance(value, (int, float)):
            try:
                dt = datetime.fromtimestamp(value, tz=timezone.utc)
                return dt.isoformat()
            except (ValueError, OSError):
                return ""

        # String date
        if isinstance(value, str):
            parsed = parse_job_date(value)
            if parsed:
                return parsed.isoformat()
            return value  # Return as-is if parsing fails

        return ""

    def _format_salary(self, min_val: Any, max_val: Any = None) -> str:
        """
        Format salary range string.

        Args:
            min_val: Minimum salary value
            max_val: Maximum salary value (optional)

        Returns:
            Formatted salary string like "$100,000 - $150,000"
        """
        try:
            min_num = int(float(min_val))
            if max_val:
                max_num = int(float(max_val))
                return f"${min_num:,} - ${max_num:,}"
            return f"${min_num:,}+"
        except (ValueError, TypeError):
            return ""

    def _extract_names_from_list(self, items: Any) -> List[str]:
        """
        Extract name values from a list of objects.

        Handles Greenhouse-style arrays like:
            [{"id": 1, "name": "Engineering"}, {"id": 2, "name": "Product"}]

        Args:
            items: List of objects with 'name' field

        Returns:
            List of name strings
        """
        if not isinstance(items, list):
            return []
        names = []
        for item in items:
            if isinstance(item, dict) and "name" in item:
                names.append(str(item["name"]))
            elif isinstance(item, str):
                names.append(item)
        return names

    def _metadata_to_dict(self, metadata: Any) -> Dict[str, Any]:
        """
        Convert metadata array to a dictionary.

        Handles Greenhouse-style metadata:
            [{"name": "Location Type", "value": "Remote"}]
        to:
            {"Location Type": "Remote"}

        Args:
            metadata: List of objects with 'name' and 'value' fields

        Returns:
            Dictionary of name->value mappings
        """
        if not isinstance(metadata, list):
            return {}
        result = {}
        for item in metadata:
            if isinstance(item, dict) and "name" in item:
                name = str(item.get("name", ""))
                value = item.get("value")
                if name and value is not None:
                    result[name] = str(value) if not isinstance(value, (list, dict)) else value
        return result

    def _normalize_tags(self, tags: Any) -> List[str]:
        """
        Normalize tags to a list of strings.

        Handles both string lists and object lists.

        Args:
            tags: List of strings or objects with name/tag field

        Returns:
            List of tag strings
        """
        if not isinstance(tags, list):
            if isinstance(tags, str):
                return [tags]
            return []
        result = []
        for tag in tags:
            if isinstance(tag, str):
                result.append(tag)
            elif isinstance(tag, dict):
                # Try common field names
                for key in ("name", "tag", "label", "value"):
                    if key in tag:
                        result.append(str(tag[key]))
                        break
        return result
