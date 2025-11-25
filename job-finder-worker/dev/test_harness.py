#!/usr/bin/env python3
"""
Test Harness for Job Finder Worker Queue Processing

This script mimics production interactions by:
1. Submitting items to the job_queue table
2. Monitoring worker logs and database changes
3. Validating expected results

Usage:
    # Submit a job URL for processing
    python dev/test_harness.py job https://example.com/job/12345

    # Submit a company for analysis
    python dev/test_harness.py company "Acme Corp" --url https://acme.com

    # Submit a scrape request
    python dev/test_harness.py scrape --source greenhouse --company "Acme Corp"

    # Watch queue processing
    python dev/test_harness.py watch

    # Run all test scenarios
    python dev/test_harness.py test-all

    # Show queue status
    python dev/test_harness.py status
"""
import argparse
import json
import os
import sqlite3
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


class Colors:
    """ANSI color codes for terminal output."""

    RED = "\033[0;31m"
    GREEN = "\033[0;32m"
    YELLOW = "\033[1;33m"
    CYAN = "\033[0;36m"
    MAGENTA = "\033[0;35m"
    RESET = "\033[0m"
    BOLD = "\033[1m"


def get_db_path() -> str:
    """Get database path from environment or default."""
    return os.environ.get(
        "JF_SQLITE_DB_PATH",
        os.environ.get(
            "SQLITE_DB_PATH", str(Path(__file__).parent.parent / ".dev/data/jobfinder.db")
        ),
    )


def get_db_connection() -> sqlite3.Connection:
    """Create database connection."""
    db_path = get_db_path()
    if not Path(db_path).exists():
        print(f"{Colors.RED}Database not found: {db_path}{Colors.RESET}")
        print("Run: make dev-setup or ./dev/setup-dev-env.sh --prod-db-path /path/to/db")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def generate_tracking_id() -> str:
    """Generate a unique tracking ID for test items."""
    return f"test-{uuid.uuid4().hex[:8]}"


def submit_job_item(
    url: str,
    company_name: Optional[str] = None,
    source: str = "manual_submission",
    tracking_id: Optional[str] = None,
) -> str:
    """Submit a JOB type item to the queue."""
    conn = get_db_connection()
    cursor = conn.cursor()

    tracking_id = tracking_id or generate_tracking_id()
    now = datetime.now(timezone.utc).isoformat()

    unique_url = f"{url}?t={tracking_id}" if url else f"https://example.com/job/{tracking_id}"

    item_id = generate_tracking_id()

    cursor.execute(
        """
        INSERT INTO job_queue (
            id, type, status, url, company_name, source, tracking_id,
            submitted_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (item_id, "job", "pending", unique_url, company_name, source, tracking_id, "test_harness", now, now),
    )

    conn.commit()
    item_id = cursor.lastrowid
    conn.close()

    print(f"{Colors.GREEN}Submitted JOB item:{Colors.RESET}")
    print(f"  ID: {item_id}")
    print(f"  URL: {url}")
    print(f"  Tracking: {tracking_id}")
    return tracking_id


def submit_company_item(
    company_name: str,
    url: Optional[str] = None,
    tracking_id: Optional[str] = None,
) -> str:
    """Submit a COMPANY type item to the queue."""
    conn = get_db_connection()
    cursor = conn.cursor()

    tracking_id = tracking_id or generate_tracking_id()
    now = datetime.now(timezone.utc).isoformat()

    metadata = {}
    if url:
        metadata["website"] = url
    company_url = url or "https://example.com/company"

    item_id = generate_tracking_id()

    cursor.execute(
        """
        INSERT INTO job_queue (
            id, type, status, url, company_name, source, tracking_id,
            submitted_by, metadata, company_sub_task, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (
            item_id,
            "company",
            "pending",
            company_url,
            company_name,
            "manual_submission",
            tracking_id,
            "test_harness",
            json.dumps(metadata) if metadata else None,
            "fetch",
            now,
            now,
        ),
    )

    conn.commit()
    item_id = cursor.lastrowid
    conn.close()

    print(f"{Colors.GREEN}Submitted COMPANY item:{Colors.RESET}")
    print(f"  ID: {item_id}")
    print(f"  Company: {company_name}")
    print(f"  URL: {url or 'N/A'}")
    print(f"  Tracking: {tracking_id}")
    return tracking_id


def submit_scrape_item(
    source_type: str = "greenhouse",
    company_name: Optional[str] = None,
    board_token: Optional[str] = None,
    tracking_id: Optional[str] = None,
) -> str:
    """Submit a SCRAPE type item to the queue."""
    conn = get_db_connection()
    cursor = conn.cursor()

    tracking_id = tracking_id or generate_tracking_id()
    now = datetime.now(timezone.utc).isoformat()

    scrape_config = {
        "source_type": source_type,
        "max_jobs": 10,  # Limit for testing
    }
    if company_name:
        scrape_config["company_name"] = company_name
    if board_token:
        scrape_config["board_token"] = board_token

    item_id = generate_tracking_id()

    cursor.execute(
        """
        INSERT INTO job_queue (
            id, type, status, company_name, source, tracking_id,
            submitted_by, scrape_config, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (
            item_id,
            "scrape",
            "pending",
            company_name,
            "manual_submission",
            tracking_id,
            "test_harness",
            json.dumps(scrape_config),
            now,
            now,
        ),
    )

    conn.commit()
    item_id = cursor.lastrowid
    conn.close()

    print(f"{Colors.GREEN}Submitted SCRAPE item:{Colors.RESET}")
    print(f"  ID: {item_id}")
    print(f"  Source Type: {source_type}")
    print(f"  Company: {company_name or 'All'}")
    print(f"  Tracking: {tracking_id}")
    return tracking_id


def submit_source_discovery_item(
    company_name: str,
    website: Optional[str] = None,
    tracking_id: Optional[str] = None,
) -> str:
    """Submit a SOURCE_DISCOVERY type item to the queue."""
    conn = get_db_connection()
    cursor = conn.cursor()

    tracking_id = tracking_id or generate_tracking_id()
    now = datetime.now(timezone.utc).isoformat()

    target_url = website or "https://example.com"
    config = {"company_name": company_name, "url": target_url}

    discovery_url = target_url + f"?t={tracking_id}"

    item_id = generate_tracking_id()

    cursor.execute(
        """
        INSERT INTO job_queue (
            id, type, status, url, company_name, source, tracking_id,
            submitted_by, source_discovery_config, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (
            item_id,
            "source_discovery",
            "pending",
            discovery_url,
            company_name,
            "manual_submission",
            tracking_id,
            "test_harness",
            json.dumps(config),
            now,
            now,
        ),
    )

    conn.commit()
    item_id = cursor.lastrowid
    conn.close()

    print(f"{Colors.GREEN}Submitted SOURCE_DISCOVERY item:{Colors.RESET}")
    print(f"  ID: {item_id}")
    print(f"  Company: {company_name}")
    print(f"  Website: {website or 'Auto-discover'}")
    print(f"  Tracking: {tracking_id}")
    return tracking_id


def get_queue_status() -> Dict[str, Any]:
    """Get current queue status."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Count by status
    cursor.execute(
        """
        SELECT status, COUNT(*) as count
        FROM job_queue
        GROUP BY status
    """
    )
    status_counts = {row["status"]: row["count"] for row in cursor.fetchall()}

    # Count by type
    cursor.execute(
        """
        SELECT type, COUNT(*) as count
        FROM job_queue
        GROUP BY type
    """
    )
    type_counts = {row["type"]: row["count"] for row in cursor.fetchall()}

    # Recent items
    cursor.execute(
        """
        SELECT id, type, status, url, company_name, tracking_id,
               created_at, updated_at, result_message
        FROM job_queue
        ORDER BY created_at DESC
        LIMIT 20
    """
    )
    recent_items = [dict(row) for row in cursor.fetchall()]

    # Job matches count
    cursor.execute("SELECT COUNT(*) FROM job_matches")
    job_matches_count = cursor.fetchone()[0]

    conn.close()

    return {
        "status_counts": status_counts,
        "type_counts": type_counts,
        "recent_items": recent_items,
        "job_matches_count": job_matches_count,
    }


def show_status():
    """Display queue status."""
    status = get_queue_status()

    print(f"\n{Colors.CYAN}{'=' * 60}{Colors.RESET}")
    print(f"{Colors.CYAN}Queue Status{Colors.RESET}")
    print(f"{Colors.CYAN}{'=' * 60}{Colors.RESET}")

    print(f"\n{Colors.BOLD}By Status:{Colors.RESET}")
    for s, count in status["status_counts"].items():
        color = {
            "PENDING": Colors.YELLOW,
            "PROCESSING": Colors.CYAN,
            "SUCCESS": Colors.GREEN,
            "FAILED": Colors.RED,
            "FILTERED": Colors.MAGENTA,
            "SKIPPED": Colors.MAGENTA,
        }.get(s, Colors.RESET)
        print(f"  {color}{s}: {count}{Colors.RESET}")

    print(f"\n{Colors.BOLD}By Type:{Colors.RESET}")
    for t, count in status["type_counts"].items():
        print(f"  {t}: {count}")

    print(f"\n{Colors.BOLD}Job Matches: {status['job_matches_count']}{Colors.RESET}")

    print(f"\n{Colors.BOLD}Recent Items:{Colors.RESET}")
    for item in status["recent_items"][:10]:
        status_color = {
            "PENDING": Colors.YELLOW,
            "PROCESSING": Colors.CYAN,
            "SUCCESS": Colors.GREEN,
            "FAILED": Colors.RED,
            "FILTERED": Colors.MAGENTA,
            "SKIPPED": Colors.MAGENTA,
        }.get(item["status"], Colors.RESET)

        url_display = item["url"][:40] + "..." if item["url"] and len(item["url"]) > 40 else item["url"] or "-"
        print(
            f"  [{item['id']}] {status_color}{item['status']:10}{Colors.RESET} "
            f"{item['type']:8} {item['company_name'] or '-':20} {url_display}"
        )


def watch_item(tracking_id: str, timeout: int = 300, poll_interval: int = 2):
    """Watch a specific item until it completes."""
    conn = get_db_connection()
    cursor = conn.cursor()

    start_time = time.time()
    last_status = None

    print(f"\n{Colors.CYAN}Watching item: {tracking_id}{Colors.RESET}")
    print(f"Timeout: {timeout}s, Poll interval: {poll_interval}s")
    print(f"{Colors.YELLOW}Press Ctrl+C to stop{Colors.RESET}\n")

    try:
        while time.time() - start_time < timeout:
            cursor.execute(
                """
                SELECT id, type, status, url, company_name, sub_task,
                       result_message, error_details, updated_at
                FROM job_queue
                WHERE tracking_id = ?
            """,
                (tracking_id,),
            )

            row = cursor.fetchone()
            if not row:
                print(f"{Colors.RED}Item not found: {tracking_id}{Colors.RESET}")
                return

            item = dict(row)
            elapsed = int(time.time() - start_time)

            # Only print if status changed
            if item["status"] != last_status:
                status_color = {
                    "PENDING": Colors.YELLOW,
                    "PROCESSING": Colors.CYAN,
                    "SUCCESS": Colors.GREEN,
                    "FAILED": Colors.RED,
                    "FILTERED": Colors.MAGENTA,
                    "SKIPPED": Colors.MAGENTA,
                }.get(item["status"], Colors.RESET)

                print(
                    f"[{elapsed:3}s] {status_color}{item['status']}{Colors.RESET} "
                    f"sub_task={item['sub_task'] or '-'}"
                )

                if item["result_message"]:
                    print(f"       Result: {item['result_message']}")

                if item["error_details"]:
                    print(f"       {Colors.RED}Error: {item['error_details']}{Colors.RESET}")

                last_status = item["status"]

            # Check if terminal state
            if item["status"] in ("SUCCESS", "FAILED", "FILTERED", "SKIPPED"):
                print(f"\n{Colors.GREEN}Item completed in {elapsed}s{Colors.RESET}")

                # Check for job match if job type
                if item["type"] == "JOB" and item["status"] == "SUCCESS":
                    cursor.execute(
                        """
                        SELECT id, job_title, company_name, match_score,
                               application_priority
                        FROM job_matches
                        WHERE queue_item_id = ?
                    """,
                        (item["id"],),
                    )
                    match = cursor.fetchone()
                    if match:
                        print(f"\n{Colors.GREEN}Job Match Created:{Colors.RESET}")
                        print(f"  Title: {match['job_title']}")
                        print(f"  Company: {match['company_name']}")
                        print(f"  Score: {match['match_score']}")
                        print(f"  Priority: {match['application_priority']}")
                return

            time.sleep(poll_interval)

        print(f"\n{Colors.YELLOW}Timeout after {timeout}s{Colors.RESET}")

    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Stopped watching{Colors.RESET}")
    finally:
        conn.close()


def watch_queue(poll_interval: int = 5):
    """Watch the queue for changes."""
    conn = get_db_connection()
    cursor = conn.cursor()

    print(f"\n{Colors.CYAN}Watching queue...{Colors.RESET}")
    print(f"Poll interval: {poll_interval}s")
    print(f"{Colors.YELLOW}Press Ctrl+C to stop{Colors.RESET}\n")

    last_counts = {}

    try:
        while True:
            cursor.execute(
                """
                SELECT status, COUNT(*) as count
                FROM job_queue
                GROUP BY status
            """
            )
            current_counts = {row["status"]: row["count"] for row in cursor.fetchall()}

            # Check for changes
            if current_counts != last_counts:
                now = datetime.now().strftime("%H:%M:%S")
                print(f"\n[{now}] Queue status changed:")

                for status in ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "FILTERED", "SKIPPED"]:
                    old = last_counts.get(status, 0)
                    new = current_counts.get(status, 0)
                    if old != new:
                        diff = new - old
                        diff_str = f"+{diff}" if diff > 0 else str(diff)
                        color = Colors.GREEN if diff > 0 else Colors.RED
                        print(f"  {status}: {old} -> {new} ({color}{diff_str}{Colors.RESET})")

                last_counts = current_counts.copy()

            time.sleep(poll_interval)

    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Stopped watching{Colors.RESET}")
    finally:
        conn.close()


def run_test_scenarios():
    """Run all test scenarios."""
    print(f"\n{Colors.CYAN}{'=' * 60}{Colors.RESET}")
    print(f"{Colors.CYAN}Running Test Scenarios{Colors.RESET}")
    print(f"{Colors.CYAN}{'=' * 60}{Colors.RESET}")

    tracking_ids = []

    # Test 1: Job URL processing
    print(f"\n{Colors.BOLD}Test 1: Job URL Processing{Colors.RESET}")
    print("Submitting a test job URL...")
    tracking_ids.append(
        submit_job_item(
            url="https://boards.greenhouse.io/anthropic/jobs/123456",
            company_name="Anthropic",
        )
    )

    # Test 2: Company analysis
    print(f"\n{Colors.BOLD}Test 2: Company Analysis{Colors.RESET}")
    print("Submitting a company for analysis...")
    tracking_ids.append(submit_company_item(company_name="Test Company", url="https://testcompany.com"))

    # Test 3: Source discovery
    print(f"\n{Colors.BOLD}Test 3: Source Discovery{Colors.RESET}")
    print("Submitting source discovery request...")
    tracking_ids.append(
        submit_source_discovery_item(company_name="Example Corp", website="https://example.com")
    )

    print(f"\n{Colors.GREEN}{'=' * 60}{Colors.RESET}")
    print(f"{Colors.GREEN}Submitted {len(tracking_ids)} test items{Colors.RESET}")
    print(f"{Colors.GREEN}{'=' * 60}{Colors.RESET}")

    print("\nTracking IDs:")
    for tid in tracking_ids:
        print(f"  - {tid}")

    print(f"\n{Colors.CYAN}To watch processing:{Colors.RESET}")
    print(f"  python dev/test_harness.py watch")
    print(f"  python dev/test_harness.py watch-item {tracking_ids[0]}")

    return tracking_ids


def clear_test_items():
    """Clear all items submitted by test_harness."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        DELETE FROM job_queue
        WHERE submitted_by = 'test_harness'
    """
    )

    deleted = cursor.rowcount
    conn.commit()
    conn.close()

    print(f"{Colors.GREEN}Cleared {deleted} test items from queue{Colors.RESET}")


def main():
    parser = argparse.ArgumentParser(
        description="Test harness for job-finder-worker queue processing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Job command
    job_parser = subparsers.add_parser("job", help="Submit a job URL for processing")
    job_parser.add_argument("url", help="Job posting URL")
    job_parser.add_argument("--company", help="Company name")
    job_parser.add_argument("--watch", action="store_true", help="Watch item after submission")

    # Company command
    company_parser = subparsers.add_parser("company", help="Submit a company for analysis")
    company_parser.add_argument("name", help="Company name")
    company_parser.add_argument("--url", help="Company website URL")
    company_parser.add_argument("--watch", action="store_true", help="Watch item after submission")

    # Scrape command
    scrape_parser = subparsers.add_parser("scrape", help="Submit a scrape request")
    scrape_parser.add_argument("--source", default="greenhouse", help="Source type")
    scrape_parser.add_argument("--company", help="Company name")
    scrape_parser.add_argument("--token", help="Board token")
    scrape_parser.add_argument("--watch", action="store_true", help="Watch item after submission")

    # Source discovery command
    discover_parser = subparsers.add_parser("discover", help="Submit source discovery request")
    discover_parser.add_argument("company", help="Company name")
    discover_parser.add_argument("--url", help="Company website URL")
    discover_parser.add_argument("--watch", action="store_true", help="Watch item after submission")

    # Status command
    subparsers.add_parser("status", help="Show queue status")

    # Watch command
    watch_parser = subparsers.add_parser("watch", help="Watch queue for changes")
    watch_parser.add_argument("--interval", type=int, default=5, help="Poll interval in seconds")

    # Watch item command
    watch_item_parser = subparsers.add_parser("watch-item", help="Watch a specific item")
    watch_item_parser.add_argument("tracking_id", help="Tracking ID to watch")
    watch_item_parser.add_argument("--timeout", type=int, default=300, help="Timeout in seconds")

    # Test all command
    subparsers.add_parser("test-all", help="Run all test scenarios")

    # Clear command
    subparsers.add_parser("clear", help="Clear all test items from queue")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "job":
        tracking_id = submit_job_item(args.url, args.company)
        if args.watch:
            watch_item(tracking_id)

    elif args.command == "company":
        tracking_id = submit_company_item(args.name, args.url)
        if args.watch:
            watch_item(tracking_id)

    elif args.command == "scrape":
        tracking_id = submit_scrape_item(args.source, args.company, args.token)
        if args.watch:
            watch_item(tracking_id)

    elif args.command == "discover":
        tracking_id = submit_source_discovery_item(args.company, args.url)
        if args.watch:
            watch_item(tracking_id)

    elif args.command == "status":
        show_status()

    elif args.command == "watch":
        watch_queue(args.interval)

    elif args.command == "watch-item":
        watch_item(args.tracking_id, args.timeout)

    elif args.command == "test-all":
        run_test_scenarios()

    elif args.command == "clear":
        clear_test_items()


if __name__ == "__main__":
    main()
