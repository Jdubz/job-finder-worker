"""SQLite-backed queue manager."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import sqlite3
from urllib.parse import urlparse, urlunparse
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

from pydantic import ValidationError

from job_finder.exceptions import DuplicateQueueItemError, StorageError
from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus
from job_finder.storage.sqlite_client import sqlite_connection
from job_finder.job_queue.notifier import QueueEventNotifier

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _rows_to_items(rows: List[Any]) -> List[JobQueueItem]:
    items: List[JobQueueItem] = []
    for row in rows:
        rec = dict(row)
        if not rec.get("tracking_id"):
            if rec.get("id"):
                rec["tracking_id"] = rec.get("id")
            else:
                logger.error("Dropping queue row with missing both 'id' and 'tracking_id': %s", rec)
                continue
        try:
            items.append(JobQueueItem.from_record(rec))
        except (ValidationError, ValueError, KeyError, TypeError) as exc:
            logger.error("Dropping malformed queue row %s: %s", rec.get("id"), exc)
    return items


class QueueManager:
    """Manage queue items stored inside the SQLite database."""

    def __init__(
        self,
        db_path: Optional[str] = None,
        notifier: Optional[QueueEventNotifier] = None,
    ):
        self.db_path = db_path
        self.notifier = notifier
        self._max_string_length = 2000
        self._ensure_schema()

    # ------------------------------------------------------------------ #
    # Schema helpers
    # ------------------------------------------------------------------ #

    def _ensure_schema(self) -> None:
        """Zero-downtime, idempotent migration guard for legacy DBs.

        Adds a nullable dedupe_key column and a partial UNIQUE index scoped to
        active (pending/processing) items so existing historical rows remain
        untouched. Safe to run on every process start.
        """
        with sqlite_connection(self.db_path) as conn:
            cols = {row["name"] for row in conn.execute("PRAGMA table_info(job_queue);")}
            if "dedupe_key" not in cols:
                conn.execute("ALTER TABLE job_queue ADD COLUMN dedupe_key TEXT;")
            conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_job_queue_dedupe_active
                ON job_queue(dedupe_key)
                WHERE dedupe_key IS NOT NULL AND status IN ('pending','processing');
                """
            )

    def _sanitize_payload(self, obj: Any) -> Any:
        """Trim oversized strings and drop heavy description fields before emitting events."""
        if obj is None:
            return obj

        if isinstance(obj, str):
            return (
                obj[: self._max_string_length] + "…" if len(obj) > self._max_string_length else obj
            )

        if isinstance(obj, list):
            return [self._sanitize_payload(v) for v in obj]

        if isinstance(obj, dict):
            cleaned: Dict[str, Any] = {}
            for key, val in obj.items():
                if key in {
                    "description",
                    "raw_html",
                    "full_text",
                    "raw_listing",
                    "html",
                }:
                    continue
                cleaned[key] = self._sanitize_payload(val)
            return cleaned

        return obj

    def _sanitize_queue_item_dict(self, item_dict: Dict[str, Any]) -> Dict[str, Any]:
        data = dict(item_dict)

        pipeline_state = data.get("pipeline_state")
        if pipeline_state is not None:
            data["pipeline_state"] = self._sanitize_payload(pipeline_state)

        scraped_data = data.get("scraped_data")
        if scraped_data is not None:
            data["scraped_data"] = self._sanitize_payload(scraped_data)

        for key in ("metadata", "input", "output"):
            if key in data:
                data[key] = self._sanitize_payload(data[key])

        for key, val in list(data.items()):
            if isinstance(val, str) and len(val) > self._max_string_length:
                data[key] = val[: self._max_string_length] + "…"

        return data

    # --------------------------------------------------------------------- #
    # CRUD HELPERS
    # --------------------------------------------------------------------- #

    @staticmethod
    def _normalize_url(url: Optional[str]) -> str:
        if not url:
            return ""
        try:
            parsed = urlparse(url.strip())
            # Drop fragments, normalize scheme/host, keep path/query
            cleaned = parsed._replace(
                fragment="", scheme=parsed.scheme.lower(), netloc=parsed.netloc.lower()
            )
            # Remove trailing slash unless root
            path = cleaned.path or "/"
            if path != "/" and path.endswith("/"):
                path = path.rstrip("/")
            cleaned = cleaned._replace(path=path)
            return urlunparse(cleaned)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to normalize URL %r: %s", url, exc)
            return url.strip()

    @staticmethod
    def _slugify(value: Optional[str]) -> str:
        if not value:
            return ""

        slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
        return slug

    def _hash_dict(self, data: Dict[str, Any]) -> str:
        return hashlib.sha1(
            json.dumps(data, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()  # noqa: S324

    def _compute_dedupe_key(self, item: JobQueueItem) -> str:
        """
        Build a deterministic fingerprint for deduplication that does NOT depend solely on URL.
        """
        t = item.type
        norm_url = self._normalize_url(item.url)
        if t == QueueItemType.JOB:
            return f"job|{norm_url}"
        if t == QueueItemType.COMPANY:
            ident = (
                item.company_id or self._slugify(item.company_name) or item.tracking_id or "missing"
            )
            return f"company|{ident}"
        if t == QueueItemType.SOURCE_DISCOVERY:
            ident = (
                norm_url
                or item.company_id
                or self._slugify(item.company_name)
                or item.tracking_id
                or "missing"
            )
            return f"source_discovery|{ident}"
        if t == QueueItemType.SCRAPE_SOURCE:
            source_id = item.source_id or (
                item.input.get("source_id") if item.input and isinstance(item.input, dict) else None
            )
            ident = (
                source_id
                or norm_url
                or item.company_id
                or self._slugify(item.company_name)
                or item.tracking_id
                or "missing"
            )
            return f"scrape_source|{ident}"
        if t == QueueItemType.SCRAPE:
            cfg = (
                item.scrape_config.model_dump()
                if item.scrape_config
                else (
                    item.input.get("scrape_config", {})
                    if item.input and isinstance(item.input, dict)
                    else {}
                )
            )
            return f"scrape|{self._hash_dict(cfg)}"
        if t == QueueItemType.AGENT_REVIEW:
            ident = item.parent_item_id or norm_url or item.tracking_id or "missing"
            return f"agent_review|{ident}"
        return f"generic|{t.value}|{norm_url or item.tracking_id or 'missing'}"

    def _dedupe_exists(self, dedupe_key: str, statuses: Optional[List[QueueStatus]] = None) -> bool:
        if not dedupe_key:
            return False
        statuses = statuses or [QueueStatus.PENDING, QueueStatus.PROCESSING]
        placeholders = ",".join("?" for _ in statuses)
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                f"""
                SELECT 1 FROM job_queue
                WHERE dedupe_key = ?
                  AND status IN ({placeholders})
                LIMIT 1
                """,
                (dedupe_key, *[s.value for s in statuses]),
            ).fetchone()
        return row is not None

    def add_item(self, item: JobQueueItem) -> str:
        """Insert a queue item."""
        if not item.id:
            item.id = str(uuid4())

        now = _utcnow()
        item.created_at = item.created_at or now
        item.updated_at = now
        item.status = item.status or QueueStatus.PENDING

        # Application-level duplicate prevention (do not rely solely on DB uniqueness)
        if item.type == QueueItemType.COMPANY:
            # Block if an active company task already exists by ID or name
            if self.has_company_task(
                company_id=item.company_id or item.input.get("company_id", ""),
                company_name=item.company_name or item.input.get("company_name", ""),
            ):
                raise DuplicateQueueItemError(
                    f"Active company task already exists for {item.company_name or item.company_id}"
                )

        # Enforce URL rules by type to reduce ambiguity
        if item.type == QueueItemType.JOB:
            if not item.url:
                raise StorageError("JOB items require a job posting URL")
        if item.type == QueueItemType.COMPANY:
            # Prefer keeping company tasks url-less; allow only if clearly a company site
            if item.url and "job" in item.url.lower():
                raise StorageError("COMPANY items should not use job board URLs")
        if item.type == QueueItemType.SCRAPE:
            item.url = None  # SCRAPE does not target a single URL

        item.dedupe_key = self._compute_dedupe_key(item)

        if self._dedupe_exists(item.dedupe_key):
            raise DuplicateQueueItemError(f"Duplicate task fingerprint: {item.dedupe_key}")

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
            if "UNIQUE constraint failed" in str(exc):
                raise DuplicateQueueItemError(
                    f"Duplicate task fingerprint (db): {item.dedupe_key}"
                ) from exc
            raise StorageError(f"Failed to insert queue item: {exc}") from exc
        except Exception as exc:
            raise StorageError(f"Failed to insert queue item: {exc}") from exc

        type_label = item.type if not hasattr(item.type, "value") else item.type.value
        logger.info("Added queue item %s (%s)", item.id, type_label)
        if self.notifier:
            payload = self._sanitize_queue_item_dict(item.model_dump(mode="json"))
            self.notifier.send_event("item.created", {"queueItem": payload})
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

    def _persist_item(self, item: JobQueueItem) -> None:
        record = item.to_record()
        values = (
            record["type"],
            record["status"],
            record["url"],
            record["tracking_id"],
            record["parent_item_id"],
            record["input"],
            record["output"],
            record["result_message"],
            record["error_details"],
            record["created_at"],
            record["updated_at"],
            record["processed_at"],
            record["completed_at"],
            record["id"],
        )

        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE job_queue
                SET type=?, status=?, url=?, tracking_id=?, parent_item_id=?,
                    input=?, output=?, result_message=?, error_details=?,
                    created_at=?, updated_at=?, processed_at=?, completed_at=?
                WHERE id=?
                """,
                values,
            )

    def update_status(
        self,
        item_id: str,
        status: QueueStatus,
        result_message: Optional[str] = None,
        scraped_data: Optional[dict] = None,
        error_details: Optional[str] = None,
        pipeline_state: Optional[dict] = None,
    ) -> None:
        item = self.get_item(item_id)
        if not item:
            logger.error("update_status: item %s not found", item_id)
            return

        now_dt = _utcnow()
        item.status = status
        item.updated_at = now_dt

        if result_message is not None:
            item.result_message = result_message
        if scraped_data is not None:
            item.scraped_data = scraped_data
        if error_details is not None:
            item.error_details = error_details
        if pipeline_state is not None:
            item.pipeline_state = pipeline_state

        if status == QueueStatus.PROCESSING:
            item.processed_at = now_dt
        if status in (
            QueueStatus.SUCCESS,
            QueueStatus.FAILED,
            QueueStatus.SKIPPED,
        ):
            item.completed_at = now_dt

        self._persist_item(item)
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
                payload = self._sanitize_queue_item_dict(updated_item.model_dump(mode="json"))
                self.notifier.send_event("item.updated", {"queueItem": payload})

    def url_exists_in_queue(self, url: str) -> bool:
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute("SELECT 1 FROM job_queue WHERE url = ? LIMIT 1", (url,)).fetchone()
        return row is not None

    def has_company_task(
        self,
        company_id: str,
        statuses: Optional[List[QueueStatus]] = None,
        company_name: Optional[str] = None,
    ) -> bool:
        """Check if a company discovery task already exists.

        Uses the structured payload stored in `input` to find any COMPANY
        items that reference the same company_id OR the same company_name.
        This is intentionally *global* (not per-tracking-id) so we don't
        spawn duplicate discovery work from different job listings.
        """

        if not company_id and not company_name:
            return False

        # Only block on work that is still active; terminal items should not
        # prevent re-analysis.
        active_statuses = statuses or [QueueStatus.PENDING, QueueStatus.PROCESSING]

        status_placeholders = ",".join("?" for _ in active_statuses)
        params: List[Any] = [QueueItemType.COMPANY.value]

        # Build OR conditions for company matching (match by id OR name)
        company_conditions = []
        if company_id:
            company_conditions.append("json_extract(input, '$.company_id') = ?")
            params.append(company_id)
        if company_name:
            company_conditions.append("json_extract(input, '$.company_name') = ?")
            params.append(company_name)

        company_match_sql = " OR ".join(company_conditions)
        params.extend(status.value for status in active_statuses)

        query = f"""
            SELECT 1
            FROM job_queue
            WHERE type = ?
              AND ({company_match_sql})
              AND status IN ({status_placeholders})
            LIMIT 1
        """

        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(query, tuple(params)).fetchone()

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
        # Legacy helper kept for compatibility; now routed through dedupe_key.
        temp = JobQueueItem(
            type=item_type,
            url=url,
            tracking_id=tracking_id,
        )
        temp.dedupe_key = self._compute_dedupe_key(temp)
        return self._dedupe_exists(temp.dedupe_key)

    def can_spawn_item(
        self, current_item: JobQueueItem, target_url: str, target_type: QueueItemType
    ) -> Tuple[bool, str]:
        """Check if spawning a new item is allowed (prevents duplicates within same lineage)."""
        if self.has_pending_work_for_url(target_url, target_type, current_item.tracking_id):
            return False, f"Duplicate work already queued for {target_url}"

        terminal_items = self._get_items_by_tracking_id(
            current_item.tracking_id,
            status_filter=[
                QueueStatus.SKIPPED,
                QueueStatus.FAILED,
            ],
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

        if target_type == QueueItemType.JOB and not target_url:
            logger.error("Cannot spawn JOB without job URL")
            return None

        # Inherit tracking_id for lineage, set parent_item_id for direct relationship
        new_item_data.setdefault("tracking_id", current_item.tracking_id)
        new_item_data.setdefault("parent_item_id", current_item.id)

        new_item = JobQueueItem(**new_item_data)
        new_item.dedupe_key = self._compute_dedupe_key(new_item)

        try:
            return self.add_item(new_item)
        except DuplicateQueueItemError as exc:
            logger.warning("Blocked spawn (duplicate): %s", exc)
            return None

    def requeue_with_state(
        self,
        item_id: str,
        pipeline_state: Dict[str, Any],
    ) -> None:
        """Update a queue item in-place to progress to the next pipeline stage."""
        item = self.get_item(item_id)
        if not item:
            logger.error("requeue_with_state: item %s not found", item_id)
            return

        item.pipeline_state = pipeline_state
        item.status = QueueStatus.PENDING
        item.updated_at = _utcnow()
        self._persist_item(item)
        self._notify_item_updated(item_id)
