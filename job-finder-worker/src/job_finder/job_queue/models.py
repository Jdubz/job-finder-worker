"""
Pydantic models for queue items backed by SQLite.

The TypeScript definitions in @shared/types are the source of truth; this file mirrors
those contracts for the Python worker.
"""

import json
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class QueueItemType(str, Enum):
    """
    Type of queue item.

    TypeScript equivalent: QueueItemType in queue.types.ts
    Values must match exactly: "job" | "company" | "scrape" | "source_discovery" | "scrape_source" | "agent_review"
    """

    JOB = "job"
    COMPANY = "company"
    SCRAPE = "scrape"
    SOURCE_DISCOVERY = "source_discovery"
    SCRAPE_SOURCE = "scrape_source"  # For automated source scraping
    AGENT_REVIEW = "agent_review"


class SourceStatus(str, Enum):
    """
    Status for job source records in SQLite.

    Tracks the operational state of a scraping source.

    TypeScript equivalent: SourceStatus in queue.types.ts
    """

    ACTIVE = "active"  # Enabled for scraping
    DISABLED = "disabled"  # Manually or automatically disabled
    FAILED = "failed"  # Permanently failed operation


class SourceTier(str, Enum):
    """
    Priority tier for company/source scraping.

    Based on scoring algorithm:
    - Portland office: +50 points
    - Tech stack alignment: up to +100 points
    - Remote-first culture: +15 points
    - AI/ML focus: +10 points

    Tiers:
    - S: 150+ points (top priority)
    - A: 100-149 points (high priority)
    - B: 70-99 points (medium priority)
    - C: 50-69 points (low priority)
    - D: 0-49 points (minimal priority)

    TypeScript equivalent: SourceTier in queue.types.ts
    """

    S = "S"
    A = "A"
    B = "B"
    C = "C"
    D = "D"


class QueueStatus(str, Enum):
    """
    Status of queue item processing.

    TypeScript equivalent: QueueStatus in queue.types.ts
    Lifecycle: pending → processing → success/failed/skipped/filtered

    - PENDING: In queue, waiting to be processed
    - PROCESSING: Currently being processed
    - FILTERED: Rejected by filter engine (did not pass intake filters)
    - SKIPPED: Skipped (duplicate or stop list blocked)
    - NEEDS_REVIEW: Human review required before proceeding
    - SUCCESS: Successfully processed and saved to job-matches
    - FAILED: Processing error occurred (terminal)
    """

    PENDING = "pending"
    PROCESSING = "processing"
    FILTERED = "filtered"
    SKIPPED = "skipped"
    FAILED = "failed"
    SUCCESS = "success"
    NEEDS_REVIEW = "needs_review"


# QueueSource type - matches TypeScript literal type
# TypeScript: "user_submission" | "automated_scan" | "scraper" | "webhook" | "email" | "manual_submission" | "user_request"
QueueSource = Literal[
    "user_submission",
    "automated_scan",
    "scraper",
    "webhook",
    "email",
    "manual_submission",
    "user_request",
]


class ScrapeConfig(BaseModel):
    """
    Configuration for a scrape request.

    Used when QueueItemType is SCRAPE to specify custom scraping parameters.

    Behavior:
    - source_ids=None → scrape all available sources (with rotation)
    - source_ids=[...] → scrape only specific sources
    - target_matches=None → no early exit, scrape all allowed sources
    - target_matches=N → stop after finding N potential matches
    - max_sources=None → unlimited sources (until target_matches or all sources done)
    - max_sources=N → stop after scraping N sources
    """

    target_matches: Optional[int] = Field(
        default=None,
        description="Stop after finding this many potential matches (None = no limit)",
    )
    max_sources: Optional[int] = Field(
        default=None,
        description="Maximum number of sources to scrape (None = unlimited)",
    )
    source_ids: Optional[List[str]] = Field(
        default=None,
        description="Specific source IDs to scrape (None = all sources with rotation)",
    )
    min_match_score: Optional[int] = Field(
        default=None, description="Override minimum match score threshold"
    )

    model_config = ConfigDict(use_enum_values=True)


class SourceTypeHint(str, Enum):
    """
    Source type hint for discovery.

    TypeScript equivalent: SourceTypeHint in queue.types.ts
    """

    AUTO = "auto"
    GREENHOUSE = "greenhouse"
    ASHBY = "ashby"
    WORKDAY = "workday"
    RSS = "rss"
    GENERIC = "generic"


class SourceDiscoveryConfig(BaseModel):
    """
    Configuration for source discovery requests.

    Used when QueueItemType is SOURCE_DISCOVERY to discover and configure a new job source.

    Flow:
    1. job-finder-FE submits URL for discovery
    2. Job-finder detects source type (greenhouse, ashby, workday, rss, generic)
    3. For known types: validate and create config
    4. For generic: use AI selector discovery
    5. Test scrape to validate
    6. Create job-source document if successful

    TypeScript equivalent: SourceDiscoveryConfig in queue.types.ts
    """

    url: str = Field(description="URL to analyze and configure")
    type_hint: Optional[SourceTypeHint] = Field(
        default=SourceTypeHint.AUTO, description="Optional hint about source type"
    )
    company_id: Optional[str] = Field(default=None, description="Optional company reference")
    company_name: Optional[str] = Field(default=None, description="Optional company name")

    model_config = ConfigDict(use_enum_values=True)


class JobQueueItem(BaseModel):
    """
    Lean queue item for the worker. Only first-class columns map to SQLite; all
    task-specific parameters/results live inside `input` and `output` blobs.
    """

    # Identity
    id: Optional[str] = None
    type: QueueItemType = Field(description="Type of item (job/company/etc.)")

    # Status tracking
    status: QueueStatus = Field(default=QueueStatus.PENDING)
    result_message: Optional[str] = None
    error_details: Optional[str] = None

    # Scheduling / routing
    url: Optional[str] = None  # canonical per-type URL used for dedupe/filters
    tracking_id: str = Field(default_factory=lambda: str(__import__("uuid").uuid4()))
    parent_item_id: Optional[str] = None

    # Payloads
    input: Dict[str, Any] = Field(default_factory=dict, description="Task-specific inputs")
    output: Dict[str, Any] = Field(default_factory=dict, description="Task results/telemetry")

    # Legacy convenience fields (kept in-memory, persisted inside input/output)
    company_name: Optional[str] = None
    company_id: Optional[str] = None
    source: Optional[QueueSource] = None
    submitted_by: Optional[str] = None
    scrape_config: Optional[ScrapeConfig] = None
    scraped_data: Optional[Dict[str, Any]] = None
    source_discovery_config: Optional[SourceDiscoveryConfig] = None
    source_id: Optional[str] = None
    source_type: Optional[str] = None
    source_config: Optional[Dict[str, Any]] = None
    source_tier: Optional[SourceTier] = None
    pipeline_state: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

    # Timestamps
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(use_enum_values=True)

    def _dt(self, value: Optional[datetime]) -> Optional[str]:
        return value.isoformat() if value else None

    @staticmethod
    def _enum_val(value: Any) -> Any:
        if value is None:
            return None
        return getattr(value, "value", value)

    def _build_input(self) -> Dict[str, Any]:
        data = {**(self.input or {})}
        # Store legacy fields inside input for compatibility with processors
        if self.company_name is not None:
            data.setdefault("company_name", self.company_name)
        if self.company_id is not None:
            data.setdefault("company_id", self.company_id)
        if self.source is not None:
            data.setdefault("source", self.source)
        if self.submitted_by is not None:
            data.setdefault("submitted_by", self.submitted_by)
        if self.scrape_config is not None:
            data["scrape_config"] = self.scrape_config.model_dump()
        if self.source_discovery_config is not None:
            data["source_discovery_config"] = self.source_discovery_config.model_dump()
        if self.source_id is not None:
            data.setdefault("source_id", self.source_id)
        if self.source_type is not None:
            data.setdefault("source_type", self.source_type)
        if self.source_config is not None:
            data.setdefault("source_config", self.source_config)
        if self.source_tier is not None:
            data.setdefault("source_tier", self._enum_val(self.source_tier))
        if self.metadata is not None:
            data.setdefault("metadata", self.metadata)
        return data

    def _build_output(self) -> Dict[str, Any]:
        data = {**(self.output or {})}
        if self.scraped_data is not None:
            data["scraped_data"] = self.scraped_data
        if self.pipeline_state is not None:
            data["pipeline_state"] = self.pipeline_state
        return data

    def to_record(self) -> Dict[str, Any]:
        input_payload = self._build_input()
        output_payload = self._build_output()

        return {
            "id": self.id,
            "type": self._enum_val(self.type),
            "status": self._enum_val(self.status),
            "url": self.url,
            "tracking_id": self.tracking_id,
            "parent_item_id": self.parent_item_id,
            "input": json.dumps(input_payload) if input_payload else None,
            "output": json.dumps(output_payload) if output_payload else None,
            "result_message": self.result_message,
            "error_details": self.error_details,
            "created_at": self._dt(self.created_at),
            "updated_at": self._dt(self.updated_at),
            "processed_at": self._dt(self.processed_at),
            "completed_at": self._dt(self.completed_at),
        }

    @classmethod
    def from_record(cls, record: Dict[str, Any]) -> "JobQueueItem":
        """Hydrate an item from a SQLite row."""

        def parse_json(value: Optional[str]) -> Optional[Dict[str, Any]]:
            if not value:
                return None
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None

        def parse_dt(value: Optional[str]) -> Optional[datetime]:
            return datetime.fromisoformat(value) if value else None

        input_data = parse_json(record.get("input")) or {}
        output_data = parse_json(record.get("output")) or {}

        return cls(
            id=record["id"],
            type=QueueItemType(record["type"]),
            status=QueueStatus(record["status"]),
            url=record.get("url"),
            input=input_data,
            output=output_data,
            company_name=input_data.get("company_name"),
            company_id=input_data.get("company_id"),
            source=input_data.get("source"),
            submitted_by=input_data.get("submitted_by"),
            created_at=parse_dt(record.get("created_at")),
            updated_at=parse_dt(record.get("updated_at")),
            processed_at=parse_dt(record.get("processed_at")),
            completed_at=parse_dt(record.get("completed_at")),
            scraped_data=output_data.get("scraped_data"),
            scrape_config=(
                ScrapeConfig(**input_data["scrape_config"])
                if input_data.get("scrape_config")
                else None
            ),
            source_discovery_config=(
                SourceDiscoveryConfig(**input_data["source_discovery_config"])
                if input_data.get("source_discovery_config")
                else None
            ),
            source_id=input_data.get("source_id"),
            source_type=input_data.get("source_type"),
            source_config=input_data.get("source_config"),
            source_tier=(
                SourceTier(input_data["source_tier"]) if input_data.get("source_tier") else None
            ),
            pipeline_state=output_data.get("pipeline_state"),
            parent_item_id=record.get("parent_item_id"),
            tracking_id=record.get("tracking_id", ""),
            result_message=record.get("result_message"),
            error_details=record.get("error_details"),
            metadata=input_data.get("metadata"),
        )
