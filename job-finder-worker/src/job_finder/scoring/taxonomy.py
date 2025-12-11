"""Minimal CSV-based skill taxonomy for deterministic term mapping.

Design goals:
- Single small table, no over-engineering.
- A few rows with comma/pipe separated synonyms.
- Unknown terms fall back to themselves (neutral) so scoring stays stable.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from job_finder.storage.sqlite_client import sqlite_connection, utcnow_iso


@dataclass
class Taxon:
    canonical: str
    category: Optional[str]
    synonyms: List[str]


class SkillTaxonomyRepository:
    """Loads and stores the minimal skill taxonomy."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path
        self._ensure_table()
        self._seed_if_empty()

    def _ensure_table(self):
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS skill_taxonomy (
                    canonical TEXT PRIMARY KEY,
                    category TEXT,
                    synonyms_csv TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def _seed_if_empty(self):
        with sqlite_connection(self.db_path) as conn:
            (count,) = conn.execute("SELECT COUNT(*) FROM skill_taxonomy").fetchone()
            if count:
                return
            now = utcnow_iso()
            seeds = [
                ("react", "frontend", "react", now),
                ("nextjs", "frontend", "nextjs,next.js", now),
                ("javascript", "frontend", "javascript,js", now),
                ("typescript", "frontend", "typescript,ts", now),
                ("node.js", "backend", "node.js,nodejs,node", now),
                ("python", "backend", "python,py", now),
                ("graphql", "api", "graphql", now),
                ("rest", "api", "rest,restful,api", now),
                ("aws", "cloud", "aws,amazon web services", now),
                ("gcp", "cloud", "gcp,google cloud platform", now),
                ("azure", "cloud", "azure", now),
                ("postgres", "database", "postgres,postgresql", now),
                ("redis", "cache", "redis", now),
            ]
            conn.executemany(
                "INSERT INTO skill_taxonomy (canonical, category, synonyms_csv, updated_at) VALUES (?,?,?,?)",
                seeds,
            )

    def load_lookup(self) -> Dict[str, Taxon]:
        """Return synonym -> Taxon lookup."""
        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT canonical, category, synonyms_csv FROM skill_taxonomy"
            ).fetchall()
        lookup: Dict[str, Taxon] = {}
        for row in rows:
            synonyms = [
                s.strip().lower()
                for s in row["synonyms_csv"].replace("|", ",").split(",")
                if s.strip()
            ]
            if row["canonical"].lower() not in synonyms:
                synonyms.append(row["canonical"].lower())
            taxon = Taxon(row["canonical"], row["category"], synonyms)
            for term in synonyms:
                lookup[term] = taxon
        return lookup

    def list_rows(self) -> List[Dict[str, str]]:
        """Return all rows for prompting/inspection."""
        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT canonical, category, synonyms_csv FROM skill_taxonomy"
            ).fetchall()
        return [
            {
                "canonical": row["canonical"],
                "category": row["category"],
                "synonyms": row["synonyms_csv"],
            }
            for row in rows
        ]

    def upsert(self, canonical: str, synonyms_csv: str, category: Optional[str] = None):
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO skill_taxonomy (canonical, category, synonyms_csv, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(canonical) DO UPDATE SET
                    category=excluded.category,
                    synonyms_csv=excluded.synonyms_csv,
                    updated_at=excluded.updated_at
                """,
                (canonical, category, synonyms_csv, utcnow_iso()),
            )
