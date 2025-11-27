"""SQLite-backed queue manager."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from job_finder.exceptions import DuplicateQueueItemError, QueueProcessingError, StorageError
from job_finder.job_queue.models import (
    CompanySubTask,
    JobQueueItem,
    QueueItemType,
    QueueStatus,
)
from job_finder.storage.sqlite_client import sqlite_connection
from job_finder.job_queue.notifier import QueueEventNotifier

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _rows_to_items(rows: List[Any]) -> List[JobQueueItem]:
    return [JobQueueItem.from_record(dict(row)) for row in rows]


class QueueManager:
    """Manage queue items stored inside the SQLite database."""

    def __init__(
        self, db_path: Optional[str] = None, notifier: Optional[QueueEventNotifier] = None
    ):
        self.db_path = db_path
        self.notifier = notifier

    # --------------------------------------------------------------------- #
    # CRUD HELPERS
    # --------------------------------------------------------------------- #

    def add_item(self, item: JobQueueItem) -> str:
        """Insert a queue item."""
        if not item.id:
            item.id = str(uuid4())

        now = _utcnow()
        item.created_at = item.created_at or now
        item.updated_at = now
        item.status = item.status or QueueStatus.PENDING

        record = item.to_record()
        columns = ", ".join(record.keys())
        placeholders = ", ".join(["?"] * len(record))

        try:
            with sqlite_connection(self.db_path) as conn:
                conn.execute(
                    f"INSERT INTO job_queue ({columns}) VALUES ({placeholders})",
                    tuple(record.values()),
                )
        except sqlite3.IntegrityError as exc:
            # UNIQUE constraint on url - this is expected during concurrent scraping
            if "UNIQUE constraint failed" in str(exc):
                raise DuplicateQueueItemError(f"Duplicate URL in queue: {item.url}") from exc
            raise StorageError(f"Failed to insert queue item: {exc}") from exc
        except Exception as exc:
            raise StorageError(f"Failed to insert queue item: {exc}") from exc

        type_label = item.type if not hasattr(item.type, "value") else item.type.value
        logger.info("Added queue item %s (%s)", item.id, type_label)
        if self.notifier:
            self.notifier.send_event("item.created", {"queueItem": item.model_dump(mode="json")})
        return item.id

    def get_pending_items(self, limit: int = 10) -> List[JobQueueItem]:
        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT * FROM job_queue
                WHERE status = ?
                ORDER BY datetime(updated_at) ASC
                LIMIT ?
                """,
                (QueueStatus.PENDING.value, limit),
            ).fetchall()

        return _rows_to_items(rows)

    def update_status(
        self,
        item_id: str,
        status: QueueStatus,
        result_message: Optional[str] = None,
        scraped_data: Optional[dict] = None,
        error_details: Optional[str] = None,
    ) -> None:
        now = _iso(_utcnow())
        update_data: Dict[str, Any] = {
            "status": status.value,
            "updated_at": now,
        }

        if result_message is not None:
            update_data["result_message"] = result_message
        if scraped_data is not None:
            update_data["scraped_data"] = json.dumps(scraped_data)
        if error_details is not None:
            update_data["error_details"] = error_details

        if status == QueueStatus.PROCESSING:
            update_data["processed_at"] = now
        if status in (
            QueueStatus.SUCCESS,
            QueueStatus.FAILED,
            QueueStatus.SKIPPED,
            QueueStatus.FILTERED,
        ):
            update_data["completed_at"] = now

        assignments = ", ".join(f"{col} = ?" for col in update_data)
        values = list(update_data.values()) + [item_id]

        with sqlite_connection(self.db_path) as conn:
            conn.execute(f"UPDATE job_queue SET {assignments} WHERE id = ?", values)

        logger.debug("Updated queue item %s -> %s", item_id, status.value)
        self._notify_item_updated(item_id)

    def get_item(self, item_id: str) -> Optional[JobQueueItem]:
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute("SELECT * FROM job_queue WHERE id = ?", (item_id,)).fetchone()
        return JobQueueItem.from_record(dict(row)) if row else None

    def _notify_item_updated(self, item_id: str) -> None:
        """Fetch an item and send an 'item.updated' notification if it exists."""
        if self.notifier:
            updated_item = self.get_item(item_id)
            if updated_item:
                self.notifier.send_event(
                    "item.updated", {"queueItem": updated_item.model_dump(mode="json")}
                )

    def url_exists_in_queue(self, url: str) -> bool:
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute("SELECT 1 FROM job_queue WHERE url = ? LIMIT 1", (url,)).fetchone()
        return row is not None

    def get_queue_stats(self) -> Dict[str, int]:
        stats = {status.value: 0 for status in QueueStatus}
        stats["total"] = 0

        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS count FROM job_queue GROUP BY status"
            ).fetchall()

        for row in rows:
            status = row["status"]
            count = row["count"]
            stats[status] = count
            stats["total"] += count

        return stats

    def handle_command(self, command: Dict[str, Any]) -> None:
        """Handle external command (currently cancel).

        This is invoked by the notifier's WebSocket callback.
        """
        if command.get("event") == "command.cancel" and command.get("itemId"):
            item_id = command["itemId"]
            self.update_status(item_id, QueueStatus.SKIPPED, "Cancelled by user (command)")

    def retry_item(self, item_id: str) -> bool:
        now = _iso(_utcnow())
        with sqlite_connection(self.db_path) as conn:
            result = conn.execute(
                """
                UPDATE job_queue
                SET status = ?, updated_at = ?, processed_at = NULL,
                    completed_at = NULL, error_details = NULL
                WHERE id = ? AND status = ?
                """,
                (QueueStatus.PENDING.value, now, item_id, QueueStatus.FAILED.value),
            )
        success = result.rowcount > 0
        if success:
            logger.info("Reset queue item %s to pending for retry", item_id)
        return success

    def delete_item(self, item_id: str) -> bool:
        with sqlite_connection(self.db_path) as conn:
            result = conn.execute("DELETE FROM job_queue WHERE id = ?", (item_id,))
        deleted = result.rowcount > 0
        if deleted:
            logger.info("Deleted queue item %s", item_id)
            if self.notifier:
                self.notifier.send_event("item.deleted", {"queueItemId": item_id})
        return deleted

    # --------------------------------------------------------------------- #
    # LOOP PREVENTION + SPAWN HELPERS
    # --------------------------------------------------------------------- #

    def _get_items_by_tracking_id(
        self, tracking_id: str, status_filter: Optional[List[QueueStatus]] = None
    ) -> List[JobQueueItem]:
        query = "SELECT * FROM job_queue WHERE tracking_id = ?"
        params: List[Any] = [tracking_id]
        if status_filter:
            placeholders = ",".join("?" for _ in status_filter)
            query += f" AND status IN ({placeholders})"
            params.extend(status.value for status in status_filter)

        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(query, tuple(params)).fetchall()

        return _rows_to_items(rows)

    def has_pending_work_for_url(
        self, url: str, item_type: QueueItemType, tracking_id: str
    ) -> bool:
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT 1 FROM job_queue
                WHERE tracking_id = ?
                  AND url = ?
                  AND type = ?
                  AND status IN (?, ?)
                LIMIT 1
                """,
                (
                    tracking_id,
                    url,
                    item_type.value,
                    QueueStatus.PENDING.value,
                    QueueStatus.PROCESSING.value,
                ),
            ).fetchone()
        return row is not None

    def can_spawn_item(
        self, current_item: JobQueueItem, target_url: str, target_type: QueueItemType
    ) -> Tuple[bool, str]:
        """Check if spawning a new item is allowed (prevents duplicates within same lineage)."""
        if self.has_pending_work_for_url(target_url, target_type, current_item.tracking_id):
            return False, f"Duplicate work already queued for {target_url}"

        terminal_items = self._get_items_by_tracking_id(
            current_item.tracking_id,
            status_filter=[QueueStatus.FILTERED, QueueStatus.SKIPPED, QueueStatus.FAILED],
        )
        for item in terminal_items:
            if item.url == target_url and item.type == target_type:
                return False, f"Already in terminal state ({item.status.value})"

        completed = self._get_items_by_tracking_id(
            current_item.tracking_id, status_filter=[QueueStatus.SUCCESS]
        )
        for item in completed:
            if item.url == target_url and item.type == target_type:
                return False, "Already completed successfully"

        return True, "OK"

    def spawn_item_safely(
        self, current_item: JobQueueItem, new_item_data: Dict[str, Any]
    ) -> Optional[str]:
        """Spawn a child item if allowed by loop prevention rules."""
        target_url = new_item_data.get("url", "")
        target_type = new_item_data.get("type")
        if not target_type:
            logger.error("Cannot spawn item without 'type'")
            return None

        if not isinstance(target_type, QueueItemType):
            target_type = QueueItemType(target_type)
            new_item_data["type"] = target_type

        can_spawn, reason = self.can_spawn_item(current_item, target_url, target_type)
        if not can_spawn:
            logger.warning("Blocked spawn: %s", reason)
            return None

        # Inherit tracking_id for lineage, set parent_item_id for direct relationship
        new_item_data.setdefault("tracking_id", current_item.tracking_id)
        new_item_data.setdefault("parent_item_id", current_item.id)

        new_item = JobQueueItem(**new_item_data)
        return self.add_item(new_item)

    def spawn_next_pipeline_step(
        self,
        current_item: JobQueueItem,
        next_sub_task: CompanySubTask,
        pipeline_state: Optional[Dict[str, Any]] = None,
        is_company: bool = True,
    ) -> Optional[str]:
        """Spawn the next step in the company pipeline."""
        if not is_company:
            raise QueueProcessingError("spawn_next_pipeline_step only supports company pipelines")

        if not isinstance(next_sub_task, CompanySubTask):
            raise QueueProcessingError("next_sub_task must be CompanySubTask")

        new_item_data = {
            "type": QueueItemType.COMPANY,
            "url": current_item.url,
            "company_name": current_item.company_name,
            "company_id": current_item.company_id,
            "source": current_item.source,
            "company_sub_task": next_sub_task,
            "pipeline_state": pipeline_state,
        }
        try:
            return self.spawn_item_safely(current_item, new_item_data)
        except StorageError as exc:
            # If a unique URL constraint blocks granular company steps, fall back to
            # requeueing the same item in-place with the next sub_task.
            self._requeue_company_step(current_item.id, next_sub_task, pipeline_state)
            logger.debug(
                "Requeued company %s in-place for sub_task=%s due to %s",
                current_item.id,
                next_sub_task,
                exc,
            )
            return current_item.id

    def _requeue_company_step(
        self, item_id: str, next_sub_task: CompanySubTask, pipeline_state: Optional[Dict[str, Any]]
    ) -> None:
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE job_queue
                SET company_sub_task = ?, pipeline_state = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    next_sub_task.value,
                    json.dumps(pipeline_state or {}),
                    QueueStatus.PENDING.value,
                    _iso(_utcnow()),
                    item_id,
                ),
            )

        # Notify FE of the company sub-task transition
        self._notify_item_updated(item_id)

    def requeue_with_state(
        self,
        item_id: str,
        pipeline_state: Dict[str, Any],
    ) -> None:
        """Update a queue item in-place to progress to the next pipeline stage."""
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE job_queue
                SET pipeline_state = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    json.dumps(pipeline_state),
                    QueueStatus.PENDING.value,
                    _iso(_utcnow()),
                    item_id,
                ),
            )

        # Notify FE of the stage transition so queue UI stays in sync
        self._notify_item_updated(item_id)
