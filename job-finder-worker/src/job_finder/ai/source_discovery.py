"""AI-powered source configuration discovery."""

import json
import logging
from typing import Any, Dict, Optional, Tuple

import feedparser
import requests

from job_finder.ai.providers import AITask, create_provider
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

    def __init__(self, provider_type: str = "claude", api_key: Optional[str] = None):
        """
        Initialize source discovery.

        Args:
            provider_type: AI provider to use (claude, openai)
            api_key: Optional API key
        """
        self.provider = create_provider(
            provider_type=provider_type, api_key=api_key, task=AITask.SELECTOR_DISCOVERY
        )

    def discover(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Discover source configuration for a URL.

        Args:
            url: URL to analyze

        Returns:
            SourceConfig dict or None if discovery failed
        """
        try:
            # Step 1: Detect source type and fetch sample
            source_type, sample = self._detect_and_fetch(url)

            if not sample:
                logger.warning(f"Could not fetch content from {url}")
                return None

            logger.info(f"Detected source type '{source_type}' for {url}")

            # Step 2: Generate config using AI
            config = self._generate_config(url, source_type, sample)

            if not config:
                logger.warning(f"AI could not generate config for {url}")
                return None

            # Step 3: Validate config
            if self._validate_config(config):
                logger.info(f"Successfully discovered config for {url}")
                return config

            logger.warning(f"Config validation failed for {url}")
            return None

        except Exception as e:
            logger.error(f"Error discovering source {url}: {e}")
            return None

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
        Generate source config using AI analysis.

        Args:
            url: Source URL
            source_type: Detected source type
            sample: Sample content

        Returns:
            Config dictionary or None
        """
        prompt = self._build_prompt(url, source_type, sample)

        try:
            response = self.provider.generate(prompt, max_tokens=2000, temperature=0.1)
            return self._parse_response(response, source_type, url)
        except Exception as e:
            logger.error(f"Error generating config: {e}")
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

Generate a JSON configuration object with these fields:

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

For HTML sources:
- type: "html"
- url: The page URL
- job_selector: CSS selector for job listing elements
- fields: Object mapping standard field names to CSS selectors
  - Use ".class" or "#id" for text content
  - Use "a@href" syntax for attributes

Additional optional fields:
- company_name: Static company name if not in data
- salary_min_field: Path to min salary (for APIs with separate min/max)
- salary_max_field: Path to max salary

Example for Greenhouse API:
{{
  "type": "api",
  "url": "https://boards-api.greenhouse.io/v1/boards/company/jobs?content=true",
  "response_path": "jobs",
  "company_name": "Company Name",
  "fields": {{
    "title": "title",
    "location": "location.name",
    "description": "content",
    "url": "absolute_url",
    "posted_date": "updated_at"
  }}
}}

Return ONLY valid JSON with no explanation. Ensure all required fields are present."""

    def _parse_response(
        self, response: str, source_type: str, url: str
    ) -> Optional[Dict[str, Any]]:
        """Parse AI response into config dict."""
        try:
            # Clean response
            response = response.strip()

            # Remove markdown code blocks
            if response.startswith("```"):
                lines = response.split("\n")
                response = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

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

    def _validate_config(self, config: Dict[str, Any]) -> bool:
        """
        Validate config by attempting a test scrape.

        Args:
            config: Configuration to validate

        Returns:
            True if config produces valid results
        """
        try:
            # Create SourceConfig and validate schema
            source_config = SourceConfig.from_dict(config)
            source_config.validate()

            # Attempt test scrape
            from job_finder.scrapers.generic_scraper import GenericScraper

            scraper = GenericScraper(source_config)
            jobs = scraper.scrape()

            # Check that we got some results
            if not jobs:
                logger.warning("Test scrape returned no jobs")
                return False

            # Check that jobs have required fields
            for job in jobs[:3]:  # Check first few
                if not job.get("title") or not job.get("url"):
                    logger.warning(f"Job missing required fields: {job}")
                    return False

            logger.info(f"Config validated: found {len(jobs)} jobs")
            return True

        except Exception as e:
            logger.error(f"Config validation failed: {e}")
            return False


def discover_source(url: str) -> Optional[Dict[str, Any]]:
    """
    Convenience function to discover source configuration.

    Args:
        url: URL to analyze

    Returns:
        SourceConfig dict or None
    """
    discovery = SourceDiscovery()
    return discovery.discover(url)
