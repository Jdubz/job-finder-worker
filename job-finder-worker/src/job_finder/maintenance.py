"""
Maintenance scheduler for job matches staleness management.

This module handles:
- Deleting job matches older than 2 weeks
- Recalculating application priorities based on match scores
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


def recalculate_match_priorities(db_path: Optional[str] = None) -> int:
    """
    Recalculate application priorities based on current match scores.

    This updates the application_priority for all job matches where the
    priority doesn't match the score tier:
    - Score >= 75: High
    - Score >= 50: Medium
    - Score < 50: Low

    Args:
        db_path: Optional path to SQLite database

    Returns:
        Number of updated matches
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    with sqlite_connection(db_path) as conn:
        cursor = conn.execute(
            """
            UPDATE job_matches
            SET
                application_priority = CASE
                    WHEN match_score >= 75 THEN 'High'
                    WHEN match_score >= 50 THEN 'Medium'
                    ELSE 'Low'
                END,
                updated_at = ?
            WHERE
                application_priority <> CASE
                    WHEN match_score >= 75 THEN 'High'
                    WHEN match_score >= 50 THEN 'Medium'
                    ELSE 'Low'
                END
            """,
            (now_iso,),
        )
        updated_count = cursor.rowcount

    logger.info(f"Recalculated priorities for {updated_count} job matches")
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

        # Step 2: Recalculate priorities for remaining matches
        results["updated_count"] = recalculate_match_priorities(db_path)

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
    import sys
    from pathlib import Path

    # Add src to Python path
    sys.path.insert(0, str(Path(__file__).parent.parent))

    from dotenv import load_dotenv

    from job_finder.logging_config import setup_logging

    load_dotenv()
    setup_logging()

    # db_path=None lets sqlite_connection use resolve_db_path internally
    results = run_maintenance()
    print(f"Maintenance results: {results}")
    sys.exit(0 if results["success"] else 1)
