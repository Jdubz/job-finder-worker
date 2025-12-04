"""Job source scrapers.

This module provides the GenericScraper for scraping jobs from any source type.
"""

from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig

__all__ = ["GenericScraper", "SourceConfig"]
