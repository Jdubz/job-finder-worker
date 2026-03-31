import sqlite3
from pathlib import Path

from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType


def make_manager(tmp_path: Path) -> QueueManager:
    db_path = tmp_path / "queue.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE job_queue (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            url TEXT,
            tracking_id TEXT,
            parent_item_id TEXT,
            input TEXT,
            output TEXT,
            result_message TEXT,
            error_details TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            last_error_category TEXT,
            created_at TEXT,
            updated_at TEXT,
            processed_at TEXT,
            completed_at TEXT,
            dedupe_key TEXT
        );
        """
    )
    conn.commit()
    conn.close()
    return QueueManager(db_path=str(db_path))


def test_normalize_url_strips_fragment_and_trailing_slash(tmp_path: Path):
    mgr = make_manager(tmp_path)
    url = "HTTPS://Example.com/path/section/#frag"
    assert mgr._normalize_url(url) == "https://example.com/path/section"


def test_normalize_url_on_malformed_returns_stripped(tmp_path: Path):
    mgr = make_manager(tmp_path)
    # malformed url that raises in urlparse access
    bad = "http://%zz"
    assert mgr._normalize_url(bad).startswith(bad.strip())


def test_compute_dedupe_key_jobs_and_company_fallbacks(tmp_path: Path):
    mgr = make_manager(tmp_path)

    job_item = JobQueueItem(type=QueueItemType.JOB, url="https://site/jobs/1")
    assert mgr._compute_dedupe_key(job_item) == "job|https://site/jobs/1"

    company_with_id = JobQueueItem(type=QueueItemType.COMPANY, company_id="cid123")
    assert mgr._compute_dedupe_key(company_with_id) == "company|cid123"

    company_with_name = JobQueueItem(
        type=QueueItemType.COMPANY, company_name="Acme Corp", tracking_id="t"
    )
    assert mgr._compute_dedupe_key(company_with_name) == "company|acme-corp"

    company_missing = JobQueueItem(type=QueueItemType.COMPANY, tracking_id="fallback")
    assert mgr._compute_dedupe_key(company_missing) == "company|fallback"


def test_compute_dedupe_key_source_and_generic_fallbacks(tmp_path: Path):
    mgr = make_manager(tmp_path)

    source_item = JobQueueItem(
        type=QueueItemType.SCRAPE_SOURCE,
        source_id="sid",
        url="https://example.com/jobs",
    )
    assert mgr._compute_dedupe_key(source_item) == "scrape_source|sid"

    source_item_no_ids = JobQueueItem(
        type=QueueItemType.SCRAPE_SOURCE,
        input={},
        tracking_id="trk",
    )
    assert mgr._compute_dedupe_key(source_item_no_ids).endswith("trk")

    generic_item = JobQueueItem(type=QueueItemType.AGENT_REVIEW, tracking_id="trk2")
    assert mgr._compute_dedupe_key(generic_item) == "agent_review|trk2"

    generic_missing = JobQueueItem(type=QueueItemType.AGENT_REVIEW)
    assert mgr._compute_dedupe_key(generic_missing).startswith("agent_review|")
