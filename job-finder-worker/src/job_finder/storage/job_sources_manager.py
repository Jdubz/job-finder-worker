"""SQLite-backed job sources manager."""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from uuid import uuid4

from job_finder.exceptions import (
    DuplicateSourceError,
    InvalidStateTransition,
    StorageError,
)
from job_finder.job_queue.models import SourceStatus
from job_finder.storage.sqlite_client import sqlite_connection, utcnow_iso
from job_finder.utils.company_name_utils import normalize_company_name

logger = logging.getLogger(__name__)


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
        # Cache for aggregator domains (invalidated on add_source with aggregator_domain)
        self._aggregator_domains_cache: Optional[List[str]] = None

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
            "disabledTags": config.get("disabled_tags", []),
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
            DuplicateSourceError: If a source with this name already exists, or if a source
                with the same (company_id, aggregator_domain) pair already exists
            ValueError: If neither company_id nor aggregator_domain is provided
        """
        # Every source must be EITHER company-specific OR an aggregator
        if not company_id and not aggregator_domain:
            raise ValueError(
                f"Source '{name}' must have either company_id (company-specific) "
                "or aggregator_domain (job board platform)"
            )

        # Enforce invariant: company-linked sources must NOT retain aggregator_domain
        if company_id and aggregator_domain:
            logger.info(
                "Stripping aggregator_domain '%s' for company-linked source '%s' (company_id=%s)",
                aggregator_domain,
                name,
                company_id,
            )
            aggregator_domain = None

        # Check for existing source with same name (legacy uniqueness) OR same (company_id, aggregator_domain)
        existing = self.get_source_by_name(name)
        if existing:
            raise DuplicateSourceError(name=name, existing_id=existing["id"])

        source_id = str(uuid4())
        now = utcnow_iso()

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

        # Invalidate aggregator domains cache if this source has an aggregator_domain
        if aggregator_domain:
            self._aggregator_domains_cache = None

        logger.info("Added job source %s (%s)", name, source_id)
        if disabled_notes:
            logger.info("Source %s created disabled: %s", source_id, disabled_notes)
        return source_id

    def get_source_by_company_and_aggregator(
        self, company_id: Optional[str], aggregator_domain: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        """Return the first source matching both company_id and aggregator_domain."""

        if not company_id or not aggregator_domain:
            return None

        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT *
                FROM job_sources
                WHERE company_id = ?
                  AND aggregator_domain = ?
                LIMIT 1
                """,
                (company_id, aggregator_domain),
            ).fetchone()

        return self._row_to_source(dict(row)) if row else None

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

    def get_disabled_sources(
        self,
        exclude_tags: Optional[List[str]] = None,
        min_disabled_hours: int = 72,
        limit: int = 3,
    ) -> List[Dict[str, Any]]:
        """Return disabled sources eligible for recovery retry.

        Args:
            exclude_tags: Disabled tags that mark non-recoverable issues
                (e.g. anti_bot, auth_required, protected_api).  Sources
                whose disabled_tags overlap with this list are skipped.
            min_disabled_hours: Minimum hours a source must have been
                disabled before it becomes eligible for retry.
            limit: Maximum number of sources to return.

        Returns:
            List of source dicts, oldest-disabled first.
        """
        with sqlite_connection(self.db_path) as conn:
            # Use disabled_at from config JSON (set when source is disabled).
            # Fall back to updated_at for sources disabled before disabled_at was added.
            rows = conn.execute(
                """
                SELECT *
                FROM job_sources
                WHERE status = ?
                  AND datetime(
                    COALESCE(
                      json_extract(config_json, '$.disabled_at'),
                      updated_at
                    )
                  ) <= datetime('now', ?)
                ORDER BY COALESCE(
                  json_extract(config_json, '$.disabled_at'),
                  updated_at
                ) ASC
                LIMIT ?
                """,
                (
                    SourceStatus.DISABLED.value,
                    f"-{min_disabled_hours} hours",
                    limit * 3,  # fetch extra to filter out excluded tags
                ),
            ).fetchall()

        exclude = set(exclude_tags or [])
        results: List[Dict[str, Any]] = []
        for row in rows:
            if len(results) >= limit:
                break
            source = self._row_to_source(dict(row))
            if not source:
                continue
            # Skip sources with non-recoverable tags
            source_tags = set(source.get("disabledTags") or [])
            if exclude and source_tags & exclude:
                continue
            results.append(source)
        return results

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

    def find_duplicate_candidate(
        self,
        name: Optional[str],
        company_id: Optional[str],
        aggregator_domain: Optional[str],
        url: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """
        Broader duplicate check used before creating a source.

        Heuristics:
        - Case-insensitive name match
        - Exact (company_id, aggregator_domain) pair
        - Same host as existing source config URL (helps with renamed sources)
        """
        host = None
        if url:
            try:
                host = urlparse(url).hostname
            except ValueError:
                host = None

        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT * FROM job_sources WHERE LOWER(name) = LOWER(?) OR company_id IS NOT NULL OR aggregator_domain IS NOT NULL",
                (name or "",),
            ).fetchall()

        for row in rows:
            source = self._row_to_source(dict(row))
            if not source:
                continue

            # Case-insensitive name collision
            if name and source.get("name", "").lower() == name.lower():
                return source

            # Company/aggregator pair collision
            if company_id and aggregator_domain:
                if (
                    source.get("companyId") == company_id
                    and source.get("aggregatorDomain") == aggregator_domain
                ):
                    return source

            # Host collision (e.g., renamed source pointing at same board)
            cfg = source.get("config") or {}
            cfg_url = cfg.get("url") or ""
            try:
                cfg_host = urlparse(cfg_url).hostname
            except Exception:
                cfg_host = None

            if host and cfg_host and host == cfg_host:
                return source

        return None

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
        now = utcnow_iso()

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

        with sqlite_connection(self.db_path) as conn:
            # Read current status and validate transition in a single connection
            row = conn.execute(
                "SELECT status FROM job_sources WHERE id = ?",
                (source_id,),
            ).fetchone()
            if not row:
                raise StorageError(f"Source {source_id} not found")
            current_status = SourceStatus(row["status"])

            # Validate state transition
            self._validate_transition(current_status, normalized_status)

            sets = ["last_scraped_at = ?", "status = ?", "updated_at = ?"]
            params: list = [now, normalized_status.value, now]

            if error is not None:
                sets.append("last_error = ?")
                params.append(error)

            set_clause = ", ".join(sets)
            conn.execute(
                f"UPDATE job_sources SET {set_clause} WHERE id = ?",
                (*params, source_id),
            )

    def record_scraping_failure(
        self,
        source_id: str,
        error: Optional[str] = None,
        error_message: Optional[str] = None,
        **extra: Any,
    ) -> None:
        """Mark a source as failed without crashing on unexpected kwargs.

        Older callers pass ``error_message``; newer ones pass ``error``. Accept
        both to avoid the worker raising a TypeError during failure handling.
        """

        if extra:
            logger.debug("record_scraping_failure received unused kwargs: %s", list(extra.keys()))

        error_text = error or error_message or "unknown_error"

        self.update_scrape_status(
            source_id,
            status=SourceStatus.FAILED.value,
            error=error_text,
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
                (status.value, utcnow_iso(), source_id),
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
        now = utcnow_iso()
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

            # Update config with disabled_notes and disabled_at
            config = json.loads(row["config_json"]) if row["config_json"] else {}
            config["disabled_notes"] = note
            config["disabled_at"] = now

            conn.execute(
                """
                UPDATE job_sources
                SET status = ?, config_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (SourceStatus.DISABLED.value, json.dumps(config), now, source_id),
            )

        logger.info("Disabled source %s: %s", source_id, reason)

    def disable_source_with_tags(
        self,
        source_id: str,
        reason: str,
        tags: Optional[List[str]] = None,
    ) -> None:
        """
        Disable a source with both disabled_notes and disabled_tags.

        Tags are additive - new tags are merged with existing ones (no duplicates).
        This allows multiple recovery attempts to accumulate evidence of non-recoverable issues.

        Args:
            source_id: The source ID to disable
            reason: Human-readable reason for disabling
            tags: List of non-recoverable tags (anti_bot, auth_required, protected_api)
        """
        now = utcnow_iso()
        note = f"[{now}] {reason}"

        with sqlite_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT status, config_json FROM job_sources WHERE id = ?",
                (source_id,),
            ).fetchone()
            if not row:
                raise StorageError(f"Source {source_id} not found")

            current_status = SourceStatus(row["status"])
            # Only validate transition if not already DISABLED
            if current_status != SourceStatus.DISABLED:
                self._validate_transition(current_status, SourceStatus.DISABLED)

            config = json.loads(row["config_json"]) if row["config_json"] else {}
            # Append to existing notes to preserve history
            existing_notes = config.get("disabled_notes", "")
            if existing_notes:
                config["disabled_notes"] = f"{existing_notes}\n{note}"
            else:
                config["disabled_notes"] = note
            config["disabled_at"] = now

            # Merge tags (additive, no duplicates)
            if tags:
                existing_tags = set(config.get("disabled_tags", []))
                existing_tags.update(tags)
                config["disabled_tags"] = sorted(list(existing_tags))

            conn.execute(
                """
                UPDATE job_sources
                SET status = ?, config_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (SourceStatus.DISABLED.value, json.dumps(config), now, source_id),
            )

        logger.info("Disabled source %s: %s (tags=%s)", source_id, reason, tags)

    def update_config(self, source_id: str, config: Dict[str, Any]) -> None:
        """Persist a new config for an existing source."""
        with sqlite_connection(self.db_path) as conn:
            updated = conn.execute(
                """
                UPDATE job_sources
                SET config_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(config), utcnow_iso(), source_id),
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
                (company_id, utcnow_iso(), source_id),
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

    def get_sources_for_company(self, company_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        """
        Get job sources linked to a company.

        Args:
            company_id: The company ID to look up
            limit: Maximum number of sources to return

        Returns:
            List of source dicts with id, name, aggregator_domain, config_json
        """
        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT id, name, aggregator_domain, config_json
                FROM job_sources
                WHERE company_id = ?
                LIMIT ?
                """,
                (company_id, limit),
            ).fetchall()

        return [
            {
                "id": row[0],
                "name": row[1],
                "aggregator_domain": row[2],
                "config_json": row[3],
            }
            for row in rows
        ]

    # ------------------------------------------------------------------ #
    # Aggregator Domain Lookup
    # ------------------------------------------------------------------ #

    def get_aggregator_domains(self) -> List[str]:
        """Return all unique aggregator_domain values (non-null).

        Uses an instance-level cache that is automatically invalidated when
        add_source() is called with an aggregator_domain. Call refresh_aggregator_domains_cache()
        to manually refresh if domains are modified externally.

        Returns:
            List of aggregator domain strings (e.g., ["greenhouse.io", "lever.co"])
        """
        if self._aggregator_domains_cache is not None:
            return self._aggregator_domains_cache

        with sqlite_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT DISTINCT aggregator_domain FROM job_sources WHERE aggregator_domain IS NOT NULL"
            ).fetchall()
        self._aggregator_domains_cache = [row[0] for row in rows]
        return self._aggregator_domains_cache

    def refresh_aggregator_domains_cache(self) -> List[str]:
        """Force refresh of the aggregator domains cache.

        Call this if domains are modified externally (e.g., direct SQL updates).
        Returns the refreshed list of domains.
        """
        self._aggregator_domains_cache = None
        return self.get_aggregator_domains()

    def is_job_board_url(self, url: Optional[str]) -> bool:
        """Check if URL belongs to a known job board or ATS platform.

        Uses database-driven aggregator domains from the job_sources table.
        This is the canonical method for checking if a URL is a job board -
        all other code should use this instead of hardcoded domain lists.

        Args:
            url: URL to check (can be None or empty)

        Returns:
            True if URL belongs to a known job board/aggregator domain
        """
        if not url:
            return False

        try:
            parsed = urlparse(url.lower())
            netloc = parsed.netloc

            if not netloc:
                return False

            # Check against database-driven aggregator domains
            aggregator_domains = self.get_aggregator_domains()
            for domain in aggregator_domains:
                if netloc == domain or netloc.endswith("." + domain):
                    return True

            return False
        except Exception as e:
            logger.warning("URL parsing failed in is_job_board_url for '%s': %s", url, e)
            return False

    def get_aggregator_domain_for_url(self, url: str) -> Optional[str]:
        """Get the aggregator domain if URL belongs to a known job board.

        Used during source discovery to determine the aggregator_domain value
        to store when creating a new source.

        Args:
            url: URL to check

        Returns:
            The matching aggregator domain, or None if not a job board
        """
        if not url:
            return None

        try:
            parsed = urlparse(url.lower())
            netloc = parsed.netloc

            if not netloc:
                return None

            aggregator_domains = self.get_aggregator_domains()
            for domain in aggregator_domains:
                if netloc == domain or netloc.endswith("." + domain):
                    return domain

            return None
        except Exception:
            return None

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
