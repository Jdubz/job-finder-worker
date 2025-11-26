"""Tests for maintenance module - staleness management and score recalculation."""

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from job_finder.maintenance import (
    STALE_THRESHOLD_DAYS,
    delete_stale_matches,
    recalculate_match_scores,
    run_maintenance,
)


def _bootstrap_db(path: Path):
    """Create job_matches table for testing."""
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE job_matches (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL UNIQUE,
                company_name TEXT NOT NULL,
                company_id TEXT,
                job_title TEXT NOT NULL,
                location TEXT,
                salary_range TEXT,
                job_description TEXT NOT NULL,
                company_info TEXT,
                match_score REAL NOT NULL,
                matched_skills TEXT,
                missing_skills TEXT,
                match_reasons TEXT,
                key_strengths TEXT,
                potential_concerns TEXT,
                experience_match REAL,
                application_priority TEXT NOT NULL,
                customization_recommendations TEXT,
                resume_intake_json TEXT,
                analyzed_at TEXT,
                submitted_by TEXT,
                queue_item_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )


def _insert_match(
    conn: sqlite3.Connection,
    match_id: str,
    company_name: str,
    match_score: float,
    priority: str,
    created_at: datetime,
    analyzed_at: datetime = None,
):
    """Insert a test job match."""
    now_iso = datetime.now(timezone.utc).isoformat()
    analyzed_iso = (analyzed_at or created_at).isoformat()
    created_iso = created_at.isoformat()

    conn.execute(
        """
        INSERT INTO job_matches (
            id, url, company_name, job_title, job_description,
            match_score, application_priority, analyzed_at,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            match_id,
            f"https://example.com/job/{match_id}",
            company_name,
            "Software Engineer",
            "Test job description",
            match_score,
            priority,
            analyzed_iso,
            created_iso,
            now_iso,
        ),
    )


class TestDeleteStaleMatches:
    """Tests for delete_stale_matches function."""

    def test_deletes_matches_older_than_threshold(self, tmp_path):
        """Should delete matches older than STALE_THRESHOLD_DAYS."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        now = datetime.now(timezone.utc)
        old_date = now - timedelta(days=STALE_THRESHOLD_DAYS + 1)
        recent_date = now - timedelta(days=1)

        with sqlite3.connect(db) as conn:
            _insert_match(conn, "old-1", "Old Company", 75, "High", old_date)
            _insert_match(conn, "old-2", "Old Company 2", 60, "Medium", old_date)
            _insert_match(conn, "recent-1", "Recent Company", 80, "High", recent_date)

        deleted = delete_stale_matches(str(db))

        assert deleted == 2

        # Verify only recent match remains
        with sqlite3.connect(db) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT id FROM job_matches").fetchall()
            assert len(rows) == 1
            assert rows[0]["id"] == "recent-1"

    def test_no_stale_matches(self, tmp_path):
        """Should return 0 when no stale matches exist."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        now = datetime.now(timezone.utc)
        recent_date = now - timedelta(days=1)

        with sqlite3.connect(db) as conn:
            _insert_match(conn, "recent-1", "Company A", 75, "High", recent_date)
            _insert_match(conn, "recent-2", "Company B", 60, "Medium", recent_date)

        deleted = delete_stale_matches(str(db))

        assert deleted == 0

        # Verify all matches remain
        with sqlite3.connect(db) as conn:
            count = conn.execute("SELECT COUNT(*) FROM job_matches").fetchone()[0]
            assert count == 2

    def test_empty_table(self, tmp_path):
        """Should handle empty table gracefully."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        deleted = delete_stale_matches(str(db))

        assert deleted == 0

    def test_boundary_at_threshold(self, tmp_path):
        """Matches just under threshold should NOT be deleted, just over should be."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        now = datetime.now(timezone.utc)
        # Just under threshold (13 days, 23 hours) - should NOT be deleted
        under_threshold = now - timedelta(days=STALE_THRESHOLD_DAYS - 1, hours=23)
        # Just over threshold - should be deleted
        over_threshold = now - timedelta(days=STALE_THRESHOLD_DAYS, hours=1)

        with sqlite3.connect(db) as conn:
            _insert_match(conn, "under", "Under Co", 70, "Medium", under_threshold)
            _insert_match(conn, "over", "Over Co", 70, "Medium", over_threshold)

        deleted = delete_stale_matches(str(db))

        assert deleted == 1

        with sqlite3.connect(db) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT id FROM job_matches").fetchall()
            ids = [r["id"] for r in rows]
            assert "under" in ids
            assert "over" not in ids


class TestRecalculateMatchScores:
    """Tests for recalculate_match_scores function."""

    def test_recalculates_priority_high(self, tmp_path):
        """Score >= 75 should have High priority."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        now = datetime.now(timezone.utc)
        with sqlite3.connect(db) as conn:
            # Score 80 but wrong priority
            _insert_match(conn, "high-1", "Company A", 80, "Low", now)

        updated = recalculate_match_scores(str(db))

        assert updated == 1

        with sqlite3.connect(db) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT application_priority FROM job_matches WHERE id = ?",
                ("high-1",),
            ).fetchone()
            assert row["application_priority"] == "High"

    def test_recalculates_priority_medium(self, tmp_path):
        """Score >= 50 and < 75 should have Medium priority."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        now = datetime.now(timezone.utc)
        with sqlite3.connect(db) as conn:
            # Score 60 but wrong priority
            _insert_match(conn, "med-1", "Company B", 60, "High", now)

        updated = recalculate_match_scores(str(db))

        assert updated == 1

        with sqlite3.connect(db) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT application_priority FROM job_matches WHERE id = ?",
                ("med-1",),
            ).fetchone()
            assert row["application_priority"] == "Medium"

    def test_recalculates_priority_low(self, tmp_path):
        """Score < 50 should have Low priority."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        now = datetime.now(timezone.utc)
        with sqlite3.connect(db) as conn:
            # Score 40 but wrong priority
            _insert_match(conn, "low-1", "Company C", 40, "High", now)

        updated = recalculate_match_scores(str(db))

        assert updated == 1

        with sqlite3.connect(db) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT application_priority FROM job_matches WHERE id = ?",
                ("low-1",),
            ).fetchone()
            assert row["application_priority"] == "Low"

    def test_updates_timestamp(self, tmp_path):
        """Should update the updated_at timestamp."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        old_time = datetime.now(timezone.utc) - timedelta(days=1)
        with sqlite3.connect(db) as conn:
            _insert_match(conn, "test-1", "Company", 75, "High", old_time)
            # Set updated_at to old time
            conn.execute(
                "UPDATE job_matches SET updated_at = ? WHERE id = ?",
                (old_time.isoformat(), "test-1"),
            )

        recalculate_match_scores(str(db))

        with sqlite3.connect(db) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT updated_at FROM job_matches WHERE id = ?",
                ("test-1",),
            ).fetchone()
            updated_at = datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00"))
            # Should be within last few seconds
            assert (datetime.now(timezone.utc) - updated_at).total_seconds() < 10

    def test_handles_multiple_matches(self, tmp_path):
        """Should process all matches correctly."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        now = datetime.now(timezone.utc)
        with sqlite3.connect(db) as conn:
            _insert_match(conn, "m1", "Company A", 90, "Low", now)  # Should be High
            _insert_match(conn, "m2", "Company B", 65, "High", now)  # Should be Medium
            _insert_match(conn, "m3", "Company C", 30, "Medium", now)  # Should be Low
            _insert_match(conn, "m4", "Company D", 75, "High", now)  # Already correct

        updated = recalculate_match_scores(str(db))

        assert updated == 4

        with sqlite3.connect(db) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT id, application_priority FROM job_matches ORDER BY id"
            ).fetchall()
            priorities = {r["id"]: r["application_priority"] for r in rows}

            assert priorities["m1"] == "High"
            assert priorities["m2"] == "Medium"
            assert priorities["m3"] == "Low"
            assert priorities["m4"] == "High"

    def test_empty_table(self, tmp_path):
        """Should handle empty table gracefully."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        updated = recalculate_match_scores(str(db))

        assert updated == 0


class TestRunMaintenance:
    """Tests for run_maintenance orchestration function."""

    def test_runs_both_operations(self, tmp_path):
        """Should delete stale and recalculate scores."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        now = datetime.now(timezone.utc)
        old_date = now - timedelta(days=STALE_THRESHOLD_DAYS + 5)
        recent_date = now - timedelta(days=1)

        with sqlite3.connect(db) as conn:
            # Stale match - should be deleted
            _insert_match(conn, "stale-1", "Old Co", 80, "High", old_date)
            # Recent match with wrong priority - should be updated
            _insert_match(conn, "recent-1", "New Co", 60, "High", recent_date)

        results = run_maintenance(str(db))

        assert results["success"] is True
        assert results["deleted_count"] == 1
        assert results["updated_count"] == 1
        assert results["error"] is None

        # Verify final state
        with sqlite3.connect(db) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT id, application_priority FROM job_matches").fetchall()
            assert len(rows) == 1
            assert rows[0]["id"] == "recent-1"
            assert rows[0]["application_priority"] == "Medium"

    def test_returns_error_on_failure(self, tmp_path):
        """Should capture errors and return them in results."""
        # Use a non-existent path to trigger an error
        db = tmp_path / "nonexistent" / "test.db"

        results = run_maintenance(str(db))

        assert results["success"] is False
        assert results["error"] is not None

    def test_empty_database(self, tmp_path):
        """Should handle empty database gracefully."""
        db = tmp_path / "test.db"
        _bootstrap_db(db)

        results = run_maintenance(str(db))

        assert results["success"] is True
        assert results["deleted_count"] == 0
        assert results["updated_count"] == 0


class TestStaleThreshold:
    """Tests to verify the STALE_THRESHOLD_DAYS constant."""

    def test_threshold_is_14_days(self):
        """Verify the threshold is set to 14 days (2 weeks)."""
        assert STALE_THRESHOLD_DAYS == 14
