import sqlite3
from pathlib import Path

from job_finder.storage.job_sources_manager import JobSourcesManager
from job_finder.job_queue.models import SourceStatus


def _bootstrap_db(path: Path):
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
              company_name TEXT,
              last_scraped_at TEXT,
              last_scraped_status TEXT,
              last_scraped_error TEXT,
              total_jobs_found INTEGER NOT NULL DEFAULT 0,
              total_jobs_matched INTEGER NOT NULL DEFAULT 0,
              consecutive_failures INTEGER NOT NULL DEFAULT 0,
              discovery_confidence TEXT,
              discovered_via TEXT,
              discovered_by TEXT,
              discovery_queue_item_id TEXT,
              validation_required INTEGER NOT NULL DEFAULT 0,
              tier TEXT NOT NULL DEFAULT 'D',
              health_json TEXT DEFAULT '{}',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )
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

    # First failure
    mgr.update_scrape_status("s1", status="error", jobs_found=0, jobs_matched=0, error="boom")
    src = mgr.get_source_by_id("s1")
    assert src["consecutiveFailures"] == 1
    assert src["health"]["healthScore"] < 1.0
    assert src["status"] == SourceStatus.FAILED.value

    # Success resets failures and health
    mgr.update_scrape_status("s1", status="success", jobs_found=2, jobs_matched=1)
    src = mgr.get_source_by_id("s1")
    assert src["consecutiveFailures"] == 0
    assert abs(src["health"]["healthScore"] - 1.0) < 1e-6
    assert src["status"] == SourceStatus.ACTIVE.value

