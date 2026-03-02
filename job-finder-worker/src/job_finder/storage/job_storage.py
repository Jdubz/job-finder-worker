"""SQLite-backed storage for job matches.

Job matches now reference job_listings via foreign key (job_listing_id).
The job_listings table stores the raw job data (title, company, description, etc.),
while job_matches stores only the AI analysis results.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import uuid4

from job_finder.exceptions import StorageError
from job_finder.storage.sqlite_client import sqlite_connection, utcnow_iso

if TYPE_CHECKING:
    from job_finder.ai.matcher import JobMatchResult

logger = logging.getLogger(__name__)


def _serialize_list(value: Optional[List[Any]]) -> str:
    return json.dumps(value or [])


def _serialize_json(value: Optional[Dict[str, Any]]) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value)


class JobStorage:
    """Persist job matches to SQLite.

    Job matches now reference job_listings via foreign key. The job data
    (URL, title, company, description) is stored in job_listings table,
    while this class stores only the AI analysis results.
    """

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
        """Deprecated: experience_match is no longer used. Preserve numeric if clean, else fallback."""
        if isinstance(value, (int, float)):
            return int(value)
        return fallback

    def _find_existing_by_listing_id(
        self, conn: sqlite3.Connection, job_listing_id: str
    ) -> Optional[str]:
        """Find existing job match by job_listing_id."""
        if not job_listing_id:
            return None

        row = conn.execute(
            "SELECT id FROM job_matches WHERE job_listing_id = ? LIMIT 1",
            (job_listing_id,),
        ).fetchone()

        if row:
            return row["id"]
        return None

    def save_job_match(
        self,
        job_listing_id: Optional[str],
        match_result: "JobMatchResult",
        user_id: Optional[str] = None,
        queue_item_id: Optional[str] = None,
    ) -> str:
        """
        Save a job match referencing a job_listing.

        The job_listing_id is a foreign key to the job_listings table,
        which contains all the job data (title, company, description, etc.).

        Args:
            job_listing_id: Foreign key to job_listings table (required for new schema)
            match_result: AI analysis result
            user_id: Optional user ID who submitted
            queue_item_id: Optional queue item ID for tracking

        Returns:
            The primary key of the saved (or existing) record.

        Raises:
            StorageError: If job_listing_id is missing or save fails
        """
        if not job_listing_id:
            raise StorageError("job_listing_id is required to save job match")

        with sqlite_connection(self.db_path) as conn:
            # Check for existing match with this listing
            existing = self._find_existing_by_listing_id(conn, job_listing_id)
            if existing:
                logger.info(
                    "[DB:DUPLICATE] Job match already exists for listing %s (ID: %s)",
                    job_listing_id,
                    existing,
                )
                return existing

            job_id = str(uuid4())
            now = utcnow_iso()

            match_reasons = getattr(match_result, "match_reasons", None)
            if not match_reasons:
                match_reasons = getattr(match_result, "key_strengths", [])

            customization = self._flatten_customization(
                getattr(match_result, "customization_recommendations", None)
            )

            experience_match = self._parse_experience_match(
                getattr(match_result, "experience_match", 0),
                fallback=match_result.match_score,
            )

            try:
                conn.execute(
                    """
                    INSERT INTO job_matches (
                        id, job_listing_id, match_score,
                        matched_skills, missing_skills, match_reasons, key_strengths,
                        potential_concerns, experience_match,
                        customization_recommendations, resume_intake_json, analyzed_at,
                        submitted_by, queue_item_id, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        job_id,
                        job_listing_id,
                        match_result.match_score,
                        _serialize_list(match_result.matched_skills),
                        _serialize_list(match_result.missing_skills),
                        _serialize_list(match_reasons),
                        _serialize_list(match_result.key_strengths),
                        _serialize_list(match_result.potential_concerns),
                        experience_match,
                        _serialize_list(customization),
                        None,  # resume_intake_data (deprecated)
                        now,
                        user_id,
                        queue_item_id,
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                if "job_listing_id" in str(exc) or "FOREIGN KEY" in str(exc):
                    raise StorageError(
                        f"Invalid job_listing_id: {job_listing_id} not found in job_listings"
                    ) from exc
                if "job_matches.job_listing_id" in str(exc):
                    existing = self._find_existing_by_listing_id(conn, job_listing_id)
                    if existing:
                        return existing
                raise StorageError(f"Failed to save job match: {exc}") from exc

            logger.info(
                "Saved job match %s (listing: %s) with score %s",
                job_id,
                job_listing_id,
                match_result.match_score,
            )
            return job_id

    def match_exists_for_listing(self, job_listing_id: str) -> bool:
        """Return True if a job match already exists for this listing."""
        if not job_listing_id:
            return False

        with sqlite_connection(self.db_path) as conn:
            row = self._find_existing_by_listing_id(conn, job_listing_id)
            return row is not None

    def get_match_by_listing_id(self, job_listing_id: str) -> Optional[Dict[str, Any]]:
        """Get job match by job_listing_id."""
        if not job_listing_id:
            return None

        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM job_matches WHERE job_listing_id = ?",
                (job_listing_id,),
            ).fetchone()
            return dict(row) if row else None
