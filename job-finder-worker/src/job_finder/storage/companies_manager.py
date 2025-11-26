"""SQLite-backed companies manager."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from job_finder.exceptions import InvalidStateTransition, StorageError
from job_finder.job_queue.models import CompanyStatus
from job_finder.storage.sqlite_client import sqlite_connection
from job_finder.utils.company_name_utils import clean_company_name, normalize_company_name

logger = logging.getLogger(__name__)


DEFAULT_ANALYSIS_PROGRESS = {
    "fetch": False,
    "extract": False,
    "analyze": False,
    "save": False,
}

VALID_COMPANY_TRANSITIONS = {
    CompanyStatus.PENDING: {CompanyStatus.ANALYZING},
    CompanyStatus.ANALYZING: {CompanyStatus.ACTIVE, CompanyStatus.FAILED},
    CompanyStatus.ACTIVE: {CompanyStatus.ANALYZING},  # Allows re-analysis
    CompanyStatus.FAILED: {CompanyStatus.PENDING},
}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CompaniesManager:
    """Manage the `companies` table."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #

    def _row_to_company(self, row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not row:
            return None

        tech_stack = []
        if row.get("tech_stack"):
            try:
                parsed = json.loads(row["tech_stack"])
                if isinstance(parsed, list):
                    tech_stack = parsed
            except json.JSONDecodeError:
                tech_stack = []

        progress = DEFAULT_ANALYSIS_PROGRESS.copy()
        if row.get("analysis_progress"):
            try:
                parsed_progress = json.loads(row["analysis_progress"])
                if isinstance(parsed_progress, dict):
                    progress.update({k: bool(v) for k, v in parsed_progress.items()})
            except json.JSONDecodeError:
                pass

        return {
            "id": row["id"],
            "name": row["name"],
            "name_normalized": row["name_lower"],
            "website": row.get("website"),
            "about": row.get("about"),
            "culture": row.get("culture"),
            "mission": row.get("mission"),
            "size": row.get("size"),
            "companySizeCategory": row.get("company_size_category"),
            "founded": row.get("founded"),
            "industry": row.get("industry"),
            "headquartersLocation": row.get("headquarters_location"),
            "hasPortlandOffice": bool(row.get("has_portland_office", 0)),
            "techStack": tech_stack,
            "tier": row.get("tier"),
            "priorityScore": row.get("priority_score"),
            "analysis_status": row.get("analysis_status"),
            "analysis_progress": progress,
            "createdAt": row.get("created_at"),
            "updatedAt": row.get("updated_at"),
        }

    def _normalize_name(self, name: str) -> str:
        return normalize_company_name(name)

    def _validate_transition(self, current: CompanyStatus, new: CompanyStatus) -> None:
        allowed = VALID_COMPANY_TRANSITIONS.get(current, set()) | {current}
        if new not in allowed:
            raise InvalidStateTransition(
                f"Cannot transition company from {current.value} to {new.value}"
            )

    def _serialize_progress(self, progress: Optional[Dict[str, Any]]) -> str:
        merged = DEFAULT_ANALYSIS_PROGRESS.copy()
        if isinstance(progress, dict):
            merged.update({k: bool(v) for k, v in progress.items()})
        return json.dumps(merged)

    # ------------------------------------------------------------------ #
    # State helpers
    # ------------------------------------------------------------------ #

    def transition_status(self, company_id: str, new_status: CompanyStatus) -> None:
        company = self.get_company_by_id(company_id)
        try:
            current_status = (
                CompanyStatus(company["analysis_status"] or CompanyStatus.PENDING.value)
                if company
                else CompanyStatus.PENDING
            )
        except Exception:
            current_status = CompanyStatus.PENDING

        # Validate transition (allows no-op)
        self._validate_transition(current_status, new_status)

        if current_status == new_status:
            return

        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                "UPDATE companies SET analysis_status = ?, updated_at = ? WHERE id = ?",
                (new_status.value, _utcnow_iso(), company_id),
            )
        logger.debug(
            "Company %s status %s → %s", company_id, current_status.value, new_status.value
        )

    def update_analysis_progress(self, company_id: str, **stage_updates: bool) -> Dict[str, bool]:
        company = self.get_company_by_id(company_id) or {}
        current_progress = company.get("analysis_progress") or DEFAULT_ANALYSIS_PROGRESS.copy()
        updated_progress = {**DEFAULT_ANALYSIS_PROGRESS, **current_progress}

        for stage, done in stage_updates.items():
            if stage in updated_progress:
                updated_progress[stage] = bool(done)

        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                "UPDATE companies SET analysis_progress = ?, updated_at = ? WHERE id = ?",
                (json.dumps(updated_progress), _utcnow_iso(), company_id),
            )

        return updated_progress

    # ------------------------------------------------------------------ #
    # Queries
    # ------------------------------------------------------------------ #

    def get_company(self, company_name: str) -> Optional[Dict[str, Any]]:
        normalized = self._normalize_name(company_name)
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM companies WHERE name_lower = ? LIMIT 1", (normalized,)
            ).fetchone()
        return self._row_to_company(dict(row)) if row else None

    def get_company_by_id(self, company_id: str) -> Optional[Dict[str, Any]]:
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute("SELECT * FROM companies WHERE id = ?", (company_id,)).fetchone()
        return self._row_to_company(dict(row)) if row else None

    def batch_get_companies(self, company_ids: list[str]) -> Dict[str, Dict[str, Any]]:
        if not company_ids:
            return {}

        results: Dict[str, Dict[str, Any]] = {}
        chunk_size = 50
        with sqlite_connection(self.db_path) as conn:
            for idx in range(0, len(company_ids), chunk_size):
                chunk = company_ids[idx : idx + chunk_size]
                placeholders = ",".join("?" for _ in chunk)
                rows = conn.execute(
                    f"SELECT * FROM companies WHERE id IN ({placeholders})", tuple(chunk)
                ).fetchall()
                for row in rows:
                    company = self._row_to_company(dict(row))
                    if company:
                        results[company["id"]] = company
        return results

    # ------------------------------------------------------------------ #
    # Mutations
    # ------------------------------------------------------------------ #

    def save_company(self, company_data: Dict[str, Any]) -> str:
        name = company_data.get("name")
        if not name or not str(name).strip():
            raise StorageError("Company name is required")

        cleaned_name = clean_company_name(str(name)) or str(name).strip()
        normalized = self._normalize_name(cleaned_name)
        company_id = company_data.get("id")

        existing = self.get_company(cleaned_name)
        if existing and not company_id:
            company_id = existing["id"]

        existing_progress = existing.get("analysis_progress") if existing else None
        progress_payload = company_data.get("analysis_progress", existing_progress)

        desired_status_value = company_data.get("analysis_status") or (
            existing.get("analysis_status") if existing else CompanyStatus.PENDING.value
        )
        desired_status = CompanyStatus(desired_status_value)

        if existing:
            current_status = CompanyStatus(
                existing.get("analysis_status") or CompanyStatus.PENDING.value
            )
            self._validate_transition(current_status, desired_status)

        now = _utcnow_iso()
        has_portland_office = bool(
            company_data.get("hasPortlandOffice") or company_data.get("has_portland_office")
        )

        tech_stack = company_data.get("techStack") or company_data.get("tech_stack") or []
        if isinstance(tech_stack, str):
            tech_stack = [tech_stack]

        fields = {
            "name": cleaned_name,
            "name_lower": normalized,
            "website": company_data.get("website"),
            "about": company_data.get("about"),
            "culture": company_data.get("culture"),
            "mission": company_data.get("mission"),
            "size": company_data.get("size"),
            "company_size_category": company_data.get("companySizeCategory")
            or company_data.get("company_size_category"),
            "founded": company_data.get("founded"),
            "industry": company_data.get("industry"),
            "headquarters_location": company_data.get("headquartersLocation")
            or company_data.get("headquarters_location"),
            "has_portland_office": 1 if has_portland_office else 0,
            "tech_stack": json.dumps(tech_stack),
            "tier": company_data.get("tier"),
            "priority_score": company_data.get("priorityScore")
            or company_data.get("priority_score"),
            "analysis_status": desired_status.value,
            "analysis_progress": self._serialize_progress(progress_payload),
        }

        if company_id:
            with sqlite_connection(self.db_path) as conn:
                assignments = ", ".join(f"{col} = ?" for col in fields)
                params = list(fields.values()) + [now, company_id]
                conn.execute(
                    f"""
                    UPDATE companies
                    SET {assignments}, updated_at = ?
                    WHERE id = ?
                    """,
                    params,
                )
        else:
            company_id = str(uuid4())
            with sqlite_connection(self.db_path) as conn:
                columns = ", ".join(fields.keys())
                placeholders = ", ".join("?" for _ in fields)
                conn.execute(
                    f"""
                    INSERT INTO companies (
                        id, {columns}, created_at, updated_at
                    ) VALUES (
                        ?, {placeholders}, ?, ?
                    )
                    """,
                    [company_id, *fields.values(), now, now],
                )

        logger.info("Saved company %s (%s)", name, company_id)
        return company_id

    # ------------------------------------------------------------------ #
    # Convenience helpers
    # ------------------------------------------------------------------ #

    def has_good_company_data(self, company_data: Dict[str, Any]) -> bool:
        about_length = len(company_data.get("about", "") or "")
        culture_length = len(company_data.get("culture", "") or "")
        has_good_quality = about_length > 100 and culture_length > 50
        has_minimal_quality = about_length > 50 or culture_length > 25
        return has_good_quality or has_minimal_quality

    def create_company_stub(self, company_name: str, company_website: str = "") -> Dict[str, Any]:
        cleaned_name = clean_company_name(company_name) or company_name.strip()
        stub_data = {
            "name": cleaned_name,
            "website": company_website,
            "about": "",
            "culture": "",
            "mission": "",
            "size": "",
            "companySizeCategory": None,
            "headquartersLocation": "",
            "industry": "",
            "tier": "D",
            "priorityScore": 0,
            "analysis_status": CompanyStatus.PENDING.value,
            "analysis_progress": DEFAULT_ANALYSIS_PROGRESS.copy(),
        }
        company_id = self.save_company(stub_data)
        stub_data["id"] = company_id
        return stub_data

    def get_or_create_company(
        self,
        company_name: str,
        company_website: str = "",
        fetch_info_func=None,
    ) -> Dict[str, Any]:
        """
        Fetch a company if it exists; otherwise create a stub and optionally
        hydrate it using a supplied fetch function.

        Args:
            company_name: Name of the company
            company_website: Website URL (used for stub and optional fetch)
            fetch_info_func: Optional callable(company_name, company_website) -> dict
                              that returns rich company data to save.
        """
        existing = self.get_company(company_name)
        if existing:
            return existing

        # Create minimal stub first so we have an ID to hang data on
        stub = self.create_company_stub(company_name, company_website)

        # If we have a fetcher, try to enrich the stub immediately
        if fetch_info_func:
            try:
                fetched = fetch_info_func(company_name, company_website) or {}
                # Preserve ID and required fields; allow fetched data to override blanks
                fetched.setdefault("id", stub["id"])
                fetched.setdefault("name", company_name)
                fetched.setdefault("website", company_website)
                self.save_company(fetched)
                return self.get_company(company_name) or stub
            except Exception as exc:
                logger.warning("Failed to fetch company info for %s: %s", company_name, exc)

        return stub
