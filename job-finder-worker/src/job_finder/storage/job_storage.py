"""SQLite-backed storage for job matches."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import uuid4

from job_finder.exceptions import StorageError
from job_finder.storage.sqlite_client import sqlite_connection
from job_finder.utils.url_utils import normalize_url

if TYPE_CHECKING:
    from job_finder.ai.matcher import JobMatchResult

logger = logging.getLogger(__name__)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_list(value: Optional[List[Any]]) -> str:
    return json.dumps(value or [])


def _serialize_json(value: Optional[Dict[str, Any]]) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value)


class JobStorage:
    """Persist job matches to SQLite."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def _flatten_customization(self, recommendations: Any) -> List[str]:
        """Convert structured customization data into a simple list of bullet points."""
        if recommendations is None:
            return []

        flattened: List[str] = []

        if isinstance(recommendations, list):
            for item in recommendations:
                flattened.append(str(item))
            return flattened

        if isinstance(recommendations, dict):
            for key, value in recommendations.items():
                if isinstance(value, list):
                    for entry in value:
                        flattened.append(f"{key}: {entry}")
                elif isinstance(value, dict):
                    flattened.append(f"{key}: {json.dumps(value)}")
                else:
                    flattened.append(f"{key}: {value}")
            return flattened

        flattened.append(str(recommendations))
        return flattened

    def _parse_experience_match(self, value: Any, fallback: int) -> int:
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            digits = "".join(ch for ch in value if ch.isdigit())
            if digits:
                try:
                    return int(digits)
                except ValueError:
                    return fallback
        return fallback

    def _find_existing_id(
        self, conn: sqlite3.Connection, url: str, user_id: Optional[str]
    ) -> Optional[str]:
        if not url:
            return None

        if user_id:
            row = conn.execute(
                "SELECT id FROM job_matches WHERE url = ? AND (submitted_by = ? OR submitted_by IS NULL) LIMIT 1",
                (url, user_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT id FROM job_matches WHERE url = ? LIMIT 1", (url,)
            ).fetchone()

        if row:
            return row["id"]
        return None

    def save_job_match(
        self,
        job: Dict[str, Any],
        match_result: "JobMatchResult",
        user_id: Optional[str] = None,
        queue_item_id: Optional[str] = None,
    ) -> str:
        """
        Save a job match if it does not already exist.

        Returns the primary key of the saved (or existing) record.
        """
        normalized_url = normalize_url(job.get("url", "")) if job.get("url") else ""

        with sqlite_connection(self.db_path) as conn:
            existing = self._find_existing_id(conn, normalized_url, user_id)
            if existing:
                logger.info(
                    "[DB:DUPLICATE] Job already exists: %s at %s (ID: %s)",
                    job.get("title"),
                    job.get("company"),
                    existing,
                )
                return existing

            job_id = str(uuid4())
            now = _utcnow()

            match_reasons = getattr(match_result, "match_reasons", None)
            if not match_reasons:
                match_reasons = getattr(match_result, "key_strengths", [])

            customization = self._flatten_customization(
                getattr(match_result, "customization_recommendations", None)
            )

            experience_match = self._parse_experience_match(
                getattr(match_result, "experience_match", 0), fallback=match_result.match_score
            )

            try:
                conn.execute(
                    """
                    INSERT INTO job_matches (
                        id, url, company_name, company_id, job_title, location,
                        salary_range, job_description, company_info, match_score,
                        matched_skills, missing_skills, match_reasons, key_strengths,
                        potential_concerns, experience_match, application_priority,
                        customization_recommendations, resume_intake_json, analyzed_at,
                        submitted_by, queue_item_id, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        job_id,
                        normalized_url or job.get("url", ""),
                        job.get("company", "") or job.get("company_name", ""),
                        job.get("company_id"),
                        job.get("title", ""),
                        job.get("location"),
                        job.get("salary") or job.get("salary_range"),
                        job.get("description", ""),
                        job.get("company_info"),
                        match_result.match_score,
                        _serialize_list(match_result.matched_skills),
                        _serialize_list(match_result.missing_skills),
                        _serialize_list(match_reasons),
                        _serialize_list(match_result.key_strengths),
                        _serialize_list(match_result.potential_concerns),
                        experience_match,
                        match_result.application_priority,
                        _serialize_list(customization),
                        _serialize_json(match_result.resume_intake_data),
                        now,
                        user_id,
                        queue_item_id or job.get("queue_item_id"),
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                if "job_matches.url" in str(exc) and normalized_url:
                    existing = self._find_existing_id(conn, normalized_url, user_id)
                    if existing:
                        return existing
                raise StorageError(f"Failed to save job match: {exc}") from exc

            logger.info(
                "Saved job match %s (%s) with score %s",
                job_id,
                job.get("company"),
                match_result.match_score,
            )
            return job_id

    def job_exists(self, job_url: str, user_id: Optional[str] = None) -> bool:
        """Return True if a normalized URL already exists."""
        if not job_url:
            return False

        normalized = normalize_url(job_url)
        with sqlite_connection(self.db_path) as conn:
            row = self._find_existing_id(conn, normalized, user_id)
            return row is not None

    def batch_check_exists(
        self, job_urls: List[str], user_id: Optional[str] = None
    ) -> Dict[str, bool]:
        """Batch existence check for URLs."""
        normalized_urls = [normalize_url(url) for url in job_urls if url]
        if not normalized_urls:
            return {}

        results = {url: False for url in normalized_urls}

        with sqlite_connection(self.db_path) as conn:
            chunk_size = 50
            for chunk_start in range(0, len(normalized_urls), chunk_size):
                chunk = normalized_urls[chunk_start : chunk_start + chunk_size]
                placeholders = ",".join("?" for _ in chunk)
                query = f"SELECT url, submitted_by FROM job_matches WHERE url IN ({placeholders})"
                rows = conn.execute(query, tuple(chunk)).fetchall()
                for row in rows:
                    if user_id and row["submitted_by"] and row["submitted_by"] != user_id:
                        continue
                    results[row["url"]] = True

        return results
