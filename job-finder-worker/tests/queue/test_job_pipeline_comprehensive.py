"""Comprehensive test of the state-driven JOB pipeline (scrape → filter → analyze → save)."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from job_finder.ai.matcher import JobMatchResult
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.job_queue import ConfigLoader, QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus
from job_finder.job_queue.processor import QueueItemProcessor
from job_finder.storage import JobStorage, JobListingStorage
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager


def _apply_migrations(db_path: Path) -> None:
    """Replay all SQLite migrations into a fresh database."""
    migrations_dir = Path(__file__).resolve().parents[3] / "infra" / "sqlite" / "migrations"
    with sqlite3.connect(db_path) as conn:
        for sql_file in sorted(migrations_dir.glob("*.sql")):
            conn.executescript(sql_file.read_text())

        # Some test runs skip older migrations that created the config table; ensure it exists
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS config (
              id TEXT PRIMARY KEY,
              payload_json TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              updated_by TEXT
            );
            """
        )


def _process_all(
    queue_manager: QueueManager, processor: QueueItemProcessor, limit: int = 25
) -> int:
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
    job_listing_storage = JobListingStorage(str(db_path))
    companies_manager = CompaniesManager(str(db_path))
    sources_manager = JobSourcesManager(str(db_path))
    config_loader = ConfigLoader(str(db_path))
    company_info_fetcher = CompanyInfoFetcher()

    # Pre-populate a company with good data so the job pipeline doesn't spawn a company task
    # Note: name_lower must match normalize_company_name("Comprehensive Co") = "comprehensive"
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
                "test-company-id",
                "Comprehensive Co",
                "comprehensive",  # normalized: " Co" suffix is stripped
                "https://comprehensive.example.com",
                "We build pipelines - this is a sufficiently long about section to pass has_good_company_data check",
                "Remote-first culture with flexible hours",
                now_iso,
                now_iso,
            ),
        )

        # Seed minimal configs (fail-loud environment)
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, updated_at) VALUES (?, ?, ?)",
            (
                "title-filter",
                json.dumps(
                    {
                        "requiredKeywords": ["engineer", "developer", "pipeline"],
                        "excludedKeywords": [],
                    }
                ),
                now_iso,
            ),
        )
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, updated_at) VALUES (?, ?, ?)",
            (
                "match-policy",
                json.dumps(
                    {
                        "minScore": 50,
                        "weights": {
                            "skillMatch": 40,
                            "experienceMatch": 30,
                            "seniorityMatch": 30,
                        },
                        "seniority": {
                            "preferred": ["senior"],
                            "acceptable": ["mid"],
                            "rejected": ["junior"],
                            "preferredBonus": 15,
                            "acceptablePenalty": 0,
                            "rejectedPenalty": -100,
                        },
                        "location": {
                            "allowRemote": True,
                            "allowHybrid": True,
                            "allowOnsite": False,
                            "userTimezone": -8,
                            "maxTimezoneDiffHours": 4,
                            "perHourPenalty": 3,
                            "hybridSameCityBonus": 10,
                        },
                        "technology": {
                            "required": [],
                            "preferred": [],
                            "disliked": [],
                            "rejected": [],
                            "requiredBonus": 10,
                            "preferredBonus": 5,
                            "dislikedPenalty": -5,
                        },
                        "salary": {
                            "minimum": None,
                            "target": None,
                            "belowTargetPenalty": 2,
                        },
                        "experience": {
                            "userYears": 12,
                            "maxRequired": 15,
                            "overqualifiedPenalty": 5,
                        },
                        "freshness": {
                            "freshBonusDays": 2,
                            "freshBonus": 10,
                            "staleThresholdDays": 3,
                            "stalePenalty": -10,
                            "veryStaleDays": 12,
                            "veryStalePenalty": -20,
                            "repostPenalty": -5,
                        },
                        "roleFit": {
                            "backendBonus": 5,
                            "mlAiBonus": 10,
                            "devopsSreBonus": 5,
                            "dataBonus": 5,
                            "securityBonus": 3,
                            "leadBonus": 3,
                            "frontendPenalty": -5,
                            "consultingPenalty": -10,
                            "clearancePenalty": -100,
                            "managementPenalty": -10,
                        },
                        "company": {
                            "preferredCityBonus": 20,
                            "preferredCity": "Portland",
                            "remoteFirstBonus": 15,
                            "aiMlFocusBonus": 10,
                            "largeCompanyBonus": 10,
                            "smallCompanyPenalty": -5,
                            "largeCompanyThreshold": 10000,
                            "smallCompanyThreshold": 100,
                            "startupBonus": 0,
                        },
                        "dealbreakers": {
                            "blockedLocations": [],
                            "locationPenalty": 60,
                            "relocationPenalty": 80,
                            "ambiguousLocationPenalty": 40,
                        },
                    }
                ),
                now_iso,
            ),
        )
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, updated_at) VALUES (?, ?, ?)",
            (
                "ai-settings",
                json.dumps(
                    {
                        "worker": {
                            "selected": {
                                "provider": "gemini",
                                "interface": "api",
                                "model": "gemini-2.0-flash",
                            }
                        },
                        "documentGenerator": {
                            "selected": {
                                "provider": "gemini",
                                "interface": "api",
                                "model": "gemini-2.0-flash",
                            }
                        },
                        "options": [],
                    }
                ),
                now_iso,
            ),
        )

    # Stub AI matcher and filter to avoid network/LLM
    class DummyMatcher:
        min_match_score = 50
        generate_intake = False

        def analyze_job(self, job: dict, **_kwargs) -> JobMatchResult:
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

    # Avoid real provider initialization (no API keys in tests)
    from job_finder.ai import providers as ai_providers
    import job_finder.job_queue.processors.job_processor as jp_module

    ai_providers.create_provider_from_config = lambda cfg, task=None: "stub-provider"  # type: ignore
    jp_module.create_provider_from_config = lambda cfg, task=None: "stub-provider"  # type: ignore

    processor = QueueItemProcessor(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=job_storage,
        job_listing_storage=job_listing_storage,
        companies_manager=companies_manager,
        sources_manager=sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=ai_matcher,
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

    processor.job_processor._scrape_job = lambda item: job_data  # type: ignore[attr-defined,method-assign]
    # Mock config refresh to prevent it from overwriting our mocks
    processor.job_processor._refresh_runtime_config = lambda: None  # type: ignore[method-assign]
    # Mock title filter to always pass
    from job_finder.filters.title_filter import TitleFilterResult

    processor.job_processor.title_filter.filter = lambda _title: TitleFilterResult(passed=True)  # type: ignore[method-assign]
    # Mock extractor to avoid AI call
    from job_finder.ai.extraction import JobExtractionResult

    class MockExtractor:
        def extract(self, title, description, location=None, posted_date=None):
            return JobExtractionResult(
                seniority="senior",
                work_arrangement="remote",
                technologies=["python"],
            )

    processor.job_processor.extractor = MockExtractor()  # type: ignore[assignment]
    # Mock scoring engine to always pass
    from job_finder.scoring.engine import ScoreBreakdown

    class MockScoringEngine:
        def score(self, extraction, job_title, job_description, company_data=None):
            from job_finder.scoring.engine import ScoreAdjustment

            return ScoreBreakdown(
                base_score=50,
                final_score=85,
                adjustments=[
                    ScoreAdjustment(category="seniority", reason="Preferred seniority", points=15),
                    ScoreAdjustment(category="location", reason="Remote position", points=5),
                ],
                passed=True,
            )

    processor.job_processor.scoring_engine = MockScoringEngine()  # type: ignore[assignment]
    processor.company_info_fetcher.fetch_company_info = lambda *_args, **_kwargs: {  # type: ignore[method-assign]
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

    # Verify queue item reached terminal SUCCESS with match result
    final_item = queue_manager.get_item(item_id)
    assert final_item is not None
    assert final_item.status == QueueStatus.SUCCESS
    # Single-task pipeline stores results in scraped_data, not pipeline_state
    assert final_item.scraped_data
    # Per hybrid scoring migration: analysis_result contains { scoringResult, detailedAnalysis }
    assert final_item.scraped_data["analysis_result"]["detailedAnalysis"]["match_score"] == 92

    # Verify job_listing was created
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        listing = conn.execute(
            "SELECT id, url, company_name FROM job_listings WHERE url = ?",
            (job_data["url"],),
        ).fetchone()
    assert listing is not None
    assert listing["url"] == job_data["url"]
    assert listing["company_name"] == job_data["company"]

    # Verify job_match was created with FK to job_listing
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        match = conn.execute(
            "SELECT job_listing_id, match_score FROM job_matches WHERE job_listing_id = ?",
            (listing["id"],),
        ).fetchone()
    assert match is not None
    assert match["match_score"] == 92
