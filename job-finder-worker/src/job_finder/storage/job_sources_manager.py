"""SQLite-backed job sources manager."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from job_finder.exceptions import StorageError
from job_finder.job_queue.models import SourceStatus
from job_finder.storage.sqlite_client import sqlite_connection

logger = logging.getLogger(__name__)


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobSourcesManager:
    """Manage the `job_sources` table."""

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

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

        return {
            "id": row["id"],
            "name": row["name"],
            "sourceType": row["source_type"],
            "status": row["status"],
            "config": parse_json(row["config_json"], {}),
            "tags": parse_json(row.get("tags"), []),
            "companyId": row.get("company_id"),
            "companyName": row.get("company_name"),
            "lastScrapedAt": row.get("last_scraped_at"),
            "lastScrapedStatus": row.get("last_scraped_status"),
            "lastScrapedError": row.get("last_scraped_error"),
            "totalJobsFound": row.get("total_jobs_found", 0),
            "totalJobsMatched": row.get("total_jobs_matched", 0),
            "consecutiveFailures": row.get("consecutive_failures", 0),
            "createdAt": row.get("created_at"),
            "updatedAt": row.get("updated_at"),
            "discoveryConfidence": row.get("discovery_confidence"),
            "discoveredVia": row.get("discovered_via"),
            "discoveredBy": row.get("discovered_by"),
            "discoveryQueueItemId": row.get("discovery_queue_item_id"),
            "validationRequired": bool(row.get("validation_required", 0)),
            "tier": row.get("tier", "D"),
            "health": parse_json(row.get("health_json"), {}),
        }

    # ------------------------------------------------------------------ #
    # CRUD
    # ------------------------------------------------------------------ #

    def add_source(
        self,
        name: str,
        source_type: str,
        config: Dict[str, Any],
        enabled: bool = True,
        company_id: Optional[str] = None,
        company_name: Optional[str] = None,
        tags: Optional[List[str]] = None,
        validation_required: bool = False,
        discovery_confidence: Optional[str] = None,
        discovered_via: Optional[str] = None,
        discovered_by: Optional[str] = None,
        discovery_queue_item_id: Optional[str] = None,
        tier: str = "D",
        health: Optional[Dict[str, Any]] = None,
    ) -> str:
        if validation_required:
            status = SourceStatus.PENDING_VALIDATION.value
        else:
            status = SourceStatus.ACTIVE.value if enabled else SourceStatus.DISABLED.value

        source_id = str(uuid4())
        now = _utcnow_iso()

        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO job_sources (
                    id, name, source_type, status, config_json, tags,
                    company_id, company_name,
                    last_scraped_at, last_scraped_status, last_scraped_error,
                    total_jobs_found, total_jobs_matched, consecutive_failures,
                    discovery_confidence, discovered_via, discovered_by, discovery_queue_item_id,
                    validation_required, tier, health_json,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, 0, 0,
                          ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    source_id,
                    name,
                    source_type,
                    status,
                    json.dumps(config),
                    json.dumps(tags or []),
                    company_id,
                    company_name,
                    discovery_confidence,
                    discovered_via,
                    discovered_by,
                    discovery_queue_item_id,
                    1 if validation_required else 0,
                    tier,
                    json.dumps(health or {}),
                    now,
                    now,
                ),
            )

        logger.info("Added job source %s (%s)", name, source_id)
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
        jobs_found: int = 0,
        jobs_matched: int = 0,
        error: Optional[str] = None,
    ) -> None:
        now = _utcnow_iso()
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE job_sources
                SET last_scraped_at = ?,
                    last_scraped_status = ?,
                    last_scraped_error = ?,
                    total_jobs_found = total_jobs_found + ?,
                    total_jobs_matched = total_jobs_matched + ?,
                    consecutive_failures = CASE
                        WHEN ? = ? THEN consecutive_failures + 1
                        ELSE 0
                    END,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    now,
                    status,
                    error,
                    jobs_found,
                    jobs_matched,
                    status,
                    SourceStatus.FAILED.value,
                    now,
                    source_id,
                ),
            )

    def record_scraping_failure(self, source_id: str, error: str) -> None:
        self.update_scrape_status(
            source_id,
            status=SourceStatus.FAILED.value,
            jobs_found=0,
            jobs_matched=0,
            error=error,
        )

    def record_scraping_success(self, source_id: str, jobs_found: int = 0) -> None:
        self.update_scrape_status(
            source_id,
            status=SourceStatus.ACTIVE.value,
            jobs_found=jobs_found,
            jobs_matched=jobs_found,
        )

    def create_from_discovery(
        self,
        name: str,
        source_type: str,
        config: Dict[str, Any],
        discovered_via: Optional[str],
        discovered_by: Optional[str],
        discovery_confidence: Optional[str],
        discovery_queue_item_id: Optional[str],
        company_id: Optional[str],
        company_name: Optional[str],
        enabled: bool,
        validation_required: bool,
        tags: Optional[List[str]] = None,
        tier: str = "D",
    ) -> str:
        return self.add_source(
            name=name,
            source_type=source_type,
            config=config,
            enabled=enabled,
            company_id=company_id,
            company_name=company_name,
            tags=tags,
            validation_required=validation_required,
            discovery_confidence=discovery_confidence,
            discovered_via=discovered_via,
            discovered_by=discovered_by,
            discovery_queue_item_id=discovery_queue_item_id,
            tier=tier,
        )

    def update_source_status(self, source_id: str, status: SourceStatus) -> None:
        with sqlite_connection(self.db_path) as conn:
            conn.execute(
                """
                UPDATE job_sources
                SET status = ?, updated_at = ?
                WHERE id = ?
                """,
                (status.value, _utcnow_iso(), source_id),
            )
