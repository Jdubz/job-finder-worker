"""Tests for known-URL pre-loading and seen_urls storage."""

import sqlite3

import pytest

from job_finder.storage.job_listing_storage import JobListingStorage
from job_finder.storage.seen_urls_storage import SeenUrlsStorage, _url_hash

# ── Helpers ──────────────────────────────────────────────────────────


def _create_tables(db_path: str) -> None:
    """Create the minimal schema needed for these tests."""
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS job_listings (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL UNIQUE,
            source_id TEXT,
            company_id TEXT,
            title TEXT NOT NULL,
            company_name TEXT NOT NULL,
            location TEXT,
            salary_range TEXT,
            description TEXT NOT NULL,
            posted_date TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            filter_result TEXT,
            analysis_result TEXT,
            match_score REAL,
            content_fingerprint TEXT,
            apply_url TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS job_listings_archive (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            source_id TEXT,
            company_id TEXT,
            title TEXT NOT NULL,
            company_name TEXT NOT NULL,
            location TEXT,
            salary_range TEXT,
            description TEXT NOT NULL,
            posted_date TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            filter_result TEXT,
            analysis_result TEXT,
            match_score REAL,
            content_fingerprint TEXT,
            apply_url TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS seen_urls (
            url_hash      TEXT NOT NULL,
            source_id     TEXT NOT NULL,
            first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            last_seen_at  TEXT,
            PRIMARY KEY (source_id, url_hash)
        );
        """)
    conn.close()


@pytest.fixture
def tmp_db(tmp_path):
    """Return path to a temporary SQLite database with required tables."""
    db_path = str(tmp_path / "test.db")
    _create_tables(db_path)
    return db_path


# ── JobListingStorage.get_urls_for_source ────────────────────────────


class TestGetUrlsForSource:
    def test_returns_urls_from_job_listings(self, tmp_db):
        storage = JobListingStorage(db_path=tmp_db)
        storage.create_listing(
            url="https://example.com/job/1",
            title="Engineer",
            company_name="Acme",
            description="Build things",
            source_id="src-1",
        )
        storage.create_listing(
            url="https://example.com/job/2",
            title="Designer",
            company_name="Acme",
            description="Design things",
            source_id="src-1",
        )
        # Different source — should not be included
        storage.create_listing(
            url="https://example.com/job/3",
            title="PM",
            company_name="Other",
            description="Manage things",
            source_id="src-2",
        )

        urls = storage.get_urls_for_source("src-1")
        assert len(urls) == 2
        assert "https://example.com/job/1" in urls
        assert "https://example.com/job/2" in urls

    def test_includes_archive_urls(self, tmp_db):
        storage = JobListingStorage(db_path=tmp_db)
        storage.create_listing(
            url="https://example.com/active",
            title="Active",
            company_name="Co",
            description="desc",
            source_id="src-1",
        )
        # Insert directly into archive
        conn = sqlite3.connect(tmp_db)
        conn.execute("""INSERT INTO job_listings_archive
               (id, url, source_id, title, company_name, description,
                status, created_at, updated_at)
               VALUES ('arch-1', 'https://example.com/archived', 'src-1',
                       'Old', 'Co', 'desc', 'archived', '2024-01-01', '2024-01-01')""")
        conn.commit()
        conn.close()

        urls = storage.get_urls_for_source("src-1")
        assert "https://example.com/active" in urls
        assert "https://example.com/archived" in urls

    def test_empty_source_returns_empty_set(self, tmp_db):
        storage = JobListingStorage(db_path=tmp_db)
        assert storage.get_urls_for_source("nonexistent") == set()

    def test_empty_source_id_returns_empty_set(self, tmp_db):
        storage = JobListingStorage(db_path=tmp_db)
        assert storage.get_urls_for_source("") == set()


# ── SeenUrlsStorage ─────────────────────────────────────────────────


class TestSeenUrlsStorage:
    def test_record_and_retrieve(self, tmp_db):
        storage = SeenUrlsStorage(db_path=tmp_db)
        urls = ["https://example.com/a", "https://example.com/b"]
        storage.record_urls(urls, source_id="src-1")

        seen = storage.get_seen_urls_for_source("src-1")
        assert len(seen) == 2
        assert _url_hash("https://example.com/a") in seen
        assert _url_hash("https://example.com/b") in seen

    def test_ignores_duplicates(self, tmp_db):
        storage = SeenUrlsStorage(db_path=tmp_db)
        storage.record_urls(["https://example.com/x"], source_id="src-1")
        storage.record_urls(["https://example.com/x"], source_id="src-1")

        seen = storage.get_seen_urls_for_source("src-1")
        assert len(seen) == 1

    def test_different_sources_isolated(self, tmp_db):
        storage = SeenUrlsStorage(db_path=tmp_db)
        storage.record_urls(["https://example.com/a"], source_id="src-1")
        storage.record_urls(["https://example.com/b"], source_id="src-2")

        assert len(storage.get_seen_urls_for_source("src-1")) == 1
        assert len(storage.get_seen_urls_for_source("src-2")) == 1

    def test_same_url_tracked_per_source(self, tmp_db):
        """Same URL can be recorded for different sources (composite PK)."""
        storage = SeenUrlsStorage(db_path=tmp_db)
        storage.record_urls(["https://example.com/shared"], source_id="src-1")
        storage.record_urls(["https://example.com/shared"], source_id="src-2")

        assert len(storage.get_seen_urls_for_source("src-1")) == 1
        assert len(storage.get_seen_urls_for_source("src-2")) == 1

    def test_record_urls_returns_correct_insert_count(self, tmp_db):
        """record_urls should only count actually inserted rows."""
        storage = SeenUrlsStorage(db_path=tmp_db)
        assert (
            storage.record_urls(
                ["https://example.com/a", "https://example.com/b"], source_id="src-1"
            )
            == 2
        )
        # Re-inserting same URLs should return 0
        assert (
            storage.record_urls(
                ["https://example.com/a", "https://example.com/b"], source_id="src-1"
            )
            == 0
        )
        # Mix of new and existing
        assert (
            storage.record_urls(
                ["https://example.com/b", "https://example.com/c"], source_id="src-1"
            )
            == 1
        )

    def test_hash_url_matches_internal(self):
        url = "https://example.com/test"
        assert SeenUrlsStorage.hash_url(url) == _url_hash(url)

    def test_empty_urls_noop(self, tmp_db):
        storage = SeenUrlsStorage(db_path=tmp_db)
        assert storage.record_urls([], source_id="src-1") == 0

    def test_graceful_when_table_missing(self, tmp_path):
        """Should return empty set if seen_urls table doesn't exist."""
        db_path = str(tmp_path / "empty.db")
        conn = sqlite3.connect(db_path)
        # Create a minimal table so the DB file exists
        conn.execute("CREATE TABLE dummy (id TEXT)")
        conn.close()

        storage = SeenUrlsStorage(db_path=db_path)
        assert storage.get_seen_urls_for_source("src-1") == set()

    def test_record_urls_guards_empty_source_id(self, tmp_db):
        """record_urls should return 0 when source_id is None or empty."""
        storage = SeenUrlsStorage(db_path=tmp_db)
        assert storage.record_urls(["https://example.com/a"], source_id=None) == 0
        assert storage.record_urls(["https://example.com/a"], source_id="") == 0


class TestCleanupExpired:
    def test_removes_old_entries(self, tmp_db):
        """Entries older than max_age_days should be deleted."""
        storage = SeenUrlsStorage(db_path=tmp_db)
        conn = sqlite3.connect(tmp_db)
        # Insert an entry with last_seen_at 30 days ago
        conn.execute(
            "INSERT INTO seen_urls (url_hash, source_id, first_seen_at, last_seen_at) "
            "VALUES (?, ?, ?, ?)",
            (
                _url_hash("https://old.com"),
                "src-1",
                "2020-01-01T00:00:00.000Z",
                "2020-01-01T00:00:00.000Z",
            ),
        )
        conn.commit()
        conn.close()

        deleted = storage.cleanup_expired(max_age_days=14)
        assert deleted == 1
        assert len(storage.get_seen_urls_for_source("src-1")) == 0

    def test_preserves_recent_entries(self, tmp_db):
        """Entries seen recently should not be deleted."""
        storage = SeenUrlsStorage(db_path=tmp_db)
        storage.record_urls(["https://fresh.com"], source_id="src-1")

        deleted = storage.cleanup_expired(max_age_days=14)
        assert deleted == 0
        assert len(storage.get_seen_urls_for_source("src-1")) == 1

    def test_falls_back_to_first_seen_at(self, tmp_db):
        """Entries without last_seen_at should use first_seen_at for TTL."""
        storage = SeenUrlsStorage(db_path=tmp_db)
        conn = sqlite3.connect(tmp_db)
        # Insert entry with no last_seen_at (legacy row)
        conn.execute(
            "INSERT INTO seen_urls (url_hash, source_id, first_seen_at) " "VALUES (?, ?, ?)",
            (_url_hash("https://legacy.com"), "src-1", "2020-01-01T00:00:00.000Z"),
        )
        conn.commit()
        conn.close()

        deleted = storage.cleanup_expired(max_age_days=14)
        assert deleted == 1

    def test_returns_zero_when_nothing_expired(self, tmp_db):
        """Should return 0 when no entries are old enough."""
        storage = SeenUrlsStorage(db_path=tmp_db)
        storage.record_urls(["https://a.com", "https://b.com"], source_id="src-1")

        assert storage.cleanup_expired(max_age_days=14) == 0
