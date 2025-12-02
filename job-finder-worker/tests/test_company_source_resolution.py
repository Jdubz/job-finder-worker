"""Tests for company vs source resolution functionality.

These tests verify that:
1. Job sources can be resolved from source_id or company name
2. Job aggregators (sources without linked companies) are detected
3. Company names like "Coinbase Careers" resolve to "Coinbase" via source linkage
4. Job board URLs are correctly identified and blocked from enrichment
"""

import sqlite3
from pathlib import Path

from job_finder.storage.job_sources_manager import JobSourcesManager


def _bootstrap_db(path: Path):
    """Create test database with job_sources table."""
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE job_sources (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              source_type TEXT NOT NULL,
              status TEXT NOT NULL,
              config_json TEXT NOT NULL,
              tags TEXT,
              company_id TEXT,
              aggregator_domain TEXT,
              last_scraped_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )
        # Insert test sources
        conn.executemany(
            """
            INSERT INTO job_sources (
              id, name, source_type, status, config_json, company_id, aggregator_domain,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, '{}', ?, ?, datetime('now'), datetime('now'))
            """,
            [
                # Company-linked source (no aggregator_domain)
                (
                    "src-coinbase",
                    "Coinbase Jobs",
                    "greenhouse",
                    "active",
                    "company-coinbase",
                    None,
                ),
                # Company-linked source with different naming
                (
                    "src-stripe",
                    "Stripe Jobs",
                    "greenhouse",
                    "active",
                    "company-stripe",
                    None,
                ),
                # Job aggregator (has aggregator_domain, no company_id)
                ("src-jbicy", "Jbicy Remote Jobs", "api", "active", None, "jbicy.io"),
                # Job aggregator (has aggregator_domain, no company_id)
                ("src-remotive", "Remotive", "rss", "active", None, "remotive.com"),
            ],
        )


class TestResolveCompanyFromSource:
    """Test resolve_company_from_source method."""

    def test_resolve_by_source_id_with_linked_company(self, tmp_path):
        """Source with linked company returns company info."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        result = manager.resolve_company_from_source(source_id="src-coinbase")

        assert result is not None
        assert result["company_id"] == "company-coinbase"
        assert result["is_aggregator"] is False
        assert result["aggregator_domain"] is None
        assert result["source_id"] == "src-coinbase"
        assert result["source_name"] == "Coinbase Jobs"

    def test_resolve_by_source_id_aggregator(self, tmp_path):
        """Aggregator source (has aggregator_domain) returns is_aggregator=True."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        result = manager.resolve_company_from_source(source_id="src-jbicy")

        assert result is not None
        assert result["company_id"] is None
        assert result["is_aggregator"] is True
        assert result["aggregator_domain"] == "jbicy.io"
        assert result["source_name"] == "Jbicy Remote Jobs"

    def test_resolve_by_company_name_exact_match(self, tmp_path):
        """Company name matching source name resolves correctly."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        # "Coinbase" matches source named "Coinbase Jobs"
        result = manager.resolve_company_from_source(company_name_raw="Coinbase")

        assert result is not None
        assert result["company_id"] == "company-coinbase"
        assert result["is_aggregator"] is False

    def test_resolve_by_company_name_with_suffix(self, tmp_path):
        """Company name with suffix like 'Careers' still resolves."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        # "Coinbase Careers" should normalize to "coinbase" and match "Coinbase Jobs"
        result = manager.resolve_company_from_source(
            company_name_raw="Coinbase Careers"
        )

        assert result is not None
        assert result["company_id"] == "company-coinbase"
        assert result["is_aggregator"] is False

    def test_resolve_by_company_name_partial_match_aggregator(self, tmp_path):
        """Aggregator source name like 'Jbicy Remote' matches 'Jbicy Remote Jobs'."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        # "Jbicy Remote" should match "Jbicy Remote Jobs"
        result = manager.resolve_company_from_source(company_name_raw="Jbicy Remote")

        assert result is not None
        assert result["is_aggregator"] is True
        assert result["source_name"] == "Jbicy Remote Jobs"

    def test_resolve_unknown_company_returns_none(self, tmp_path):
        """Unknown company name returns None."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        result = manager.resolve_company_from_source(company_name_raw="Unknown Corp")

        assert result is None

    def test_resolve_unknown_source_id_returns_none(self, tmp_path):
        """Unknown source_id returns None."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        result = manager.resolve_company_from_source(source_id="unknown-source")

        assert result is None

    def test_source_id_takes_precedence_over_company_name(self, tmp_path):
        """When both source_id and company_name provided, source_id wins."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        # Provide valid source_id with mismatched company_name
        result = manager.resolve_company_from_source(
            source_id="src-coinbase", company_name_raw="Stripe"
        )

        # Should return Coinbase source (from source_id), not Stripe
        assert result is not None
        assert result["source_name"] == "Coinbase Jobs"
        assert result["company_id"] == "company-coinbase"


class TestMatchSourceByCompanyName:
    """Test _match_source_by_company_name method."""

    def test_exact_normalized_match(self, tmp_path):
        """Exact match after normalization."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        # "stripe" matches source named "Stripe Jobs"
        source = manager._match_source_by_company_name("stripe")

        assert source is not None
        assert source["name"] == "Stripe Jobs"
        assert source["companyId"] == "company-stripe"

    def test_partial_match_with_minimum_length(self, tmp_path):
        """Partial matches require 60% overlap ratio to avoid false positives."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        # "coin" should NOT match "coinbase" because:
        # - "coin" (4 chars) vs "coinbase" (8 chars) = 50% ratio, below 60% threshold
        source = manager._match_source_by_company_name("coin")
        assert source is None  # Below 60% threshold, no match

    def test_empty_name_returns_none(self, tmp_path):
        """Empty company name returns None."""
        db = tmp_path / "sources.db"
        _bootstrap_db(db)
        manager = JobSourcesManager(str(db))

        source = manager._match_source_by_company_name("")

        assert source is None


class TestIsJobBoardUrl:
    """Test _is_job_board_url static method in JobProcessor."""

    def test_job_board_urls(self):
        """Test common job board URL detection using actual production code."""
        from job_finder.job_queue.processors.job_processor import JobProcessor

        # Job board URLs (ATS providers)
        assert JobProcessor._is_job_board_url(
            "https://boards.greenhouse.io/coinbase/jobs/123"
        )
        assert JobProcessor._is_job_board_url("https://jobs.lever.co/stripe/123")
        assert JobProcessor._is_job_board_url("https://jbicy.io/jobs/123")

        # Job aggregators
        assert JobProcessor._is_job_board_url(
            "https://weworkremotely.com/remote-jobs/123"
        )
        assert JobProcessor._is_job_board_url("https://remotive.com/jobs/123")

        # Non-job board URLs (company websites)
        assert not JobProcessor._is_job_board_url("https://coinbase.com/careers")
        assert not JobProcessor._is_job_board_url("https://stripe.com/jobs")
        assert not JobProcessor._is_job_board_url("https://google.com/about")

        # Edge cases
        assert not JobProcessor._is_job_board_url("")
        assert not JobProcessor._is_job_board_url(None)

    def test_no_false_positives_on_similar_domains(self):
        """Ensure suffix matching prevents false positives like 'notgreenhouse.io'."""
        from job_finder.job_queue.processors.job_processor import JobProcessor

        # Should NOT match - similar but not actual job board domains
        assert not JobProcessor._is_job_board_url("https://notgreenhouse.io/jobs")
        assert not JobProcessor._is_job_board_url("https://mylever.co/jobs")
        assert not JobProcessor._is_job_board_url("https://fakejbicy.io/jobs")
