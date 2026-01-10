"""Tests for QueueManager retry and unblock logic.

These tests verify the intelligent failure handling:
- TRANSIENT errors auto-retry up to max_retries
- RESOURCE errors set status to BLOCKED
- PERMANENT errors immediately fail
- Unblock methods reset BLOCKED items to PENDING
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from job_finder.exceptions import (
    ExtractionError,
    NoAgentsAvailableError,
    QuotaExhaustedError,
    ScrapeBotProtectionError,
    ScrapeTransientError,
)
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import QueueItemType, QueueStatus


def _init_db(db_path: Path) -> None:
    """Initialize test database with all required columns including retry tracking."""
    db_path.touch()
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
            dedupe_key TEXT,
            input TEXT,
            output TEXT,
            result_message TEXT,
            error_details TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            last_error_category TEXT,
            created_at TEXT,
            updated_at TEXT,
            processed_at TEXT,
            completed_at TEXT
        );
        """
    )
    conn.commit()
    conn.close()


def _insert_job_item(
    db_path: Path,
    *,
    item_id: str,
    status: str,
    retry_count: int = 0,
    max_retries: int = 3,
    last_error_category: str | None = None,
) -> None:
    """Insert a job queue item with retry tracking fields."""
    conn = sqlite3.connect(db_path)
    payload = json.dumps({"url": "https://example.com/job"})
    conn.execute(
        """
        INSERT INTO job_queue (id, type, status, url, tracking_id, input, retry_count, max_retries, last_error_category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            item_id,
            QueueItemType.JOB.value,
            status,
            "https://example.com/job",
            "test-tracking-id",  # Required field
            payload,
            retry_count,
            max_retries,
            last_error_category,
        ),
    )
    conn.commit()
    conn.close()


def _get_item_status(db_path: Path, item_id: str) -> tuple[str | None, int | None, str | None]:
    """Get item status, retry_count, and last_error_category."""
    conn = sqlite3.connect(db_path)
    cursor = conn.execute(
        "SELECT status, retry_count, last_error_category FROM job_queue WHERE id = ?",
        (item_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return row if row else (None, None, None)


class TestHandleItemFailureTransient:
    """Test handle_item_failure() with TRANSIENT errors."""

    def test_transient_error_increments_retry_and_resets_to_pending(self, tmp_path):
        """TRANSIENT error should increment retry_count and reset to PENDING."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(db_path, item_id="item-1", status="processing", retry_count=0)

        manager = QueueManager(str(db_path))
        error = ScrapeTransientError(
            source_url="https://example.com",
            reason="Service unavailable",
            status_code=503,
        )

        result = manager.handle_item_failure("item-1", error, "Service unavailable")

        assert result == QueueStatus.PENDING
        status, retry_count, category = _get_item_status(db_path, "item-1")
        assert status == "pending"
        assert retry_count == 1
        assert category == "transient"

    def test_transient_error_fails_after_max_retries(self, tmp_path):
        """TRANSIENT error should fail after max_retries exceeded."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        # Item already at max_retries (3)
        _insert_job_item(
            db_path, item_id="item-1", status="processing", retry_count=3, max_retries=3
        )

        manager = QueueManager(str(db_path))
        error = ScrapeTransientError(
            source_url="https://example.com",
            reason="Service unavailable",
            status_code=503,
        )

        result = manager.handle_item_failure("item-1", error, "Service unavailable")

        assert result == QueueStatus.FAILED
        status, retry_count, _ = _get_item_status(db_path, "item-1")
        assert status == "failed"
        # Retry count should not increment beyond max
        assert retry_count == 3

    def test_multiple_transient_retries(self, tmp_path):
        """Multiple TRANSIENT errors should increment retry_count each time."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(db_path, item_id="item-1", status="processing", retry_count=0)

        manager = QueueManager(str(db_path))
        error = ScrapeTransientError(
            source_url="https://example.com",
            reason="Service unavailable",
            status_code=503,
        )

        # First failure -> retry_count=1, status=pending
        result = manager.handle_item_failure("item-1", error, "Retry 1")
        assert result == QueueStatus.PENDING
        _, retry_count, _ = _get_item_status(db_path, "item-1")
        assert retry_count == 1

        # Simulate processing again
        conn = sqlite3.connect(db_path)
        conn.execute("UPDATE job_queue SET status = 'processing' WHERE id = 'item-1'")
        conn.commit()
        conn.close()

        # Second failure -> retry_count=2, status=pending
        result = manager.handle_item_failure("item-1", error, "Retry 2")
        assert result == QueueStatus.PENDING
        _, retry_count, _ = _get_item_status(db_path, "item-1")
        assert retry_count == 2


class TestHandleItemFailureResource:
    """Test handle_item_failure() with RESOURCE errors."""

    def test_resource_error_sets_blocked_status(self, tmp_path):
        """RESOURCE error should set status to BLOCKED."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(db_path, item_id="item-1", status="processing")

        manager = QueueManager(str(db_path))
        error = NoAgentsAvailableError("No AI agents available")

        result = manager.handle_item_failure("item-1", error, "No agents")

        assert result == QueueStatus.BLOCKED
        status, _, category = _get_item_status(db_path, "item-1")
        assert status == "blocked"
        assert category == "resource"

    def test_quota_exhausted_sets_blocked(self, tmp_path):
        """QuotaExhaustedError should set status to BLOCKED."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(db_path, item_id="item-1", status="processing")

        manager = QueueManager(str(db_path))
        error = QuotaExhaustedError("API quota exceeded")

        result = manager.handle_item_failure("item-1", error, "Quota exceeded")

        assert result == QueueStatus.BLOCKED
        status, _, category = _get_item_status(db_path, "item-1")
        assert status == "blocked"
        assert category == "resource"


class TestHandleItemFailurePermanent:
    """Test handle_item_failure() with PERMANENT errors."""

    def test_permanent_error_immediately_fails(self, tmp_path):
        """PERMANENT error should immediately set status to FAILED."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(db_path, item_id="item-1", status="processing")

        manager = QueueManager(str(db_path))
        error = ScrapeBotProtectionError(
            source_url="https://example.com",
            reason="Bot protection detected",
            status_code=403,
        )

        result = manager.handle_item_failure("item-1", error, "Bot detected")

        assert result == QueueStatus.FAILED
        status, _, _ = _get_item_status(db_path, "item-1")
        assert status == "failed"

    def test_extraction_error_fails_without_retry(self, tmp_path):
        """ExtractionError should fail without retrying."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(db_path, item_id="item-1", status="processing", retry_count=0)

        manager = QueueManager(str(db_path))
        error = ExtractionError("Failed to extract job data")

        result = manager.handle_item_failure("item-1", error, "Extraction failed")

        assert result == QueueStatus.FAILED
        status, retry_count, _ = _get_item_status(db_path, "item-1")
        assert status == "failed"
        assert retry_count == 0  # No retry increment


class TestUnblockItem:
    """Test unblock_item() method."""

    def test_unblock_single_item(self, tmp_path):
        """unblock_item() should reset a BLOCKED item to PENDING."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(
            db_path,
            item_id="item-1",
            status="blocked",
            retry_count=2,
            last_error_category="resource",
        )

        manager = QueueManager(str(db_path))
        result = manager.unblock_item("item-1")

        assert result is True
        status, retry_count, _ = _get_item_status(db_path, "item-1")
        assert status == "pending"
        assert retry_count == 0  # Reset to 0

    def test_unblock_non_blocked_item_fails(self, tmp_path):
        """unblock_item() should fail for non-BLOCKED items."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(db_path, item_id="item-1", status="failed")

        manager = QueueManager(str(db_path))
        result = manager.unblock_item("item-1")

        assert result is False
        status, _, _ = _get_item_status(db_path, "item-1")
        assert status == "failed"  # Unchanged


class TestUnblockItems:
    """Test unblock_items() bulk method."""

    def test_unblock_all_blocked_items(self, tmp_path):
        """unblock_items() should reset all BLOCKED items to PENDING."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(
            db_path, item_id="item-1", status="blocked", last_error_category="resource"
        )
        _insert_job_item(
            db_path, item_id="item-2", status="blocked", last_error_category="resource"
        )
        _insert_job_item(db_path, item_id="item-3", status="failed")  # Should not be affected

        manager = QueueManager(str(db_path))
        count = manager.unblock_items()

        assert count == 2
        assert _get_item_status(db_path, "item-1")[0] == "pending"
        assert _get_item_status(db_path, "item-2")[0] == "pending"
        assert _get_item_status(db_path, "item-3")[0] == "failed"

    def test_unblock_by_error_category(self, tmp_path):
        """unblock_items() with category should only unblock matching items."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(
            db_path, item_id="item-1", status="blocked", last_error_category="resource"
        )
        _insert_job_item(
            db_path, item_id="item-2", status="blocked", last_error_category="transient"
        )

        manager = QueueManager(str(db_path))
        count = manager.unblock_items(error_category="resource")

        assert count == 1
        assert _get_item_status(db_path, "item-1")[0] == "pending"
        assert _get_item_status(db_path, "item-2")[0] == "blocked"

    def test_unblock_resets_retry_count(self, tmp_path):
        """unblock_items() should reset retry_count to 0."""
        db_path = tmp_path / "test.db"
        _init_db(db_path)
        _insert_job_item(
            db_path,
            item_id="item-1",
            status="blocked",
            retry_count=3,
            last_error_category="resource",
        )

        manager = QueueManager(str(db_path))
        manager.unblock_items()

        _, retry_count, _ = _get_item_status(db_path, "item-1")
        assert retry_count == 0
