"""
Migration to add unique constraint on job_sources.name.

This migration adds a unique index on the name column to prevent duplicate
source names at the database level.

Note: Application-level checks in JobSourcesManager.add_source() provide
the primary protection. This index serves as a safety net and improves
lookup performance.

Usage:
    python -m job_finder.migrations.add_unique_source_name /path/to/database.db [--dry-run]
"""

import logging
import sqlite3
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def check_for_duplicates(cursor: sqlite3.Cursor) -> list[tuple[str, int]]:
    """Check for existing duplicate names.

    Returns:
        List of (name, count) tuples for names that appear more than once
    """
    cursor.execute("""
        SELECT name, COUNT(*) as count
        FROM job_sources
        GROUP BY name
        HAVING count > 1
        ORDER BY count DESC
    """)
    return cursor.fetchall()


def run_migration(db_path: str, dry_run: bool = False) -> bool:
    """
    Add unique index on job_sources.name.

    Args:
        db_path: Path to the SQLite database
        dry_run: If True, only report what would be done

    Returns:
        True if migration succeeded, False otherwise
    """
    logger.info(f"Opening database: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        # Check if index already exists
        cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type = 'index' AND name = 'idx_job_sources_name_unique'
        """)
        if cursor.fetchone():
            logger.info("Unique index idx_job_sources_name_unique already exists. Nothing to do.")
            return True

        # Check for existing duplicates
        duplicates = check_for_duplicates(cursor)
        if duplicates:
            logger.error("Cannot add unique constraint - duplicate names exist:")
            for name, count in duplicates:
                logger.error(f"  '{name}' appears {count} times")
            logger.error("")
            logger.error("Please resolve duplicates before running this migration.")
            logger.error("You can use: DELETE FROM job_sources WHERE id IN (...)")
            return False

        if dry_run:
            logger.info("[DRY RUN] Would create unique index idx_job_sources_name_unique on job_sources(name)")
            return True

        # Create unique index
        logger.info("Creating unique index idx_job_sources_name_unique on job_sources(name)...")
        cursor.execute("""
            CREATE UNIQUE INDEX idx_job_sources_name_unique ON job_sources(name)
        """)

        conn.commit()
        logger.info("Migration completed successfully.")
        return True

    except sqlite3.IntegrityError as e:
        logger.error(f"Integrity error (likely duplicates exist): {e}")
        conn.rollback()
        return False
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Add unique constraint on job_sources.name."
    )
    parser.add_argument("db_path", help="Path to the SQLite database")
    parser.add_argument(
        "--dry-run", action="store_true", help="If set, only report what would be done"
    )
    args = parser.parse_args()

    if args.dry_run:
        logger.info("Running in DRY RUN mode - no changes will be made")

    success = run_migration(args.db_path, dry_run=args.dry_run)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
