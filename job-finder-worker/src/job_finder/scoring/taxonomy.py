"""Minimal CSV-based skill taxonomy for deterministic term mapping.

Design goals:
- Single small table, no over-engineering.
- A few rows with comma/pipe separated synonyms.
- Unknown terms fall back to themselves (neutral) so scoring stays stable.

Matching semantics:
- SYNONYMS: Bidirectional equivalence. "node" = "node.js" = "nodejs"
  Both job requirements and user skills map to the same canonical form.

- IMPLIES: One-way qualification. "express implies rest"
  If user has "express" and job wants "rest", user qualifies (gets bonus).
  But if user has "rest" and job wants "express", NO match.
  This handles: frameworks → patterns, specific → general, etc.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from job_finder.storage.sqlite_client import sqlite_connection, utcnow_iso


@dataclass
class Taxon:
    canonical: str
    category: Optional[str]
    synonyms: List[str]
    implies: Set[str] = field(default_factory=set)  # Skills this one qualifies for


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
                    implies_csv TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                )
                """
            )
            # Migration: add implies_csv column if missing
            columns = [row[1] for row in conn.execute("PRAGMA table_info(skill_taxonomy)")]
            if "implies_csv" not in columns:
                conn.execute(
                    "ALTER TABLE skill_taxonomy ADD COLUMN implies_csv TEXT NOT NULL DEFAULT ''"
                )

    def _seed_if_empty(self):
        with sqlite_connection(self.db_path) as conn:
            (count,) = conn.execute("SELECT COUNT(*) FROM skill_taxonomy").fetchone()
            if count:
                return
            now = utcnow_iso()
            # Format: (canonical, category, synonyms_csv, implies_csv, updated_at)
            # implies_csv: skills this one qualifies user for (one-way)
            # Example: express implies rest - if user has express, they qualify for REST jobs
            seeds = [
                # Frontend frameworks - imply javascript
                ("react", "frontend", "react,reactjs,react.js", "javascript", now),
                ("nextjs", "frontend", "nextjs,next.js,next", "react,javascript", now),
                ("vue", "frontend", "vue,vuejs,vue.js", "javascript", now),
                ("angular", "frontend", "angular,angularjs", "javascript,typescript", now),
                ("svelte", "frontend", "svelte,sveltekit", "javascript", now),
                # Core languages
                ("javascript", "language", "javascript,js,ecmascript", "", now),
                ("typescript", "language", "typescript,ts", "javascript", now),  # TS implies JS
                ("python", "language", "python,py,python3", "", now),
                # Backend frameworks - imply their language + REST
                ("node.js", "backend", "node.js,nodejs,node", "javascript,rest", now),
                (
                    "express",
                    "backend",
                    "express,expressjs,express.js",
                    "node.js,javascript,rest",
                    now,
                ),
                ("fastapi", "backend", "fastapi,fast-api", "python,rest", now),
                ("django", "backend", "django", "python,rest", now),
                ("flask", "backend", "flask", "python,rest", now),
                # API patterns (no implies - these are the targets)
                ("graphql", "api", "graphql,gql", "", now),
                ("rest", "api", "rest,restful,restful api", "", now),
                # Cloud providers (no cross-implies - different platforms)
                ("aws", "cloud", "aws,amazon web services,amazon", "", now),
                ("gcp", "cloud", "gcp,google cloud platform,google cloud", "", now),
                ("azure", "cloud", "azure,microsoft azure", "", now),
                # Databases
                ("postgres", "database", "postgres,postgresql,psql", "sql", now),
                ("mysql", "database", "mysql,mariadb", "sql", now),
                ("mongodb", "database", "mongodb,mongo", "nosql", now),
                ("redis", "cache", "redis", "", now),
                ("sql", "database", "sql", "", now),
                ("nosql", "database", "nosql", "", now),
                # Container/orchestration
                ("docker", "devops", "docker,containers", "", now),
                (
                    "kubernetes",
                    "devops",
                    "kubernetes,k8s",
                    "docker",
                    now,
                ),  # K8s implies docker knowledge
            ]
            conn.executemany(
                "INSERT INTO skill_taxonomy (canonical, category, synonyms_csv, implies_csv, updated_at) VALUES (?,?,?,?,?)",
                seeds,
            )

    def load_lookup(self) -> Dict[str, Taxon]:
        """Return synonym -> Taxon lookup."""
        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT canonical, category, synonyms_csv, implies_csv FROM skill_taxonomy"
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
            # Parse implies_csv into a set of canonical skill names
            implies_csv = row["implies_csv"] or ""
            implies = {
                s.strip().lower() for s in implies_csv.replace("|", ",").split(",") if s.strip()
            }
            taxon = Taxon(row["canonical"], row["category"], synonyms, implies)
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

    def upsert(
        self,
        canonical: str,
        synonyms_csv: str,
        category: Optional[str] = None,
        implies_csv: str = "",
    ):
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO skill_taxonomy (canonical, category, synonyms_csv, implies_csv, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(canonical) DO UPDATE SET
                    category=excluded.category,
                    synonyms_csv=excluded.synonyms_csv,
                    implies_csv=excluded.implies_csv,
                    updated_at=excluded.updated_at
                """,
                (canonical, category, synonyms_csv, implies_csv, utcnow_iso()),
            )
