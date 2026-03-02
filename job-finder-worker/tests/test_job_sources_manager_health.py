import sqlite3
from pathlib import Path

from job_finder.storage.job_sources_manager import JobSourcesManager
from job_finder.job_queue.models import SourceStatus


def _bootstrap_db(path: Path):
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
              company_name TEXT,
              last_scraped_at TEXT,
              last_error TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """)
        conn.execute(
            """
            INSERT INTO job_sources (
              id, name, source_type, status, config_json,
              created_at, updated_at
            ) VALUES ('s1','Test','rss', ?, '{}', datetime('now'), datetime('now'))
            """,
            (SourceStatus.ACTIVE.value,),
        )


def test_health_updates_on_failure_then_success(tmp_path):
    db = tmp_path / "sources_health.db"
    _bootstrap_db(db)
    mgr = JobSourcesManager(str(db))

    # First failure should update status to failed
    mgr.record_scraping_failure("s1", "Test error")
    src = mgr.get_source_by_id("s1")
    assert src["status"] == SourceStatus.FAILED.value

    # Success should reset status to active
    mgr.record_scraping_success("s1")
    src = mgr.get_source_by_id("s1")
    assert src["status"] == SourceStatus.ACTIVE.value


def test_record_scraping_failure_accepts_error_message_kwarg(tmp_path):
    db = tmp_path / "sources_health_kwargs.db"
    _bootstrap_db(db)
    mgr = JobSourcesManager(str(db))

    # Simulate caller passing deprecated error_message kwarg
    mgr.record_scraping_failure("s1", error_message="Legacy error kwarg")

    src = mgr.get_source_by_id("s1")
    assert src["status"] == SourceStatus.FAILED.value
