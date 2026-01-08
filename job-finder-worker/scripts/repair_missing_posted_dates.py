#!/usr/bin/env python3
"""
Repair script to backfill missing posted_date values in job_listings.

This script identifies job listings with missing posted_date and attempts to
repair them by fetching the date from the original source (API, RSS, or HTML).

Usage:
    python scripts/repair_missing_posted_dates.py [--dry-run]

Options:
    --dry-run    Show what would be updated without making changes
"""

import argparse
import logging
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import feedparser
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Default database path
DEFAULT_DB_PATH = "/srv/job-finder/data/jobfinder.db"


def normalize_timestamp(value: Any) -> Optional[str]:
    """Convert various timestamp formats to ISO format string."""
    if value is None:
        return None

    # Handle millisecond timestamps (13+ digits)
    if isinstance(value, (int, float)):
        timestamp = value
        if isinstance(value, int) and value > 9999999999:
            timestamp = value / 1000.0
        try:
            dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
            return dt.isoformat()
        except (ValueError, OSError):
            return None

    # Handle string dates
    if isinstance(value, str):
        # Try parsing as ISO format or common date formats
        try:
            from dateutil import parser as dateutil_parser

            parsed = dateutil_parser.parse(value)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.isoformat()
        except Exception:
            return None

    return None


def fetch_lever_dates(api_url: str) -> Dict[str, str]:
    """
    Fetch job dates from Lever API.

    Returns:
        Dict mapping hostedUrl -> ISO date string
    """
    logger.info(f"Fetching Lever API: {api_url}")
    try:
        response = requests.get(api_url, timeout=30)
        response.raise_for_status()
        data = response.json()

        url_to_date = {}
        for job in data:
            url = job.get("hostedUrl")
            created_at = job.get("createdAt")
            if url and created_at:
                iso_date = normalize_timestamp(created_at)
                if iso_date:
                    url_to_date[url] = iso_date

        logger.info(f"  Found {len(url_to_date)} jobs with dates")
        return url_to_date
    except Exception as e:
        logger.error(f"  Failed to fetch Lever API: {e}")
        return {}


def fetch_greenhouse_dates(api_url: str) -> Dict[str, str]:
    """
    Fetch job dates from Greenhouse API.

    Returns:
        Dict mapping absolute_url -> ISO date string
    """
    logger.info(f"Fetching Greenhouse API: {api_url}")
    try:
        response = requests.get(api_url, timeout=30)
        response.raise_for_status()
        data = response.json()

        url_to_date = {}
        jobs = data.get("jobs", [])
        for job in jobs:
            url = job.get("absolute_url")
            # Prefer first_published, fallback to updated_at
            date_str = job.get("first_published") or job.get("updated_at")
            if url and date_str:
                iso_date = normalize_timestamp(date_str)
                if iso_date:
                    url_to_date[url] = iso_date

        logger.info(f"  Found {len(url_to_date)} jobs with dates")
        return url_to_date
    except Exception as e:
        logger.error(f"  Failed to fetch Greenhouse API: {e}")
        return {}


def fetch_rss_dates(rss_url: str) -> Dict[str, str]:
    """
    Fetch job dates from RSS feed.

    Returns:
        Dict mapping link -> ISO date string
    """
    logger.info(f"Fetching RSS feed: {rss_url}")
    try:
        feed = feedparser.parse(rss_url)

        url_to_date = {}
        for entry in feed.entries:
            url = entry.get("link")
            # feedparser normalizes pubDate to 'published'
            date_str = entry.get("published") or entry.get("updated")
            if url and date_str:
                iso_date = normalize_timestamp(date_str)
                if iso_date:
                    url_to_date[url] = iso_date

        logger.info(f"  Found {len(url_to_date)} jobs with dates")
        return url_to_date
    except Exception as e:
        logger.error(f"  Failed to fetch RSS feed: {e}")
        return {}


def fetch_html_date(job_url: str) -> Optional[str]:
    """
    Attempt to extract posted date from job detail page HTML.

    Looks for:
    - JSON-LD JobPosting schema with datePosted
    - Meta tags with date information
    - Inline JSON with datePosted

    Returns:
        ISO date string or None
    """
    logger.info(f"Fetching HTML page: {job_url}")
    try:
        response = requests.get(job_url, timeout=30)
        response.raise_for_status()
        html = response.text

        # Try to find datePosted in inline JSON or JSON-LD
        patterns = [
            r'"datePosted"\s*:\s*"([^"]+)"',
            r'"date_posted"\s*:\s*"([^"]+)"',
            r'"postedDate"\s*:\s*"([^"]+)"',
            r'"published_time"\s*content="([^"]+)"',
            r'property="article:published_time"\s*content="([^"]+)"',
        ]

        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                date_str = match.group(1)
                iso_date = normalize_timestamp(date_str)
                if iso_date:
                    logger.info(f"  Found date: {iso_date}")
                    return iso_date

        logger.warning(f"  No date found in HTML")
        return None
    except Exception as e:
        logger.error(f"  Failed to fetch HTML: {e}")
        return None


def get_missing_posted_date_listings(db_path: str) -> List[Dict[str, Any]]:
    """Query job_listings with missing posted_date."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    query = """
    SELECT
        jl.id,
        jl.title,
        jl.company_name,
        jl.url,
        jl.source_id,
        js.name as source_name,
        js.aggregator_domain,
        json_extract(js.config_json, '$.type') as source_type,
        json_extract(js.config_json, '$.url') as source_url
    FROM job_listings jl
    LEFT JOIN job_sources js ON jl.source_id = js.id
    WHERE jl.posted_date IS NULL OR jl.posted_date = ''
    ORDER BY js.name, jl.created_at DESC
    """

    cursor.execute(query)
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return results


def update_posted_date(db_path: str, listing_id: str, posted_date: str, dry_run: bool) -> bool:
    """Update posted_date for a specific listing."""
    if dry_run:
        logger.info(f"  [DRY RUN] Would update {listing_id} with posted_date={posted_date}")
        return True

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE job_listings SET posted_date = ?, updated_at = ? WHERE id = ?",
            (posted_date, datetime.now(timezone.utc).isoformat(), listing_id),
        )
        conn.commit()
        conn.close()
        logger.info(f"  Updated {listing_id} with posted_date={posted_date}")
        return True
    except Exception as e:
        logger.error(f"  Failed to update {listing_id}: {e}")
        return False


def repair_listings(db_path: str, dry_run: bool = False) -> Tuple[int, int]:
    """
    Main repair function.

    Returns:
        Tuple of (repaired_count, failed_count)
    """
    listings = get_missing_posted_date_listings(db_path)
    logger.info(f"Found {len(listings)} listings with missing posted_date")

    if not listings:
        return 0, 0

    # Group listings by source for efficient batch fetching
    source_listings: Dict[str, List[Dict[str, Any]]] = {}
    no_source_listings: List[Dict[str, Any]] = []

    for listing in listings:
        source_url = listing.get("source_url")
        if source_url:
            if source_url not in source_listings:
                source_listings[source_url] = []
            source_listings[source_url].append(listing)
        else:
            no_source_listings.append(listing)

    repaired = 0
    failed = 0

    # Process listings grouped by source
    for source_url, source_jobs in source_listings.items():
        source_type = source_jobs[0].get("source_type")
        source_name = source_jobs[0].get("source_name")
        aggregator_domain = source_jobs[0].get("aggregator_domain")

        logger.info(f"\nProcessing source: {source_name} ({source_type})")

        # Fetch dates based on source type
        url_to_date: Dict[str, str] = {}

        if source_type == "api":
            if "lever.co" in source_url or aggregator_domain == "lever.co":
                url_to_date = fetch_lever_dates(source_url)
            elif "greenhouse.io" in source_url or aggregator_domain == "greenhouse.io":
                url_to_date = fetch_greenhouse_dates(source_url)
            else:
                logger.warning(f"  Unknown API type for {source_url}")
        elif source_type == "rss":
            url_to_date = fetch_rss_dates(source_url)
        else:
            logger.warning(f"  Unsupported source type: {source_type}")

        # Match and update listings
        for listing in source_jobs:
            job_url = listing["url"]
            listing_id = listing["id"]

            # Try exact match first
            posted_date = url_to_date.get(job_url)

            # Try matching by job ID in URL if exact match fails
            if not posted_date:
                for api_url, date in url_to_date.items():
                    # Extract job ID from both URLs and compare
                    job_id_patterns = [
                        r"/([a-f0-9-]{36})(?:\?|$)",  # UUID pattern
                        r"[?&]gh_jid=(\d+)",  # Greenhouse job ID
                        r"/(\d+)(?:\?|$)",  # Numeric ID at end
                    ]
                    for pattern in job_id_patterns:
                        job_match = re.search(pattern, job_url)
                        api_match = re.search(pattern, api_url)
                        if job_match and api_match and job_match.group(1) == api_match.group(1):
                            posted_date = date
                            break
                    if posted_date:
                        break

            if posted_date:
                if update_posted_date(db_path, listing_id, posted_date, dry_run):
                    repaired += 1
                else:
                    failed += 1
            else:
                logger.warning(f"  No date found for: {listing['title']} ({job_url})")
                failed += 1

    # Process listings without source (try HTML scraping)
    if no_source_listings:
        logger.info(
            f"\nProcessing {len(no_source_listings)} listings without source (HTML scraping)"
        )
        for listing in no_source_listings:
            job_url = listing["url"]
            listing_id = listing["id"]

            posted_date = fetch_html_date(job_url)
            if posted_date:
                if update_posted_date(db_path, listing_id, posted_date, dry_run):
                    repaired += 1
                else:
                    failed += 1
            else:
                logger.warning(f"  No date found for: {listing['title']} ({job_url})")
                failed += 1

    return repaired, failed


def main():
    parser = argparse.ArgumentParser(
        description="Repair missing posted_date values in job_listings"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be updated without making changes",
    )
    parser.add_argument(
        "--db-path",
        default=DEFAULT_DB_PATH,
        help=f"Path to the SQLite database (default: {DEFAULT_DB_PATH})",
    )
    args = parser.parse_args()

    if args.dry_run:
        logger.info("Running in DRY RUN mode - no changes will be made")

    if not Path(args.db_path).exists():
        logger.error(f"Database not found: {args.db_path}")
        sys.exit(1)

    repaired, failed = repair_listings(args.db_path, args.dry_run)

    logger.info(f"\n{'='*50}")
    logger.info(f"Repair complete: {repaired} repaired, {failed} failed")

    if args.dry_run and repaired > 0:
        logger.info("Run without --dry-run to apply changes")


if __name__ == "__main__":
    main()
