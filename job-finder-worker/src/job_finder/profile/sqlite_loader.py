"""Profile loader backed by SQLite."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from job_finder.exceptions import InitializationError
from job_finder.profile.schema import Experience, Profile, Skill
from job_finder.storage.sqlite_client import sqlite_connection

logger = logging.getLogger(__name__)


def _parse_json(value: Optional[str], default):
    if not value:
        return default
    try:
        parsed = json.loads(value)
        return parsed
    except json.JSONDecodeError:
        return default


class SQLiteProfileLoader:
    """Load profile data from local SQLite tables."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def load_profile(
        self,
        user_id: Optional[str] = None,
        name: Optional[str] = None,
        email: Optional[str] = None,
    ) -> Profile:
        try:
            profile_row = self._fetch_user_row(user_id)
            experiences = self._load_experiences(user_id)
            skills = self._derive_skills(experiences)

            return Profile(
                name=name or profile_row.get("name") or "Job Finder User",
                email=email or profile_row.get("email"),
                location=profile_row.get("location"),
                summary=profile_row.get("summary"),
                years_of_experience=profile_row.get("years_of_experience"),
                skills=skills,
                experience=experiences,
                education=[],
                projects=[],
                certifications=[],
                languages=[],
                preferences=None,
            )
        except Exception as exc:
            raise InitializationError(f"Failed to load profile: {exc}") from exc

    def _fetch_user_row(self, user_id: Optional[str]) -> Dict[str, Any]:
        query = "SELECT * FROM users"
        params: List[Any] = []
        if user_id:
            query += " WHERE id = ?"
            params.append(user_id)
        query += " LIMIT 1"

        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(query, tuple(params)).fetchone()

        if not row:
            return {}
        return dict(row)

    def _load_experiences(self, user_id: Optional[str]) -> List[Experience]:
        # Query root-level content_items (no parent) that represent work experience
        query = """
            SELECT * FROM content_items
            WHERE parent_id IS NULL
            ORDER BY datetime(start_date) DESC
        """
        params: List[Any] = []

        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(query, tuple(params)).fetchall()

        experiences: List[Experience] = []
        for row in rows:
            # Convert sqlite3.Row to dict for .get() access
            row = dict(row)
            # Parse description field for bullet points (achievements)
            description = row.get("description") or ""
            achievements = []
            if description:
                # Extract bullet points from markdown description
                lines = description.split("\n")
                for line in lines:
                    stripped = line.strip()
                    if stripped.startswith("- "):
                        achievements.append(stripped[2:].strip())

            # Parse skills JSON array
            skills_json = row.get("skills")
            technologies = _parse_json(skills_json, [])
            if isinstance(technologies, str):
                technologies = [tech.strip() for tech in technologies.split(",") if tech.strip()]

            experiences.append(
                Experience(
                    company=row.get("title", ""),  # title field holds company name
                    title=row.get("role", ""),  # role field holds job title
                    start_date=row.get("start_date", ""),
                    end_date=row.get("end_date"),
                    location=row.get("location"),
                    description=description,
                    responsibilities=[],
                    achievements=achievements or [],
                    technologies=technologies or [],
                    is_current=not row.get("end_date"),
                )
            )

        return experiences

    def _derive_skills(self, experiences: List[Experience]) -> List[Skill]:
        skill_counts: Dict[str, int] = {}
        for experience in experiences:
            for tech in experience.technologies:
                skill_counts[tech] = skill_counts.get(tech, 0) + 1

        skills = [
            Skill(name=name, level=None, years_experience=None)
            for name in sorted(skill_counts.keys())
        ]
        return skills
