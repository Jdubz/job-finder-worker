"""
Parity checks between worker models and @shared/types TypeScript definitions.

These tests parse the source TypeScript files (no ts-node dependency) and
compare literal unions and interface field sets against the worker's enums and
Pydantic models. The goal is early detection when shared contracts change.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, Set

from job_finder.ai.matcher import JobMatchResult
from job_finder.job_queue.models import (
    CompanySubTask,
    JobQueueItem,
    JobSubTask,
    QueueItemType,
    QueueStatus,
    SourceTier,
)


TS_SHARED_ROOT = Path(__file__).resolve().parents[2] / "shared" / "src"


# --------------------------------------------------------------------------- #
# Parsing helpers
# --------------------------------------------------------------------------- #


def _parse_union_literals(ts_path: Path, type_name: str) -> Set[str]:
    """Extract string literal union members from a TypeScript `type` definition."""
    lines = ts_path.read_text().splitlines()
    union_text = ""
    for idx, line in enumerate(lines):
        if re.search(rf"type\s+{type_name}\s*=", line):
            union_text = line
            j = idx + 1
            # Capture continuation lines if the union spans multiple lines
            while j < len(lines) and '"' in lines[j] and ';' not in union_text:
                union_text += lines[j]
                j += 1
            break

    if not union_text:
        raise AssertionError(f"Could not find union type {type_name} in {ts_path}")

    return set(re.findall(r'"([^"]+)"', union_text))


def _parse_interface_fields(ts_path: Path, interface: str) -> Set[str]:
    """Extract top-level property names from a TypeScript interface."""
    lines = ts_path.read_text().splitlines()
    start = None
    for idx, line in enumerate(lines):
        if re.match(rf"\s*export\s+interface\s+{interface}\s*{{", line):
            start = idx + 1
            break
    if start is None:
        raise AssertionError(f"Interface {interface} not found in {ts_path}")

    fields: Set[str] = set()
    for line in lines[start:]:
        if line.strip().startswith("}"):
            break
        m = re.match(r"\s*(\w+)\??\s*:", line)
        if m:
            fields.add(m.group(1))
    return fields


def _to_camel(name: str) -> str:
    parts = name.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


def _normalize_names(names: Iterable[str]) -> Set[str]:
    """Return a normalized set where snake_case and camelCase collapse together."""
    norm = set()
    for n in names:
        norm.add(n)
        norm.add(_to_camel(n))
    return norm


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #


def test_queue_enums_match_shared_types():
    ts_queue = TS_SHARED_ROOT / "queue.types.ts"

    assert _parse_union_literals(ts_queue, "QueueItemType") == {e.value for e in QueueItemType}
    assert _parse_union_literals(ts_queue, "QueueStatus") == {e.value for e in QueueStatus}
    assert _parse_union_literals(ts_queue, "JobSubTask") == {e.value for e in JobSubTask}
    assert _parse_union_literals(ts_queue, "CompanySubTask") == {e.value for e in CompanySubTask}
    assert _parse_union_literals(ts_queue, "SourceTier") == {e.value for e in SourceTier}


def test_queue_item_fields_cover_shared_contract():
    ts_queue = TS_SHARED_ROOT / "queue.types.ts"
    ts_fields = _parse_interface_fields(ts_queue, "QueueItem")

    worker_fields = set(JobQueueItem.model_fields.keys())
    worker_norm = _normalize_names(worker_fields)

    missing = {f for f in ts_fields if f not in worker_norm}
    assert not missing, f"Worker JobQueueItem missing fields: {missing}"


def test_job_listing_fields_cover_shared_contract():
    ts_job = TS_SHARED_ROOT / "job.types.ts"
    ts_fields = _parse_interface_fields(ts_job, "JobListing")

    worker_job_fields = {
        "title",
        "company",
        "company_website",
        "location",
        "description",
        "url",
        "posted_date",
        "salary",
        "company_info",
        "resume_intake_data",
        "company_id",
    }
    worker_norm = _normalize_names(worker_job_fields)
    missing = {f for f in ts_fields if f not in worker_norm}
    assert not missing, f"Worker job payload missing fields: {missing}"


def test_job_match_fields_cover_shared_contract():
    ts_job = TS_SHARED_ROOT / "job.types.ts"
    ts_fields = _parse_interface_fields(ts_job, "JobMatch")

    worker_match_fields = {
        "url",
        "company_name",
        "company_id",
        "job_title",
        "job_description",
        "location",
        "salary_range",
        "company_info",
        "match_score",
        "matched_skills",
        "missing_skills",
        "match_reasons",
        "key_strengths",
        "potential_concerns",
        "experience_match",
        "application_priority",
        "customization_recommendations",
        "resume_intake_data",
        "created_at",
        "updated_at",
        "analyzed_at",
        "id",
        "queue_item_id",
        "submitted_by",
    }

    worker_match_fields.update(JobMatchResult.model_fields.keys())

    worker_norm = _normalize_names(worker_match_fields)
    missing = {f for f in ts_fields if f not in worker_norm}
    assert not missing, f"Worker job match payload missing fields: {missing}"
