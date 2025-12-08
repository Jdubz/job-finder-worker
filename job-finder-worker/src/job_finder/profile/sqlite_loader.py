"""Profile loader backed by SQLite.

Loads user profile data from content_items table, including:
- Work experience with project highlights
- Skills with years of experience (from reducer)
- Professional summary (from narrative items)
- Education and projects
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from job_finder.exceptions import InitializationError
from job_finder.profile.schema import Education, Experience, Profile, Project, Skill
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
        name: Optional[str] = None,
        email: Optional[str] = None,
    ) -> Profile:
        """Load complete profile from content_items.

        Args:
            name: Override name (optional)
            email: Override email (optional)

        Returns:
            Profile with work experience, highlights, skills, education, projects
        """
        try:
            profile_row = self._fetch_user_row()
            experiences = self._load_experiences()
            skills = self._derive_skills_with_years()
            summary = self._load_summary()
            education = self._load_education()
            projects = self._load_projects()
            years_of_experience = self._get_total_experience_years()

            return Profile(
                name=name or profile_row.get("name") or "Job Finder User",
                email=email or profile_row.get("email"),
                location=profile_row.get("location"),
                summary=summary,
                years_of_experience=years_of_experience,
                skills=skills,
                experience=experiences,
                education=education,
                projects=projects,
                certifications=[],
                languages=[],
                preferences=None,
            )
        except Exception as exc:
            raise InitializationError(f"Failed to load profile: {exc}") from exc

    def _fetch_user_row(self) -> Dict[str, Any]:
        """Fetch the first user row from the users table."""
        query = "SELECT * FROM users LIMIT 1"

        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(query).fetchone()

        if not row:
            return {}
        return dict(row)

    def _load_experiences(self) -> List[Experience]:
        """Load work experiences with their project highlights.

        Queries work items (ai_context='work') and their child highlights,
        combining them into Experience objects with detailed achievements.
        """
        # Query work items only
        work_query = """
            SELECT * FROM content_items
            WHERE ai_context = 'work'
            ORDER BY datetime(start_date) DESC
        """

        # Query highlights grouped by parent
        highlight_query = """
            SELECT * FROM content_items
            WHERE ai_context = 'highlight'
            ORDER BY parent_id, order_index
        """

        with sqlite_connection(self.db_path) as conn:
            work_rows = conn.execute(work_query).fetchall()
            highlight_rows = conn.execute(highlight_query).fetchall()

        # Build lookup: parent_id -> list of highlights
        highlights_by_parent: Dict[str, List[Dict[str, Any]]] = {}
        for row in highlight_rows:
            highlight = dict(row)
            parent_id = highlight.get("parent_id")
            if parent_id:
                highlights_by_parent.setdefault(parent_id, []).append(highlight)

        experiences: List[Experience] = []
        for row in work_rows:
            work = dict(row)
            work_id = work.get("id")

            # Parse description field for bullet points
            description = work.get("description") or ""
            description_bullets = []
            if description:
                lines = description.split("\n")
                for line in lines:
                    stripped = line.strip()
                    if stripped.startswith("- "):
                        description_bullets.append(stripped[2:].strip())

            # Build achievements: highlights FIRST (more valuable detail), then description bullets
            achievements = []

            # Add highlights as key project achievements (these are the detailed project stories)
            work_highlights = highlights_by_parent.get(work_id, [])
            for highlight in work_highlights:
                h_title = highlight.get("title") or ""
                h_desc = highlight.get("description") or ""
                if h_title and h_desc:
                    # Format: "Project Name: Description"
                    achievements.append(f"{h_title}: {h_desc}")
                elif h_desc:
                    achievements.append(h_desc)

            # Add description bullets after highlights
            achievements.extend(description_bullets)

            # Parse skills JSON array
            skills_json = work.get("skills")
            technologies = _parse_json(skills_json, [])
            if isinstance(technologies, str):
                technologies = [tech.strip() for tech in technologies.split(",") if tech.strip()]

            experiences.append(
                Experience(
                    company=work.get("title") or "",  # title field holds company name
                    title=work.get("role") or "",  # role field holds job title
                    start_date=work.get("start_date") or "",
                    end_date=work.get("end_date"),
                    location=work.get("location") or "",
                    description=description,
                    responsibilities=[],
                    achievements=achievements,
                    technologies=technologies or [],
                    is_current=not work.get("end_date"),
                )
            )

        return experiences

    def _load_summary(self) -> Optional[str]:
        """Load professional summary from narrative overview item."""
        query = """
            SELECT description FROM content_items
            WHERE ai_context = 'narrative' AND id = 'overview'
            LIMIT 1
        """

        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(query).fetchone()

        if not row:
            return None

        description = row[0] or ""
        # Strip markdown header if present (e.g., "# Senior Full-Stack Engineer\n...")
        lines = description.strip().split("\n")
        if lines and lines[0].startswith("#"):
            lines = lines[1:]
        return "\n".join(lines).strip() or None

    def _load_education(self) -> List[Education]:
        """Load education items from content_items."""
        query = """
            SELECT * FROM content_items
            WHERE ai_context = 'education'
            ORDER BY order_index
        """

        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(query).fetchall()

        education_list: List[Education] = []
        for row in rows:
            item = dict(row)
            # title = institution, role = degree/program
            institution = item.get("title") or ""
            degree_info = item.get("role") or ""
            description = item.get("description") or ""

            # Extract honors from description if present
            honors = []
            if description:
                lines = description.split("\n")
                for line in lines:
                    stripped = line.strip()
                    if stripped.startswith("**") and stripped.endswith("**"):
                        # Bold text like **Regents scholar** is an honor
                        honors.append(stripped.strip("*").strip())
                    elif stripped.startswith("- "):
                        honors.append(stripped[2:].strip())

            education_list.append(
                Education(
                    institution=institution,
                    degree=degree_info,
                    field_of_study=None,
                    honors=honors,
                )
            )

        return education_list

    def _load_projects(self) -> List[Project]:
        """Load project items from content_items."""
        query = """
            SELECT * FROM content_items
            WHERE ai_context = 'project'
            ORDER BY order_index
        """

        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(query).fetchall()

        projects: List[Project] = []
        for row in rows:
            item = dict(row)
            name = item.get("title") or ""
            description = item.get("description") or ""

            # Parse skills JSON for technologies
            skills_json = item.get("skills")
            technologies = _parse_json(skills_json, [])
            if isinstance(technologies, str):
                technologies = [t.strip() for t in technologies.split(",") if t.strip()]

            projects.append(
                Project(
                    name=name,
                    description=description,
                    technologies=technologies or [],
                    highlights=[],
                )
            )

        return projects

    def _derive_skills_with_years(self) -> List[Skill]:
        """Derive skills with years of experience from reducer.

        Uses the reducer's skill_years calculation for accurate experience tracking.
        """
        from job_finder.profile.reducer import load_scoring_profile

        scoring_profile = load_scoring_profile(self.db_path)

        skills: List[Skill] = []
        for skill_name, years in scoring_profile.skill_years.items():
            # Infer level based on years
            level = self._infer_skill_level(years)
            skills.append(
                Skill(
                    name=skill_name,
                    level=level,
                    years_experience=years,
                )
            )

        # Sort by years descending, then by name
        skills.sort(key=lambda s: (-1 * (s.years_experience or 0), s.name.lower()))
        return skills

    def _infer_skill_level(self, years: float) -> str:
        """Infer skill proficiency level from years of experience."""
        if years >= 5:
            return "expert"
        elif years >= 3:
            return "advanced"
        elif years >= 1:
            return "intermediate"
        else:
            return "beginner"

    def _get_total_experience_years(self) -> float:
        """Get total years of professional experience from reducer."""
        from job_finder.profile.reducer import load_scoring_profile

        scoring_profile = load_scoring_profile(self.db_path)
        return scoring_profile.total_experience_years
