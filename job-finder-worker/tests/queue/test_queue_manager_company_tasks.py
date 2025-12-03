"""Regression tests for company task deduping in QueueManager.

These tests verify that has_company_task correctly prevents duplicate company
enrichment tasks from being spawned. The key invariant is:

    has_company_task should return True if ANY active task exists for the
    same company, matching by company_id OR company_name (not AND).

Bug History (2024-12): The original implementation used AND logic when both
company_id and company_name were provided, which allowed duplicate tasks to
be spawned when:
- Task A creates a company task for "Acme" with no company_id
- Later, Task B tries to spawn for "Acme" but now has a company_id
  (because a stub was created in the meantime)
- With AND logic: no match found → duplicate spawned (BUG)
- With OR logic: name matches → correctly blocked (FIXED)
"""

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


def test_has_company_task_uses_or_logic_for_id_and_name(queue_mgr):
    """has_company_task should match by company_id OR company_name, not both."""

    import sqlite3

    # Insert a task with specific id and name
    payload = json.dumps({"company_id": "existing-id", "company_name": "ExistingCompany"})
    conn = sqlite3.connect(queue_mgr.db_path)
    conn.execute(
        """
        INSERT INTO job_queue (id, type, status, url, tracking_id, parent_item_id, input)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "item-or-test",
            QueueItemType.COMPANY.value,
            QueueStatus.PENDING.value,
            "https://example.com",
            "t-3",
            None,
            payload,
        ),
    )
    conn.commit()
    conn.close()

    # Should match by id alone (even with different name)
    assert queue_mgr.has_company_task("existing-id", company_name="DifferentName") is True

    # Should match by name alone (even with different id)
    assert queue_mgr.has_company_task("different-id", company_name="ExistingCompany") is True

    # Should NOT match when both id AND name are different
    assert queue_mgr.has_company_task("different-id", company_name="DifferentName") is False


# ============================================================================
# REGRESSION TESTS: Scenarios that would fail with AND logic
# ============================================================================


class TestCompanyTaskDeduplicationEdgeCases:
    """Edge cases that specifically test OR vs AND logic behavior.

    These tests document scenarios where the old AND logic would have
    incorrectly allowed duplicate company tasks to be spawned.
    """

    def test_stub_creation_race_condition(self, queue_mgr):
        """Simulate: Task A spawns without ID, Task B arrives after stub created.

        Scenario:
        1. Job A for "Acme Corp" arrives, no company exists → spawns task with name only
        2. CompaniesManager creates a stub with id="stub-123"
        3. Job B for "Acme Corp" arrives, finds stub → tries to spawn with id="stub-123"
        4. Should be blocked because name matches the pending task

        With AND logic: query for (id="stub-123" AND name="Acme Corp") finds nothing
        With OR logic: query for (id="stub-123" OR name="Acme Corp") finds the task
        """
        import sqlite3

        # Task A spawned with name only (no company_id yet)
        payload_task_a = json.dumps({"company_name": "Acme Corp"})
        conn = sqlite3.connect(queue_mgr.db_path)
        conn.execute(
            """
            INSERT INTO job_queue (id, type, status, url, tracking_id, parent_item_id, input)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "task-a-name-only",
                QueueItemType.COMPANY.value,
                QueueStatus.PENDING.value,
                None,
                "t-race-1",
                None,
                payload_task_a,
            ),
        )
        conn.commit()
        conn.close()

        # Task B tries to spawn with BOTH id and name (after stub was created)
        # This MUST be blocked - OR logic ensures name match is sufficient
        assert queue_mgr.has_company_task("stub-123", company_name="Acme Corp") is True

    def test_id_only_task_blocks_name_lookup(self, queue_mgr):
        """Task with id-only should still be found when querying with both id and name.

        Scenario: Old task only has company_id, new query includes both id and name.
        """
        import sqlite3

        # Existing task has only company_id (legacy or edge case)
        payload = json.dumps({"company_id": "legacy-id-123"})
        conn = sqlite3.connect(queue_mgr.db_path)
        conn.execute(
            """
            INSERT INTO job_queue (id, type, status, url, tracking_id, parent_item_id, input)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "task-id-only",
                QueueItemType.COMPANY.value,
                QueueStatus.PROCESSING.value,
                None,
                "t-id-only",
                None,
                payload,
            ),
        )
        conn.commit()
        conn.close()

        # Query with both id and name - id should match
        assert queue_mgr.has_company_task("legacy-id-123", company_name="SomeCompany") is True

        # Query with only name (different) should NOT match
        assert queue_mgr.has_company_task("", company_name="SomeCompany") is False

    def test_name_only_task_blocks_id_lookup(self, queue_mgr):
        """Task with name-only should still be found when querying with both id and name.

        Scenario: Old task only has company_name, new query includes both id and name.
        """
        import sqlite3

        # Existing task has only company_name
        payload = json.dumps({"company_name": "NameOnlyCompany"})
        conn = sqlite3.connect(queue_mgr.db_path)
        conn.execute(
            """
            INSERT INTO job_queue (id, type, status, url, tracking_id, parent_item_id, input)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "task-name-only",
                QueueItemType.COMPANY.value,
                QueueStatus.PENDING.value,
                None,
                "t-name-only",
                None,
                payload,
            ),
        )
        conn.commit()
        conn.close()

        # Query with both id and name - name should match
        assert queue_mgr.has_company_task("some-new-id", company_name="NameOnlyCompany") is True

        # Query with only id (different) should NOT match
        assert queue_mgr.has_company_task("some-new-id") is False

    def test_multiple_jobs_same_company_different_ids(self, queue_mgr):
        """Multiple jobs for same company may have different company_ids.

        Scenario: Company "TechCorp" has multiple entries due to data inconsistency:
        - Job 1 created stub with id "tech-1"
        - Job 2 from different source has id "tech-2" but same name

        Only ONE company task should be allowed.
        """
        import sqlite3

        # First task spawned with id "tech-1"
        payload_first = json.dumps({"company_id": "tech-1", "company_name": "TechCorp"})
        conn = sqlite3.connect(queue_mgr.db_path)
        conn.execute(
            """
            INSERT INTO job_queue (id, type, status, url, tracking_id, parent_item_id, input)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "tech-task-1",
                QueueItemType.COMPANY.value,
                QueueStatus.PENDING.value,
                None,
                "t-tech-1",
                None,
                payload_first,
            ),
        )
        conn.commit()
        conn.close()

        # Second job tries to spawn with different id but same name
        # MUST be blocked by name match
        assert queue_mgr.has_company_task("tech-2", company_name="TechCorp") is True

        # Third job tries with same id but different name (typo/variant)
        # MUST be blocked by id match
        assert queue_mgr.has_company_task("tech-1", company_name="Tech Corp Inc") is True

        # Completely different company should NOT be blocked
        assert queue_mgr.has_company_task("other-id", company_name="OtherCompany") is False

    def test_empty_values_handled_correctly(self, queue_mgr):
        """Empty string and None should not cause false matches."""
        import sqlite3

        # Task with both fields populated
        payload = json.dumps({"company_id": "real-id", "company_name": "RealCompany"})
        conn = sqlite3.connect(queue_mgr.db_path)
        conn.execute(
            """
            INSERT INTO job_queue (id, type, status, url, tracking_id, parent_item_id, input)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "task-real",
                QueueItemType.COMPANY.value,
                QueueStatus.PENDING.value,
                None,
                "t-real",
                None,
                payload,
            ),
        )
        conn.commit()
        conn.close()

        # Empty strings should not match
        assert queue_mgr.has_company_task("", company_name="") is False

        # None values converted to empty should not match
        assert queue_mgr.has_company_task("") is False

        # But real values should still match
        assert queue_mgr.has_company_task("real-id") is True
        assert queue_mgr.has_company_task("", company_name="RealCompany") is True

    def test_processing_status_blocks_spawn(self, queue_mgr):
        """PROCESSING status should block new spawns just like PENDING."""
        import sqlite3

        payload = json.dumps({"company_id": "proc-id", "company_name": "ProcessingCo"})
        conn = sqlite3.connect(queue_mgr.db_path)
        conn.execute(
            """
            INSERT INTO job_queue (id, type, status, url, tracking_id, parent_item_id, input)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "task-processing",
                QueueItemType.COMPANY.value,
                QueueStatus.PROCESSING.value,
                None,
                "t-proc",
                None,
                payload,
            ),
        )
        conn.commit()
        conn.close()

        # Both PENDING and PROCESSING should block
        assert queue_mgr.has_company_task("proc-id", company_name="ProcessingCo") is True
        assert queue_mgr.has_company_task("other-id", company_name="ProcessingCo") is True
        assert queue_mgr.has_company_task("proc-id", company_name="OtherName") is True
