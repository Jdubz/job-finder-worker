"""Tests for CompaniesManager persistence helpers."""

from __future__ import annotations

import json
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


def test_save_company_coerces_dict_text_fields(tmp_path: Path):
    """AI occasionally returns dicts for text fields — save_company must coerce them."""
    db_path = tmp_path / "companies.db"
    _apply_migrations(db_path)

    manager = CompaniesManager(str(db_path))

    company_id = manager.save_company(
        {
            "name": "Instructure",
            "website": "https://instructure.com",
            "about": {"summary": "Ed-tech company", "details": "Canvas LMS"},
            "culture": {"values": ["innovation", "collaboration"]},
            "mission": {"statement": "Inspire learning"},
            "techStack": {"frontend": "React", "backend": "Ruby"},
        }
    )

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT about, culture, mission, tech_stack FROM companies WHERE id = ?",
            (company_id,),
        ).fetchone()

    # Dict fields should be coerced to human-readable strings
    assert isinstance(row["about"], str)
    assert "Ed-tech company" in row["about"]
    assert "Canvas LMS" in row["about"]
    assert isinstance(row["culture"], str)
    assert isinstance(row["mission"], str)
    assert "Inspire learning" in row["mission"]
    # tech_stack dict should have been converted to a JSON list of its values
    assert isinstance(row["tech_stack"], str)
    tech_stack_parsed = json.loads(row["tech_stack"])
    assert isinstance(tech_stack_parsed, list)
    assert "React" in tech_stack_parsed
    assert "Ruby" in tech_stack_parsed


def test_save_company_coerces_dict_text_fields_on_update(tmp_path: Path):
    """Dict coercion should also work when updating an existing company."""
    db_path = tmp_path / "companies.db"
    _apply_migrations(db_path)

    manager = CompaniesManager(str(db_path))

    # First create a stub company so there is an existing row to update
    stub = manager.create_company_stub("Instructure Careers", "https://instructure.com")

    # Now update that company, passing dicts for text fields to exercise UPDATE path
    updated_id = manager.save_company(
        {
            "id": stub["id"],
            "name": "Instructure",
            "website": "https://instructure.com",
            "about": {"summary": "Ed-tech company", "details": "Canvas LMS"},
            "culture": {"values": ["innovation", "collaboration"]},
            "mission": {"statement": "Inspire learning"},
            "techStack": {"frontend": "React", "backend": "Ruby"},
        }
    )

    assert updated_id == stub["id"]

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT about, culture, mission, tech_stack FROM companies WHERE id = ?",
            (updated_id,),
        ).fetchone()

    assert isinstance(row["about"], str)
    assert "Ed-tech company" in row["about"]
    assert isinstance(row["culture"], str)
    assert isinstance(row["mission"], str)
    tech_stack_parsed = json.loads(row["tech_stack"])
    assert isinstance(tech_stack_parsed, list)
    assert "React" in tech_stack_parsed


def test_save_company_handles_none_and_empty_values(tmp_path: Path):
    """save_company should handle None and empty container values without SQLite binding errors."""
    db_path = tmp_path / "companies.db"
    _apply_migrations(db_path)

    manager = CompaniesManager(str(db_path))

    company_id = manager.save_company(
        {
            "name": "EdgeCaseCorp",
            "website": "https://edgecase.example",
            "about": None,
            "culture": {},
            "mission": [],
            "techStack": [],
        }
    )

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT about, culture, mission, tech_stack FROM companies WHERE id = ?",
            (company_id,),
        ).fetchone()

    assert row is not None
    for field in ("about", "culture", "mission", "tech_stack"):
        value = row[field]
        assert value is None or isinstance(value, str)


def test_save_company_handles_non_string_scalar_values(tmp_path: Path):
    """save_company should tolerate scalar non-string values (bool/int/float) for text fields."""
    db_path = tmp_path / "companies.db"
    _apply_migrations(db_path)

    manager = CompaniesManager(str(db_path))

    company_id = manager.save_company(
        {
            "name": "ScalarCorp",
            "website": "https://scalar.example",
            "about": True,
            "culture": 42,
            "mission": 3.14,
            "techStack": "Python",
        }
    )

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT about, culture, mission, tech_stack FROM companies WHERE id = ?",
            (company_id,),
        ).fetchone()

    assert row is not None
    for field in ("about", "culture", "mission"):
        assert row[field] is not None
        assert isinstance(row[field], str)
