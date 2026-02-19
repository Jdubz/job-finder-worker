"""
Migration to re-enable sources incorrectly disabled by transient errors.

On 2026-02-18, a transient Workday API issue (HTTP 400) caused the scrape_runner
to permanently disable all 19 Workday sources on a single failure. The BuiltIn
aggregator was also disabled after a timeout. All 20 endpoints now return HTTP 200.

This migration re-enables those sources by:
1. Verifying each source is currently disabled
2. Clearing disabled_notes, disabled_tags, and consecutive_failures from config
3. Setting status back to active

Usage:
    python -m job_finder.migrations.reenable_transient_sources /path/to/database.db --dry-run
    python -m job_finder.migrations.reenable_transient_sources /path/to/database.db
"""

import json
import logging
import sqlite3
import sys
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# All 20 source IDs verified returning HTTP 200 as of 2026-02-18
SOURCES_TO_REENABLE = {
    "09dbf836-bb8a-4137-af91-b08df0f93d6d": "100 Salesforce, Inc. Jobs",
    "08e707a7-ac4a-4f20-989a-a83ab86cb55b": "Boeing Jobs (myworkdayjobs.com)",
    "20853555-ca87-4f7f-951e-5bc832bdec67": "BuiltIn (Aggregator)",
    "c61804a6-ddf3-4ffc-9a42-f69db1417960": "CSG Jobs (myworkdayjobs.com)",
    "48d9e092-4c4c-4550-9919-ee1f8d8c3909": "Cardlytics, Inc. Jobs (myworkdayjobs.com)",
    "78a53e15-381a-46f2-bcef-358164d8e81b": "Centene Corporation Jobs (myworkdayjobs.com)",
    "ce9da8cd-fba9-49da-b69f-42253c63ecc9": "Ciena Jobs (myworkdayjobs.com)",
    "f2e3b3f8-15dc-495e-9a37-36174dfe514a": "Cleveland Clinic Jobs (myworkdayjobs.com)",
    "de0a84a2-6f51-4aea-9193-72176d285be4": "Concentrix Jobs (myworkdayjobs.com)",
    "08cceb92-edce-43dc-b9c0-037fa40c3e0d": "Duck Creek Technologies Jobs (myworkdayjobs.com)",
    "09888518-4afd-4bd6-a336-840cd99bfb93": "Eos Energy Enterprises Jobs (myworkdayjobs.com)",
    "76bf4e57-5b47-4ad9-9491-c9b85e52a250": "GD Information Technology, Inc. Jobs (myworkdayjobs.com)",
    "325508a5-34b1-4ba0-8002-74b94d6098b8": "GE HealthCare Jobs (myworkdayjobs.com)",
    "492c3f3b-cc04-4230-8c66-3f4b4b772e94": "Green Dot Corporation Jobs (myworkdayjobs.com)",
    "e074463e-3818-4309-9fbd-1f9c92d1c310": "Pluralsight, LLC Jobs (myworkdayjobs.com)",
    "8fe2848a-65a7-45c6-9aa2-93138512e0fb": "Press Ganey Jobs (myworkdayjobs.com)",
    "e5b59279-8d1a-4429-a84c-1f01c0f5c988": "Progressive Leasing Jobs (myworkdayjobs.com)",
    "65b329b3-d341-4476-bfd9-cc1e11507309": "RELX Jobs (myworkdayjobs.com)",
    "b4dcee66-9724-4a2d-b938-9469cc35ccc7": "Red Hat Jobs (myworkdayjobs.com)",
    "1a30afb7-380b-430b-8e17-6db8dc83edad": "Solenis Jobs (myworkdayjobs.com)",
}


def run_migration(db_path: str, dry_run: bool = False) -> None:
    """Re-enable sources that were incorrectly disabled by transient errors."""
    logger.info(f"Re-enabling transient-disabled sources in {db_path}")
    logger.info(f"Dry run: {dry_run}")
    logger.info(f"Sources to process: {len(SOURCES_TO_REENABLE)}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    reenabled = 0
    skipped = 0

    for source_id, expected_name in SOURCES_TO_REENABLE.items():
        cursor.execute(
            "SELECT id, name, status, config_json FROM job_sources WHERE id = ?",
            (source_id,),
        )
        row = cursor.fetchone()

        if not row:
            logger.warning(f"  NOT FOUND: {source_id} ({expected_name})")
            skipped += 1
            continue

        name = row["name"]
        status = row["status"]

        if status != "disabled":
            logger.info(f"  SKIP (status={status}): {name}")
            skipped += 1
            continue

        # Parse config and clear disable-related fields
        try:
            config = json.loads(row["config_json"]) if row["config_json"] else {}
        except json.JSONDecodeError:
            logger.warning(f"  SKIP (bad JSON): {name}")
            skipped += 1
            continue

        removed = []
        for key in ("disabled_notes", "disabled_tags", "consecutive_failures"):
            if key in config:
                removed.append(f"{key}={config.pop(key)}")

        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        logger.info(f"  RE-ENABLE: {name} (cleared: {', '.join(removed) if removed else 'none'})")

        if not dry_run:
            cursor.execute(
                """
                UPDATE job_sources
                SET status = 'active', config_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(config), now, source_id),
            )

        reenabled += 1

    if not dry_run:
        conn.commit()

    conn.close()

    logger.info("")
    logger.info("=" * 50)
    logger.info("Migration Complete")
    logger.info("=" * 50)
    logger.info(f"  Re-enabled: {reenabled}")
    logger.info(f"  Skipped:    {skipped}")
    if dry_run:
        logger.info("  (dry run - no changes written)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: python -m job_finder.migrations.reenable_transient_sources <db_path> [--dry-run]"
        )
        sys.exit(1)

    db_path = sys.argv[1]
    dry_run = "--dry-run" in sys.argv

    run_migration(db_path, dry_run)
