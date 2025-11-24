"""Comprehensive test of the state-driven JOB pipeline (scrape → filter → analyze → save)."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pytest

from job_finder.ai.matcher import JobMatchResult
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.filters.models import FilterResult
from job_finder.job_queue import ConfigLoader, QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus
from job_finder.job_queue.processor import QueueItemProcessor
from job_finder.storage import JobStorage
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager


def _apply_migrations(db_path: Path) -> None:
    """Replay all SQLite migrations into a fresh database."""
    migrations_dir = Path(__file__).resolve().parents[3] / "infra" / "sqlite" / "migrations"
    with sqlite3.connect(db_path) as conn:
        for sql_file in sorted(migrations_dir.glob("*.sql")):
            conn.executescript(sql_file.read_text())


def _process_all(queue_manager: QueueManager, processor: QueueItemProcessor, limit: int = 25) -> int:
    processed = 0
    while processed < limit:
        pending = queue_manager.get_pending_items(limit=20)
        if not pending:
            break
        for item in pending:
            processor.process_item(item)
            processed += 1
            if processed >= limit:
                break
    return processed


def test_job_pipeline_full_path(tmp_path: Path):
    """End-to-end: JOB item with no state flows through all stages and persists a match."""
    db_path = tmp_path / "pipeline.db"
    _apply_migrations(db_path)

    # Real SQLite-backed managers
    queue_manager = QueueManager(str(db_path))
    job_storage = JobStorage(str(db_path))
    companies_manager = CompaniesManager(str(db_path))
    sources_manager = JobSourcesManager(str(db_path))
    config_loader = ConfigLoader(str(db_path))
    company_info_fetcher = CompanyInfoFetcher(companies_manager)

    # Stub AI matcher and filter to avoid network/LLM
    class DummyMatcher:
        min_match_score = 50

        def analyze_job(self, job: dict) -> JobMatchResult:
            return JobMatchResult(
                job_title=job.get("title", "Unknown"),
                job_company=job.get("company", ""),
                job_url=job.get("url", ""),
                match_score=92,
                matched_skills=["python"],
                missing_skills=[],
                experience_match="5+",
                key_strengths=["relevance"],
                potential_concerns=[],
                application_priority="High",
                customization_recommendations={},
            )

    ai_matcher = DummyMatcher()

    processor = QueueItemProcessor(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=job_storage,
        companies_manager=companies_manager,
        sources_manager=sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=ai_matcher,
        profile=object(),  # not used in this flow
    )

    # Patch internals to keep the run deterministic
    job_data = {
        "title": "Pipeline Engineer",
        "company": "Comprehensive Co",
        "company_website": "https://comprehensive.example.com",
        "location": "Remote",
        "description": "A" * 400,
        "url": "https://comprehensive.example.com/jobs/pipeline-engineer",
        "posted_date": datetime.now(timezone.utc).isoformat(),
    }

    processor.job_processor._scrape_job = lambda item: job_data  # type: ignore[attr-defined]
    processor.job_processor.filter_engine.evaluate_job = (
        lambda _job: FilterResult(passed=True, total_strikes=0, strike_threshold=5)
    )
    processor.company_info_fetcher.fetch_company_info = lambda *_args, **_kwargs: {
        "about": "We build pipelines",
        "culture": "Remote-first",
    }

    # Enqueue bare JOB item (no pipeline_state)
    item = JobQueueItem(
        type=QueueItemType.JOB,
        url=job_data["url"],
        company_name=job_data["company"],
        source="user_submission",
    )
    item_id = queue_manager.add_item(item)

    processed = _process_all(queue_manager, processor, limit=25)
    assert processed > 0

    # Verify queue item reached terminal SUCCESS with save stage
    final_item = queue_manager.get_item(item_id)
    assert final_item is not None
    assert final_item.status == QueueStatus.SUCCESS
    assert final_item.pipeline_stage == "save"
    assert final_item.pipeline_state
    assert final_item.pipeline_state["match_result"]["match_score"] == 92

    # Verify job saved to job_matches
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT url, company_name, match_score FROM job_matches").fetchone()
    assert row is not None
    assert row["url"] == job_data["url"]
    assert row["company_name"] == job_data["company"]
    assert row["match_score"] == 92
