"""End-to-end queue-driven scrape flow.

Enqueues a SCRAPE request, runs the queue processor, and verifies a job is
scraped, analyzed, and saved into job_matches.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest

from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.job_queue import ConfigLoader, QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType, ScrapeConfig
from job_finder.job_queue.processor import QueueItemProcessor
from job_finder.storage import JobStorage
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager
from job_finder.ai.matcher import JobMatchResult


def _apply_migrations(db_path: Path) -> None:
    """Apply all SQLite migrations to a fresh database."""
    migrations_dir = Path(__file__).resolve().parents[3] / "infra" / "sqlite" / "migrations"
    with sqlite3.connect(db_path) as conn:
        for sql_file in sorted(migrations_dir.glob("*.sql")):
            conn.executescript(sql_file.read_text())


class DummyMatcher:
    """Cheap stub that always returns a passing match result."""

    def __init__(self, score: int = 88):
        self.min_match_score = score

    def analyze_job(self, job: dict) -> JobMatchResult:
        return JobMatchResult(
            job_title=job.get("title", "Unknown"),
            job_company=job.get("company", "Unknown"),
            job_url=job.get("url", ""),
            match_score=self.min_match_score,
            matched_skills=["python"],
            missing_skills=[],
            experience_match="5+",
            key_strengths=["relevance"],
            potential_concerns=[],
            application_priority="High",
            customization_recommendations={},
        )


@pytest.fixture
def temp_db(tmp_path):
    db_path = tmp_path / "queue_e2e.db"
    _apply_migrations(db_path)
    return db_path


def _process_queue(
    queue_manager: QueueManager, processor: QueueItemProcessor, limit: int = 25
) -> int:
    """Simple processing loop mirroring run_job_search_unified."""
    processed = 0
    while processed < limit:
        pending = queue_manager.get_pending_items(limit=50)
        if not pending:
            break
        for item in pending:
            processor.process_item(item)
            processed += 1
            if processed >= limit:
                break
    return processed


def test_queue_scrape_end_to_end(temp_db):
    db_path = str(temp_db)

    queue_manager = QueueManager(db_path)
    job_storage = JobStorage(db_path)
    companies_manager = CompaniesManager(db_path)
    sources_manager = JobSourcesManager(db_path)
    config_loader = ConfigLoader(db_path)
    company_info_fetcher = CompanyInfoFetcher(companies_manager)
    ai_matcher = DummyMatcher(score=88)

    # Pre-populate a company with good data so the job pipeline doesn't spawn a company task
    # Note: name_lower must match normalize_company_name("E2E Co") = "e2e"
    now_iso = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO companies (
                id, name, name_lower, website, about, culture,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "e2e-company-id",
                "E2E Co",
                "e2e",  # normalized: " Co" suffix is stripped
                "https://e2e.example.com",
                "We build E2E pipelines with extensive testing and monitoring capabilities.",
                "Remote-first culture with quarterly meetups.",
                now_iso,
                now_iso,
            ),
        )

    # Insert a single active source so ScrapeRunner has work.
    source_id = sources_manager.add_source(
        name="E2E RSS",
        source_type="rss",
        config={"url": "https://example.com/jobs.rss"},
        company_id=None,
        company_name="E2E Co",
        discovery_confidence="high",
    )

    processor = QueueItemProcessor(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=job_storage,
        companies_manager=companies_manager,
        sources_manager=sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=ai_matcher,
    )

    scrape_runner = processor.job_processor.scrape_runner

    # Avoid real network scraping; submit a deterministic job into the queue.
    def fake_scrape_source(source, remaining_matches=None):
        job = {
            "title": "E2E Pipeline Engineer",
            "company": "E2E Co",
            "company_website": "https://e2e.example.com",
            "location": "Remote",
            "description": "A" * 300,  # avoid quality strikes
            "url": "https://e2e.example.com/jobs/pipeline-engineer",
            "posted_date": datetime.now(timezone.utc).isoformat(),
        }
        submitted = scrape_runner.scraper_intake.submit_jobs(
            jobs=[job], source="scraper", company_id=source.get("companyId")
        )
        return {"jobs_found": 1, "jobs_submitted": submitted}

    scrape_runner._scrape_source = fake_scrape_source  # type: ignore[attr-defined]

    # Enqueue SCRAPE request that targets the inserted source.
    scrape_item = JobQueueItem(
        type=QueueItemType.SCRAPE,
        url="",
        company_name="",
        source="user_request",
        scrape_config=ScrapeConfig(target_matches=1, max_sources=1, source_ids=[source_id]),
    )
    queue_manager.add_item(scrape_item)

    processed = _process_queue(queue_manager, processor, limit=20)

    with sqlite3.connect(db_path) as conn:
        job_row = conn.execute("SELECT url, company_name, match_score FROM job_matches").fetchone()

    stats = queue_manager.get_queue_stats()

    assert processed > 0
    assert job_row is not None
    assert job_row[0] == "https://e2e.example.com/jobs/pipeline-engineer"
    assert job_row[1] == "E2E Co"
    assert job_row[2] == 88
    assert stats["pending"] == 0
