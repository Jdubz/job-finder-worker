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


def test_create_from_discovery_persists_metadata(tmp_path):
    """Test that create_from_discovery persists source with company_id."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))
    source_id = mgr.create_from_discovery(
        name="Acme Greenhouse",
        source_type="greenhouse",
        config={"board_token": "acme"},
        company_id="comp-1",
        tags=["gh"],
    )

    stored = mgr.get_source_by_id(source_id)
    assert stored["name"] == "Acme Greenhouse"
    assert stored["sourceType"] == "greenhouse"
    assert stored["companyId"] == "comp-1"
    assert stored["aggregatorDomain"] is None
    assert stored["status"] == "active"
    assert stored["tags"] == ["gh"]


def test_create_from_discovery_aggregator_source(tmp_path):
    """Test that create_from_discovery persists aggregator source."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))
    source_id = mgr.create_from_discovery(
        name="Remotive Jobs",
        source_type="api",
        config={"url": "https://remotive.com/api/jobs"},
        aggregator_domain="remotive.com",
        tags=["remote"],
    )

    stored = mgr.get_source_by_id(source_id)
    assert stored["name"] == "Remotive Jobs"
    assert stored["sourceType"] == "api"
    assert stored["companyId"] is None
    assert stored["aggregatorDomain"] == "remotive.com"
    assert stored["status"] == "active"
    assert stored["tags"] == ["remote"]
