"""AI-powered source configuration discovery."""

import json
import logging
from typing import Any, Dict, Optional, Tuple

import feedparser
import requests

from job_finder.ai.providers import AIProvider
from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.platform_patterns import (
    PlatformPattern,
    build_config_from_pattern,
    match_platform,
)
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

    Uses a data-driven pattern registry for known platforms,
    falling back to AI analysis for unknown sources.
    """

    def __init__(self, provider: Optional[AIProvider]):
        """
        Initialize source discovery.

        Args:
            provider: AI provider instance to use for analysis (optional when
                pattern-based discovery is sufficient).
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
            # Step 0: Try pattern-based detection FIRST (no fetch required)
            # This handles JS-rendered pages where fetch returns unusable HTML
            pattern_config = self._try_pattern_detection(url)
            if pattern_config:
                validation = self._validate_config(pattern_config)
                if validation.get("success"):
                    logger.info(f"Pattern-based detection succeeded for {url}")
                    return pattern_config, validation
                # If validation failed, continue to try fetching

            # Step 1: Detect source type and fetch sample
            source_type, sample = self._detect_and_fetch(url)

            if not sample:
                logger.warning(f"Could not fetch content from {url}")
                # Even if fetch failed, pattern config might still be usable
                if pattern_config:
                    return pattern_config, {
                        "success": False,
                        "error": "fetch_failed_but_pattern_available",
                    }
                return None, {}

            logger.info(f"Detected source type '{source_type}' for {url}")

            # Step 2: Generate config using patterns or AI
            config = self._generate_config(url, source_type, sample)

            if not config:
                logger.warning(f"Could not generate config for {url}")
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

    def _try_pattern_detection(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Try to detect platform from URL patterns (data-driven).

        This handles platforms where:
        - The page is JS-rendered (so fetch returns unusable HTML)
        - The page returns errors (500, etc.)
        - But we can derive the API endpoint from the URL pattern

        Args:
            url: Source URL to analyze

        Returns:
            Config dictionary or None
        """
        result = match_platform(url)
        if not result:
            return None

        pattern, groups = result
        config = build_config_from_pattern(pattern, groups)

        # Validate by making a test request to the API
        if not self._validate_api_endpoint(config, pattern):
            return None

        return config

    def _validate_api_endpoint(self, config: Dict[str, Any], pattern: PlatformPattern) -> bool:
        """
        Validate that an API endpoint works by making a test request.

        Args:
            config: Config dictionary with API details
            pattern: Platform pattern for validation hints

        Returns:
            True if API returns expected data structure
        """
        try:
            url = config["url"]
            method = config.get("method", "GET")
            headers = config.get("headers", {})
            headers.setdefault("Accept", "application/json")

            if method == "POST":
                response = requests.post(
                    url,
                    headers=headers,
                    json=config.get("post_body", {}),
                    timeout=10,
                )
            else:
                response = requests.get(url, headers=headers, timeout=10)

            response.raise_for_status()
            data = response.json()

            # Check for expected key in response
            if pattern.validation_key:
                if pattern.validation_key not in data:
                    return False
            else:
                # For array responses (like Lever), check it's a list
                if not isinstance(data, list):
                    return False

            return True

        except (requests.RequestException, json.JSONDecodeError) as e:
            logger.debug(f"API validation failed for {config['url']}: {e}")
            return False

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
        Generate source config using pattern matching first, then AI if available.

        Args:
            url: Source URL
            source_type: Detected source type
            sample: Sample content

        Returns:
            Config dictionary or None
        """
        # Try pattern-based detection with the fetched sample
        pattern_config = self._try_pattern_with_sample(url, source_type, sample)
        if pattern_config:
            return pattern_config

        # Standard RSS feeds can be mapped directly
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

        # Fall back to AI for unknown sources
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

    def _try_pattern_with_sample(
        self, url: str, source_type: str, sample: str
    ) -> Optional[Dict[str, Any]]:
        """
        Try pattern-based detection when we have fetched sample data.

        For API sources, we can validate the response structure matches
        the expected pattern even if the URL didn't match exactly.

        Args:
            url: Source URL
            source_type: Detected source type
            sample: Fetched sample content

        Returns:
            Config dictionary or None
        """
        if source_type != "api":
            return None

        try:
            data = json.loads(sample)
        except json.JSONDecodeError:
            return None

        # Check if URL matches any known pattern
        result = match_platform(url)
        if result:
            pattern, groups = result
            config = build_config_from_pattern(pattern, groups)
            # Already validated during URL match, but verify response has expected key
            if pattern.validation_key and pattern.validation_key in data:
                return config
            if not pattern.validation_key and isinstance(data, list):
                return config

        return None

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

=== CONFIGURATION RULES ===

IMPORTANT: Many job boards use JavaScript rendering for their HTML pages, but provide
JSON APIs that return structured data. ALWAYS prefer using the API over HTML scraping.

For API sources:
- type: "api"
- url: The API endpoint URL
- response_path: Path to the jobs array (e.g., "jobs", "data.results", "[1:]" for array slice)
- fields: Object mapping standard field names to source field paths using dot notation
  - Required: "title", "url"
  - Optional: "company", "location", "description", "posted_date", "salary"
- method: "GET" or "POST" (default: "GET")
- post_body: Request body for POST APIs
- base_url: Base URL for constructing full URLs from relative paths

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
- headers: Custom HTTP headers

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
            if source_config.method == "POST":
                resp = requests.post(
                    url,
                    headers=headers,
                    json=source_config.post_body,
                    timeout=30,
                )
            else:
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
