"""Tests for CompaniesManager persistence helpers."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from job_finder.storage.companies_manager import CompaniesManager


def _apply_migrations(db_path: Path) -> None:
    # Migrations are at monorepo root: job-finder-bot/infra/sqlite/migrations
    migrations_dir = Path(__file__).resolve().parents[2] / "infra" / "sqlite" / "migrations"
    with sqlite3.connect(db_path) as conn:
        for sql_file in sorted(migrations_dir.glob("*.sql")):
            conn.executescript(sql_file.read_text())


def test_save_company_strips_careers_suffix(tmp_path: Path):
    db_path = tmp_path / "companies.db"
    _apply_migrations(db_path)

    manager = CompaniesManager(str(db_path))

    company_id = manager.save_company({"name": "Acme Careers", "website": "https://acme.example"})

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT name, name_lower FROM companies WHERE id = ?", (company_id,)
        ).fetchone()

    assert row["name"] == "Acme"
    assert row["name_lower"] == "acme"


def test_stub_creation_returns_clean_name(tmp_path: Path):
    db_path = tmp_path / "companies.db"
    _apply_migrations(db_path)

    manager = CompaniesManager(str(db_path))

    stub = manager.create_company_stub("Cloudflare | Careers", "https://cloudflare.com")

    assert stub["name"] == "Cloudflare"

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT name, name_lower FROM companies WHERE id = ?", (stub["id"],)
        ).fetchone()

    assert row["name"] == "Cloudflare"
    assert row["name_lower"] == "cloudflare"
