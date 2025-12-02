"""SQLite-backed job sources manager."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from job_finder.exceptions import (
    DuplicateSourceError,
    InvalidStateTransition,
    StorageError,
)
from job_finder.job_queue.models import SourceStatus
from job_finder.storage.sqlite_client import sqlite_connection
from job_finder.utils.company_name_utils import normalize_company_name

logger = logging.getLogger(__name__)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


VALID_SOURCE_TRANSITIONS = {
    SourceStatus.ACTIVE: {
        SourceStatus.DISABLED,
        SourceStatus.FAILED,
    },
    SourceStatus.DISABLED: {SourceStatus.ACTIVE},
    SourceStatus.FAILED: {SourceStatus.ACTIVE},
}


class JobSourcesManager:
    """Manage the `job_sources` table."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def _validate_transition(self, current: SourceStatus, new: SourceStatus) -> None:
        allowed = VALID_SOURCE_TRANSITIONS.get(current, set()) | {current}
        if new not in allowed:
            raise InvalidStateTransition(
                f"Invalid source transition from {current.value} to {new.value}"
            )

    def _row_to_source(self, row: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not row:
            return None

        def parse_json(value: Optional[str], default):
            if not value:
                return default
            try:
                parsed = json.loads(value)
                return parsed
            except json.JSONDecodeError:
                return default

        config = parse_json(row["config_json"], {})

        return {
            "id": row["id"],
            "name": row["name"],
            "sourceType": row["source_type"],
            "status": row["status"],
            "config": config,
            "tags": parse_json(row.get("tags"), []),
            "companyId": row.get("company_id"),
            "aggregatorDomain": row.get("aggregator_domain"),
            "lastScrapedAt": row.get("last_scraped_at"),
            "createdAt": row.get("created_at"),
            "updatedAt": row.get("updated_at"),
            "disabledNotes": config.get("disabled_notes"),
        }

    # ------------------------------------------------------------------ #
    # CRUD
    # ------------------------------------------------------------------ #

    def add_source(
        self,
        name: str,
        source_type: str,
        config: Dict[str, Any],
        company_id: Optional[str] = None,
        aggregator_domain: Optional[str] = None,
        tags: Optional[List[str]] = None,
        status: SourceStatus = SourceStatus.ACTIVE,
    ) -> str:
        """Add a new job source.

        Args:
            name: Unique name for the source
            source_type: Type of source (api, rss, html)
            config: Configuration dict for the source
            company_id: FK to company if this is a company-specific source
            aggregator_domain: Domain if this is an aggregator (e.g., "greenhouse.io")
            tags: Optional list of tags
            status: Initial status (default: ACTIVE)

        Returns:
            The ID of the newly created source

        Raises:
            DuplicateSourceError: If a source with this name already exists
            ValueError: If neither company_id nor aggregator_domain is provided
        """
        # Every source must be EITHER company-specific OR an aggregator
        if not company_id and not aggregator_domain:
            raise ValueError(
                f"Source '{name}' must have either company_id (company-specific) "
                "or aggregator_domain (job board platform)"
            )

        # Check for existing source with same name
        existing = self.get_source_by_name(name)
        if existing:
            raise DuplicateSourceError(name=name, existing_id=existing["id"])

        source_id = str(uuid4())
        now = _utcnow_iso()

        # Persist disabled_notes in config for visibility (no dedicated column yet)
        disabled_notes = config.get("disabled_notes")
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO job_sources (
                    id, name, source_type, status, config_json, tags,
                    company_id, aggregator_domain, last_scraped_at,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                """,
                (
                    source_id,
                    name,
                    source_type,
                    status.value,
                    json.dumps(config),
                    json.dumps(tags or []),
                    company_id,
                    aggregator_domain,
                    now,
                    now,
                ),
            )

        logger.info("Added job source %s (%s)", name, source_id)
        if disabled_notes:
            logger.info("Source %s created disabled: %s", source_id, disabled_notes)
        return source_id

    def get_active_sources(
        self, source_type: Optional[str] = None, tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        query = "SELECT * FROM job_sources WHERE status = ?"
        params: List[Any] = [SourceStatus.ACTIVE.value]
        if source_type:
            query += " AND source_type = ?"
            params.append(source_type)

        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(query, tuple(params)).fetchall()

        sources = []
        for row in rows:
            source = self._row_to_source(dict(row))
            if not source:
                continue

            if tags:
                source_tags = set(source.get("tags") or [])
                if not source_tags.intersection(tags):
                    continue
            sources.append(source)
        return sources

    def get_source_by_id(self, source_id: str) -> Optional[Dict[str, Any]]:
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute("SELECT * FROM job_sources WHERE id = ?", (source_id,)).fetchone()
        return self._row_to_source(dict(row)) if row else None

    def get_source_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Get a source by its name.

        Args:
            name: The source name to look up

        Returns:
            Source dict if found, None otherwise
        """
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute("SELECT * FROM job_sources WHERE name = ?", (name,)).fetchone()
        return self._row_to_source(dict(row)) if row else None

    def get_source_for_url(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Simple heuristic: find the first source whose config contains the board token or URL domain.
        """
        normalized_url = url.lower()
        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM job_sources").fetchall()

        for row in rows:
            source = self._row_to_source(dict(row))
            if not source:
                continue
            config = source.get("config") or {}
            board_token = config.get("board_token") or ""
            base_url = config.get("url") or ""
            if board_token and board_token.lower() in normalized_url:
                return source
            if base_url and base_url.lower() in normalized_url:
                return source
        return None

    # ------------------------------------------------------------------ #
    # Updates
    # ------------------------------------------------------------------ #

    def update_scrape_status(
        self,
        source_id: str,
        status: str,
        error: Optional[str] = None,
    ) -> None:
        """Update scrape status after a scrape attempt."""
        now = _utcnow_iso()

        # Normalize status into SourceStatus
        status_lower = status.lower()
        if status_lower in ("success", "active"):
            normalized_status = SourceStatus.ACTIVE
        elif status_lower in ("error", "failed", SourceStatus.FAILED.value):
            normalized_status = SourceStatus.FAILED
        elif status_lower == SourceStatus.DISABLED.value:
            normalized_status = SourceStatus.DISABLED
        else:
            normalized_status = SourceStatus(status_lower)

        # Read current status for transition validation
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT status FROM job_sources WHERE id = ?",
                (source_id,),
            ).fetchone()
            if not row:
                raise StorageError(f"Source {source_id} not found")
            current_status = SourceStatus(row["status"])

        # Validate state transition
        self._validate_transition(current_status, normalized_status)

        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE job_sources
                SET last_scraped_at = ?,
                    status = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    now,
                    normalized_status.value,
                    now,
                    source_id,
                ),
            )

    def record_scraping_failure(self, source_id: str, error: str) -> None:
        self.update_scrape_status(
            source_id,
            status=SourceStatus.FAILED.value,
            error=error,
        )

    def record_scraping_success(self, source_id: str) -> None:
        self.update_scrape_status(
            source_id,
            status=SourceStatus.ACTIVE.value,
        )

    def create_from_discovery(
        self,
        name: str,
        source_type: str,
        config: Dict[str, Any],
        company_id: Optional[str] = None,
        aggregator_domain: Optional[str] = None,
        tags: Optional[List[str]] = None,
        status: SourceStatus = SourceStatus.ACTIVE,
    ) -> str:
        """Create a source from discovery process.

        Args:
            name: Unique name for the source
            source_type: Type of source (greenhouse, lever, api, rss, etc.)
            config: Configuration dict for the source
            company_id: FK to company if this is a company-specific source
            aggregator_domain: Domain if this is an aggregator platform
            tags: Optional list of tags
            status: Initial status (default: ACTIVE)

        Returns:
            The ID of the newly created source
        """
        return self.add_source(
            name=name,
            source_type=source_type,
            config=config,
            company_id=company_id,
            aggregator_domain=aggregator_domain,
            tags=tags,
            status=status,
        )

    def update_source_status(self, source_id: str, status: SourceStatus) -> None:
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT status FROM job_sources WHERE id = ?", (source_id,)
            ).fetchone()
            if not row:
                raise StorageError(f"Source {source_id} not found")

            current_status = SourceStatus(row["status"])
            self._validate_transition(current_status, status)

            conn.execute(
                """
                UPDATE job_sources
                SET status = ?, updated_at = ?
                WHERE id = ?
                """,
                (status.value, _utcnow_iso(), source_id),
            )

    def disable_source_with_note(self, source_id: str, reason: str) -> None:
        """
        Disable a source and record the reason in config.disabled_notes.

        This method transitions the source to DISABLED status and stores
        a timestamped note explaining why it was disabled (e.g., anti-bot
        protection detected, repeated failures, etc.).

        Args:
            source_id: The source ID to disable
            reason: Human-readable reason for disabling
        """
        now = _utcnow_iso()
        note = f"[{now}] {reason}"

        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT status, config_json FROM job_sources WHERE id = ?",
                (source_id,),
            ).fetchone()
            if not row:
                raise StorageError(f"Source {source_id} not found")

            current_status = SourceStatus(row["status"])
            self._validate_transition(current_status, SourceStatus.DISABLED)

            # Update config with disabled_notes
            config = json.loads(row["config_json"]) if row["config_json"] else {}
            config["disabled_notes"] = note

            conn.execute(
                """
                UPDATE job_sources
                SET status = ?, config_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (SourceStatus.DISABLED.value, json.dumps(config), now, source_id),
            )

        logger.info("Disabled source %s: %s", source_id, reason)

    def update_config(self, source_id: str, config: Dict[str, Any]) -> None:
        """Persist a new config for an existing source."""
        with sqlite_connection(self.db_path) as conn:
            updated = conn.execute(
                """
                UPDATE job_sources
                SET config_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(config), _utcnow_iso(), source_id),
            )
            if updated.rowcount == 0:
                raise StorageError(f"Source {source_id} not found")

    def update_company_link(self, source_id: str, company_id: str) -> bool:
        """
        Link a source to a company by setting the company_id foreign key.

        This method performs "self-healing FK repair" by associating a job source
        with a company only if the source currently has no company_id set (i.e.,
        the foreign key is missing). This situation can arise from:
        - Legacy data created before FK enforcement
        - Import errors or race conditions during source creation
        - Sources created from aggregator discovery before company was known

        The method should be used when reconciling data to ensure sources are
        properly linked to their corresponding companies, without overwriting
        any existing links. If a source is already linked to a company, this
        method will make no changes.

        Args:
            source_id: The source ID to update
            company_id: The company ID to link

        Returns:
            True if the link was updated (source was previously unlinked),
            False if the source was already linked or not found
        """
        with sqlite_connection(self.db_path) as conn:
            result = conn.execute(
                """
                UPDATE job_sources
                SET company_id = ?, updated_at = ?
                WHERE id = ? AND company_id IS NULL
                """,
                (company_id, _utcnow_iso(), source_id),
            )
        updated = result.rowcount > 0
        if updated:
            logger.info("Linked source %s to company %s", source_id, company_id)
        return updated

    def has_source_for_company(self, company_id: str) -> bool:
        """
        Check if a company has any associated job sources.

        This is an optimized query that only checks for existence rather than
        fetching all sources. Use this instead of filtering get_active_sources()
        when you only need to know if any source exists.

        Args:
            company_id: The company ID to check

        Returns:
            True if the company has at least one source, False otherwise
        """
        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT 1 FROM job_sources WHERE company_id = ? LIMIT 1",
                (company_id,),
            ).fetchone()
        return row is not None

    # ------------------------------------------------------------------ #
    # Aggregator Domain Lookup
    # ------------------------------------------------------------------ #

    def get_aggregator_domains(self) -> List[str]:
        """Return all unique aggregator_domain values (non-null).

        Used for validating that company websites are not job board URLs.

        Returns:
            List of aggregator domain strings (e.g., ["greenhouse.io", "lever.co"])
        """
        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT DISTINCT aggregator_domain FROM job_sources WHERE aggregator_domain IS NOT NULL"
            ).fetchall()
        return [row[0] for row in rows]

    # ------------------------------------------------------------------ #
    # Company Resolution
    # ------------------------------------------------------------------ #

    def resolve_company_from_source(
        self,
        source_id: Optional[str] = None,
        company_name_raw: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Resolve actual company info from a job source.

        Uses a two-tier resolution strategy:
        1. Direct source_id lookup (most reliable)
        2. Fuzzy match company name against source names

        Args:
            source_id: Direct source ID to look up
            company_name_raw: Company name to match against source names

        Returns:
            Dict with resolution info, or None if no matching source:
            - company_id: Linked company ID (or None if aggregator)
            - is_aggregator: True if source has aggregator_domain set
            - aggregator_domain: The aggregator domain if set
            - source_id: The matched source ID
            - source_name: The source name
        """
        source = None

        # Tier 1: Direct source_id lookup
        if source_id:
            source = self.get_source_by_id(source_id)

        # Tier 2: Fuzzy match company name against source names
        if not source and company_name_raw:
            source = self._match_source_by_company_name(company_name_raw)

        if not source:
            return None

        company_id = source.get("companyId")
        aggregator_domain = source.get("aggregatorDomain")

        return {
            "company_id": company_id,
            "is_aggregator": aggregator_domain is not None,
            "aggregator_domain": aggregator_domain,
            "source_id": source.get("id"),
            "source_name": source.get("name"),
        }

    @staticmethod
    def _compute_partial_match_score(query: str, target: str) -> int:
        """
        Compute partial match score between two normalized strings.

        Requires at least 60% overlap ratio to avoid false positives
        (e.g., "Coin" should not match "Coinbase").

        Args:
            query: The normalized query string
            target: The normalized target string to match against

        Returns:
            Match score (length of matched portion), or 0 if below threshold
        """
        if not query or not target:
            return 0

        longer_len = max(len(query), len(target))
        if query in target:
            match_ratio = len(query) / longer_len
            if match_ratio >= 0.6:
                return len(query)
        elif target in query:
            match_ratio = len(target) / longer_len
            if match_ratio >= 0.6:
                return len(target)
        return 0

    def _match_source_by_company_name(self, company_name: str) -> Optional[Dict[str, Any]]:
        """
        Fuzzy match a company name against known source names.

        Matches patterns like:
        - "Coinbase" matches "Coinbase Jobs"
        - "Coinbase Careers" matches "Coinbase Jobs"
        - "Jbicy Remote" matches "Jbicy Remote Jobs"

        Args:
            company_name: Company name to match

        Returns:
            Matching source dict, or None if no match
        """
        normalized = normalize_company_name(company_name)
        if not normalized:
            return None

        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute("SELECT * FROM job_sources").fetchall()

        best_match = None
        best_match_score = 0

        for row in rows:
            source = self._row_to_source(dict(row))
            if not source:
                continue

            source_name = source.get("name", "")
            # Normalize source name for comparison: "Coinbase Jobs" -> "coinbase"
            source_normalized = normalize_company_name(source_name)

            # Exact match on source base name
            if normalized == source_normalized:
                return source

            # Partial match scoring: prefer longer matches
            score = self._compute_partial_match_score(normalized, source_normalized)

            if score > best_match_score:
                best_match = source
                best_match_score = score

        # Only return partial matches if they're significant (at least 4 chars matched)
        if best_match and best_match_score >= 4:
            return best_match

        return None
