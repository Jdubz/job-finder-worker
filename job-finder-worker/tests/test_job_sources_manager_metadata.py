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
              company_name TEXT,
              last_scraped_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )


def test_create_from_discovery_persists_metadata(tmp_path):
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))
    source_id = mgr.create_from_discovery(
        name="Acme Greenhouse",
        source_type="greenhouse",
        config={"board_token": "acme"},
        company_id="comp-1",
        company_name="Acme",
        tags=["gh"],
    )

    stored = mgr.get_source_by_id(source_id)
    assert stored["name"] == "Acme Greenhouse"
    assert stored["sourceType"] == "greenhouse"
    assert stored["companyId"] == "comp-1"
    assert stored["companyName"] == "Acme"
    assert stored["status"] == "active"
    assert stored["tags"] == ["gh"]
