"""Tests for source rotation logic in ScrapeRunner."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from job_finder.scrape_runner import ScrapeRunner


@pytest.fixture
def mock_dependencies():
    """Create mock dependencies for ScrapeRunner."""
    queue_manager = MagicMock()
    job_storage = MagicMock()
    job_storage.db_path = ":memory:"
    companies_manager = MagicMock()
    sources_manager = MagicMock()
    company_info_fetcher = MagicMock()

    return {
        "queue_manager": queue_manager,
        "job_storage": job_storage,
        "companies_manager": companies_manager,
        "sources_manager": sources_manager,
        "company_info_fetcher": company_info_fetcher,
    }


@pytest.fixture
def scrape_runner(mock_dependencies):
    """Create ScrapeRunner with mocked dependencies."""
    with patch("job_finder.scrape_runner.ConfigLoader"):
        return ScrapeRunner(**mock_dependencies, filter_engine=None)


def make_source(
    source_id: str,
    name: str,
    last_scraped: datetime = None,
    health_score: float = 1.0,
    tier: str = "B",
    company_id: str = None,
):
    """Create a mock source for testing."""
    return {
        "id": source_id,
        "name": name,
        "lastScrapedAt": last_scraped.isoformat() if last_scraped else None,
        "health": {"healthScore": health_score},
        "tier": tier,
        "companyId": company_id,
        "config": {"type": "api", "url": "https://example.com", "fields": {}},
    }


class TestSourceRotation:
    """Test that sources are rotated evenly."""

    @patch("job_finder.utils.source_health.CompanyScrapeTracker")
    def test_oldest_sources_come_first(self, mock_tracker, scrape_runner, mock_dependencies):
        """Sources that haven't been scraped recently should come first."""
        mock_tracker.return_value.get_scrape_frequency.return_value = 0.0

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

    @patch("job_finder.utils.source_health.CompanyScrapeTracker")
    def test_unhealthy_sources_last(self, mock_tracker, scrape_runner, mock_dependencies):
        """Sources with low health should be deprioritized."""
        mock_tracker.return_value.get_scrape_frequency.return_value = 0.0

        now = datetime.now(timezone.utc)
        sources = [
            make_source("1", "Healthy-Old", last_scraped=now - timedelta(days=5), health_score=0.9),
            make_source(
                "2", "Unhealthy-Older", last_scraped=now - timedelta(days=10), health_score=0.2
            ),
            make_source(
                "3", "Healthy-Recent", last_scraped=now - timedelta(hours=1), health_score=1.0
            ),
        ]
        mock_dependencies["sources_manager"].get_active_sources.return_value = sources

        result = scrape_runner._get_next_sources_by_rotation(limit=None)

        # Healthy sources first (sorted by last_scraped), then unhealthy
        assert result[0]["name"] == "Healthy-Old"
        assert result[1]["name"] == "Healthy-Recent"
        assert result[2]["name"] == "Unhealthy-Older"  # Despite being oldest, it's unhealthy

    @patch("job_finder.utils.source_health.CompanyScrapeTracker")
    def test_tier_as_tiebreaker(self, mock_tracker, scrape_runner, mock_dependencies):
        """When last_scraped is the same, higher tier wins."""
        mock_tracker.return_value.get_scrape_frequency.return_value = 0.0

        same_time = datetime.now(timezone.utc) - timedelta(days=3)
        sources = [
            make_source("1", "Tier-D", last_scraped=same_time, tier="D"),
            make_source("2", "Tier-A", last_scraped=same_time, tier="A"),
            make_source("3", "Tier-S", last_scraped=same_time, tier="S"),
        ]
        mock_dependencies["sources_manager"].get_active_sources.return_value = sources

        result = scrape_runner._get_next_sources_by_rotation(limit=None)

        # Same last_scraped, so sorted by tier priority
        assert result[0]["name"] == "Tier-S"
        assert result[1]["name"] == "Tier-A"
        assert result[2]["name"] == "Tier-D"

    @patch("job_finder.utils.source_health.CompanyScrapeTracker")
    def test_limit_respects_rotation_order(self, mock_tracker, scrape_runner, mock_dependencies):
        """Limit should return the top N sources by rotation order."""
        mock_tracker.return_value.get_scrape_frequency.return_value = 0.0

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

    @patch("job_finder.utils.source_health.CompanyScrapeTracker")
    def test_never_scraped_sources_prioritized(
        self, mock_tracker, scrape_runner, mock_dependencies
    ):
        """Sources that have never been scraped should be at the front."""
        mock_tracker.return_value.get_scrape_frequency.return_value = 0.0

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
