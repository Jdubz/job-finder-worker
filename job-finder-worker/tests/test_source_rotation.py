"""Tests for source rotation logic in ScrapeRunner."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from job_finder.scrape_runner import ScrapeRunner


@pytest.fixture
def mock_dependencies():
    """Create mock dependencies for ScrapeRunner."""
    queue_manager = MagicMock()
    job_listing_storage = MagicMock()
    job_listing_storage.db_path = ":memory:"
    companies_manager = MagicMock()
    sources_manager = MagicMock()
    company_info_fetcher = MagicMock()

    return {
        "queue_manager": queue_manager,
        "job_listing_storage": job_listing_storage,
        "companies_manager": companies_manager,
        "sources_manager": sources_manager,
        "company_info_fetcher": company_info_fetcher,
    }


@pytest.fixture
def scrape_runner(mock_dependencies):
    """Create ScrapeRunner with mocked dependencies."""
    with patch("job_finder.scrape_runner.ConfigLoader"):
        return ScrapeRunner(**mock_dependencies, title_filter=None)


def make_source(
    source_id: str,
    name: str,
    last_scraped: datetime = None,
    company_id: str = None,
):
    """Create a mock source for testing."""
    return {
        "id": source_id,
        "name": name,
        "lastScrapedAt": last_scraped.isoformat() if last_scraped else None,
        "companyId": company_id,
        "config": {"type": "api", "url": "https://example.com", "fields": {}},
    }


class TestSourceRotation:
    """Test that sources are rotated chronologically (oldest first)."""

    def test_oldest_sources_come_first(self, scrape_runner, mock_dependencies):
        """Sources that haven't been scraped recently should come first."""
        now = datetime.now(timezone.utc)
        sources = [
            make_source("1", "Recent", last_scraped=now - timedelta(hours=1)),
            make_source("2", "Old", last_scraped=now - timedelta(days=7)),
            make_source("3", "Never", last_scraped=None),
        ]
        mock_dependencies["sources_manager"].get_active_sources.return_value = sources

        result = scrape_runner._get_next_sources_by_rotation(limit=None)

        # Never scraped and oldest should come first
        assert result[0]["name"] == "Never"
        assert result[1]["name"] == "Old"
        assert result[2]["name"] == "Recent"

    def test_limit_respects_rotation_order(self, scrape_runner, mock_dependencies):
        """Limit should return the top N sources by rotation order."""
        now = datetime.now(timezone.utc)
        sources = [
            make_source("1", "Source-1", last_scraped=now - timedelta(days=1)),
            make_source("2", "Source-2", last_scraped=now - timedelta(days=5)),
            make_source("3", "Source-3", last_scraped=now - timedelta(days=3)),
            make_source("4", "Source-4", last_scraped=now - timedelta(days=2)),
        ]
        mock_dependencies["sources_manager"].get_active_sources.return_value = sources

        result = scrape_runner._get_next_sources_by_rotation(limit=2)

        # Should get the 2 oldest sources
        assert len(result) == 2
        assert result[0]["name"] == "Source-2"  # 5 days old
        assert result[1]["name"] == "Source-3"  # 3 days old

    def test_never_scraped_sources_prioritized(self, scrape_runner, mock_dependencies):
        """Sources that have never been scraped should be at the front."""
        now = datetime.now(timezone.utc)
        sources = [
            make_source("1", "Scraped-1", last_scraped=now - timedelta(days=30)),
            make_source("2", "Never-1", last_scraped=None),
            make_source("3", "Scraped-2", last_scraped=now - timedelta(days=1)),
            make_source("4", "Never-2", last_scraped=None),
        ]
        mock_dependencies["sources_manager"].get_active_sources.return_value = sources

        result = scrape_runner._get_next_sources_by_rotation(limit=None)

        # Never scraped should come first (epoch 1970)
        names = [s["name"] for s in result]
        assert names.index("Never-1") < names.index("Scraped-1")
        assert names.index("Never-2") < names.index("Scraped-1")

    def test_empty_sources_returns_empty_list(self, scrape_runner, mock_dependencies):
        """Empty source list should return empty result."""
        mock_dependencies["sources_manager"].get_active_sources.return_value = []

        result = scrape_runner._get_next_sources_by_rotation(limit=None)

        assert result == []

    def test_limit_none_returns_all(self, scrape_runner, mock_dependencies):
        """limit=None should return all sources."""
        now = datetime.now(timezone.utc)
        sources = [
            make_source("1", "Source-1", last_scraped=now - timedelta(days=1)),
            make_source("2", "Source-2", last_scraped=now - timedelta(days=2)),
            make_source("3", "Source-3", last_scraped=now - timedelta(days=3)),
        ]
        mock_dependencies["sources_manager"].get_active_sources.return_value = sources

        result = scrape_runner._get_next_sources_by_rotation(limit=None)

        assert len(result) == 3
