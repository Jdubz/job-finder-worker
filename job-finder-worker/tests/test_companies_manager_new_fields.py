"""Verify CompaniesManager persists new company influence fields."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import sqlite_vec

from job_finder.storage.companies_manager import CompaniesManager


def _apply_migrations(db_path: Path) -> None:
    migrations_dir = Path(__file__).resolve().parents[2] / "infra" / "sqlite" / "migrations"
    with sqlite3.connect(db_path) as conn:
        conn.enable_load_extension(True)
        sqlite_vec.load(conn)
        conn.enable_load_extension(False)
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS config (
              id TEXT PRIMARY KEY,
              payload_json TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              updated_by TEXT
            );
            """)
        vec0_unavailable = False
        for sql_file in sorted(migrations_dir.glob("*.sql")):
            if vec0_unavailable and sql_file.name.startswith(("051", "052")):
                continue
            try:
                conn.executescript(sql_file.read_text())
            except sqlite3.OperationalError as exc:
                if "vec0" in str(exc):
                    vec0_unavailable = True
                else:
                    raise


def test_save_company_persists_influence_fields(tmp_path: Path):
    db_path = tmp_path / "companies.db"
    _apply_migrations(db_path)

    manager = CompaniesManager(str(db_path))

    company_id = manager.save_company(
        {
            "name": "Influence Inc",
            "website": "https://influence.example",
            "isRemoteFirst": True,
            "aiMlFocus": True,
            "employeeCount": 1200,
            "timezoneOffset": -5,
        }
    )

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT is_remote_first, ai_ml_focus, employee_count, timezone_offset FROM companies WHERE id = ?",
            (company_id,),
        ).fetchone()

    assert row["is_remote_first"] == 1
    assert row["ai_ml_focus"] == 1
    assert row["employee_count"] == 1200
    assert row["timezone_offset"] == -5
