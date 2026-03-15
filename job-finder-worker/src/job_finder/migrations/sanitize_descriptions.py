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

# Add src directory to path so we can import job_finder
src_dir = Path(__file__).resolve().parents[2]
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

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

    total = conn.execute("SELECT COUNT(*) FROM job_listings").fetchone()[0]
    cursor = conn.execute("SELECT id, description FROM job_listings")

    changed = 0
    batch = []

    while True:
        rows = cursor.fetchmany(args.batch_size)
        if not rows:
            break

        for row in rows:
            listing_id = row["id"]
            original = row["description"] or ""
            sanitized = sanitize_html_description(original)

            if sanitized != original:
                changed += 1

                if changed <= 5:
                    logger.info("\n--- Example %d (id=%s) ---", changed, listing_id[:8])
                    logger.info("BEFORE (first 200): %s", repr(original[:200]))
                    logger.info("AFTER  (first 200): %s", repr(sanitized[:200]))

                if args.apply:
                    batch.append((sanitized, listing_id))

        if args.apply and batch:
            conn.executemany(
                "UPDATE job_listings SET description = ? WHERE id = ?",
                batch,
            )
            conn.commit()
            logger.info("  Committed batch of %d updates", len(batch))
            batch = []

    logger.info("\nTotal listings: %d", total)
    logger.info("Would change: %d (%.1f%%)", changed, (changed / total * 100) if total else 0)

    if not args.apply and changed:
        logger.info("\nRe-run with --apply to write changes.")

    conn.close()


if __name__ == "__main__":
    main()
