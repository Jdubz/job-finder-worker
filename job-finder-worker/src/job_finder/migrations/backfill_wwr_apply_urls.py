"""
Backfill apply_url for aggregator listings (WeWorkRemotely, Remotive, etc.).

Two-stage resolution:
    1. Extract company URL from the description text
       (e.g. ``URL: https://company.com`` or ``To apply: https://…``)
    2. Fall back to the company website stored in the ``companies`` table
       (matched via ``company_id`` on the listing)

Usage:
    python -m job_finder.migrations.backfill_wwr_apply_urls /path/to/database.db --dry-run
    python -m job_finder.migrations.backfill_wwr_apply_urls /path/to/database.db
"""

import logging
import re
import sqlite3
import sys
from typing import Dict, Optional
from urllib.parse import urlparse

from job_finder.utils.url_utils import AGGREGATOR_HOST_SUBSTRINGS

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def _validate_non_aggregator(url: str) -> Optional[str]:
    """Return *url* if it's a valid, non-aggregator HTTP(S) URL."""
    try:
        url = url.rstrip(".,;)")
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if any(agg in host for agg in AGGREGATOR_HOST_SUBSTRINGS):
            return None
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return url
    except Exception:
        pass
    return None


def _extract_company_url(description: str) -> Optional[str]:
    """Extract company website from a plain-text aggregator description.

    Checks two patterns in order:
        1. ``URL: https://company.com`` (most common in WWR descriptions)
        2. ``To apply: https://company.com/careers``

    Returns None if neither pattern matches or the URL is an aggregator link.
    """
    if not description:
        return None

    match = re.search(r"(?:^|\n)\s*URL:\s*(https?://\S+)", description, re.IGNORECASE)
    if match:
        result = _validate_non_aggregator(match.group(1))
        if result:
            return result

    match = re.search(r"(?:^|\n)\s*To apply:\s*(https?://\S+)", description, re.IGNORECASE)
    if match:
        result = _validate_non_aggregator(match.group(1))
        if result:
            return result

    return None


def _load_company_websites(conn: sqlite3.Connection) -> Dict[str, str]:
    """Build a {company_id: website} map for companies with a non-empty website."""
    rows = conn.execute(
        "SELECT id, website FROM companies WHERE website IS NOT NULL AND website != ''"
    ).fetchall()
    return {r["id"]: r["website"] for r in rows}


def run(db_path: str, dry_run: bool = True) -> None:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    # Ensure apply_url column exists
    columns = [row["name"] for row in conn.execute("PRAGMA table_info(job_listings)").fetchall()]
    if "apply_url" not in columns:
        logger.info("Adding apply_url column to job_listings")
        conn.execute("ALTER TABLE job_listings ADD COLUMN apply_url TEXT")
        conn.commit()

    # Find all aggregator source IDs (WWR, Remotive, etc.)
    sources = conn.execute(
        "SELECT id, name FROM job_sources WHERE aggregator_domain IS NOT NULL AND aggregator_domain != ''"
    ).fetchall()

    if not sources:
        logger.info("No aggregator sources found")
        conn.close()
        return

    source_ids = [s["id"] for s in sources]
    logger.info(
        "Found %d aggregator sources: %s",
        len(sources),
        ", ".join(s["name"] for s in sources),
    )

    placeholders = ",".join("?" * len(source_ids))
    rows = conn.execute(
        f"""
        SELECT id, url, description, apply_url, company_id, company_name
        FROM job_listings
        WHERE source_id IN ({placeholders})
        """,
        source_ids,
    ).fetchall()

    logger.info("Found %d aggregator listings total", len(rows))

    # Pre-load company websites for the DB-fallback stage
    company_websites = _load_company_websites(conn)

    updated = 0
    updated_from_db = 0
    skipped_has_apply = 0
    skipped_no_url = 0

    for row in rows:
        if row["apply_url"]:
            skipped_has_apply += 1
            continue

        # Stage 1: extract from description text
        company_url = _extract_company_url(row["description"])

        # Stage 2: fall back to company website from companies table
        if not company_url and row["company_id"]:
            website = company_websites.get(row["company_id"])
            if website:
                company_url = _validate_non_aggregator(website)
                if company_url:
                    updated_from_db += 1

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
        "Results: %d updated (%d from companies table), %d already had apply_url, %d unresolved",
        updated,
        updated_from_db,
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
