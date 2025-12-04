"""
Migration to add partial index on (company_id, aggregator_domain).

This supports fast lookups for company-specific aggregator sources and
enforces uniqueness at the database level for that pair when both columns
are present.

Usage:
    python -m job_finder.migrations.add_company_aggregator_index /path/to/database.db [--dry-run]
"""

import logging
import sqlite3
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def run_migration(db_path: str, dry_run: bool = False) -> bool:
    logger.info(f"Opening database: {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if index already exists
        cursor.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type = 'index' AND name = 'idx_job_sources_company_aggregator'
            """
        )
        if cursor.fetchone():
            logger.info("Index idx_job_sources_company_aggregator already exists. Nothing to do.")
            return True

        if dry_run:
            logger.info(
                "[DRY RUN] Would create partial index idx_job_sources_company_aggregator on (company_id, aggregator_domain)"
            )
            return True

        logger.info("Creating partial index idx_job_sources_company_aggregator on job_sources...")
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_job_sources_company_aggregator
              ON job_sources (company_id, aggregator_domain)
              WHERE company_id IS NOT NULL AND aggregator_domain IS NOT NULL;
            """
        )

        conn.commit()
        logger.info("Migration completed successfully.")
        return True

    except Exception as exc:
        logger.error(f"Migration failed: {exc}")
        conn.rollback()
        return False
    finally:
        conn.close()


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Add partial index on (company_id, aggregator_domain) to job_sources."
    )
    parser.add_argument("db_path", help="Path to the SQLite database")
    parser.add_argument("--dry-run", action="store_true", help="If set, only report actions")
    args = parser.parse_args()

    if args.dry_run:
        logger.info("Running in DRY RUN mode - no changes will be made")

    success = run_migration(args.db_path, dry_run=args.dry_run)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
