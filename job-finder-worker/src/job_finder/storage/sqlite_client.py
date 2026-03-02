"""SQLite connection utilities for the worker."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

from job_finder.exceptions import ConfigurationError


def utcnow_iso() -> str:
    """Return current UTC time as ISO 8601 string.

    Consolidated utility used by all storage modules for timestamp fields.
    """
    return datetime.now(timezone.utc).isoformat()


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB_PATH = PROJECT_ROOT.parent / "infra" / "sqlite" / "jobfinder.db"


def resolve_db_path(db_path: Optional[str] = None) -> Path:
    """
    Resolve the SQLite database path using a single canonical env var.

    Order of precedence:
        1. Explicit db_path argument
        2. SQLITE_DB_PATH env var
        3. infra/sqlite/jobfinder.db inside the monorepo
    """
    path = db_path or os.getenv("SQLITE_DB_PATH") or str(DEFAULT_DB_PATH)

    resolved = Path(path).expanduser().resolve()

    if not resolved.exists():
        raise ConfigurationError(
            f"SQLite database not found at {resolved}. Set SQLITE_DB_PATH or run migrations."
        )

    return resolved


def _create_connection(resolved_path: Path) -> sqlite3.Connection:
    """Create a configured sqlite3 connection."""
    conn = sqlite3.connect(
        resolved_path, detect_types=sqlite3.PARSE_DECLTYPES, check_same_thread=False
    )
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    return conn


@contextmanager
def sqlite_connection(db_path: Optional[str] = None) -> Iterator[sqlite3.Connection]:
    """
    Context manager that yields a configured sqlite3 connection.

    Each call opens a fresh connection to avoid cross-thread issues.
    """
    resolved_path = resolve_db_path(db_path)
    conn = _create_connection(resolved_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
