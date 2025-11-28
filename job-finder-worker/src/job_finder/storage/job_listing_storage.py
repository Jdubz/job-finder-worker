"""SQLite-backed storage for job listings.

This module manages the job_listings table which stores ALL jobs that pass
pre-filtering, regardless of AI analysis outcome. It serves as:
- Source of truth for job deduplication (URL uniqueness)
- Record of all jobs discovered through scraping
- Link to source and company records
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from job_finder.exceptions import StorageError
from job_finder.storage.sqlite_client import sqlite_connection
from job_finder.utils.url_utils import normalize_url

logger = logging.getLogger(__name__)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_json(value: Optional[Dict[str, Any]]) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value)


class JobListingStorage:
    """Persist job listings to SQLite."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def create_listing(
        self,
        url: str,
        title: str,
        company_name: str,
        description: str,
        source_id: Optional[str] = None,
        company_id: Optional[str] = None,
        location: Optional[str] = None,
        salary_range: Optional[str] = None,
        posted_date: Optional[str] = None,
        status: str = "pending",
        filter_result: Optional[Dict[str, Any]] = None,
        listing_id: Optional[str] = None,
    ) -> str:
        """
        Create a new job listing record.

        Returns the primary key of the created record.
        Raises StorageError if URL already exists (use get_or_create_listing instead).
        """
        normalized_url = normalize_url(url) if url else ""
        listing_id = listing_id or str(uuid4())
        now = _utcnow()

        with sqlite_connection(self.db_path) as conn:
            try:
                conn.execute(
                    """
                    INSERT INTO job_listings (
                        id, url, source_id, company_id, title, company_name,
                        location, salary_range, description, posted_date,
                        status, filter_result, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        listing_id,
                        normalized_url,
                        source_id,
                        company_id,
                        title,
                        company_name,
                        location,
                        salary_range,
                        description,
                        posted_date,
                        status,
                        _serialize_json(filter_result),
                        now,
                        now,
                    ),
                )
                logger.info(
                    "Created job listing %s: %s at %s",
                    listing_id,
                    title,
                    company_name,
                )
                return listing_id
            except sqlite3.IntegrityError as exc:
                if "job_listings.url" in str(exc):
                    raise StorageError(
                        f"Job listing with URL already exists: {normalized_url}"
                    ) from exc
                raise StorageError(f"Failed to create job listing: {exc}") from exc

    def get_or_create_listing(
        self,
        url: str,
        title: str,
        company_name: str,
        description: str,
        source_id: Optional[str] = None,
        company_id: Optional[str] = None,
        location: Optional[str] = None,
        salary_range: Optional[str] = None,
        posted_date: Optional[str] = None,
        status: str = "pending",
        filter_result: Optional[Dict[str, Any]] = None,
    ) -> tuple[str, bool]:
        """
        Get existing listing by URL or create a new one.

        Returns (listing_id, created) tuple where created is True if new record.
        """
        normalized_url = normalize_url(url) if url else ""

        with sqlite_connection(self.db_path) as conn:
            # Check for existing
            row = conn.execute(
                "SELECT id FROM job_listings WHERE url = ? LIMIT 1",
                (normalized_url,),
            ).fetchone()

            if row:
                logger.debug("Found existing job listing: %s", row["id"])
                return row["id"], False

        # Create new (outside transaction to avoid nested connection issues)
        listing_id = self.create_listing(
            url=url,
            title=title,
            company_name=company_name,
            description=description,
            source_id=source_id,
            company_id=company_id,
            location=location,
            salary_range=salary_range,
            posted_date=posted_date,
            status=status,
            filter_result=filter_result,
        )
        return listing_id, True

    def get_by_id(self, listing_id: str) -> Optional[Dict[str, Any]]:
        """Get a job listing by ID."""
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute("SELECT * FROM job_listings WHERE id = ?", (listing_id,)).fetchone()
            return dict(row) if row else None

    def get_by_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Get a job listing by URL."""
        normalized_url = normalize_url(url) if url else ""
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM job_listings WHERE url = ?", (normalized_url,)
            ).fetchone()
            return dict(row) if row else None

    def listing_exists(self, url: str) -> bool:
        """Return True if a normalized URL already exists in job_listings."""
        if not url:
            return False

        normalized = normalize_url(url)
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT 1 FROM job_listings WHERE url = ? LIMIT 1", (normalized,)
            ).fetchone()
            return row is not None

    def batch_check_exists(self, urls: List[str]) -> Dict[str, bool]:
        """
        Batch existence check for URLs.

        Returns dict mapping normalized URL -> exists boolean.
        """
        normalized_urls = [normalize_url(url) for url in urls if url]
        if not normalized_urls:
            return {}

        results = {url: False for url in normalized_urls}

        with sqlite_connection(self.db_path) as conn:
            chunk_size = 50
            for chunk_start in range(0, len(normalized_urls), chunk_size):
                chunk = normalized_urls[chunk_start : chunk_start + chunk_size]
                placeholders = ",".join("?" for _ in chunk)
                query = f"SELECT url FROM job_listings WHERE url IN ({placeholders})"
                rows = conn.execute(query, tuple(chunk)).fetchall()
                for row in rows:
                    results[row["url"]] = True

        return results

    def update_status(
        self,
        listing_id: str,
        status: str,
        filter_result: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Update job listing status.

        Valid statuses: pending, filtered, analyzing, analyzed, skipped
        """
        now = _utcnow()

        with sqlite_connection(self.db_path) as conn:
            if filter_result is not None:
                conn.execute(
                    """
                    UPDATE job_listings
                    SET status = ?, filter_result = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (status, _serialize_json(filter_result), now, listing_id),
                )
            else:
                conn.execute(
                    """
                    UPDATE job_listings
                    SET status = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (status, now, listing_id),
                )

            return conn.total_changes > 0

    def update_company_id(self, listing_id: str, company_id: str) -> bool:
        """Update the company_id for a job listing."""
        now = _utcnow()

        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE job_listings
                SET company_id = ?, updated_at = ?
                WHERE id = ?
                """,
                (company_id, now, listing_id),
            )
            return conn.total_changes > 0

    def delete(self, listing_id: str) -> bool:
        """Delete a job listing by ID."""
        with sqlite_connection(self.db_path) as conn:
            conn.execute("DELETE FROM job_listings WHERE id = ?", (listing_id,))
            return conn.total_changes > 0
