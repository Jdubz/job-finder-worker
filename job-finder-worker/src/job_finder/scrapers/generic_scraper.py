"""Generic scraper for all job source types."""

import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import feedparser
import json
import requests
from bs4 import BeautifulSoup

from job_finder.exceptions import (
    ScrapeBlockedError,
    ScrapeAuthError,
    ScrapeBotProtectionError,
    ScrapeConfigError,
    ScrapeNotFoundError,
    ScrapeProtectedApiError,
    ScrapeTransientError,
)
from job_finder.rendering.playwright_renderer import RenderRequest, get_renderer
from job_finder.scrapers.source_config import SourceConfig
from job_finder.scrapers.text_sanitizer import (
    sanitize_company_name,
    sanitize_html_description,
    sanitize_title,
)
from job_finder.settings import get_fetch_delay_seconds
from job_finder.utils.date_utils import parse_job_date

logger = logging.getLogger(__name__)

# Default headers for requests
DEFAULT_HEADERS = {
    "User-Agent": "JobFinderBot/1.0",
    "Accept": "application/json, text/html, */*",
}

# Bot protection markers (Cloudflare, CAPTCHA, WAF, etc.)
BOT_PROTECTION_MARKERS = [
    "cf-browser-verification",
    "checking your browser",
    "challenge-platform",
    "captcha",
    "recaptcha",
    "hcaptcha",
    "ray id:",
    "cloudflare",
    "sucuri",
    "incapsula",
    "ddos protection",
    "bot protection",
    "access denied by security",
    "automated access",
    "please verify you are human",
    "akamai",
    "distil_r_blocked",
    "perimeterx",
]

# Authentication wall markers
# NOTE: These should be specific phrases that indicate the page REQUIRES login,
# not just mentions of login (e.g., a login link in the header)
AUTH_WALL_MARKERS = [
    "sign in to continue",
    "log in to continue",
    "login required",
    "please sign in",
    "please log in",
    "authentication required",
    "you must be logged in",
    "you need to log in",
    "access denied. please log in",
    'type="password"',  # Password input field
    'name="password"',  # Password input field
    "sso redirect",
    "redirect_uri=",  # OAuth redirect parameter
    "response_type=code",  # OAuth authorization
]


def _detect_bot_protection(content: Optional[str]) -> bool:
    """Check if content contains bot protection markers."""
    if not isinstance(content, str) or not content:
        return False
    content_lower = content.lower()
    return any(marker in content_lower for marker in BOT_PROTECTION_MARKERS)


def _detect_auth_wall(content: Optional[str]) -> bool:
    """Check if content contains authentication wall markers."""
    if not isinstance(content, str) or not content:
        return False
    content_lower = content.lower()
    return any(marker in content_lower for marker in AUTH_WALL_MARKERS)


def classify_http_error(
    url: str,
    status_code: int,
    reason: str,
    content: str = "",
    is_api: bool = False,
    headers: Optional[dict] = None,
) -> ScrapeBlockedError:
    """
    Classify an HTTP error into the appropriate exception type.

    This function analyzes both the HTTP status code and response content
    to determine the real cause of the error.

    Args:
        url: The URL that returned the error
        status_code: HTTP status code
        reason: HTTP reason phrase
        content: Response content (for content analysis)
        is_api: Whether this is an API endpoint (affects 401/403 handling)
        headers: Response headers (used to extract Retry-After for 429s)

    Returns:
        Appropriate ScrapeBlockedError subclass
    """
    # First check content for bot protection (overrides status code logic)
    if content and _detect_bot_protection(content):
        return ScrapeBotProtectionError(
            url, f"Bot protection detected (HTTP {status_code})", status_code
        )

    # Check content for auth wall
    if content and _detect_auth_wall(content):
        return ScrapeAuthError(url, f"Authentication required (HTTP {status_code})", status_code)

    # Status code based classification
    if status_code == 400:
        # Bad Request - config error (wrong params, invalid format)
        return ScrapeConfigError(url, f"HTTP 400: {reason} - config error", status_code)

    elif status_code == 401:
        # Unauthorized - auth required
        if is_api:
            return ScrapeProtectedApiError(
                url, f"HTTP 401: {reason} - API auth required", status_code
            )
        return ScrapeAuthError(url, f"HTTP 401: {reason} - authentication required", status_code)

    elif status_code == 403:
        # Forbidden - could be bot protection, rate limit, or auth
        if is_api:
            return ScrapeProtectedApiError(
                url, f"HTTP 403: {reason} - API access denied", status_code
            )
        # Without content, this is likely a hard block rather than transient rate limit
        if not content:
            return ScrapeBlockedError(
                url, f"HTTP 403: {reason} - access forbidden (empty response)", status_code
            )
        # With content but no explicit bot/auth markers, treat as transient to avoid mislabeling
        return ScrapeTransientError(url, f"HTTP 403: {reason} - possibly rate limited", status_code)

    elif status_code == 404:
        # Not Found - endpoint moved or removed (NOT bot protection!)
        return ScrapeNotFoundError(url, f"HTTP 404: {reason} - endpoint not found", status_code)

    elif status_code == 410:
        # Gone - resource permanently removed
        return ScrapeNotFoundError(url, f"HTTP 410: {reason} - resource removed", status_code)

    elif status_code == 422:
        # Unprocessable Entity - usually API validation error
        if is_api:
            return ScrapeProtectedApiError(
                url, f"HTTP 422: {reason} - API validation failed", status_code
            )
        return ScrapeConfigError(url, f"HTTP 422: {reason} - validation error", status_code)

    elif status_code == 429:
        # Too Many Requests - rate limiting (transient)
        retry_after = None
        if headers:
            raw = headers.get("Retry-After") or headers.get("retry-after")
            if raw:
                try:
                    retry_after = int(raw)
                except (ValueError, TypeError):
                    pass
        return ScrapeTransientError(
            url, f"HTTP 429: {reason} - rate limited", status_code, retry_after
        )

    elif status_code in (500, 502, 503, 504):
        # Server errors - transient
        return ScrapeTransientError(
            url, f"HTTP {status_code}: {reason} - server error", status_code
        )

    else:
        # Unknown status - generic error
        return ScrapeBlockedError(url, f"HTTP {status_code}: {reason}", status_code)


@dataclass
class PreExtractedJob:
    """Wrapper for jobs already extracted (e.g., from JSON-LD fallback).

    When _extract_fields encounters this type, it returns the inner dict
    unchanged instead of applying CSS/dot-notation field extraction.
    """

    data: Dict[str, Any]


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

    # Feedparser normalizes RSS element names to standard attribute names.
    # Map common RSS field names to their feedparser equivalents.
    _RSS_TO_FEEDPARSER_MAP = {
        "pubDate": "published",
        "pubdate": "published",
        "dc:date": "published",
        "guid": "id",
    }

    def __init__(self, config: SourceConfig):
        """
        Initialize generic scraper.

        Args:
            config: Source configuration
        """
        self.config = config

    @lru_cache(maxsize=1)
    def _get_effective_url(self) -> str:
        """
        Get the effective URL with any server-side filters applied.

        If company_filter and company_filter_param are both set, appends the
        filter as a query parameter for server-side filtering.

        Cached to avoid redundant computation during a single scrape operation.

        Returns:
            URL with filters applied
        """
        url = self.config.url

        # Apply server-side company filter if supported
        if self.config.company_filter and self.config.company_filter_param:
            parsed = urlparse(url)
            # Parse existing query params
            params = parse_qs(parsed.query, keep_blank_values=True)
            # Add company filter param
            params[self.config.company_filter_param] = [self.config.company_filter]
            # Rebuild URL with new params
            new_query = urlencode(params, doseq=True)
            url = urlunparse(parsed._replace(query=new_query))

        return url

    def scrape(self) -> List[Dict[str, Any]]:
        """
        Scrape jobs from the configured source.

        Returns:
            List of standardized job dictionaries
        """
        try:
            effective_url = self._get_effective_url()
            if effective_url != self.config.url:
                logger.info(
                    f"Scraping {self.config.type} source with server-side filter: {effective_url}"
                )
            else:
                logger.info(f"Scraping {self.config.type} source: {self.config.url}")

            # Fetch data based on source type
            if self.config.pagination_type:
                data = self._fetch_paginated()
            elif self.config.type == "api":
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
            skipped_no_title_url = 0
            for item in data:
                job = self._extract_fields(item)

                # Enrich from detail page/API when we lack description/posted_date,
                # or when the platform is marked for detail following.
                if job.get("url") and self._should_enrich(job):
                    job = self._enrich_from_detail(job)

                if job.get("title") and job.get("url"):
                    jobs.append(job)
                else:
                    skipped_no_title_url += 1

            if skipped_no_title_url and not jobs:
                logger.warning(
                    "field_extraction_total_failure: %d items matched but 0 produced "
                    "title+url; field mappings likely wrong. "
                    "source_type=%s job_selector=%r fields=%r url=%s",
                    skipped_no_title_url,
                    self.config.type,
                    self.config.job_selector or "(n/a)",
                    dict(self.config.fields),
                    self.config.url,
                )
            elif skipped_no_title_url:
                logger.debug(
                    "field_extraction: skipped %d/%d items missing title or url",
                    skipped_no_title_url,
                    skipped_no_title_url + len(jobs),
                )

            # Apply company filter if configured (for company-specific aggregator sources)
            if self.config.company_filter and jobs:
                pre_filter_count = len(jobs)
                jobs = [j for j in jobs if self._matches_company_filter(j)]
                logger.info(
                    f"Company filter '{self.config.company_filter}' matched "
                    f"{len(jobs)}/{pre_filter_count} jobs"
                )

            logger.info(f"Scraped {len(jobs)} jobs from {effective_url}")
            return jobs

        except ScrapeBlockedError:
            # Let blocking errors propagate so the caller can disable the source
            raise
        except requests.RequestException as e:
            # Surface network/HTTP failures so callers can record failure or disable the source
            logger.error(f"Request error scraping {self.config.url}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error scraping {self.config.url}: {e}")
            raise

    def _fetch_json(self) -> List[Dict[str, Any]]:
        """
        Fetch JSON API with optional authentication.

        Supports both GET and POST requests.

        Returns:
            List of job items from API response
        """
        if self._should_paginate_post():
            return self._fetch_json_paginated()

        url = self._get_effective_url()
        headers, url = self._apply_auth_and_headers(url)

        # Make request based on method
        if self.config.method.upper() == "POST":
            headers["Content-Type"] = "application/json"
            response = requests.post(url, headers=headers, json=self.config.post_body, timeout=30)
        else:
            response = requests.get(url, headers=headers, timeout=30)

        try:
            response.raise_for_status()
        except requests.HTTPError as e:
            # Classify HTTP error properly based on status and content
            content = ""
            resp_headers = None
            try:
                content = response.text[:5000]  # Get content sample for analysis
            except Exception:
                pass  # Best-effort retrieval; continue with empty content if this fails
            try:
                resp_headers = response.headers
            except Exception:
                pass
            raise classify_http_error(
                self.config.url,
                response.status_code,
                response.reason,
                content,
                is_api=True,
                headers=resp_headers,
            ) from e
        data = response.json()

        # Navigate to jobs array using response_path
        return self._navigate_path(data, self.config.response_path)

    def _should_enrich(self, job: Dict[str, Any]) -> bool:
        """
        Decide whether to follow the detail page/API for enrichment.

        Rules:
        - For API sources: only if config.follow_detail is True (avoid thousands of detail hits)
        - For HTML/RSS: if config.follow_detail OR description is missing OR posted_date is missing
        """
        if self.config.type == "api":
            return self.config.follow_detail
        return (
            self.config.follow_detail
            or not (job.get("description") or "").strip()
            or not job.get("posted_date")
        )

    def _fetch_json_paginated(self) -> List[Dict[str, Any]]:
        """
        Fetch paginated POST JSON APIs that use offset/limit in the request body.

        This is primarily for Workday, but is driven entirely by config (presence
        of offset/limit keys) to avoid hardcoding vendor specifics.
        """
        url = self._get_effective_url()
        headers, url = self._apply_auth_and_headers(url, force_json=True)

        results: List[Dict[str, Any]] = []
        body = dict(self.config.post_body or {})
        limit = self._parse_int_with_default(body.get("limit"), 20)
        offset = self._parse_int_with_default(body.get("offset"), 0)
        max_pages = 50  # safety cap to avoid infinite loops; tuned for Workday defaults

        for _ in range(max_pages):
            payload = dict(body)
            payload["offset"] = offset
            payload["limit"] = limit
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            try:
                response.raise_for_status()
            except requests.HTTPError as e:
                content = ""
                try:
                    content = response.text[:5000]
                except Exception:
                    pass  # Best-effort retrieval; continue with empty content if this fails
                raise classify_http_error(
                    self.config.url, response.status_code, response.reason, content, is_api=True
                ) from e

            data = response.json()
            items = self._navigate_path(data, self.config.response_path)
            if not items:
                break

            results.extend(items)

            # Stop if fewer than limit returned (no more pages)
            if len(items) < limit:
                break

            offset += limit

        if len(results) and len(results) / max(limit, 1) >= max_pages:
            logger.warning(
                "Pagination hit max_pages=%s for %s; results may be truncated",
                max_pages,
                self.config.url,
            )
        return results

    def _should_paginate_post(self) -> bool:
        """
        Determine whether to auto-paginate a POST API based on config.

        We enable pagination when:
        - HTTP method is POST
        - post_body defines both 'offset' and 'limit'
        """
        if self.config.method.upper() != "POST":
            return False
        body = self.config.post_body or {}
        return "offset" in body and "limit" in body

    def _apply_auth_and_headers(
        self, url: str, force_json: bool = False
    ) -> tuple[Dict[str, str], str]:
        """
        Build headers (plus auth) and possibly mutate the URL for query auth.
        Shared between GET/POST fetchers to avoid duplication.
        """
        headers = {**DEFAULT_HEADERS, **self.config.headers}

        if self.config.api_key:
            if self.config.auth_type == "bearer":
                headers["Authorization"] = f"Bearer {self.config.api_key}"
            elif self.config.auth_type == "header":
                headers[self.config.auth_param] = self.config.api_key
            elif self.config.auth_type == "query":
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}{self.config.auth_param}={self.config.api_key}"

        if force_json:
            headers["Content-Type"] = "application/json"

        return headers, url

    @staticmethod
    def _parse_int_with_default(value: Any, default: int) -> int:
        """Parse ints while treating 0 as valid; fall back on None/empty strings."""
        if value is None or value == "":
            return default
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    def _fetch_rss(self) -> List[Any]:
        """
        Fetch and parse RSS/Atom feed.

        Returns:
            List of feed entries

        Raises:
            ScrapeBlockedError: If the response appears to be an anti-bot page
        """
        # Fetch with requests first to get raw content for anti-bot detection
        url = self._get_effective_url()
        headers = {**DEFAULT_HEADERS, **self.config.headers}
        response = requests.get(url, headers=headers, timeout=30)
        try:
            response.raise_for_status()
        except requests.HTTPError as e:
            content = ""
            try:
                content = response.text[:5000]
            except Exception:
                pass  # Best-effort retrieval; continue with empty content if this fails
            raise classify_http_error(
                self.config.url, response.status_code, response.reason, content, is_api=False
            ) from e

        content = response.text
        feed = feedparser.parse(content)

        # Check for anti-bot blocking when feed parsing fails
        if feed.bozo and not feed.entries:
            blocked_reason = self._detect_blocked_response(content, feed.bozo_exception)
            if blocked_reason:
                # Classify based on content analysis (status_code=0 since no HTTP error)
                if _detect_bot_protection(content):
                    raise ScrapeBotProtectionError(self.config.url, blocked_reason, status_code=0)
                elif _detect_auth_wall(content):
                    raise ScrapeAuthError(self.config.url, blocked_reason, status_code=0)
                else:
                    # Default to config error for RSS (wrong URL, not a feed)
                    raise ScrapeConfigError(self.config.url, blocked_reason, status_code=0)
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
        url = self._get_effective_url()
        return self._fetch_html_page(url)

    # ── Generic pagination engine ──────────────────────────────────────

    def _fetch_paginated(self) -> List[Any]:
        """
        Fetch multiple pages from a paginated source.

        Dispatches to the appropriate per-page fetcher based on config.type
        and assembles results across pages. Stops on: empty page, items <
        page_size (when page_size > 0), no cursor token, or max_pages reached.
        """
        results: List[Any] = []
        cursor: Optional[str] = None
        delay = get_fetch_delay_seconds()
        hit_max_pages = True

        for page_num in range(self.config.max_pages):
            # Build URL for this page
            if self.config.pagination_type == "cursor" and page_num > 0:
                url = self._build_cursor_url(cursor)
            else:
                url = self._build_page_url(page_num)

            # Fetch one page
            items, raw_response = self._fetch_single_page(url, cursor if page_num > 0 else None)

            if not items:
                hit_max_pages = False
                break

            results.extend(items)

            # Stop if fewer items than page_size (last page)
            if self.config.page_size and len(items) < self.config.page_size:
                hit_max_pages = False
                break

            # For cursor pagination, extract next cursor
            if self.config.pagination_type == "cursor":
                cursor = self._extract_cursor(raw_response)
                if not cursor:
                    hit_max_pages = False
                    break

            # Rate-limit between pages
            if delay > 0 and page_num < self.config.max_pages - 1:
                time.sleep(delay)

        if hit_max_pages and results:
            logger.warning(
                "Pagination hit max_pages=%s for %s; results may be truncated",
                self.config.max_pages,
                self.config.url,
            )
        return results

    def _build_page_url(self, page_num: int) -> str:
        """Build URL for a numbered/offset page."""
        base_url = self._get_effective_url()

        if self.config.pagination_type == "url_template":
            url = base_url.replace("{page}", str(page_num + self.config.page_start))
            url = url.replace("{offset}", str(page_num * self.config.page_size))
            return url

        if self.config.pagination_type == "page_num":
            param_value = str(page_num + self.config.page_start)
        elif self.config.pagination_type == "offset":
            param_value = str(page_num * self.config.page_size)
        else:
            return base_url

        parsed = urlparse(base_url)
        params = parse_qs(parsed.query, keep_blank_values=True)
        params[self.config.pagination_param] = [param_value]
        new_query = urlencode(params, doseq=True)
        return urlunparse(parsed._replace(query=new_query))

    def _build_cursor_url(self, cursor_token: Optional[str]) -> str:
        """Build URL for cursor-based pagination."""
        base_url = self._get_effective_url()
        if self.config.cursor_send_in == "query" and cursor_token:
            parsed = urlparse(base_url)
            params = parse_qs(parsed.query, keep_blank_values=True)
            params[self.config.pagination_param] = [cursor_token]
            new_query = urlencode(params, doseq=True)
            return urlunparse(parsed._replace(query=new_query))
        return base_url

    def _fetch_single_page(
        self, url: str, cursor_token: Optional[str]
    ) -> tuple[List[Any], Optional[dict]]:
        """
        Fetch a single page and return (items, raw_response_dict).

        raw_response_dict is the parsed JSON dict for API sources (needed for
        cursor extraction); None for HTML sources.
        """
        if self.config.type == "api":
            return self._fetch_json_page(url, cursor_token)
        elif self.config.type == "html":
            items = self._fetch_html_page(url)
            return items, None
        else:
            logger.error(f"Pagination not supported for source type: {self.config.type}")
            return [], None

    def _fetch_json_page(self, url: str, cursor_token: Optional[str]) -> tuple[List[Any], dict]:
        """Fetch a single page from a JSON API."""
        headers, url = self._apply_auth_and_headers(url)

        if self.config.method.upper() == "POST":
            headers["Content-Type"] = "application/json"
            body = dict(self.config.post_body or {})
            if cursor_token and self.config.cursor_send_in == "body":
                body[self.config.pagination_param] = cursor_token
            response = requests.post(url, headers=headers, json=body, timeout=30)
        else:
            response = requests.get(url, headers=headers, timeout=30)

        try:
            response.raise_for_status()
        except requests.HTTPError as e:
            content = ""
            resp_headers = None
            try:
                content = response.text[:5000]
            except Exception:
                pass
            try:
                resp_headers = response.headers
            except Exception:
                pass
            raise classify_http_error(
                self.config.url,
                response.status_code,
                response.reason,
                content,
                is_api=True,
                headers=resp_headers,
            ) from e

        data = response.json()
        items = self._navigate_path(data, self.config.response_path)
        return items, data

    def _fetch_html_page(self, url: str) -> List[Any]:
        """Fetch a single page from an HTML source."""
        headers = {**DEFAULT_HEADERS, **self.config.headers}

        if self.config.requires_js:
            try:
                result = get_renderer().render(
                    RenderRequest(
                        url=url,
                        wait_for_selector=(
                            self.config.render_wait_for
                            or self.config.embedded_json_selector
                            or self.config.job_selector
                        ),
                        wait_timeout_ms=self.config.render_timeout_ms,
                        block_resources=True,
                        headers=headers,
                    )
                )
                soup = BeautifulSoup(result.html, "html.parser")

                # JS pages may return 200 with a CAPTCHA/login body
                rendered_text = result.html[:10000]
                if _detect_bot_protection(rendered_text):
                    raise ScrapeBotProtectionError(
                        url,
                        "Bot protection detected in JS-rendered page",
                        status_code=None,
                    )
                if _detect_auth_wall(rendered_text):
                    raise ScrapeAuthError(
                        url,
                        "Authentication wall detected in JS-rendered page",
                        status_code=None,
                    )
            except RuntimeError as exc:
                error_msg = str(exc).lower()
                if "timeout" in error_msg:
                    raise ScrapeTransientError(
                        self.config.url, f"Render timeout: {exc}", status_code=None
                    ) from exc
                else:
                    raise ScrapeBlockedError(self.config.url, f"Render failed: {exc}") from exc
        else:
            response = requests.get(url, headers=headers, timeout=30)
            try:
                response.raise_for_status()
            except requests.HTTPError as e:
                content = ""
                resp_headers = None
                try:
                    content = response.text[:5000]
                except Exception:
                    pass
                try:
                    resp_headers = response.headers
                except Exception:
                    pass
                raise classify_http_error(
                    self.config.url,
                    response.status_code,
                    response.reason,
                    content,
                    is_api=False,
                    headers=resp_headers,
                ) from e
            soup = BeautifulSoup(response.text, "html.parser")

        if self.config.embedded_json_selector:
            return self._extract_embedded_json(soup)

        if self.config.job_selector:
            items = soup.select(self.config.job_selector)
            if not items and self.config.requires_js:
                self._diagnose_empty_selector(soup, len(result.html), url)
            if not items:
                # Fallback: try JSON-LD structured data
                jsonld_jobs = self._try_jsonld_listing_fallback(soup)
                if jsonld_jobs:
                    return jsonld_jobs
            return items

        return []

    _JOB_HINT_SELECTORS = [
        "[class*='job']",
        "[class*='Job']",
        "[class*='position']",
        "[class*='Position']",
        "[class*='opening']",
        "[class*='Opening']",
        "[class*='career']",
        "[class*='Career']",
        "[class*='listing']",
        "[class*='Listing']",
        "[id*='job']",
        "[id*='Job']",
        "[data-job]",
        "[data-job-id]",
    ]

    def _diagnose_empty_selector(self, soup: BeautifulSoup, html_len: int, url: str) -> None:
        """Log diagnostic info when job_selector matches zero elements on a JS-rendered page."""
        title_tag = soup.find("title")
        page_title = title_tag.get_text(strip=True) if title_tag else "(no <title>)"
        text_preview = soup.get_text(separator=" ", strip=True)[:300].replace("\n", " ")

        hints = []
        for sel in self._JOB_HINT_SELECTORS:
            try:
                found = soup.select(sel)
                if found:
                    el = found[0]
                    cls = " ".join(el.get("class", []))
                    hints.append(
                        f"{sel} → {len(found)} hits " f'(first: <{el.name} class="{cls}">)'
                    )
            except Exception:
                pass

        logger.warning(
            "js_render_zero_jobs: selector=%r matched 0 elements "
            "url=%s html_size=%d page_title=%r text_preview=%r hints=[%s]",
            self.config.job_selector,
            url,
            html_len,
            page_title,
            text_preview,
            "; ".join(hints[:5]) if hints else "none",
        )

    def _try_jsonld_listing_fallback(self, soup: BeautifulSoup) -> List[PreExtractedJob]:
        """Try to extract job listings from JSON-LD when CSS selectors fail."""
        postings = []
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                data = json.loads(script.string or "{}")
            except json.JSONDecodeError:
                continue
            # Collect all JobPosting objects (direct, array, @graph)
            if isinstance(data, list):
                postings.extend(
                    d for d in data if isinstance(d, dict) and d.get("@type") == "JobPosting"
                )
            elif isinstance(data, dict):
                graph = data.get("@graph")
                if graph and isinstance(graph, list):
                    postings.extend(
                        g for g in graph if isinstance(g, dict) and g.get("@type") == "JobPosting"
                    )
                elif data.get("@type") == "JobPosting":
                    postings.append(data)

        if not postings:
            return []

        jobs = []
        for jp in postings:
            job: Dict[str, Any] = {}
            job["title"] = sanitize_title(jp.get("title") or "")
            hiring_org = jp.get("hiringOrganization") or {}
            company_raw = (
                hiring_org.get("name", "") if isinstance(hiring_org, dict) else str(hiring_org)
            )
            job["company"] = sanitize_company_name(company_raw)
            job["description"] = sanitize_html_description(jp.get("description", ""))
            # URL: reconstruct relative URLs using base_url
            raw_url = jp.get("url") or jp.get("sameAs") or ""
            if raw_url and self.config.base_url and not re.match(r"^https?://", raw_url):
                base = self.config.base_url.rstrip("/")
                relative = raw_url.lstrip("/")
                job["url"] = f"{base}/{relative}"
            else:
                job["url"] = raw_url
            # Location (default to empty string if not a dict)
            job["location"] = ""
            job["company_website"] = ""
            place = jp.get("jobLocation")
            if isinstance(place, list):
                place = place[0] if place else None
            if isinstance(place, dict):
                addr = place.get("address") or {}
                parts = [
                    addr.get("addressLocality"),
                    addr.get("addressRegion"),
                    addr.get("addressCountry"),
                ]
                parts = [(p.get("name", "") if isinstance(p, dict) else p or "") for p in parts]
                job["location"] = ", ".join(p for p in parts if p)
            if jp.get("datePosted"):
                job["posted_date"] = self._normalize_date(jp["datePosted"])
            # Override company name from config if specified
            if self.config.company_name:
                job["company"] = self.config.company_name
            if job.get("title") and job.get("url"):
                jobs.append(PreExtractedJob(data=job))

        if jobs:
            logger.info(
                "jsonld_listing_fallback: extracted %d jobs from JSON-LD (selector=%r failed)",
                len(jobs),
                self.config.job_selector,
            )
        return jobs

    def _extract_cursor(self, response_data: Optional[dict]) -> Optional[str]:
        """Extract next-page cursor from a JSON response using cursor_response_path."""
        if not response_data or not self.config.cursor_response_path:
            return None
        value = self._dot_access(response_data, self.config.cursor_response_path)
        if value is not None and str(value).strip():
            return str(value)
        return None

    def _extract_embedded_json(self, soup: BeautifulSoup) -> List[Dict]:
        """
        Extract job data from embedded JSON elements in HTML.

        Selects elements via embedded_json_selector, parses each element's
        text as JSON. If response_path is set, navigates it within each element.
        """
        elements = soup.select(self.config.embedded_json_selector)
        results: List[Dict] = []
        for el in elements:
            text = el.get_text(strip=True)
            if not text:
                continue
            try:
                data = json.loads(text)
            except json.JSONDecodeError:
                logger.debug("Skipping non-JSON element: %.100s", text)
                continue
            if self.config.response_path:
                items = self._navigate_path(data, self.config.response_path)
                results.extend(items)
            elif isinstance(data, list):
                results.extend(data)
            elif isinstance(data, dict):
                results.append(data)
        return results

    def _enrich_from_detail(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Enrich a job by fetching its detail page.

        Extracts data using multiple strategies in order of reliability:
        1. JSON-LD JobPosting schema (via _extract_from_jsonld)
        2-5. HTML extraction (via _extract_posted_date_from_html):
             meta tags, <time> elements, CSS selectors, text patterns

        Only fills fields that are missing to avoid clobbering list-page data.
        Applies rate limiting delay after HTTP requests, even on failure.

        404/410 errors are handled gracefully (stale job listings) - the job is
        returned unmodified. Other HTTP errors propagate to allow source-level
        error handling.
        """
        url = job.get("url")
        if not url:
            return job

        platform = self._detect_platform()
        if platform == "smartrecruiters":
            return self._enrich_smartrecruiters(job)
        if platform == "workday":
            return self._enrich_workday(job)

        delay = get_fetch_delay_seconds()
        try:
            headers = {**DEFAULT_HEADERS, **self.config.headers}
            response = requests.get(url, headers=headers, timeout=15)

            # Handle stale job listings gracefully - 404/410 means the job was removed
            if response.status_code in (404, 410):
                logger.debug(
                    "Detail page not found (stale listing?), skipping enrichment: %s",
                    url,
                )
                return job

            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            # Strategy 1: JSON-LD JobPosting schema (most reliable)
            self._extract_from_jsonld(soup, job)

            # Strategy 2-5: If no posted_date yet, try HTML extraction methods
            if not job.get("posted_date"):
                html_date = self._extract_posted_date_from_html(soup)
                if html_date:
                    job["posted_date"] = html_date
        finally:
            # Rate limit after request, even on failure, to avoid overwhelming the source
            if delay > 0:
                time.sleep(delay)

        return job

    def _detect_platform(self) -> Optional[str]:
        """Lightweight platform detector based on config and job URL."""
        url = (self.config.url or "").lower()
        if "smartrecruiters.com" in url:
            return "smartrecruiters"
        if "myworkdayjobs.com" in url:
            return "workday"
        return None

    def _enrich_smartrecruiters(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Fetch SmartRecruiters job detail to fill description and metadata."""
        ref_url = job.get("url") or ""
        delay = get_fetch_delay_seconds()
        try:
            response = requests.get(ref_url, headers=DEFAULT_HEADERS, timeout=15)
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, json.JSONDecodeError) as e:
            logger.info("SmartRecruiters detail fetch failed for %s: %s", ref_url, e)
            return job
        finally:
            if delay > 0:
                time.sleep(delay)

        ad = (data.get("jobAd") or {}).get("sections") or {}
        desc = ((ad.get("jobDescription") or {}).get("text") or "").strip()
        reqs = ((ad.get("qualifications") or {}).get("text") or "").strip()
        title = (data.get("name") or "").strip()
        location = ((data.get("location") or {}).get("fullLocation") or "").strip()
        posted = data.get("releasedDate") or data.get("posted") or job.get("posted_date")

        if desc:
            job["description"] = desc
        elif reqs:
            job["description"] = reqs
        if title:
            job.setdefault("title", title)
        if location:
            job.setdefault("location", location)
        if posted:
            job.setdefault("posted_date", posted)

        return job

    def _enrich_workday(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Fetch Workday job detail for description and qualifications."""
        external_path = job.get("url") or ""
        base_url = self.config.base_url or self.config.url
        if external_path.startswith("http"):
            detail_url = external_path
        else:
            detail_url = f"{base_url.rstrip('/')}/{external_path.lstrip('/')}"

        delay = get_fetch_delay_seconds()
        try:
            response = requests.get(detail_url, headers=DEFAULT_HEADERS, timeout=15)
            response.raise_for_status()
            data = response.json()
        except (requests.RequestException, json.JSONDecodeError) as e:
            logger.info("Workday detail fetch failed for %s: %s", detail_url, e)
            return job
        finally:
            if delay > 0:
                time.sleep(delay)

        info = data.get("jobPostingInfo") or {}
        desc = (info.get("jobDescription") or "").strip()
        quals = (info.get("qualifications") or "").strip()
        title = (info.get("title") or "").strip()
        location = (
            (info.get("location") or "").strip()
            or (info.get("locationNames") or "").strip()
            or job.get("location")
        )
        posted = info.get("startDate") or info.get("postedOn")

        if desc:
            job["description"] = desc
        elif quals:
            job["description"] = quals
        if title:
            job.setdefault("title", title)
        if location:
            job.setdefault("location", location)
        if posted:
            job.setdefault("posted_date", posted)

        # Normalize URL to be absolute
        job["url"] = detail_url
        return job

    def _extract_from_jsonld(self, soup: BeautifulSoup, job: Dict[str, Any]) -> None:
        """Extract job data from JSON-LD JobPosting schema.

        Modifies job dict in-place with title, company, description, location,
        and posted_date if found in JSON-LD.
        """
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                data = json.loads(script.string or "{}")
            except json.JSONDecodeError:
                continue

            postings = []
            if isinstance(data, list):
                postings = [
                    d for d in data if isinstance(d, dict) and d.get("@type") == "JobPosting"
                ]
            elif isinstance(data, dict):
                graph = data.get("@graph")
                if graph and isinstance(graph, list):
                    postings = [
                        g for g in graph if isinstance(g, dict) and g.get("@type") == "JobPosting"
                    ]
                elif data.get("@type") == "JobPosting":
                    postings = [data]

            if not postings:
                continue

            jp = postings[0]
            job.setdefault("title", jp.get("title") or "")
            job.setdefault("company", (jp.get("hiringOrganization") or {}).get("name", ""))
            job.setdefault("description", jp.get("description", ""))

            # Location: try place then address fields
            if not job.get("location"):
                loc = None
                place = jp.get("jobLocation")
                if isinstance(place, list):
                    place = place[0] if place else None
                if isinstance(place, dict):
                    addr = place.get("address") or {}
                    city = addr.get("addressLocality") or ""
                    region = addr.get("addressRegion") or ""
                    country = addr.get("addressCountry") or ""
                    loc = ", ".join([p for p in [city, region, country] if p])
                if loc:
                    job["location"] = loc
                elif "location" not in job:
                    job["location"] = ""

            if not job.get("posted_date") and jp.get("datePosted"):
                job["posted_date"] = jp.get("datePosted")

            return  # Found and processed JobPosting, done

    def _extract_posted_date_from_html(self, soup: BeautifulSoup) -> Optional[str]:
        """
        Extract posted date from HTML using multiple fallback strategies.

        Tries in order of reliability:
        1. Meta tags (og:article:published_time, article:published_time, etc.)
        2. <time> elements with datetime attribute
        3. Common CSS selectors for date elements
        4. Text content matching date patterns
        """
        # Strategy 1: Meta tags
        meta_date = self._extract_date_from_meta(soup)
        if meta_date:
            return meta_date

        # Strategy 2: <time> elements with datetime attribute
        time_date = self._extract_date_from_time_elements(soup)
        if time_date:
            return time_date

        # Strategy 3: Common CSS selectors for job posting dates
        selector_date = self._extract_date_from_selectors(soup)
        if selector_date:
            return selector_date

        # Strategy 4: Text pattern matching for relative dates
        text_date = self._extract_date_from_text_patterns(soup)
        if text_date:
            return text_date

        return None

    def _extract_date_from_meta(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract date from meta tags."""
        # Priority order of meta tag names/properties
        meta_selectors = [
            {"property": "article:published_time"},
            {"property": "og:article:published_time"},
            {"name": "date"},
            {"name": "publish_date"},
            {"name": "publication_date"},
            {"name": "DC.date"},
            {"name": "DC.date.issued"},
            {"name": "dcterms.created"},
            {"property": "datePublished"},
            {"itemprop": "datePosted"},
            {"itemprop": "datePublished"},
        ]

        for selector in meta_selectors:
            meta = soup.find("meta", attrs=selector)
            if meta and meta.get("content"):
                content = meta.get("content", "").strip()
                if content and parse_job_date(content):
                    return content

        return None

    def _extract_date_from_time_elements(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract date from <time> elements with datetime attribute."""
        job_related_patterns = ["post", "publish", "date", "created", "listed", "added"]

        # Collect all time elements once to avoid duplicate DOM traversal
        time_elements = soup.find_all("time")
        first_valid_date: Optional[str] = None

        for time_el in time_elements:
            datetime_attr = time_el.get("datetime")
            if not (
                datetime_attr and isinstance(datetime_attr, str) and parse_job_date(datetime_attr)
            ):
                continue

            # Remember first valid date as fallback
            if first_valid_date is None:
                first_valid_date = datetime_attr

            # Check if this time element is in a job-related context
            # Check up to 5 parent levels for job-related classes
            depth = 0
            for parent in time_el.parents:
                depth += 1
                if depth > 5:
                    break
                if parent.name in ["div", "span", "p", "li", "section", "article"]:
                    class_list = parent.get("class") or []
                    if isinstance(class_list, list):
                        parent_classes = " ".join(class_list).lower()
                        if any(p in parent_classes for p in job_related_patterns):
                            return datetime_attr

        # Fall back to first valid time element
        return first_valid_date

    def _extract_date_from_selectors(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract date using common CSS selectors for job posting dates."""
        # Common class/id patterns for date elements in job postings
        date_selectors = [
            "[class*='posted-date']",
            "[class*='post-date']",
            "[class*='publish-date']",
            "[class*='date-posted']",
            "[class*='job-date']",
            "[class*='listing-date']",
            "[class*='created-date']",
            "[class*='datePosted']",
            "[class*='postDate']",
            "[class*='jobDate']",
            "[data-automation*='date']",
            "[data-testid*='date']",
            ".posted-on",
            ".job-posted",
            ".posting-date",
        ]

        for selector in date_selectors:
            try:
                elements = soup.select(selector)
                for el in elements:
                    # Try datetime attribute first
                    date_str = el.get("datetime")
                    if date_str and isinstance(date_str, str) and parse_job_date(date_str):
                        return date_str

                    # Try text content
                    text = el.get_text(strip=True)
                    if text and parse_job_date(text):
                        return text
            except Exception:
                continue

        return None

    def _extract_date_from_text_patterns(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract date from text patterns like 'Posted 2 days ago'."""
        # Common patterns that precede dates in job postings
        date_patterns = [
            r"posted\s*:?\s*(.+?)(?:\s*[|\-•]|$)",
            r"published\s*:?\s*(.+?)(?:\s*[|\-•]|$)",
            r"listed\s*:?\s*(.+?)(?:\s*[|\-•]|$)",
            r"added\s*:?\s*(.+?)(?:\s*[|\-•]|$)",
            r"date\s*:?\s*(.+?)(?:\s*[|\-•]|$)",
            # Direct relative date patterns
            r"(\d+\s*(?:day|days|week|weeks|hour|hours|month|months)\s*ago)",
            r"(today|yesterday|just\s*now|just\s*posted)",
        ]

        # Look in elements likely to contain posting metadata
        metadata_selectors = [
            "[class*='meta']",
            "[class*='info']",
            "[class*='detail']",
            "[class*='header']",
            "[class*='summary']",
            "header",
            ".job-info",
            ".posting-info",
        ]

        text_to_search = []

        # Gather text from metadata-like elements
        for selector in metadata_selectors:
            try:
                for el in soup.select(selector):
                    text = el.get_text(separator=" ", strip=True)
                    if text and len(text) < 500:  # Avoid huge text blocks
                        text_to_search.append(text.lower())
            except Exception:
                continue

        # Search for date patterns
        for text in text_to_search:
            for pattern in date_patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    date_str = match.group(1).strip()
                    parsed = parse_job_date(date_str)
                    if parsed:
                        return date_str

        return None

    def _extract_fields(self, item: Any) -> Dict[str, Any]:
        """
        Extract fields from item using config mappings.

        Args:
            item: Raw item (dict for api/rss, element for html)

        Returns:
            Standardized job dictionary
        """
        if isinstance(item, PreExtractedJob):
            return item.data

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
            if isinstance(url, str):
                is_absolute = re.match(r"^https?://", url)
                if not is_absolute:
                    # Normalize slashes to avoid double slashes
                    base = self.config.base_url.rstrip("/")
                    relative = url.lstrip("/")
                    job["url"] = f"{base}/{relative}"

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

        # Extract location from description "Headquarters:" pattern if missing
        if not job.get("location") and job.get("description"):
            location = self._extract_location_from_description(job["description"])
            if location:
                job["location"] = location

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

    def _matches_company_filter(self, job: Dict[str, Any]) -> bool:
        """
        Check if a job matches the company filter.

        Uses fuzzy matching to handle variations in company names:
        - Case-insensitive comparison
        - Strips common suffixes (.io, Inc, LLC, etc.)
        - Checks if filter is contained in company name or vice versa
        - Requires minimum 3 chars to avoid false positives with short names

        Args:
            job: Job dictionary with 'company' field

        Returns:
            True if job matches filter or no filter is set
        """
        if not self.config.company_filter:
            return True

        company = job.get("company", "")
        if not company:
            return False

        # Normalize both for comparison
        filter_norm = self._normalize_company_name(self.config.company_filter)
        company_norm = self._normalize_company_name(company)

        # Exact match after normalization
        if filter_norm == company_norm:
            return True

        # For substring matching, require minimum length to avoid false positives
        # e.g., "AI" matching "RAIL" or "Go" matching "Google"
        min_length_for_substring = 3

        if len(filter_norm) >= min_length_for_substring:
            # Check if filter is a whole word in company name
            # e.g. "Proxify" should match "Proxify AB" but not "NotProxify" or "ProxifyAB"
            if re.search(r"\b" + re.escape(filter_norm) + r"\b", company_norm):
                return True

        if len(company_norm) >= min_length_for_substring:
            # Check if company is a whole word in filter (handles normalization differences)
            if re.search(r"\b" + re.escape(company_norm) + r"\b", filter_norm):
                return True

        return False

    def _normalize_company_name(self, name: Optional[str]) -> str:
        """
        Normalize company name for fuzzy matching.

        Removes common suffixes, punctuation, and normalizes case.

        Args:
            name: Company name to normalize (can be None)

        Returns:
            Normalized company name
        """
        if not name:
            return ""

        # Lowercase and strip whitespace
        result = name.lower().strip()

        # Remove common legal suffixes
        suffixes = [
            " inc.",
            " inc",
            " llc",
            " ltd.",
            " ltd",
            " co.",
            " co",
            " corp.",
            " corp",
            " gmbh",
            " ag",
            " pty ltd",
            " pty",
            " holdings",
            " group",
            " limited",
        ]
        for suffix in suffixes:
            if result.endswith(suffix):
                result = result[: -len(suffix)]

        # Remove .io, .com, .ai etc. domain-style suffixes
        result = re.sub(r"\.(io|com|ai|app|dev|co|net|org)$", "", result)

        # Remove punctuation except spaces
        result = re.sub(r"[^\w\s]", "", result)

        # Collapse multiple spaces
        result = re.sub(r"\s+", " ", result).strip()

        return result

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

    def _extract_location_from_description(self, description: str) -> Optional[str]:
        """
        Extract headquarters location from description.

        WeWorkRemotely and similar aggregators often include:
        <strong>Headquarters:</strong> City, State/Country

        Args:
            description: Job description text (may contain HTML)

        Returns:
            Location string if found, None otherwise
        """
        if not description:
            return None

        # Pattern to match "Headquarters: Location" in various formats
        patterns = [
            r"Headquarters:</strong>\s*([^\n<]+)",
            r"Headquarters:&lt;/strong&gt;\s*([^\n&]+)",
            r"Headquarters:\s*([^\n<]+)",
        ]

        for pattern in patterns:
            match = re.search(pattern, description, re.IGNORECASE)
            if match:
                location = match.group(1).strip()
                # Clean up common artifacts
                location = re.sub(r"<br\s*/?>.*", "", location, flags=re.IGNORECASE)
                location = location.strip()
                if location and len(location) < 100:
                    return location

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
        if isinstance(item, dict):
            return self._dot_access(item, path)
        elif self.config.type == "html":
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

        Handles common RSS field names and fallbacks. Feedparser normalizes
        RSS element names (e.g., pubDate -> published), so we map common
        RSS field names to their feedparser equivalents using the class
        constant _RSS_TO_FEEDPARSER_MAP.

        Args:
            entry: Feedparser entry
            path: Attribute name (may be RSS element name or feedparser name)

        Returns:
            Attribute value or None
        """
        # Normalize path if it's a raw RSS element name
        normalized_path = self._RSS_TO_FEEDPARSER_MAP.get(path, path)

        # Direct attribute access with normalized path
        value = getattr(entry, normalized_path, None)

        # Handle common fallbacks
        if value is None:
            # Try alternate field names
            fallbacks = {
                "description": ["summary", "content"],
                "url": ["link", "id"],
                "posted_date": ["published", "updated", "created"],
                "published": ["updated", "created"],  # Fallback for date fields
            }
            for fallback in fallbacks.get(normalized_path, []):
                value = getattr(entry, fallback, None)
                if value is not None:
                    break

            # Handle content list
            if value is None and normalized_path in ("description", "content"):
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
            - Unix timestamps in seconds (int/float)
            - Unix timestamps in milliseconds (11+ digit int/float)
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
                # Heuristic to detect millisecond timestamps: if a numeric timestamp
                # is >= 10,000,000,000 (11+ digits), we assume it's in milliseconds.
                # A 10-digit timestamp in seconds can represent dates up to year 2286,
                # so this is a reasonable assumption for job posting dates.
                # Examples: 1752761621698 (ms) vs 1704067200 (s)
                timestamp = float(value)
                if timestamp >= 10_000_000_000:
                    timestamp = timestamp / 1000.0
                dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
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
