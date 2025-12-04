"""Regression tests for company task deduping in QueueManager."""

import json
from pathlib import Path

import pytest

from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import QueueItemType, QueueStatus


def _init_db(db_path: Path) -> None:
    db_path.touch()
    import sqlite3

    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE job_queue (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            url TEXT,
            tracking_id TEXT,
            parent_item_id TEXT,
            input TEXT,
            output TEXT,
            result_message TEXT,
            error_details TEXT,
            created_at TEXT,
            updated_at TEXT,
            processed_at TEXT,
            completed_at TEXT
        );
        """
    )
    conn.commit()
    conn.close()


def _insert_company_item(db_path: Path, *, company_id: str, status: str) -> None:
    import sqlite3

    payload = json.dumps({"company_id": company_id, "company_name": "Acme"})
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        INSERT INTO job_queue (id, type, status, url, tracking_id, parent_item_id, input)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            f"item-{company_id}-{status}",
            QueueItemType.COMPANY.value,
            status,
            "https://example.com",
            "t-1",
            None,
            payload,
        ),
    )
    conn.commit()
    conn.close()


@pytest.fixture()
def queue_mgr(tmp_path, monkeypatch):
    db_path = tmp_path / "queue.db"
    _init_db(db_path)
    monkeypatch.setenv("SQLITE_DB_PATH", str(db_path))
    return QueueManager(db_path=str(db_path))


def test_has_company_task_blocks_active(queue_mgr):
    """Pending company work should block new spawns."""

    _insert_company_item(Path(queue_mgr.db_path), company_id="c1", status=QueueStatus.PENDING.value)

    assert queue_mgr.has_company_task("c1") is True


def test_has_company_task_ignores_terminal(queue_mgr):
    """Terminal items (success/failure/filtered) must not block new work."""

    for status in (QueueStatus.SUCCESS.value, QueueStatus.FAILED.value, QueueStatus.SKIPPED.value):
        _insert_company_item(Path(queue_mgr.db_path), company_id="c2", status=status)

    assert queue_mgr.has_company_task("c2") is False


def test_has_company_task_blocks_by_name_when_no_id(queue_mgr):
    """Fallback to company_name should still block when id missing."""

    import sqlite3

    payload = json.dumps({"company_name": "NameOnly"})
    conn = sqlite3.connect(queue_mgr.db_path)
    conn.execute(
        """
        INSERT INTO job_queue (id, type, status, url, tracking_id, parent_item_id, input)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "item-nameonly",
            QueueItemType.COMPANY.value,
            QueueStatus.PROCESSING.value,
            "https://example.com",
            "t-2",
            None,
            payload,
        ),
    )
    conn.commit()
    conn.close()

    assert queue_mgr.has_company_task("", company_name="NameOnly") is True
