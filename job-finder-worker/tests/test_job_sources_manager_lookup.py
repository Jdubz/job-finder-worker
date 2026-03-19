import sqlite3
from pathlib import Path

from job_finder.storage.job_sources_manager import JobSourcesManager


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
              aggregator_domain TEXT,
              last_scraped_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )

        conn.execute(
            """
            INSERT INTO job_sources (
              id, name, source_type, status, config_json, tags,
              company_id, aggregator_domain, created_at, updated_at
            ) VALUES (
              'src-gh', 'GH Jobs', 'api', 'active', '{}', '[]',
              'co-1', 'greenhouse.io', datetime('now'), datetime('now')
            )
            """
        )


def test_get_source_by_company_and_aggregator_match(tmp_path):
    db = tmp_path / "sources_lookup.db"
    _bootstrap_db(db)
    mgr = JobSourcesManager(str(db))

    found = mgr.get_source_by_company_and_aggregator("co-1", "greenhouse.io")
    assert found is not None
    assert found["id"] == "src-gh"


def test_get_source_by_company_and_aggregator_none_inputs(tmp_path):
    db = tmp_path / "sources_lookup.db"
    _bootstrap_db(db)
    mgr = JobSourcesManager(str(db))

    assert mgr.get_source_by_company_and_aggregator(None, "greenhouse.io") is None
    assert mgr.get_source_by_company_and_aggregator("co-1", None) is None


def test_get_source_by_company_and_aggregator_no_match(tmp_path):
    db = tmp_path / "sources_lookup.db"
    _bootstrap_db(db)
    mgr = JobSourcesManager(str(db))

    assert mgr.get_source_by_company_and_aggregator("co-2", "greenhouse.io") is None
