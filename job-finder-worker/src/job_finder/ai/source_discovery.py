"""AI-powered source configuration discovery."""

import json
import logging
from typing import Any, Dict, Optional, Tuple

import feedparser
import requests

from job_finder.ai.providers import AIProvider
from job_finder.scrapers.config_expander import parse_workday_url
from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig
from job_finder.settings import get_scraping_settings

logger = logging.getLogger(__name__)


class SourceDiscovery:
    """
    AI-powered discovery of source configurations.

    Analyzes URLs to:
    1. Detect source type (api, rss, html)
    2. Generate field mappings
    3. Validate configuration by test scraping
    """

    def __init__(self, provider: Optional[AIProvider]):
        """
        Initialize source discovery.

        Args:
            provider: AI provider instance to use for analysis (optional when
                heuristic discovery is sufficient).
        """
        self.provider = provider

    def discover(self, url: str) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
        """
        Discover source configuration for a URL.

        Args:
            url: URL to analyze

        Returns:
            Tuple of (SourceConfig dict or None, metadata dict)
        """
        try:
            # Step 0: Try URL-based heuristics FIRST (before fetch)
            # Some platforms (Workday, Ashby HTML pages) can be detected by URL pattern
            # even when the page itself is JS-rendered or returns errors
            heuristic_config = self._try_url_based_heuristics(url)
            if heuristic_config:
                validation = self._validate_config(heuristic_config)
                if validation.get("success"):
                    logger.info(f"URL-based heuristic succeeded for {url}")
                    return heuristic_config, validation
                # If validation failed, continue to try fetching

            # Step 1: Detect source type and fetch sample
            source_type, sample = self._detect_and_fetch(url)

            if not sample:
                logger.warning(f"Could not fetch content from {url}")
                # Even if fetch failed, heuristic config might still be usable
                # (e.g., Workday POST API might work even if GET fails)
                if heuristic_config:
                    return heuristic_config, {"success": False, "error": "fetch_failed_but_heuristic_available"}
                return None, {}

            logger.info(f"Detected source type '{source_type}' for {url}")

            # Step 2: Generate config using heuristics or AI
            config = self._generate_config(url, source_type, sample)

            if not config:
                logger.warning(f"AI could not generate config for {url}")
                return None, {}

            # Step 3: Validate config
            validation = self._validate_config(config)
            if validation.get("success"):
                logger.info(f"Successfully discovered config for {url}")
                return config, validation

            logger.warning(f"Config validation failed for {url}")
            return None, validation

        except Exception as e:
            logger.error(f"Error discovering source {url}: {e}")
            return None, {}

    def _detect_and_fetch(self, url: str) -> Tuple[str, Optional[str]]:
        """
        Detect source type and fetch sample content.

        Args:
            url: URL to analyze

        Returns:
            Tuple of (source_type, sample_content)
        """
        headers = {
            "User-Agent": "JobFinderBot/1.0",
            "Accept": "application/json, application/rss+xml, application/xml, text/xml, text/html, */*",
        }

        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "").lower()

            # Check for RSS/Atom feed
            if any(x in content_type for x in ["rss", "xml", "atom"]):
                return "rss", response.text

            # Check for JSON API
            if "json" in content_type:
                return "api", response.text

            # Try parsing as RSS anyway (some feeds don't set correct content-type)
            if url.endswith((".rss", ".xml", "/feed", "/rss")):
                feed = feedparser.parse(url)
                if feed.entries:
                    return "rss", response.text

            # Try parsing as JSON
            try:
                response.json()
                return "api", response.text
            except (ValueError, json.JSONDecodeError):
                pass

            # Default to HTML
            return "html", response.text

        except requests.RequestException as e:
            logger.error(f"Error fetching {url}: {e}")
            return "unknown", None

    def _generate_config(self, url: str, source_type: str, sample: str) -> Optional[Dict[str, Any]]:
        """
        Generate source config using heuristics first, then AI if available.

        Args:
            url: Source URL
            source_type: Detected source type
            sample: Sample content

        Returns:
            Config dictionary or None
        """

        # Heuristic: Greenhouse API responses follow a consistent schema that we
        # can map without AI. This avoids failed AI calls when credentials are
        # missing or CLI arguments change.
        heuristic_config = self._try_greenhouse_config(url, sample)
        if heuristic_config:
            return heuristic_config

        # Heuristic: Ashby API responses follow a consistent schema
        heuristic_config = self._try_ashby_config(url, sample)
        if heuristic_config:
            return heuristic_config

        # Heuristic: Workday URLs follow a consistent pattern and have a POST API
        heuristic_config = self._try_workday_config(url)
        if heuristic_config:
            return heuristic_config

        # Heuristic: Standard RSS feeds can be mapped directly.
        if source_type == "rss":
            return {
                "type": "rss",
                "url": url,
                "fields": {
                    "title": "title",
                    "url": "link",
                    "description": "summary",
                    "posted_date": "published",
                },
            }

        if not self.provider:
            logger.warning("AI provider unavailable; cannot generate config for %s", url)
            return None

        prompt = self._build_prompt(url, source_type, sample)

        try:
            response = self.provider.generate(prompt, max_tokens=2000, temperature=0.1)
            return self._parse_response(response, source_type, url)
        except Exception as e:
            logger.error(f"Error generating config: {e}")
            return None

    def _try_greenhouse_config(self, url: str, sample: str) -> Optional[Dict[str, Any]]:
        """Return a deterministic config for Greenhouse API responses."""
        if "boards-api.greenhouse.io" not in url:
            return None

        try:
            data = json.loads(sample)
        except json.JSONDecodeError:
            return None

        jobs = data.get("jobs") if isinstance(data, dict) else None
        # An empty jobs list is valid (no openings); only bail when the key is absent/null
        if jobs is None:
            return None

        return {
            "type": "api",
            "url": url,
            "response_path": "jobs",
            "fields": {
                "title": "title",
                "location": "location.name",
                "description": "content",
                "url": "absolute_url",
                "posted_date": "updated_at",
            },
        }

    def _try_ashby_config(self, url: str, sample: str) -> Optional[Dict[str, Any]]:
        """Return a deterministic config for Ashby API responses."""
        if "api.ashbyhq.com/posting-api/job-board" not in url:
            return None

        try:
            data = json.loads(sample)
        except json.JSONDecodeError:
            return None

        jobs = data.get("jobs") if isinstance(data, dict) else None
        # An empty jobs list is valid (no openings); only bail when the key is absent/null
        if jobs is None:
            return None

        return {
            "type": "api",
            "url": url,
            "response_path": "jobs",
            "fields": {
                "title": "title",
                "location": "location",
                "description": "descriptionHtml",
                "url": "jobUrl",
                "posted_date": "publishedAt",
            },
        }

    def _try_workday_config(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Return a deterministic config for Workday careers pages.

        Workday pages are JavaScript-rendered, but we can detect them by URL pattern
        and derive the API endpoint from the careers page URL.

        URL Pattern: https://{tenant}.{wd_instance}.myworkdayjobs.com/{site_id}
        API Pattern: POST https://{tenant}.{wd_instance}.myworkdayjobs.com/wday/cxs/{tenant}/{site_id}/jobs
        """
        # Check if URL matches Workday pattern
        parsed = parse_workday_url(url)
        if not parsed:
            return None

        tenant, wd_instance, site_id = parsed

        # Construct the API URL
        api_url = (
            f"https://{tenant}.{wd_instance}.myworkdayjobs.com/wday/cxs/{tenant}/{site_id}/jobs"
        )
        base_url = f"https://{tenant}.{wd_instance}.myworkdayjobs.com/{site_id}"

        # Validate by making a test POST request
        try:
            response = requests.post(
                api_url,
                headers={"Content-Type": "application/json"},
                json={"limit": 1, "offset": 0},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
            if "jobPostings" not in data:
                return None
        except (requests.RequestException, json.JSONDecodeError):
            return None

        return {
            "type": "api",
            "url": api_url,
            "method": "POST",
            "post_body": {"limit": 20, "offset": 0},
            "response_path": "jobPostings",
            "base_url": base_url,
            "fields": {
                "title": "title",
                "location": "locationsText",
                "url": "externalPath",
                "posted_date": "postedOn",
            },
        }

    def _try_url_based_heuristics(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Try URL-based heuristics that don't require fetching the page.

        This handles platforms where:
        - The page is JS-rendered (so fetch returns unusable HTML)
        - The page returns errors (500, etc.)
        - But we can derive the API endpoint from the URL pattern

        Args:
            url: Source URL to analyze

        Returns:
            Config dictionary or None
        """
        # Try Workday first - their pages often return 500 but API works
        config = self._try_workday_config(url)
        if config:
            return config

        # Try Ashby HTML URL -> API URL conversion
        config = self._try_ashby_html_to_api(url)
        if config:
            return config

        return None

    def _try_ashby_html_to_api(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Convert Ashby HTML job board URL to API URL.

        jobs.ashbyhq.com/{board_name} -> api.ashbyhq.com/posting-api/job-board/{board_name}

        The HTML pages are JS-rendered and return unusable content,
        but the API endpoint is predictable and returns JSON.
        """
        import re
        from urllib.parse import urlparse

        parsed = urlparse(url)

        # Check if it's an Ashby HTML page
        if "jobs.ashbyhq.com" not in parsed.netloc:
            return None

        # Extract board name from path (e.g., /supabase or /The%20Browser%20Company)
        path_parts = parsed.path.strip("/").split("/")
        if not path_parts or not path_parts[0]:
            return None

        board_name = path_parts[0]

        # Construct API URL
        api_url = f"https://api.ashbyhq.com/posting-api/job-board/{board_name}?includeCompensation=true"

        # Validate by fetching API
        try:
            response = requests.get(
                api_url,
                headers={"Accept": "application/json"},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
            if "jobs" not in data:
                return None
        except (requests.RequestException, json.JSONDecodeError):
            return None

        return {
            "type": "api",
            "url": api_url,
            "response_path": "jobs",
            "fields": {
                "title": "title",
                "location": "location",
                "description": "descriptionHtml",
                "url": "jobUrl",
                "posted_date": "publishedAt",
            },
        }

    def _build_prompt(self, url: str, source_type: str, sample: str) -> str:
        """Build AI prompt for config generation."""
        scraping_settings = get_scraping_settings()
        max_sample = scraping_settings.get("maxHtmlSampleLength", 20000)
        truncated_sample = sample[:max_sample] if len(sample) > max_sample else sample

        return f"""Analyze this job listing source and generate a scraper configuration.

URL: {url}
Detected Type: {source_type}

Sample Content:
```
{truncated_sample}
```

=== KNOWN ATS PLATFORMS (use these exact configurations) ===

IMPORTANT: Many job boards use JavaScript rendering for their HTML pages, but provide
JSON APIs that return structured data. ALWAYS prefer using the API over HTML scraping.

1. GREENHOUSE (boards-api.greenhouse.io)
   - API URL pattern: https://boards-api.greenhouse.io/v1/boards/{{board_token}}/jobs?content=true
   - The board_token is from the careers page URL (e.g., anthropic from jobs.greenhouse.io/anthropic)
   {{
     "type": "api",
     "url": "https://boards-api.greenhouse.io/v1/boards/BOARD_TOKEN/jobs?content=true",
     "response_path": "jobs",
     "fields": {{
       "title": "title",
       "location": "location.name",
       "description": "content",
       "url": "absolute_url",
       "posted_date": "updated_at"
     }}
   }}

2. ASHBY (api.ashbyhq.com)
   - API URL pattern: https://api.ashbyhq.com/posting-api/job-board/{{board_name}}?includeCompensation=true
   - The board_name is CASE-SENSITIVE and matches jobs.ashbyhq.com/{{board_name}}
   - HTML pages at jobs.ashbyhq.com require JavaScript - ALWAYS use the API instead
   {{
     "type": "api",
     "url": "https://api.ashbyhq.com/posting-api/job-board/BOARD_NAME?includeCompensation=true",
     "response_path": "jobs",
     "fields": {{
       "title": "title",
       "location": "location",
       "description": "descriptionHtml",
       "url": "jobUrl",
       "posted_date": "publishedAt"
     }}
   }}

3. LEVER (jobs.lever.co)
   - NOTE: Lever's public API (api.lever.co) is unreliable/deprecated for most companies
   - Many companies have migrated away from Lever or disabled the API
   - If API returns "Document not found", the source may be unavailable

4. WORKDAY ({{tenant}}.{{wd_instance}}.myworkdayjobs.com)
   - URL pattern: https://{{tenant}}.{{wd_instance}}.myworkdayjobs.com/{{site_id}}
   - API pattern: POST https://{{tenant}}.{{wd_instance}}.myworkdayjobs.com/wday/cxs/{{tenant}}/{{site_id}}/jobs
   - HTML pages require JavaScript - ALWAYS use the POST API instead
   - Job URLs are relative paths that need the base URL prepended
   {{
     "type": "api",
     "url": "https://TENANT.WD_INSTANCE.myworkdayjobs.com/wday/cxs/TENANT/SITE_ID/jobs",
     "method": "POST",
     "post_body": {{"limit": 20, "offset": 0}},
     "response_path": "jobPostings",
     "base_url": "https://TENANT.WD_INSTANCE.myworkdayjobs.com/SITE_ID",
     "fields": {{
       "title": "title",
       "location": "locationsText",
       "url": "externalPath",
       "posted_date": "postedOn"
     }}
   }}

=== GENERAL CONFIGURATION RULES ===

For API sources:
- type: "api"
- url: The API endpoint URL
- response_path: Path to the jobs array (e.g., "jobs", "data.results", "[1:]" for array slice)
- fields: Object mapping standard field names to source field paths using dot notation
  - Required: "title", "url"
  - Optional: "company", "location", "description", "posted_date", "salary"

For RSS sources:
- type: "rss"
- url: The RSS feed URL
- fields: Object mapping standard field names to RSS entry attributes
  - Common: title, link, summary/description, published

For HTML sources (use only when no API is available):
- type: "html"
- url: The page URL
- job_selector: CSS selector for job listing elements
- fields: Object mapping standard field names to CSS selectors
  - Use ".class" or "#id" for text content
  - Use "a@href" syntax for attributes
- NOTE: HTML scraping does NOT support JavaScript rendering. If the page requires
  JavaScript to load content, you MUST find an API endpoint instead.

Additional optional fields:
- company_name: Static company name if not in data
- salary_min_field: Path to min salary (for APIs with separate min/max)
- salary_max_field: Path to max salary

Return ONLY valid JSON with no explanation. Ensure all required fields are present."""

    def _parse_response(
        self, response: str, source_type: str, url: str
    ) -> Optional[Dict[str, Any]]:
        """Parse AI response into config dict."""
        try:
            # Clean response
            response = response.strip()

            # Remove markdown code blocks - find JSON content directly
            if response.startswith("```"):
                json_start = response.find("{")
                json_end = response.rfind("}")
                if json_start != -1 and json_end != -1:
                    response = response[json_start : json_end + 1]

            config = json.loads(response)

            # Ensure required fields
            if "type" not in config:
                config["type"] = source_type
            if "url" not in config:
                config["url"] = url
            if "fields" not in config:
                logger.warning("AI response missing 'fields' mapping")
                return None

            return config

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {e}")
            logger.debug(f"Response was: {response[:500]}")
            return None

    def _validate_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate config by attempting a test scrape.

        Args:
            config: Configuration to validate

        Returns:
            Dict with success flag and validation metadata
        """
        meta: Dict[str, Any] = {
            "success": False,
            "parsed_length": 0,
            "needs_api_key": False,
            "error": "",
        }

        try:
            # Create SourceConfig and validate schema
            source_config = SourceConfig.from_dict(config)
            source_config.validate()

            # Detect auth requirement for APIs before scraping
            if source_config.type == "api":
                api_ok, api_jobs, needs_key = self._probe_api(source_config)
                if needs_key:
                    meta["needs_api_key"] = True
                    meta["error"] = "auth_required"
                    return meta
                if not api_ok:
                    meta["error"] = "api_probe_failed"
                    return meta
                jobs = api_jobs
            else:
                scraper = GenericScraper(source_config)
                jobs = scraper.scrape()

            meta["parsed_length"] = len(jobs)

            # Structural check: ensure mapping yields title/url if jobs exist
            if jobs:
                valid_sample = any(job.get("title") and job.get("url") for job in jobs[:3])
                if not valid_sample:
                    meta["error"] = "missing_required_fields"
                    return meta

            # Empty handling
            policy = config.get("validation_policy", "fail_on_empty")
            if len(jobs) == 0 and policy == "fail_on_empty":
                meta["error"] = "empty_results"
                return meta

            meta["success"] = True
            return meta

        except Exception as e:
            logger.error(f"Config validation failed: {e}")
            meta["error"] = str(e)
            return meta

    def _probe_api(self, source_config: SourceConfig) -> Tuple[bool, list, bool]:
        """
        Make a single API call to detect auth needs and return parsed jobs or errors.
        """
        headers = {**source_config.headers}
        url = source_config.url

        if source_config.api_key:
            if source_config.auth_type == "bearer":
                headers["Authorization"] = f"Bearer {source_config.api_key}"
            elif source_config.auth_type == "header" and source_config.auth_param:
                headers[source_config.auth_param] = source_config.api_key
            elif source_config.auth_type == "query" and source_config.auth_param:
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}{source_config.auth_param}={source_config.api_key}"

        try:
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code in (401, 403):
                return False, [], True
            resp.raise_for_status()
            data = resp.json()
            jobs = GenericScraper(source_config)._navigate_path(data, source_config.response_path)
            return True, jobs, False
        except (requests.RequestException, json.JSONDecodeError) as exc:
            logger.warning("API probe failed for %s: %s", source_config.url, exc)
            return False, [], False


def discover_source(
    url: str, provider: AIProvider
) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    """
    Convenience function to discover source configuration.

    Args:
        url: URL to analyze
        provider: AI provider instance to use

    Returns:
        Tuple of SourceConfig dict (or None) and validation metadata
    """
    discovery = SourceDiscovery(provider)
    return discovery.discover(url)
