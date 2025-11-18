"""Helpers for tracking scraper health using SQLite."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from job_finder.storage.sqlite_client import sqlite_connection


class CompanyScrapeTracker:
    """Track scraping frequency for companies."""

    def __init__(self, db_path: Optional[str] = None, window_days: int = 30):
        self.db_path = db_path
        self.window = timedelta(days=window_days)

    def get_scrape_frequency(self, company_id: str) -> float:
        if not company_id:
            return 0.0

        cutoff = datetime.now(timezone.utc) - self.window
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM job_sources
                WHERE company_id = ?
                  AND last_scraped_at IS NOT NULL
                  AND datetime(last_scraped_at) >= datetime(?, 'unixepoch')
                """,
                (company_id, cutoff.timestamp()),
            ).fetchone()

        count = row["cnt"] if row else 0
        return count / max(self.window.days, 1)
