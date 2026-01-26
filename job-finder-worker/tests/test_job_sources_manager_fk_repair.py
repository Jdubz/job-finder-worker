"""Tests for FK repair methods in JobSourcesManager."""

import sqlite3
from pathlib import Path

from job_finder.storage.job_sources_manager import JobSourcesManager
from job_finder.job_queue.models import SourceStatus


def _bootstrap_db(path: Path):
    """Create test database with job_sources table."""
    with sqlite3.connect(path) as conn:
        conn.execute("""
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
            """)


def test_update_company_link_success(tmp_path):
    """Test linking a source without a company to a company."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            INSERT INTO job_sources (
              id, name, source_type, status, config_json,
              company_id, created_at, updated_at
            ) VALUES ('s1', 'Test Source', 'rss', ?, '{}', NULL, datetime('now'), datetime('now'))
            """,
            (SourceStatus.ACTIVE.value,),
        )

    mgr = JobSourcesManager(str(db))

    # Should successfully link
    result = mgr.update_company_link("s1", "company-123")
    assert result is True

    # Verify the link was made
    src = mgr.get_source_by_id("s1")
    assert src["companyId"] == "company-123"


def test_update_company_link_already_linked(tmp_path):
    """Test that existing company links are not overwritten."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            INSERT INTO job_sources (
              id, name, source_type, status, config_json,
              company_id, created_at, updated_at
            ) VALUES ('s1', 'Test Source', 'rss', ?, '{}', 'existing-company', datetime('now'), datetime('now'))
            """,
            (SourceStatus.ACTIVE.value,),
        )

    mgr = JobSourcesManager(str(db))

    # Should not update - source already has a company
    result = mgr.update_company_link("s1", "new-company")
    assert result is False

    # Verify original link is preserved
    src = mgr.get_source_by_id("s1")
    assert src["companyId"] == "existing-company"


def test_update_company_link_source_not_found(tmp_path):
    """Test linking a non-existent source returns False."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))

    # Should return False for non-existent source
    result = mgr.update_company_link("non-existent", "company-123")
    assert result is False


def test_has_source_for_company_true(tmp_path):
    """Test has_source_for_company returns True when source exists."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            INSERT INTO job_sources (
              id, name, source_type, status, config_json,
              company_id, created_at, updated_at
            ) VALUES ('s1', 'Test Source', 'rss', ?, '{}', 'company-123', datetime('now'), datetime('now'))
            """,
            (SourceStatus.ACTIVE.value,),
        )

    mgr = JobSourcesManager(str(db))

    assert mgr.has_source_for_company("company-123") is True


def test_has_source_for_company_false(tmp_path):
    """Test has_source_for_company returns False when no source exists."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))

    assert mgr.has_source_for_company("non-existent-company") is False


def test_has_source_for_company_multiple_sources(tmp_path):
    """Test has_source_for_company with multiple sources for same company."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    with sqlite3.connect(db) as conn:
        conn.execute(
            """
            INSERT INTO job_sources (
              id, name, source_type, status, config_json,
              company_id, created_at, updated_at
            ) VALUES
              ('s1', 'Source 1', 'rss', ?, '{}', 'company-123', datetime('now'), datetime('now')),
              ('s2', 'Source 2', 'api', ?, '{}', 'company-123', datetime('now'), datetime('now'))
            """,
            (SourceStatus.ACTIVE.value, SourceStatus.ACTIVE.value),
        )

    mgr = JobSourcesManager(str(db))

    # Should still return True (existence check, not count)
    assert mgr.has_source_for_company("company-123") is True
