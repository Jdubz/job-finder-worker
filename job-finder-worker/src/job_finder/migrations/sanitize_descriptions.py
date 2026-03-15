"""One-time migration: re-sanitize all job listing descriptions.

Many descriptions were stored with raw HTML, unescaped entities, or as
walls of text with no line breaks. This script applies the improved
sanitize_html_description() to every row and updates those that change.

Usage:
    cd job-finder-worker
    python -m job_finder.migrations.sanitize_descriptions [--db-path /path/to/db]
    # or against prod:
    SQLITE_DB_PATH=/srv/job-finder/data/jobfinder.db python -m job_finder.migrations.sanitize_descriptions

Dry-run (default): prints stats without writing.
Pass --apply to write changes.
"""

import argparse
import logging
import sqlite3
import sys
from pathlib import Path

# Add project root to path so we can import job_finder
project_root = Path(__file__).resolve().parents[3]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from job_finder.scrapers.text_sanitizer import sanitize_html_description
from job_finder.storage.sqlite_client import resolve_db_path

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Re-sanitize job listing descriptions")
    parser.add_argument("--db-path", help="Path to SQLite database")
    parser.add_argument(
        "--apply", action="store_true", help="Actually write changes (default is dry-run)"
    )
    parser.add_argument("--batch-size", type=int, default=500, help="Commit batch size")
    args = parser.parse_args()

    db_path = resolve_db_path(args.db_path)
    logger.info("Database: %s", db_path)
    logger.info("Mode: %s", "APPLY" if args.apply else "DRY RUN")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    cursor = conn.execute("SELECT id, description FROM job_listings")
    rows = cursor.fetchall()

    total = len(rows)
    changed = 0
    updates = []

    for row in rows:
        listing_id = row["id"]
        original = row["description"] or ""
        sanitized = sanitize_html_description(original)

        if sanitized != original:
            changed += 1
            updates.append((sanitized, listing_id))

            if changed <= 5:
                logger.info("\n--- Example %d (id=%s) ---", changed, listing_id[:8])
                logger.info("BEFORE (first 200): %s", repr(original[:200]))
                logger.info("AFTER  (first 200): %s", repr(sanitized[:200]))

    logger.info("\nTotal listings: %d", total)
    logger.info("Would change: %d (%.1f%%)", changed, (changed / total * 100) if total else 0)

    if args.apply and updates:
        logger.info("Applying %d updates in batches of %d...", len(updates), args.batch_size)
        for i in range(0, len(updates), args.batch_size):
            batch = updates[i : i + args.batch_size]
            conn.executemany(
                "UPDATE job_listings SET description = ? WHERE id = ?",
                batch,
            )
            conn.commit()
            logger.info("  Committed batch %d-%d", i + 1, min(i + args.batch_size, len(updates)))
        logger.info("Done. %d descriptions updated.", len(updates))
    elif not args.apply and updates:
        logger.info("\nRe-run with --apply to write changes.")

    conn.close()


if __name__ == "__main__":
    main()
