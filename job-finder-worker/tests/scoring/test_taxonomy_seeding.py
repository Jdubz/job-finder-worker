import sqlite3
from pathlib import Path

from job_finder.scoring.taxonomy import SkillTaxonomyRepository


def test_ensure_core_seeds_inserts_missing_core_rows(tmp_path: Path):
    db_path = tmp_path / "tax.db"

    # Create table with a placeholder row so _seed_if_empty() will no-op
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE skill_taxonomy (
                canonical TEXT PRIMARY KEY,
                category TEXT,
                synonyms_csv TEXT NOT NULL,
                implies_csv TEXT NOT NULL DEFAULT '',
                parallels_csv TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            )
            """)
        conn.execute(
            "INSERT INTO skill_taxonomy (canonical, category, synonyms_csv, implies_csv, parallels_csv, updated_at) VALUES (?,?,?,?,?,datetime('now'))",
            (
                "python",
                "language",
                "python",
                "",
                "",
            ),
        )

    repo = SkillTaxonomyRepository(db_path=str(db_path))

    lookup = repo.load_lookup()

    # Core cloud parallels should have been inserted even though table was non-empty
    assert "aws" in lookup
    assert "gcp" in lookup
    assert "azure" in lookup

    # Custom placeholder should remain untouched
    assert lookup["python"].canonical == "python"
