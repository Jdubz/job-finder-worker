"""
Migration to add parallels_csv column to skill_taxonomy and populate parallel relationships.

This migration:
1. Adds the parallels_csv column to skill_taxonomy if missing
2. Updates existing taxonomy rows with parallel skill relationships

Parallel skills are bidirectional alternatives - if a user has AWS and a job wants GCP,
the user won't be penalized for missing the skill (but won't get a bonus either).

Usage:
    python -m job_finder.migrations.add_taxonomy_parallels /path/to/database.db [--dry-run]
"""

import logging
import sqlite3
import sys
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# Parallel relationships to add to existing taxonomy entries
# Format: canonical -> parallels_csv
PARALLEL_UPDATES = {
    # Frontend frameworks - parallel to each other
    "react": "vue,angular,svelte",
    "vue": "react,angular,svelte",
    "angular": "react,vue,svelte",
    "svelte": "react,vue,angular",
    # Backend frameworks - parallel to each other
    "express": "fastapi,django,flask",
    "fastapi": "express,django,flask",
    "django": "express,fastapi,flask",
    "flask": "express,fastapi,django",
    # API patterns - parallel to each other
    "graphql": "rest",
    "rest": "graphql",
    # Cloud providers - parallel to each other
    "aws": "gcp,azure",
    "gcp": "aws,azure",
    "azure": "aws,gcp",
    # SQL databases - parallel to each other
    "postgres": "mysql",
    "mysql": "postgres",
}


def run_migration(db_path: str, dry_run: bool = False) -> bool:
    """
    Add parallels_csv column and populate parallel relationships.

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
        # Check if skill_taxonomy table exists
        cursor.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'skill_taxonomy'
        """
        )
        if not cursor.fetchone():
            logger.info("skill_taxonomy table does not exist. Nothing to migrate.")
            logger.info("Table will be created with parallels when taxonomy is first loaded.")
            return True

        # Check if parallels_csv column exists
        columns = [row[1] for row in cursor.execute("PRAGMA table_info(skill_taxonomy)")]
        column_added = False

        if "parallels_csv" not in columns:
            if dry_run:
                logger.info("[DRY RUN] Would add parallels_csv column to skill_taxonomy table")
                # In dry run, we still need to check what updates would be needed
                cursor.execute("SELECT canonical FROM skill_taxonomy")
                existing = {row["canonical"]: "" for row in cursor.fetchall()}
            else:
                logger.info("Adding parallels_csv column to skill_taxonomy table...")
                cursor.execute(
                    "ALTER TABLE skill_taxonomy ADD COLUMN parallels_csv TEXT NOT NULL DEFAULT ''"
                )
                column_added = True
                # Get existing entries (all will have empty parallels_csv)
                cursor.execute("SELECT canonical, parallels_csv FROM skill_taxonomy")
                existing = {
                    row["canonical"]: row["parallels_csv"] or "" for row in cursor.fetchall()
                }
        else:
            logger.info("parallels_csv column already exists.")
            # Get existing taxonomy entries
            cursor.execute("SELECT canonical, parallels_csv FROM skill_taxonomy")
            existing = {row["canonical"]: row["parallels_csv"] or "" for row in cursor.fetchall()}

        # Determine what updates are needed
        updates_needed = []
        for canonical, parallels_csv in PARALLEL_UPDATES.items():
            if canonical in existing:
                current = existing[canonical]
                if current != parallels_csv:
                    updates_needed.append((canonical, current, parallels_csv))

        if not updates_needed and not column_added:
            logger.info("All parallel relationships already up to date. Nothing to do.")
            return True

        # Report planned updates
        if updates_needed:
            logger.info(f"Found {len(updates_needed)} entries to update:")
            for canonical, current, new in updates_needed:
                if current:
                    logger.info(f"  {canonical}: '{current}' -> '{new}'")
                else:
                    logger.info(f"  {canonical}: (empty) -> '{new}'")

        if dry_run:
            logger.info("[DRY RUN] No changes made.")
            return True

        # Apply updates
        now = utcnow_iso()
        for canonical, _, parallels_csv in updates_needed:
            cursor.execute(
                """
                UPDATE skill_taxonomy
                SET parallels_csv = ?, updated_at = ?
                WHERE canonical = ?
                """,
                (parallels_csv, now, canonical),
            )
            logger.info(f"  Updated {canonical}")

        conn.commit()
        logger.info("Migration completed successfully.")
        return True

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Add parallels_csv column to skill_taxonomy and populate parallel relationships."
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
