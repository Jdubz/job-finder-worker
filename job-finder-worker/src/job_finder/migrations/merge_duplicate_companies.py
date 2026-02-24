"""
Merge duplicate company records that normalize to the same name.

Finds companies that differ only in domain suffixes (.ai, .io), legal suffixes
(Inc, Corp), or job board suffixes (Careers, Jobs) and merges them into a single
canonical record.  Foreign keys in job_listings, job_sources, and job_queue are
reassigned to the surviving record.

Usage:
    python -m job_finder.migrations.merge_duplicate_companies /path/to/database.db --dry-run
    python -m job_finder.migrations.merge_duplicate_companies /path/to/database.db
"""

import logging
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone

from job_finder.utils.company_name_utils import normalize_company_name

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def _pick_primary(members: list[dict], conn: sqlite3.Connection) -> dict:
    """Pick the best record to keep from a group of duplicate companies.

    Preference order:
      1. Most job listings attached
      2. Has non-null 'about' field (enriched data)
      3. Oldest created_at (canonical first-seen)
    """
    for m in members:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM job_listings WHERE company_id = ?",
            (m["id"],),
        ).fetchone()
        m["_listing_count"] = row[0] if row else 0

    members.sort(
        key=lambda m: (
            m["_listing_count"],
            1 if m.get("about") else 0,
            -(datetime.fromisoformat(m["created_at"]).timestamp() if m.get("created_at") else 0),
        ),
        reverse=True,
    )
    return members[0]


def _merge_company(conn: sqlite3.Connection, primary_id: str, secondary_id: str) -> dict:
    """Reassign all FKs from secondary to primary and delete secondary."""
    stats = {}

    # Reassign job_listings
    cur = conn.execute(
        "UPDATE job_listings SET company_id = ? WHERE company_id = ?",
        (primary_id, secondary_id),
    )
    stats["listings_moved"] = cur.rowcount

    # Reassign job_sources
    cur = conn.execute(
        "UPDATE job_sources SET company_id = ? WHERE company_id = ?",
        (primary_id, secondary_id),
    )
    stats["sources_moved"] = cur.rowcount

    # Reassign active queue items (company_id is stored in JSON input field)
    cur = conn.execute(
        """UPDATE job_queue SET input = json_set(input, '$.company_id', ?)
           WHERE json_extract(input, '$.company_id') = ?""",
        (primary_id, secondary_id),
    )
    stats["queue_moved"] = cur.rowcount

    # Delete secondary company
    conn.execute("DELETE FROM companies WHERE id = ?", (secondary_id,))
    stats["deleted"] = True

    return stats


def run(db_path: str, dry_run: bool = True) -> None:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    rows = conn.execute("SELECT id, name, name_lower, about, created_at FROM companies").fetchall()
    companies = [dict(r) for r in rows]

    # Group by new normalized name
    groups: dict[str, list[dict]] = defaultdict(list)
    for c in companies:
        norm = normalize_company_name(c["name"])
        groups[norm].append(c)

    dupes = {k: v for k, v in groups.items() if len(v) > 1}
    if not dupes:
        logger.info("No duplicate companies found.")
        conn.close()
        return

    logger.info("Found %d duplicate groups:", len(dupes))
    total_merged = 0

    for norm_name, members in sorted(dupes.items()):
        primary = _pick_primary(members, conn)
        secondaries = [m for m in members if m["id"] != primary["id"]]

        names = [m["name"] for m in secondaries]
        logger.info(
            "  %s: merge %s → %s (ID %s)",
            norm_name,
            names,
            primary["name"],
            primary["id"],
        )

        if not dry_run:
            for sec in secondaries:
                stats = _merge_company(conn, primary["id"], sec["id"])
                logger.info(
                    "    Merged %s: %d listings, %d sources, %d queue items moved",
                    sec["name"],
                    stats["listings_moved"],
                    stats["sources_moved"],
                    stats["queue_moved"],
                )
                total_merged += 1

            # Update the primary's name_lower to the new normalized form
            conn.execute(
                "UPDATE companies SET name_lower = ?, updated_at = ? WHERE id = ?",
                (norm_name, datetime.now(timezone.utc).isoformat(), primary["id"]),
            )

    if dry_run:
        logger.info(
            "DRY RUN — %d groups with %d secondary records would be merged.",
            len(dupes),
            sum(len(v) - 1 for v in dupes.values()),
        )
    else:
        conn.commit()
        logger.info("Committed %d company merges.", total_merged)

    conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python -m {__name__} <db_path> [--dry-run]")
        sys.exit(1)

    db = sys.argv[1]
    dry = "--dry-run" in sys.argv
    run(db, dry_run=dry)
