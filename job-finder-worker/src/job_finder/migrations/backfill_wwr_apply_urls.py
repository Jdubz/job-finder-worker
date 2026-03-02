"""
Backfill apply_url for aggregator listings (WeWorkRemotely, Remotive, etc.).

Uses the multi-strategy apply URL resolver:
    1. ATS derivation (Greenhouse, Lever, etc.)
    2. Extract company URL from the description text
    3. Web search + heuristic scoring (opt-in via ``--use-search``)
    4. Fall back to the company website stored in the ``companies`` table

Usage:
    python -m job_finder.migrations.backfill_wwr_apply_urls /path/to/database.db --dry-run
    python -m job_finder.migrations.backfill_wwr_apply_urls /path/to/database.db --use-search
    python -m job_finder.migrations.backfill_wwr_apply_urls /path/to/database.db
"""

import logging
import sqlite3
import sys
from typing import Dict, Optional
from urllib.parse import urlparse

from job_finder.utils.apply_url_resolver import resolve_apply_url
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


def _load_company_websites(conn: sqlite3.Connection) -> Dict[str, str]:
    """Build a {company_id: website} map for companies with a non-empty website."""
    rows = conn.execute(
        "SELECT id, website FROM companies WHERE website IS NOT NULL AND website != ''"
    ).fetchall()
    return {r["id"]: r["website"] for r in rows}


class _BackfillCompaniesManager:
    """Lightweight adapter to provide a companies_manager-like interface for the resolver."""

    def __init__(self, company_websites: Dict[str, str], company_id: Optional[str]):
        self._company_websites = company_websites
        self._company_id = company_id

    def get_company(self, name: str) -> Optional[Dict]:
        if self._company_id:
            website = self._company_websites.get(self._company_id)
            if website:
                return {"id": self._company_id, "website": website}
        return None


def run(db_path: str, dry_run: bool = True, use_search: bool = False) -> None:
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
        SELECT id, url, title, description, apply_url, company_id, company_name
        FROM job_listings
        WHERE source_id IN ({placeholders})
        """,
        source_ids,
    ).fetchall()

    logger.info("Found %d aggregator listings total", len(rows))

    # Pre-load company websites for the DB-fallback stage
    company_websites = _load_company_websites(conn)

    # Initialize search client only if requested
    search_client = None
    if use_search:
        try:
            from job_finder.ai.search_client import get_search_client

            search_client = get_search_client()
            if search_client:
                logger.info("Search-based resolution enabled")
            else:
                logger.warning("--use-search requested but no search API keys configured")
        except Exception as e:
            logger.warning("Failed to initialize search client: %s", e)

    updated = 0
    updated_from_db = 0
    updated_from_search = 0
    skipped_has_apply = 0
    skipped_no_url = 0

    for row in rows:
        if row["apply_url"]:
            skipped_has_apply += 1
            continue

        # Build a lightweight companies_manager for this row
        cm = _BackfillCompaniesManager(company_websites, row["company_id"])

        result = resolve_apply_url(
            job_url=row["url"],
            job={
                "title": row["title"] or "",
                "company": row["company_name"] or "",
                "description": row["description"] or "",
                "company_website": "",  # Let the resolver use companies_manager
            },
            search_client=search_client,
            companies_manager=cm,
            is_aggregator=True,
        )

        if not result.url:
            skipped_no_url += 1
            logger.debug("No apply URL found for %s", row["url"])
            continue

        # Track resolution method for stats
        if result.method == "company_fallback":
            updated_from_db += 1
        elif result.method == "search_resolved":
            updated_from_search += 1

        updated += 1
        if dry_run:
            logger.info(
                "[DRY RUN] Would set apply_url=%s (method=%s, confidence=%s) for %s",
                result.url,
                result.method,
                result.confidence,
                row["url"],
            )
        else:
            conn.execute(
                "UPDATE job_listings SET apply_url = ? WHERE id = ?",
                (result.url, row["id"]),
            )

    if not dry_run and updated > 0:
        conn.commit()

    parts = [
        f"{updated} updated",
        f"{updated_from_db} from companies table",
    ]
    if use_search:
        parts.append(f"{updated_from_search} from search")
    parts.extend([
        f"{skipped_has_apply} already had apply_url",
        f"{skipped_no_url} unresolved",
    ])

    logger.info("Results: %s", ", ".join(parts))
    conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: python -m job_finder.migrations.backfill_wwr_apply_urls <db_path> [--dry-run] [--use-search]"
        )
        sys.exit(1)

    db = sys.argv[1]
    dry = "--dry-run" in sys.argv
    search = "--use-search" in sys.argv
    run(db, dry_run=dry, use_search=search)
