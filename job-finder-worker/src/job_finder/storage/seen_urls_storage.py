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
    return hashlib.sha256(url.encode()).hexdigest()[:16]


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

        The caller already has the full URL → it can compute the hash to check
        membership.  But since job_listings stores full URLs and we want a
        unified ``known_urls`` set, we store full-URL hashes and the caller
        does the same hash to probe.

        NOTE: We return the *url_hash* values (not the original URLs, which we
        don't store).  The caller should use ``url_in_seen_set()`` to probe.
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
        """Bulk-insert URLs into ``seen_urls`` (ignores duplicates).

        Returns the number of newly inserted rows.
        """
        if not urls:
            return 0

        inserted = 0
        with sqlite_connection(self.db_path) as conn:
            if not self._ensure_table(conn):
                return 0
            for url in urls:
                h = _url_hash(url)
                try:
                    conn.execute(
                        "INSERT OR IGNORE INTO seen_urls (url_hash, source_id) VALUES (?, ?)",
                        (h, source_id),
                    )
                    inserted += 1
                except sqlite3.IntegrityError:
                    pass
        return inserted

    @staticmethod
    def hash_url(url: str) -> str:
        """Compute the hash used as PK in ``seen_urls``.

        Exposed so callers can do O(1) membership checks against the set
        returned by ``get_seen_urls_for_source()``.
        """
        return _url_hash(url)
