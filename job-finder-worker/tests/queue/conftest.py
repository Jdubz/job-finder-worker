"""Shared fixtures for queue tests.

Many queue tests instantiate JobProcessor whose __init__ calls
_build_scoring_engine → SkillTaxonomyRepository(db_path).  When tests
use a MagicMock config_loader without a real db_path the repository
falls back to resolve_db_path(None) which reads SQLITE_DB_PATH or the
monorepo default path.  In CI neither exists so the tests fail.

This conftest sets SQLITE_DB_PATH to a lightweight temp database for the
entire queue test session so the fallback always resolves.
"""

import os
import sqlite3
import tempfile

import pytest


@pytest.fixture(autouse=True, scope="session")
def _queue_test_db():
    """Point SQLITE_DB_PATH at a temp DB for the queue test session."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "queue-test.db")
        with sqlite3.connect(db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS skill_taxonomy (
                    canonical TEXT PRIMARY KEY,
                    category TEXT,
                    synonyms_csv TEXT NOT NULL,
                    implies_csv TEXT NOT NULL DEFAULT '',
                    parallels_csv TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                )
            """)
        old = os.environ.get("SQLITE_DB_PATH")
        os.environ["SQLITE_DB_PATH"] = db_path
        yield db_path
        if old is None:
            os.environ.pop("SQLITE_DB_PATH", None)
        else:
            os.environ["SQLITE_DB_PATH"] = old
