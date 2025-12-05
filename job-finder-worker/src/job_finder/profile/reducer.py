"""Reduce content_items rows into a scoring-ready profile.

Rules (2025-12-05 clarifications):
- Treat all ai_context items equally for skills.
- Overlapping date ranges count once per calendar month (longest coverage per month).
- A skill only accrues experience once per month even if multiple jobs share it.
- Highlights inherit the parent work item's date range.
- If a skill only appears in undated items, assign a 1-year baseline.
- Open-ended roles use today's date as end_date.
- Month-level granularity; round totals up to whole years.
- Empty content_items => zeroed profile.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime
from typing import Dict, Iterable, List, Optional, Set

import sqlite3

from job_finder.storage.sqlite_client import sqlite_connection


@dataclass
class ScoringProfile:
    skills: Set[str]
    skill_years: Dict[str, float]
    total_experience_years: float


def _normalize_skill(skill: str) -> str:
    """Lowercase + trim; remove common punctuation and collapse whitespace."""
    cleaned = skill.strip().lower()
    for ch in [",", ".", ";", ":", "(", ")", "[", "]", "{", "}"]:
        cleaned = cleaned.replace(ch, " ")
    cleaned = " ".join(cleaned.split())
    return cleaned


def _month_span(start: date, end: date) -> Set[str]:
    """Return set of YYYY-MM strings inclusive between start and end (inclusive of start month)."""
    if end < start:
        return set()
    months: Set[str] = set()
    year, month = start.year, start.month
    while (year, month) <= (end.year, end.month):
        months.add(f"{year:04d}-{month:02d}")
        # increment month
        month += 1
        if month == 13:
            month = 1
            year += 1
    return months


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        # Accept YYYY-MM or YYYY-MM-DD
        if len(value) == 7:
            return datetime.strptime(value, "%Y-%m").date()
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _round_up_years(months: int) -> float:
    if months <= 0:
        return 0.0
    return float(math.ceil(months / 12))


def build_analog_map(analog_groups: Iterable[Iterable[str]]) -> Dict[str, Set[str]]:
    """Build lookup of skill -> equivalent skills from grouped lists."""
    analog_map: Dict[str, Set[str]] = {}
    for group in analog_groups or []:
        if isinstance(group, str):
            entries = [p.strip() for p in group.split(",") if p.strip()]
        else:
            entries = list(group)
        group_set = {_normalize_skill(s) for s in entries if s}
        for skill in group_set:
            analog_map[skill] = group_set - {skill}
    return analog_map


def reduce_content_items(items: List[dict]) -> ScoringProfile:
    """Reduce raw content_items rows into skill years and totals."""
    if not items:
        return ScoringProfile(skills=set(), skill_years={}, total_experience_years=0.0)

    today = date.today()

    # Index for parent lookup (highlights inherit dates)
    by_id = {item.get("id"): item for item in items}

    skill_months: Dict[str, Set[str]] = {}
    all_skills: Set[str] = set()
    overall_months: Set[str] = set()
    undated_skills: Set[str] = set()

    for raw in items:
        skills_raw = raw.get("skills")
        if not skills_raw:
            normalized_skills: Set[str] = set()
        elif isinstance(skills_raw, str):
            skills_list = [s.strip() for s in skills_raw.split(",") if s.strip()]
            normalized_skills = {_normalize_skill(s) for s in skills_list if s}
        elif isinstance(skills_raw, (list, tuple)):
            normalized_skills = {_normalize_skill(s) for s in skills_raw if s}
        else:
            normalized_skills = set()

        all_skills.update(normalized_skills)

        start = _parse_date(raw.get("start_date"))
        end = _parse_date(raw.get("end_date"))

        # If highlight inherits parent dates
        if raw.get("ai_context") == "highlight" and raw.get("parent_id") and not start:
            parent = by_id.get(raw.get("parent_id"))
            if parent:
                start = _parse_date(parent.get("start_date")) or start
                end = _parse_date(parent.get("end_date")) or end

        if start:
            end = end or today
            months = _month_span(start, end)
            if not months:
                continue
            overall_months |= months
            for skill in normalized_skills:
                skill_months.setdefault(skill, set()).update(months)
        elif not start:
            # Items with only end_date (or neither) count as undated for baseline handling
            undated_skills.update(normalized_skills)

    # Add baseline for skills that only appear in undated items
    for skill in undated_skills:
        if skill not in skill_months:
            skill_months[skill] = {f"baseline-{i}" for i in range(12)}

    skill_years = {skill: _round_up_years(len(months)) for skill, months in skill_months.items()}
    total_experience_years = _round_up_years(len(overall_months))

    return ScoringProfile(
        skills=all_skills,
        skill_years=skill_years,
        total_experience_years=total_experience_years,
    )


def load_scoring_profile(db_path: Optional[str] = None) -> ScoringProfile:
    """Load content_items from SQLite and reduce to scoring profile."""
    try:
        with sqlite_connection(db_path) as conn:
            rows = conn.execute(
                "SELECT id, parent_id, ai_context, start_date, end_date, skills FROM content_items"
            ).fetchall()
        items = [dict(row) for row in rows]
        return reduce_content_items(items)
    except sqlite3.OperationalError:
        # Table not present (e.g., in unit tests using stub DB) -> zero profile
        return ScoringProfile(skills=set(), skill_years={}, total_experience_years=0.0)
