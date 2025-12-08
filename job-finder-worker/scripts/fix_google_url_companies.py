#!/usr/bin/env python3
"""Fix companies that have Google search URLs stored as their website.

This script:
1. Finds companies with google.com/search URLs as their website
2. Clears the bad data (website, about, culture) so they can be re-enriched
3. Optionally queues re-enrichment tasks for these companies

Usage:
    python scripts/fix_google_url_companies.py /path/to/jobfinder.db [--queue-enrichment]
"""

import argparse
import json
import sqlite3
import sys
import uuid
from datetime import datetime, timezone


def find_affected_companies(conn: sqlite3.Connection) -> list:
    """Find companies with Google search URLs as website."""
    cursor = conn.execute(
        """
        SELECT id, name, website, about, culture
        FROM companies
        WHERE website LIKE '%google.com/search%'
           OR website LIKE '%bing.com/search%'
           OR website LIKE '%duckduckgo.com%'
        ORDER BY name
        """
    )
    return cursor.fetchall()


def clear_company_data(conn: sqlite3.Connection, company_id: str) -> None:
    """Clear bad website and about data for a company."""
    conn.execute(
        """
        UPDATE companies
        SET website = '',
            about = '',
            culture = '',
            updated_at = ?
        WHERE id = ?
        """,
        (datetime.now(timezone.utc).isoformat(), company_id),
    )


def queue_enrichment_task(conn: sqlite3.Connection, company_id: str, company_name: str) -> str:
    """Queue a company enrichment task."""
    task_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    input_data = json.dumps(
        {
            "company_id": company_id,
            "company_name": company_name,
            "source": "cleanup_script",
        }
    )

    conn.execute(
        """
        INSERT INTO job_queue (id, type, status, url, input, created_at, updated_at, tracking_id)
        VALUES (?, 'company', 'pending', ?, ?, ?, ?, ?)
        """,
        (
            task_id,
            f"https://cleanup.local/company/{company_id}",
            input_data,
            now,
            now,
            str(uuid.uuid4()),
        ),
    )
    return task_id


def main():
    parser = argparse.ArgumentParser(description="Fix companies with Google search URLs as website")
    parser.add_argument("db_path", help="Path to the jobfinder.db database")
    parser.add_argument(
        "--queue-enrichment",
        action="store_true",
        help="Queue enrichment tasks for affected companies",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    args = parser.parse_args()

    conn = sqlite3.connect(args.db_path)
    conn.row_factory = sqlite3.Row

    try:
        affected = find_affected_companies(conn)
        print(f"Found {len(affected)} companies with search engine URLs as website:\n")

        for row in affected:
            company_id = row[0]
            name = row[1]
            website = row[2]
            about_len = len(row[3] or "")
            culture_len = len(row[4] or "")

            print(f"  - {name}")
            print(f"    ID: {company_id}")
            print(f"    Website: {website[:60]}...")
            print(f"    About: {about_len} chars, Culture: {culture_len} chars")
            print()

        if not affected:
            print("No companies to fix!")
            return 0

        if args.dry_run:
            print("[DRY RUN] Would clear data for these companies")
            if args.queue_enrichment:
                print("[DRY RUN] Would queue enrichment tasks")
            return 0

        # Confirm before proceeding
        response = input(f"\nClear data for {len(affected)} companies? [y/N] ")
        if response.lower() != "y":
            print("Aborted.")
            return 1

        # Clear bad data
        for row in affected:
            company_id = row[0]
            name = row[1]
            clear_company_data(conn, company_id)
            print(f"Cleared: {name}")

        conn.commit()
        print(f"\nCleared data for {len(affected)} companies.")

        # Queue enrichment tasks if requested
        if args.queue_enrichment:
            response = input(f"\nQueue enrichment tasks for {len(affected)} companies? [y/N] ")
            if response.lower() == "y":
                for row in affected:
                    company_id = row[0]
                    name = row[1]
                    task_id = queue_enrichment_task(conn, company_id, name)
                    print(f"Queued: {name} (task_id={task_id})")
                conn.commit()
                print(f"\nQueued {len(affected)} enrichment tasks.")

        print("\nDone! Run the worker to re-enrich these companies.")
        return 0

    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
