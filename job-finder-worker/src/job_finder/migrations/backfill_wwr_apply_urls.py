"""
Backfill apply_url for WeWorkRemotely listings using company website from descriptions.

WWR descriptions contain the company website in plain-text format:
    URL: https://company.com

This migration extracts the URL and sets it as apply_url so the frontend
navigates directly to the company site instead of the WWR paywall page.

Usage:
    python -m job_finder.migrations.backfill_wwr_apply_urls /path/to/database.db --dry-run
    python -m job_finder.migrations.backfill_wwr_apply_urls /path/to/database.db
"""

import logging
import re
import sqlite3
import sys
from typing import Optional
from urllib.parse import urlparse

from job_finder.utils.url_utils import AGGREGATOR_HOST_SUBSTRINGS

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def _extract_company_url(description: str) -> Optional[str]:
    """Extract company website from a plain-text WWR description.

    Checks two patterns in order:
        1. ``URL: https://company.com`` (most common in WWR descriptions)
        2. ``To apply: https://company.com/careers``

    Returns None if neither pattern matches or the URL is an aggregator link.
    """
    if not description:
        return None

    # Pattern 1: explicit "URL: <url>" line (most common in WWR descriptions)
    match = re.search(r"(?:^|\n)\s*URL:\s*(https?://\S+)", description, re.IGNORECASE)
    if match:
        url = match.group(1).rstrip(".,;)")
        try:
            parsed = urlparse(url)
            host = (parsed.hostname or "").lower()
            if any(agg in host for agg in AGGREGATOR_HOST_SUBSTRINGS):
                return None
            if parsed.scheme in ("http", "https") and parsed.netloc:
                return url
        except Exception:
            pass

    # Pattern 2: "To apply: <url>" line
    match = re.search(r"(?:^|\n)\s*To apply:\s*(https?://\S+)", description, re.IGNORECASE)
    if match:
        url = match.group(1).rstrip(".,;)")
        try:
            parsed = urlparse(url)
            host = (parsed.hostname or "").lower()
            if any(agg in host for agg in AGGREGATOR_HOST_SUBSTRINGS):
                return None
            if parsed.scheme in ("http", "https") and parsed.netloc:
                return url
        except Exception:
            pass

    return None


def run(db_path: str, dry_run: bool = True) -> None:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    # Ensure apply_url column exists
    columns = [row["name"] for row in conn.execute("PRAGMA table_info(job_listings)").fetchall()]
    has_apply_url = "apply_url" in columns
    if not has_apply_url:
        logger.info("Adding apply_url column to job_listings")
        conn.execute("ALTER TABLE job_listings ADD COLUMN apply_url TEXT")
        conn.commit()
        has_apply_url = True

    # Find all WWR source IDs
    sources = conn.execute(
        "SELECT id, name FROM job_sources WHERE aggregator_domain = 'weworkremotely.com'"
    ).fetchall()

    if not sources:
        logger.info("No WeWorkRemotely sources found")
        conn.close()
        return

    source_ids = [s["id"] for s in sources]
    logger.info(
        "Found %d WWR sources: %s",
        len(sources),
        ", ".join(s["name"] for s in sources),
    )

    placeholders = ",".join("?" * len(source_ids))
    rows = conn.execute(
        f"""
        SELECT id, url, description, apply_url
        FROM job_listings
        WHERE source_id IN ({placeholders})
        """,
        source_ids,
    ).fetchall()

    logger.info("Found %d WWR listings total", len(rows))

    updated = 0
    skipped_has_apply = 0
    skipped_no_url = 0

    for row in rows:
        if row["apply_url"]:
            skipped_has_apply += 1
            continue

        company_url = _extract_company_url(row["description"])
        if not company_url:
            skipped_no_url += 1
            logger.debug("No company URL found for %s", row["url"])
            continue

        updated += 1
        if dry_run:
            logger.info("[DRY RUN] Would set apply_url=%s for %s", company_url, row["url"])
        else:
            conn.execute(
                "UPDATE job_listings SET apply_url = ? WHERE id = ?",
                (company_url, row["id"]),
            )

    if not dry_run and updated > 0:
        conn.commit()

    logger.info(
        "Results: %d updated, %d already had apply_url, %d no company URL found",
        updated,
        skipped_has_apply,
        skipped_no_url,
    )
    conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            f"Usage: python -m job_finder.migrations.backfill_wwr_apply_urls <db_path> [--dry-run]"
        )
        sys.exit(1)

    db = sys.argv[1]
    dry = "--dry-run" in sys.argv
    run(db, dry_run=dry)
