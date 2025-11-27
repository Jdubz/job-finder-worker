#!/usr/bin/env python3
"""State-driven job search entry point (queue-first).

Enqueues a SCRAPE request and then processes the queue using the
state-driven pipeline until work is exhausted or the target matches
limit is reached.
"""

import argparse
import os
import sys
from pathlib import Path
import sqlite3

from dotenv import load_dotenv

# Add src to path (go up from dev/bin to worker root, then into src)
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from job_finder.ai import AIJobMatcher
from job_finder.ai.providers import create_provider_from_config
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.job_queue import ConfigLoader, QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType, ScrapeConfig
from job_finder.job_queue.processor import QueueItemProcessor
from job_finder.logging_config import setup_logging
from job_finder.profile import SQLiteProfileLoader
from job_finder.storage import JobStorage
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager


def main():
    """Run a full scrape + match cycle through the queue pipeline."""
    parser = argparse.ArgumentParser(description="Run job finder search")
    parser.add_argument(
        "--max-jobs",
        type=int,
        help="Override max jobs to enqueue/analyze (default: use config value)",
    )
    parser.add_argument(
        "--mode",
        choices=["full", "quick"],
        default="full",
        help="Output mode: 'full' (detailed) or 'quick' (summary only)",
    )
    parser.add_argument(
        "--no-env",
        action="store_true",
        help="Skip loading .env file",
    )
    parser.add_argument(
        "--queue-limit",
        type=int,
        default=200,
        help="Max queue items to process before stopping (safety guard)",
    )

    args = parser.parse_args()

    # Load environment variables (unless --no-env)
    if not args.no_env:
        load_dotenv()

    # Provide a safe default ENVIRONMENT for logging if not supplied
    os.environ.setdefault("ENVIRONMENT", "development")

    # Configure logging
    setup_logging()

    if args.mode == "full":
        print("=" * 70)
        print("STATE-DRIVEN JOB SEARCH (QUEUE)")
        print("=" * 70)
        print("\n📋 Loading configuration from SQLite job_finder_config (no YAML file)")

    config: dict = {}

    # Override target matches if specified
    target_matches = args.max_jobs or 10

    # Resolve DB path
    db_path = (
        os.getenv("JF_SQLITE_DB_PATH")
        or os.getenv("JOB_FINDER_SQLITE_PATH")
        or os.getenv("SQLITE_DB_PATH")
        or os.getenv("DATABASE_PATH")
    )
    if not db_path:
        print("❌ JF_SQLITE_DB_PATH not set")
        sys.exit(1)

    # Build core components
    job_storage = JobStorage(db_path)
    companies_manager = CompaniesManager(db_path)
    sources_manager = JobSourcesManager(db_path)
    queue_manager = QueueManager(db_path)
    config_loader = ConfigLoader(db_path)
    profile = SQLiteProfileLoader(db_path).load_profile()

    # Load AI settings from config
    ai_settings = config_loader.get_ai_settings()
    job_match = config_loader.get_job_match()

    # Create provider from AI settings
    provider = create_provider_from_config(ai_settings)
    worker_ai_config = (
        (ai_settings.get("worker") or ai_settings) if isinstance(ai_settings, dict) else {}
    )
    ai_matcher = AIJobMatcher(
        provider=provider,
        profile=profile,
        min_match_score=job_match.get("minMatchScore", 70),
        generate_intake=job_match.get("generateIntakeData", True),
        portland_office_bonus=job_match.get("portlandOfficeBonus", 15),
        user_timezone=job_match.get("userTimezone", -8),
        prefer_large_companies=job_match.get("preferLargeCompanies", True),
        config=job_match,
    )
    company_info_fetcher = CompanyInfoFetcher(provider, worker_ai_config)

    processor = QueueItemProcessor(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=job_storage,
        companies_manager=companies_manager,
        sources_manager=sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=ai_matcher,
    )

    # Enqueue SCRAPE request
    scrape_config = ScrapeConfig(
        target_matches=target_matches,
        max_sources=config.get("search", {}).get("max_sources", 20),
        source_ids=None,
        min_match_score=None,
    )
    scrape_item = JobQueueItem(
        type=QueueItemType.SCRAPE,
        url="",
        company_name="",
        source="user_request",
        scrape_config=scrape_config,
    )
    queue_manager.add_item(scrape_item)

    if args.mode == "full":
        print(f"✓ Enqueued SCRAPE request for up to {target_matches} jobs")

    # Simple processing loop
    processed = 0
    safety_limit = args.queue_limit
    while processed < safety_limit:
        pending = queue_manager.get_pending_items(limit=20)
        if not pending:
            break
        for item in pending:
            processor.process_item(item)
            processed += 1
            if processed >= safety_limit:
                break

    # Summarize results
    queue_stats = queue_manager.get_queue_stats()
    job_count = _count_jobs(db_path)

    print("\n" + "=" * 70)
    print("SEARCH COMPLETE!")
    print("=" * 70)
    print(f"Queue processed items: {processed} (limit {safety_limit})")
    print(f"Queue status: {queue_stats}")
    print(f"job_matches rows: {job_count}")
    print("=" * 70)


def _count_jobs(db_path: str) -> int:
    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT COUNT(*) AS cnt FROM job_matches").fetchone()
            return row["cnt"] if row else 0
    except sqlite3.Error:
        return -1


if __name__ == "__main__":
    main()
