"""SQLite-backed storage for scrape reports."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
from uuid import uuid4

from job_finder.storage.sqlite_client import sqlite_connection, utcnow_iso

logger = logging.getLogger(__name__)


class ScrapeReportStorage:
    """Persist scrape reports to SQLite for observability."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def create_report(self, trigger: str = "scheduled") -> str:
        """Create a new scrape report in 'running' status. Returns report ID."""
        report_id = str(uuid4())
        now = utcnow_iso()
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO scrape_reports (id, started_at, status, trigger)
                VALUES (?, ?, 'running', ?)
                """,
                (report_id, now, trigger),
            )
        return report_id

    def complete_report(
        self,
        report_id: str,
        sources_scraped: int,
        total_jobs_found: int,
        total_jobs_submitted: int,
        total_duplicates: int,
        total_prefiltered: int,
        source_details: List[Dict[str, Any]],
        filter_breakdown: Dict[str, int],
        errors: List[str],
    ) -> None:
        """Finalize a scrape report with aggregated stats."""
        now = utcnow_iso()
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE scrape_reports
                SET completed_at = ?,
                    status = 'completed',
                    sources_scraped = ?,
                    total_jobs_found = ?,
                    total_jobs_submitted = ?,
                    total_duplicates = ?,
                    total_prefiltered = ?,
                    source_details = ?,
                    filter_breakdown = ?,
                    errors = ?
                WHERE id = ?
                """,
                (
                    now,
                    sources_scraped,
                    total_jobs_found,
                    total_jobs_submitted,
                    total_duplicates,
                    total_prefiltered,
                    json.dumps(source_details),
                    json.dumps(filter_breakdown),
                    json.dumps(errors),
                    report_id,
                ),
            )

    def fail_report(self, report_id: str, errors: List[str]) -> None:
        """Mark a report as failed."""
        now = utcnow_iso()
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE scrape_reports
                SET completed_at = ?, status = 'failed', errors = ?
                WHERE id = ?
                """,
                (now, json.dumps(errors), report_id),
            )

    def get_recent_reports(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Retrieve recent scrape reports, newest first."""
        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT * FROM scrape_reports
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def get_report(self, report_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single scrape report by ID."""
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM scrape_reports WHERE id = ?",
                (report_id,),
            ).fetchone()
        if not row:
            return None
        return self._row_to_dict(row)

    @staticmethod
    def _row_to_dict(row) -> Dict[str, Any]:
        """Convert a sqlite3.Row to a dict, deserializing JSON fields."""
        d = dict(row)
        for json_field in ("source_details", "filter_breakdown", "errors"):
            if d.get(json_field):
                try:
                    d[json_field] = json.loads(d[json_field])
                except (json.JSONDecodeError, TypeError):
                    pass
        return d
