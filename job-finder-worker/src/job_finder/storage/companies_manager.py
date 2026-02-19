"""SQLite-backed companies manager."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional
from uuid import uuid4

from job_finder.exceptions import StorageError
from job_finder.storage.sqlite_client import sqlite_connection, utcnow_iso
from job_finder.utils.company_name_utils import (
    clean_company_name,
    normalize_company_name,
)

logger = logging.getLogger(__name__)


class CompaniesManager:
    """Manage the `companies` table."""

    def __init__(self, db_path: Optional[str] = None, sources_manager=None):
        self.db_path = db_path
        self.sources_manager = sources_manager

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

        return {
            "id": row["id"],
            "name": row["name"],
            "name_normalized": row["name_lower"],
            "website": row.get("website"),
            "about": row.get("about"),
            "culture": row.get("culture"),
            "mission": row.get("mission"),
            "companySizeCategory": row.get("company_size_category"),
            "industry": row.get("industry"),
            "headquartersLocation": row.get("headquarters_location"),
            "hasPortlandOffice": bool(row.get("has_portland_office", 0)),
            "isRemoteFirst": bool(row.get("is_remote_first", 0)),
            "aiMlFocus": bool(row.get("ai_ml_focus", 0)),
            "employeeCount": row.get("employee_count"),
            "timezoneOffset": row.get("timezone_offset"),
            "techStack": tech_stack,
            "createdAt": row.get("created_at"),
            "updatedAt": row.get("updated_at"),
        }

    def _normalize_name(self, name: str) -> str:
        return normalize_company_name(name)

    def _validate_website(self, website: Optional[str]) -> Optional[str]:
        """Validate and clean website URL, rejecting aggregator domains.

        Uses JobSourcesManager.is_job_board_url() for database-driven domain checking.

        Args:
            website: The website URL to validate

        Returns:
            The validated website URL, or None if it's an aggregator domain
        """
        if not website:
            return None

        # Use sources_manager for database-driven job board detection
        if self.sources_manager:
            if self.sources_manager.is_job_board_url(website):
                logger.warning(
                    "Rejecting aggregator URL as company website: %s",
                    website,
                )
                return None
        else:
            logger.debug(
                "Skipping aggregator URL validation for '%s' - sources_manager not provided",
                website,
            )

        return website

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
                    f"SELECT * FROM companies WHERE id IN ({placeholders})",
                    tuple(chunk),
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

        now = utcnow_iso()
        has_portland_office = bool(
            company_data.get("hasPortlandOffice") or company_data.get("has_portland_office")
        )

        tech_stack = company_data.get("techStack") or company_data.get("tech_stack") or []
        if isinstance(tech_stack, dict):
            tech_stack = list(tech_stack.values()) if tech_stack else []
        elif isinstance(tech_stack, str):
            tech_stack = [tech_stack]

        # Validate website - reject aggregator domains
        website = self._validate_website(company_data.get("website"))

        # Coerce text fields — AI responses occasionally return dicts for string fields,
        # which SQLite cannot bind.  Convert to JSON string if dict, else use as-is.
        def _text(val: object) -> object:
            if isinstance(val, dict):
                return json.dumps(val)
            if isinstance(val, list):
                return json.dumps(val)
            return val

        fields = {
            "name": cleaned_name,
            "name_lower": normalized,
            "website": website,
            "about": _text(company_data.get("about")),
            "culture": _text(company_data.get("culture")),
            "mission": _text(company_data.get("mission")),
            "company_size_category": _text(
                company_data.get("companySizeCategory") or company_data.get("company_size_category")
            ),
            "industry": _text(company_data.get("industry")),
            "headquarters_location": _text(
                company_data.get("headquartersLocation")
                or company_data.get("headquarters_location")
            ),
            "has_portland_office": 1 if has_portland_office else 0,
            "is_remote_first": (
                1 if company_data.get("isRemoteFirst") or company_data.get("is_remote_first") else 0
            ),
            "ai_ml_focus": (
                1 if company_data.get("aiMlFocus") or company_data.get("ai_ml_focus") else 0
            ),
            "employee_count": company_data.get("employeeCount")
            or company_data.get("employee_count"),
            "timezone_offset": company_data.get("timezoneOffset")
            or company_data.get("timezone_offset"),
            "tech_stack": json.dumps(tech_stack),
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
        """Return True when we have the minimal structured fields used by scoring.

        Good data if:
        - the record was updated after creation (enrichment ran), OR
        - we have size info AND location info (hq_location or locations array).
        """
        if not company_data:
            return False

        created_at = company_data.get("created_at") or company_data.get("createdAt")
        updated_at = company_data.get("updated_at") or company_data.get("updatedAt")
        if created_at and updated_at and str(updated_at) != str(created_at):
            return True

        has_size = bool(
            company_data.get("companySizeCategory")
            or company_data.get("employeeCount")
            or company_data.get("company_size_category")
            or company_data.get("employee_count")
        )

        has_location = bool(
            company_data.get("headquartersLocation") or company_data.get("headquarters_location")
        )

        return has_size and has_location

    def create_company_stub(self, company_name: str, company_website: str = "") -> Dict[str, Any]:
        cleaned_name = clean_company_name(company_name) or company_name.strip()
        stub_data = {
            "name": cleaned_name,
            "website": company_website,
            "about": "",
            "culture": "",
            "mission": "",
            "companySizeCategory": None,
            "headquartersLocation": "",
            "industry": "",
            "isRemoteFirst": False,
            "aiMlFocus": False,
            "employeeCount": None,
            "timezoneOffset": None,
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
