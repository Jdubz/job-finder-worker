"""
Deduplicate existing job listings using re-normalized URLs and content fingerprints.

Phase 1: Re-normalize URLs with updated normalize_url() (path lowercasing) and
         remove collisions (multiple old listings mapping to the same new URL).
Phase 2: Compute content fingerprints for all listings and remove fingerprint
         duplicates (multi-location postings, re-scraped with rotated ATS IDs).

For each collision group, keeps the listing that has a match in job_matches
(to preserve user-visible data), preferring the oldest record as tiebreaker.

Usage:
    python -m job_finder.migrations.deduplicate_listings /path/to/database.db --dry-run
    python -m job_finder.migrations.deduplicate_listings /path/to/database.db
"""

import logging
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime

from job_finder.utils.url_utils import compute_content_fingerprint, normalize_url

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def _has_match(conn: sqlite3.Connection, listing_id: str) -> bool:
    """Check if a listing has a corresponding job_match record."""
    row = conn.execute(
        "SELECT 1 FROM job_matches WHERE job_listing_id = ? LIMIT 1",
        (listing_id,),
    ).fetchone()
    return row is not None


def _pick_keeper(members: list[dict], conn: sqlite3.Connection) -> dict:
    """Pick the best listing to keep from a duplicate group.

    Priority: has match > oldest created_at.
    """
    for member in members:
        member["_has_match"] = _has_match(conn, member["id"])

    members.sort(
        key=lambda m: (
            m["_has_match"],  # True > False
            -(m.get("_created_ts", 0)),  # oldest first (smallest timestamp wins)
        ),
        reverse=True,
    )
    return members[0]


def _parse_timestamp(row: dict) -> float:
    """Parse created_at into a timestamp for tiebreaking."""
    try:
        return datetime.fromisoformat(row["created_at"]).timestamp()
    except Exception:
        return 0


def _renormalize_urls(conn: sqlite3.Connection, dry_run: bool) -> int:
    """Re-normalize all URLs and deduplicate collisions."""
    rows = conn.execute(
        "SELECT id, url, title, company_name, created_at FROM job_listings"
    ).fetchall()
    listings = [dict(r) for r in rows]

    # Parse timestamps for tiebreaking
    for listing in listings:
        listing["_created_ts"] = _parse_timestamp(listing)

    # Group by new normalized URL
    groups: dict[str, list[dict]] = defaultdict(list)
    for listing in listings:
        new_url = normalize_url(listing["url"])
        groups[new_url].append(listing)

    to_delete = []
    to_update = []

    for new_url, members in groups.items():
        if len(members) > 1:
            keeper = _pick_keeper(members, conn)
            for m in members:
                if m["id"] != keeper["id"]:
                    to_delete.append(m["id"])
            if keeper["url"] != new_url:
                to_update.append((new_url, keeper["id"]))
        else:
            m = members[0]
            if m["url"] != new_url:
                to_update.append((new_url, m["id"]))

    logger.info(
        "URL re-normalization: %d listings to delete, %d URLs to update",
        len(to_delete),
        len(to_update),
    )

    if dry_run:
        for lid in to_delete[:10]:
            match = next(row for row in listings if row["id"] == lid)
            logger.info("  Would delete: %s — %s", match["title"], match["url"])
        if len(to_delete) > 10:
            logger.info("  ... and %d more", len(to_delete) - 10)
        return len(to_delete)

    for lid in to_delete:
        conn.execute("DELETE FROM job_listings WHERE id = ?", (lid,))
    for new_url, lid in to_update:
        conn.execute("UPDATE job_listings SET url = ? WHERE id = ?", (new_url, lid))

    return len(to_delete)


def _backfill_and_dedup_fingerprints(conn: sqlite3.Connection, dry_run: bool) -> int:
    """Compute fingerprints for all listings, then deduplicate fingerprint collisions."""
    rows = conn.execute(
        "SELECT id, url, title, company_name, description, created_at FROM job_listings"
    ).fetchall()
    listings = [dict(r) for r in rows]

    for listing in listings:
        listing["_created_ts"] = _parse_timestamp(listing)

    # Compute fingerprints
    fp_groups: dict[str, list[dict]] = defaultdict(list)
    updates = []

    for listing in listings:
        fp = compute_content_fingerprint(
            listing["title"], listing["company_name"], listing.get("description") or ""
        )
        listing["_fingerprint"] = fp
        fp_groups[fp].append(listing)
        updates.append((fp, listing["id"]))

    # Backfill fingerprints (even in dry_run, we log but don't write)
    if not dry_run:
        for fp, lid in updates:
            conn.execute(
                "UPDATE job_listings SET content_fingerprint = ? WHERE id = ?",
                (fp, lid),
            )

    # Deduplicate fingerprint collisions
    to_delete = []
    for fp, members in fp_groups.items():
        if len(members) > 1:
            keeper = _pick_keeper(members, conn)
            for m in members:
                if m["id"] != keeper["id"]:
                    to_delete.append(m["id"])

    logger.info(
        "Fingerprint dedup: %d fingerprint collision groups, %d listings to delete",
        sum(1 for v in fp_groups.values() if len(v) > 1),
        len(to_delete),
    )

    if dry_run:
        # Show some examples
        shown = 0
        for fp, members in fp_groups.items():
            if len(members) > 1 and shown < 5:
                names = [f"{m['title']} @ {m['company_name']}" for m in members]
                logger.info("  Fingerprint group: %s", names)
                shown += 1
        return len(to_delete)

    for lid in to_delete:
        conn.execute("DELETE FROM job_listings WHERE id = ?", (lid,))

    return len(to_delete)


def run(db_path: str, dry_run: bool = True) -> None:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    logger.info("=== Phase 1: URL Re-Normalization ===")
    url_deleted = _renormalize_urls(conn, dry_run)

    logger.info("=== Phase 2: Content Fingerprint Backfill & Dedup ===")
    fp_deleted = _backfill_and_dedup_fingerprints(conn, dry_run)

    total = url_deleted + fp_deleted
    if dry_run:
        logger.info(
            "DRY RUN — would delete %d total duplicate listings (%d URL, %d fingerprint)",
            total,
            url_deleted,
            fp_deleted,
        )
    else:
        conn.commit()
        logger.info(
            "Committed: deleted %d duplicate listings (%d URL, %d fingerprint)",
            total,
            url_deleted,
            fp_deleted,
        )

    conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python -m {__name__} <db_path> [--dry-run]")
        sys.exit(1)

    db = sys.argv[1]
    dry = "--dry-run" in sys.argv
    run(db, dry_run=dry)
