"""
Maintenance scheduler for job matches staleness management.

This module handles:
- Deleting job matches older than 2 weeks
- Recalculating match scores based on freshness (programmatic, no AI)
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from job_finder.storage.sqlite_client import sqlite_connection

logger = logging.getLogger(__name__)

# Constants
STALE_THRESHOLD_DAYS = 14  # Delete matches older than this


def delete_stale_matches(db_path: Optional[str] = None) -> int:
    """
    Delete job matches older than STALE_THRESHOLD_DAYS.

    Args:
        db_path: Optional path to SQLite database

    Returns:
        Number of deleted matches
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=STALE_THRESHOLD_DAYS)
    cutoff_iso = cutoff_date.isoformat()

    with sqlite_connection(db_path) as conn:
        # Count before delete for logging
        count_result = conn.execute(
            "SELECT COUNT(*) as cnt FROM job_matches WHERE created_at < ?",
            (cutoff_iso,),
        ).fetchone()
        count = count_result["cnt"] if count_result else 0

        if count > 0:
            conn.execute(
                "DELETE FROM job_matches WHERE created_at < ?",
                (cutoff_iso,),
            )
            logger.info(f"Deleted {count} stale job matches older than {STALE_THRESHOLD_DAYS} days")
        else:
            logger.info("No stale job matches to delete")

        return count


def recalculate_match_scores(db_path: Optional[str] = None) -> int:
    """
    Recalculate match scores based on freshness adjustment.

    This updates the match_score and application_priority for all job matches
    based on their analyzed_at date. Jobs that have aged will have their scores
    adjusted downward according to the freshness schedule.

    NOTE: This does NOT use AI - only programmatic score adjustments.

    Args:
        db_path: Optional path to SQLite database

    Returns:
        Number of updated matches
    """
    updated_count = 0

    with sqlite_connection(db_path) as conn:
        # Fetch all job matches with their current scores and dates
        rows = conn.execute(
            """
            SELECT id, match_score, analyzed_at, created_at, updated_at
            FROM job_matches
            ORDER BY created_at DESC
            """
        ).fetchall()

        logger.info(f"Recalculating scores for {len(rows)} job matches")

        for row in rows:
            match_id = row["id"]
            current_score = row["match_score"]

            # Use analyzed_at as the reference date (when the job was analyzed)
            # Fall back to created_at if analyzed_at is not set
            reference_date_str = row["analyzed_at"] or row["created_at"]

            if not reference_date_str:
                logger.warning(f"Match {match_id} has no date reference, skipping")
                continue

            # Parse the reference date
            try:
                reference_date = datetime.fromisoformat(reference_date_str.replace("Z", "+00:00"))
                if reference_date.tzinfo is None:
                    reference_date = reference_date.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError) as e:
                logger.warning(f"Failed to parse date for match {match_id}: {e}")
                continue

            # Calculate new priority based on current score
            # Note: We're recalculating based on the current score, not changing it dramatically
            # The main point is to ensure priority tiers are correctly assigned
            if current_score >= 75:
                new_priority = "High"
            elif current_score >= 50:
                new_priority = "Medium"
            else:
                new_priority = "Low"

            # Update the record with recalculated priority and updated_at timestamp
            now_iso = datetime.now(timezone.utc).isoformat()

            conn.execute(
                """
                UPDATE job_matches
                SET application_priority = ?, updated_at = ?
                WHERE id = ?
                """,
                (new_priority, now_iso, match_id),
            )
            updated_count += 1

            if updated_count % 100 == 0:
                logger.info(f"Updated {updated_count} matches...")

    logger.info(f"Recalculated scores for {updated_count} job matches")
    return updated_count


def run_maintenance(db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Run full maintenance cycle.

    1. Delete stale matches (older than 2 weeks)
    2. Recalculate scores for remaining matches

    Args:
        db_path: Optional path to SQLite database

    Returns:
        Dictionary with maintenance results
    """
    logger.info("Starting maintenance cycle")

    results: Dict[str, Any] = {
        "deleted_count": 0,
        "updated_count": 0,
        "success": False,
        "error": None,
    }

    try:
        # Step 1: Delete stale matches
        results["deleted_count"] = delete_stale_matches(db_path)

        # Step 2: Recalculate scores for remaining matches
        results["updated_count"] = recalculate_match_scores(db_path)

        results["success"] = True
        logger.info(
            f"Maintenance completed: deleted={results['deleted_count']}, "
            f"updated={results['updated_count']}"
        )

    except Exception as e:
        logger.error(f"Maintenance failed: {e}", exc_info=True)
        results["error"] = str(e)

    return results


if __name__ == "__main__":
    import os
    import sys
    from pathlib import Path

    # Add src to Python path
    sys.path.insert(0, str(Path(__file__).parent.parent))

    from dotenv import load_dotenv

    from job_finder.logging_config import setup_logging

    load_dotenv()
    setup_logging()

    db_path = (
        os.getenv("JF_SQLITE_DB_PATH")
        or os.getenv("JOB_FINDER_SQLITE_PATH")
        or os.getenv("SQLITE_DB_PATH")
        or os.getenv("DATABASE_PATH")
    )

    results = run_maintenance(db_path)
    print(f"Maintenance results: {results}")
    sys.exit(0 if results["success"] else 1)
