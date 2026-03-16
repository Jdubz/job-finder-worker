"""Lightweight storage for URLs seen during scraping.

Records every URL encountered by the scrape pipeline regardless of outcome
(pre-filtered, board-URL-without-detail, duplicate, etc.). This prevents
re-scraping the same URLs every cycle when they'll just be discarded again.
"""

from __future__ import annotations

import hashlib
import logging
import sqlite3
from typing import Optional, Set

from job_finder.storage.sqlite_client import sqlite_connection

logger = logging.getLogger(__name__)


def _url_hash(url: str) -> str:
    """Stable, short hash for a normalized URL."""
    return hashlib.sha256(url.encode()).hexdigest()[:32]


class SeenUrlsStorage:
    """Read/write for the ``seen_urls`` table."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def _ensure_table(self, conn: sqlite3.Connection) -> bool:
        """Return True if the seen_urls table exists, False otherwise."""
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='seen_urls'"
        ).fetchone()
        return row is not None

    def get_seen_urls_for_source(self, source_id: str) -> Set[str]:
        """Return all url_hash values recorded for *source_id*.

        The caller already has the full URL — it can compute the hash with
        ``SeenUrlsStorage.hash_url(url)`` and check for membership in the
        returned set.

        NOTE: We return the *url_hash* values (not the original URLs, which we
        don't store).  The caller should use ``hash_url()`` to probe.
        """
        if not source_id:
            return set()

        with sqlite_connection(self.db_path) as conn:
            if not self._ensure_table(conn):
                return set()
            rows = conn.execute(
                "SELECT url_hash FROM seen_urls WHERE source_id = ?",
                (source_id,),
            ).fetchall()
            return {row["url_hash"] for row in rows}

    def record_urls(self, urls: list[str], source_id: Optional[str]) -> int:
        """Bulk-upsert URLs into ``seen_urls``.

        New URLs are inserted; existing URLs get their ``first_seen_at``
        refreshed so the TTL cleanup only removes URLs that are no longer
        returned by the source (i.e. delisted jobs).

        Returns the number of rows affected (inserts + updates).
        """
        if not urls:
            return 0

        with sqlite_connection(self.db_path) as conn:
            if not self._ensure_table(conn):
                return 0
            hashes_to_insert = [(_url_hash(url), source_id) for url in urls]
            before = conn.total_changes
            conn.executemany(
                "INSERT INTO seen_urls (url_hash, source_id) VALUES (?, ?) "
                "ON CONFLICT (source_id, url_hash) DO UPDATE "
                "SET first_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                hashes_to_insert,
            )
            return conn.total_changes - before

    def cleanup_expired(self, max_age_days: int = 14) -> int:
        """Delete entries older than *max_age_days*.

        Returns the number of deleted rows.
        """
        with sqlite_connection(self.db_path) as conn:
            if not self._ensure_table(conn):
                return 0
            before = conn.total_changes
            conn.execute(
                "DELETE FROM seen_urls "
                "WHERE first_seen_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)",
                (f"-{max_age_days} days",),
            )
            deleted = conn.total_changes - before
            if deleted > 0:
                logger.info(
                    "seen_urls cleanup: removed %d entries older than %d days",
                    deleted,
                    max_age_days,
                )
            return deleted

    @staticmethod
    def hash_url(url: str) -> str:
        """Compute the hash used as PK in ``seen_urls``.

        Exposed so callers can do O(1) membership checks against the set
        returned by ``get_seen_urls_for_source()``.
        """
        return _url_hash(url)
