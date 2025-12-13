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
  NOTE: Implies is NOT transitive. If A implies B and B implies C, A does NOT
  automatically imply C. Each skill must explicitly list all skills it implies.

- PARALLELS: Bidirectional alternative. "aws parallel gcp"
  If user has "aws" and job wants "gcp", user doesn't get penalized for missing.
  But they don't get a bonus either - these are different platforms.
  This handles: cloud providers, competing frameworks (React/Vue), etc.
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
    implies: Set[str] = field(default_factory=set)  # Skills this one qualifies for (one-way)
    parallels: Set[str] = field(default_factory=set)  # Alternative skills (bidirectional)


class SkillTaxonomyRepository:
    """Loads and stores the minimal skill taxonomy."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path
        self._ensure_table()
        self._seed_if_empty()
        # Always ensure the core parallels/implies set exists (idempotent)
        # Some historical dev DBs have only placeholder rows; we insert the
        # curated seed set with INSERT OR IGNORE so local overrides survive.
        self._ensure_core_seeds()

    def _ensure_table(self):
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS skill_taxonomy (
                    canonical TEXT PRIMARY KEY,
                    category TEXT,
                    synonyms_csv TEXT NOT NULL,
                    implies_csv TEXT NOT NULL DEFAULT '',
                    parallels_csv TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                )
                """
            )
            # Migration: add columns if missing
            columns = [row[1] for row in conn.execute("PRAGMA table_info(skill_taxonomy)")]
            if "implies_csv" not in columns:
                conn.execute(
                    "ALTER TABLE skill_taxonomy ADD COLUMN implies_csv TEXT NOT NULL DEFAULT ''"
                )
            if "parallels_csv" not in columns:
                conn.execute(
                    "ALTER TABLE skill_taxonomy ADD COLUMN parallels_csv TEXT NOT NULL DEFAULT ''"
                )

    def _seed_if_empty(self):
        with sqlite_connection(self.db_path) as conn:
            (count,) = conn.execute("SELECT COUNT(*) FROM skill_taxonomy").fetchone()
            if count:
                return
            now = utcnow_iso()
            # Format: (canonical, category, synonyms_csv, implies_csv, parallels_csv, updated_at)
            # implies_csv: skills this one qualifies user for (one-way)
            # parallels_csv: alternative skills (bidirectional) - prevents penalty but no bonus
            seeds = [
                # Frontend frameworks - imply javascript, parallel to each other
                (
                    "react",
                    "frontend",
                    "react,reactjs,react.js",
                    "javascript",
                    "vue,angular,svelte",
                    now,
                ),
                ("nextjs", "frontend", "nextjs,next.js,next", "react,javascript", "", now),
                ("vue", "frontend", "vue,vuejs,vue.js", "javascript", "react,angular,svelte", now),
                (
                    "angular",
                    "frontend",
                    "angular,angularjs",
                    "javascript,typescript",
                    "react,vue,svelte",
                    now,
                ),
                ("svelte", "frontend", "svelte,sveltekit", "javascript", "react,vue,angular", now),
                # Core languages
                ("javascript", "language", "javascript,js,ecmascript", "", "", now),
                ("typescript", "language", "typescript,ts", "javascript", "", now),
                ("python", "language", "python,py,python3", "", "", now),
                # Backend frameworks - imply their language + REST
                # NOTE: Since implies is NOT transitive, we must explicitly list all
                # implied skills. Express lists "javascript" even though node.js also
                # implies it, because express->node.js->javascript won't be followed.
                ("node.js", "backend", "node.js,nodejs,node", "javascript,rest", "", now),
                (
                    "express",
                    "backend",
                    "express,expressjs,express.js",
                    "node.js,javascript,rest",  # All 3 needed since no transitive lookup
                    "fastapi,django,flask",
                    now,
                ),
                (
                    "fastapi",
                    "backend",
                    "fastapi,fast-api",
                    "python,rest",
                    "express,django,flask",
                    now,
                ),
                ("django", "backend", "django", "python,rest", "express,fastapi,flask", now),
                ("flask", "backend", "flask", "python,rest", "express,fastapi,django", now),
                # API patterns (no implies - these are the targets)
                ("graphql", "api", "graphql,gql", "", "rest", now),
                ("rest", "api", "rest,restful,restful api", "", "graphql", now),
                # Cloud providers - parallel to each other (different platforms)
                ("aws", "cloud", "aws,amazon web services,amazon", "", "gcp,azure", now),
                ("gcp", "cloud", "gcp,google cloud platform,google cloud", "", "aws,azure", now),
                ("azure", "cloud", "azure,microsoft azure", "", "aws,gcp", now),
                # Databases - SQL databases parallel, NoSQL databases parallel
                ("postgres", "database", "postgres,postgresql,psql", "sql", "mysql", now),
                ("mysql", "database", "mysql,mariadb", "sql", "postgres", now),
                ("mongodb", "database", "mongodb,mongo", "nosql", "", now),
                ("redis", "cache", "redis", "", "", now),
                ("sql", "database", "sql", "", "", now),
                ("nosql", "database", "nosql", "", "", now),
                # Container/orchestration
                ("docker", "devops", "docker,containers", "", "", now),
                ("kubernetes", "devops", "kubernetes,k8s", "docker", "", now),
            ]
            conn.executemany(
                "INSERT INTO skill_taxonomy (canonical, category, synonyms_csv, implies_csv, parallels_csv, updated_at) VALUES (?,?,?,?,?,?)",
                seeds,
            )

    def _ensure_core_seeds(self):
        """
        Ensure the curated seed set (with parallels/implies) exists.

        Runs on every initialization and uses INSERT OR IGNORE so it never overwrites
        local/custom rows. This is important for historical dev DBs that were created
        with placeholder rows (e.g., only canonical set, empty synonyms/implies/parallels).
        """
        with sqlite_connection(self.db_path) as conn:
            existing = {row[0] for row in conn.execute("SELECT canonical FROM skill_taxonomy")}
            # If the core cloud/parallel rows already exist, assume seeding happened.
            if {"aws", "gcp", "azure"}.issubset(existing):
                return

            now = utcnow_iso()
            seeds = [
                (
                    "react",
                    "frontend",
                    "react,reactjs,react.js",
                    "javascript",
                    "vue,angular,svelte",
                    now,
                ),
                ("nextjs", "frontend", "nextjs,next.js,next", "react,javascript", "", now),
                ("vue", "frontend", "vue,vuejs,vue.js", "javascript", "react,angular,svelte", now),
                (
                    "angular",
                    "frontend",
                    "angular,angularjs",
                    "javascript,typescript",
                    "react,vue,svelte",
                    now,
                ),
                ("svelte", "frontend", "svelte,sveltekit", "javascript", "react,vue,angular", now),
                ("javascript", "language", "javascript,js,ecmascript", "", "", now),
                ("typescript", "language", "typescript,ts", "javascript", "", now),
                ("python", "language", "python,py,python3", "", "", now),
                ("node.js", "backend", "node.js,nodejs,node", "javascript,rest", "", now),
                (
                    "express",
                    "backend",
                    "express,expressjs,express.js",
                    "node.js,javascript,rest",
                    "fastapi,django,flask",
                    now,
                ),
                (
                    "fastapi",
                    "backend",
                    "fastapi,fast-api",
                    "python,rest",
                    "express,django,flask",
                    now,
                ),
                ("django", "backend", "django", "python,rest", "express,fastapi,flask", now),
                ("flask", "backend", "flask", "python,rest", "express,fastapi,django", now),
                ("graphql", "api", "graphql,gql", "", "rest", now),
                ("rest", "api", "rest,restful,restful api", "", "graphql", now),
                ("aws", "cloud", "aws,amazon web services,amazon", "", "gcp,azure", now),
                ("gcp", "cloud", "gcp,google cloud platform,google cloud", "", "aws,azure", now),
                ("azure", "cloud", "azure,microsoft azure", "", "aws,gcp", now),
                ("postgres", "database", "postgres,postgresql,psql", "sql", "mysql", now),
                ("mysql", "database", "mysql,mariadb", "sql", "postgres", now),
                ("mongodb", "database", "mongodb,mongo", "nosql", "", now),
                ("redis", "cache", "redis", "", "", now),
                ("sql", "database", "sql", "", "", now),
                ("nosql", "database", "nosql", "", "", now),
                ("docker", "devops", "docker,containers", "", "", now),
                ("kubernetes", "devops", "kubernetes,k8s", "docker", "", now),
            ]
            conn.executemany(
                "INSERT OR IGNORE INTO skill_taxonomy (canonical, category, synonyms_csv, implies_csv, parallels_csv, updated_at) VALUES (?,?,?,?,?,?)",
                seeds,
            )

    def load_lookup(self) -> Dict[str, Taxon]:
        """Return synonym -> Taxon lookup."""
        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT canonical, category, synonyms_csv, implies_csv, parallels_csv FROM skill_taxonomy"
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
            # Parse parallels_csv into a set of canonical skill names
            parallels_csv = row["parallels_csv"] or ""
            parallels = {
                s.strip().lower() for s in parallels_csv.replace("|", ",").split(",") if s.strip()
            }
            taxon = Taxon(row["canonical"], row["category"], synonyms, implies, parallels)
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
        parallels_csv: str = "",
    ):
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO skill_taxonomy (canonical, category, synonyms_csv, implies_csv, parallels_csv, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(canonical) DO UPDATE SET
                    category=excluded.category,
                    synonyms_csv=excluded.synonyms_csv,
                    implies_csv=excluded.implies_csv,
                    parallels_csv=excluded.parallels_csv,
                    updated_at=excluded.updated_at
                """,
                (canonical, category, synonyms_csv, implies_csv, parallels_csv, utcnow_iso()),
            )
