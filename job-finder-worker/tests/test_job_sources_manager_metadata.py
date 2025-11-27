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
              last_scraped_status TEXT,
              last_scraped_error TEXT,
              consecutive_failures INTEGER NOT NULL DEFAULT 0,
              discovery_confidence TEXT,
              discovered_via TEXT,
              discovered_by TEXT,
              discovery_queue_item_id TEXT,
              validation_required INTEGER NOT NULL DEFAULT 0,
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
        discovered_via="user_submission",
        discovered_by="tester",
        discovery_confidence="high",
        discovery_queue_item_id="queue-1",
        company_id="comp-1",
        company_name="Acme",
        validation_required=True,
        tags=["gh"],
    )

    stored = mgr.get_source_by_id(source_id)
    assert stored["name"] == "Acme Greenhouse"
    assert stored["discoveredVia"] == "user_submission"
    assert stored["discoveredBy"] == "tester"
    assert stored["discoveryConfidence"] == "high"
    assert stored["discoveryQueueItemId"] == "queue-1"
    assert stored["validationRequired"] is True
    assert stored["status"] == "pending_validation"
