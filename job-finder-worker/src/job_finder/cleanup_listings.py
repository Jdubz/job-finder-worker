"""One-time cleanup script to run all job listings against current pre-filter settings.

Deletes listings that fail the pre-filter check, along with associated job_matches
(via CASCADE).

Usage:
    # Local development (uses .env for SQLITE_DB_PATH)
    ENVIRONMENT=development python -m job_finder.cleanup_listings --dry-run

    # Production (uses .env for SQLITE_DB_PATH)
    # First source the environment: source /srv/job-finder/secrets/worker.env
    ENVIRONMENT=production python -m job_finder.cleanup_listings --dry-run

    # Actual cleanup (remove --dry-run)
    ENVIRONMENT=production python -m job_finder.cleanup_listings

Options:
    --dry-run       Show what would be deleted without actually deleting
    --batch-size N  Process N listings at a time (default: 100)
    --verbose, -v   Show each failed listing with reason
"""

import argparse
import logging
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Add src to Python path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from job_finder.filters.prefilter import PreFilter
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.storage.sqlite_client import sqlite_connection

logger = logging.getLogger(__name__)


def get_all_listings(db_path: str | None = None) -> List[Dict[str, Any]]:
    """Fetch all job listings from the database."""
    with sqlite_connection(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, url, title, company_name, location, description,
                   posted_date, salary_range, source_id, status
            FROM job_listings
            ORDER BY created_at ASC
            """
        ).fetchall()
        return [dict(row) for row in rows]


def get_source_info(db_path: str | None, source_id: str | None) -> Dict[str, Any]:
    """Get source information to determine if it's a remote-only source."""
    if not source_id:
        return {}

    with sqlite_connection(db_path) as conn:
        row = conn.execute(
            "SELECT id, name, source_type FROM job_sources WHERE id = ?", (source_id,)
        ).fetchone()
        return dict(row) if row else {}


def is_remote_source(source_info: Dict[str, Any]) -> bool:
    """Check if a source is a remote-only job board."""
    # Known remote-only sources
    remote_source_types = {"remotive", "weworkremotely", "remote_ok"}
    source_type = (source_info.get("source_type") or "").lower()
    source_name = (source_info.get("name") or "").lower()

    return source_type in remote_source_types or "remote" in source_name


def delete_listings(db_path: str | None, listing_ids: List[str]) -> int:
    """Delete listings by ID. Returns count of deleted rows."""
    if not listing_ids:
        return 0

    with sqlite_connection(db_path) as conn:
        placeholders = ",".join("?" for _ in listing_ids)
        conn.execute(f"DELETE FROM job_listings WHERE id IN ({placeholders})", tuple(listing_ids))
        return conn.total_changes


def run_cleanup(
    db_path: str | None = None,
    dry_run: bool = False,
    batch_size: int = 100,
) -> Tuple[int, int, int]:
    """
    Run the cleanup process.

    Returns:
        Tuple of (total_processed, passed_count, failed_count)
    """
    # Load current pre-filter config
    config_loader = ConfigLoader(db_path)
    prefilter_config = config_loader.get_prefilter_policy()
    prefilter = PreFilter(prefilter_config)

    logger.info("Loaded pre-filter configuration")
    logger.info(f"  Title required keywords: {prefilter.required_keywords}")
    logger.info(f"  Title excluded keywords: {prefilter.excluded_keywords}")
    logger.info(f"  Max age days: {prefilter.max_age_days}")
    logger.info(f"  Allow remote: {prefilter.allow_remote}")
    logger.info(f"  Allow hybrid: {prefilter.allow_hybrid}")
    logger.info(f"  Allow onsite: {prefilter.allow_onsite}")
    logger.info(f"  Min salary: {prefilter.min_salary}")

    # Fetch all listings
    listings = get_all_listings(db_path)
    total = len(listings)
    logger.info(f"Found {total} job listings to process")

    if total == 0:
        return 0, 0, 0

    # Cache source info to avoid repeated lookups
    source_cache: Dict[str, Dict[str, Any]] = {}

    passed_count = 0
    failed_count = 0
    to_delete: List[str] = []

    for i, listing in enumerate(listings):
        listing_id = listing["id"]
        source_id = listing.get("source_id")

        # Get source info (cached)
        if source_id and source_id not in source_cache:
            source_cache[source_id] = get_source_info(db_path, source_id)
        source_info = source_cache.get(source_id, {}) if source_id else {}

        # Build job_data dict for pre-filter
        job_data = {
            "title": listing.get("title", ""),
            "description": listing.get("description", ""),
            "location": listing.get("location", ""),
            "posted_date": listing.get("posted_date"),
            "salary_range": listing.get("salary_range"),
            "company_name": listing.get("company_name", ""),
        }

        # Run pre-filter
        result = prefilter.filter(job_data, is_remote_source=is_remote_source(source_info))

        if result.passed:
            passed_count += 1
        else:
            failed_count += 1
            to_delete.append(listing_id)
            logger.debug(
                f"FAIL: {listing.get('title', 'No title')[:50]} @ {listing.get('company_name', 'Unknown')[:30]} - {result.reason}"
            )

        # Process in batches
        if len(to_delete) >= batch_size:
            if dry_run:
                logger.info(f"[DRY RUN] Would delete {len(to_delete)} listings")
            else:
                deleted = delete_listings(db_path, to_delete)
                logger.info(f"Deleted {deleted} listings")
            to_delete = []

        # Progress logging
        if (i + 1) % 100 == 0 or (i + 1) == total:
            logger.info(f"Progress: {i + 1}/{total} ({passed_count} passed, {failed_count} failed)")

    # Delete remaining
    if to_delete:
        if dry_run:
            logger.info(f"[DRY RUN] Would delete {len(to_delete)} listings")
        else:
            deleted = delete_listings(db_path, to_delete)
            logger.info(f"Deleted {deleted} listings")

    return total, passed_count, failed_count


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Clean up job listings that fail current pre-filter settings",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Dry run on production (source env first)
  source /srv/job-finder/secrets/worker.env
  ENVIRONMENT=production python -m job_finder.cleanup_listings --dry-run --verbose

  # Actual cleanup on production
  source /srv/job-finder/secrets/worker.env
  ENVIRONMENT=production python -m job_finder.cleanup_listings
        """,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be deleted without actually deleting",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Process N listings at a time (default: 100)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose logging (show each failed listing)",
    )
    args = parser.parse_args()

    # Setup logging
    from dotenv import load_dotenv
    from job_finder.logging_config import setup_logging

    load_dotenv()
    setup_logging()

    if args.verbose:
        logging.getLogger("job_finder.cleanup_listings").setLevel(logging.DEBUG)

    logger.info("=" * 60)
    logger.info("Job Listings Cleanup - Pre-filter Check")
    logger.info("=" * 60)

    if args.dry_run:
        logger.info("*** DRY RUN MODE - No changes will be made ***")

    try:
        total, passed, failed = run_cleanup(
            db_path=None,  # Uses SQLITE_DB_PATH env var via resolve_db_path
            dry_run=args.dry_run,
            batch_size=args.batch_size,
        )

        logger.info("=" * 60)
        logger.info("CLEANUP COMPLETE")
        logger.info(f"  Total processed: {total}")
        logger.info(f"  Passed: {passed}")
        logger.info(f"  Failed (deleted): {failed}")
        logger.info("=" * 60)

        return 0 if failed == 0 else 1

    except Exception as e:
        logger.error(f"Cleanup failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
