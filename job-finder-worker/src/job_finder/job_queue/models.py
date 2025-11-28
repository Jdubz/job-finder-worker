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
    Values must match exactly: "job" | "company" | "scrape" | "source_discovery" | "scrape_source"
    """

    JOB = "job"
    COMPANY = "company"
    SCRAPE = "scrape"
    SOURCE_DISCOVERY = "source_discovery"
    SCRAPE_SOURCE = "scrape_source"  # NEW: For automated source scraping


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
    - SUCCESS: Successfully processed and saved to job-matches
    - FAILED: Processing error occurred
    """

    PENDING = "pending"
    PROCESSING = "processing"
    FILTERED = "filtered"
    SKIPPED = "skipped"
    FAILED = "failed"
    SUCCESS = "success"


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
    Queue item representing a job or company to be processed.

    TypeScript equivalent: QueueItem interface in queue.types.ts
    This model represents rows in the job_queue table. Items are processed
    in FIFO order (oldest created_at first).

    IMPORTANT: This model must match the TypeScript QueueItem interface exactly.
    See: https://github.com/Jdubz/job-finder-shared-types/blob/main/src/queue.types.ts
    """

    # Identity
    id: Optional[str] = None
    type: QueueItemType = Field(description="Type of item (job or company)")

    # Status tracking
    status: QueueStatus = Field(
        default=QueueStatus.PENDING, description="Current processing status"
    )
    result_message: Optional[str] = Field(
        default=None, description="Why skipped/failed, or success details"
    )
    error_details: Optional[str] = Field(
        default=None, description="Technical error details for debugging"
    )

    # Input data
    url: str = Field(
        default="", description="URL to scrape (job posting or company page, empty for SCRAPE type)"
    )
    company_name: str = Field(default="", description="Company name (empty for SCRAPE type)")
    company_id: Optional[str] = Field(default=None, description="Company record ID")
    source: QueueSource = Field(
        default="scraper",
        description="Source of submission: scraper, user_submission, webhook, email",
    )
    submitted_by: Optional[str] = Field(
        default=None, description="User ID if submitted by authenticated user"
    )

    # Timestamps (for FIFO ordering)
    created_at: Optional[datetime] = Field(default=None, description="When item was added to queue")
    updated_at: Optional[datetime] = Field(default=None, description="Last update to status/data")
    processed_at: Optional[datetime] = Field(default=None, description="When processing started")
    completed_at: Optional[datetime] = Field(
        default=None, description="When processing finished (success/failed/skipped)"
    )

    # Optional scraped data (populated by scrapers or API submissions)
    scraped_data: Optional[Dict[str, Any]] = Field(
        default=None, description="Pre-scraped job or company data"
    )

    # Scrape configuration (only used when type is SCRAPE)
    scrape_config: Optional[ScrapeConfig] = Field(
        default=None, description="Configuration for scrape requests"
    )

    # Source discovery configuration (only used when type is SOURCE_DISCOVERY)
    source_discovery_config: Optional[SourceDiscoveryConfig] = Field(
        default=None, description="Configuration for source discovery"
    )

    # Scrape source fields (only used when type is SCRAPE_SOURCE)
    source_id: Optional[str] = Field(
        default=None,
        description="Reference to job-sources table entry (for SCRAPE_SOURCE type)",
    )
    source_type: Optional[str] = Field(
        default=None,
        description="Generic scraping method: api, rss, html (vendor auto-detected from config)",
    )
    source_config: Optional[Dict[str, Any]] = Field(
        default=None, description="Source-specific configuration (selectors, API keys, etc.)"
    )
    source_tier: Optional[SourceTier] = Field(
        default=None, description="Priority tier (S/A/B/C/D) for scheduling optimization"
    )

    # Pipeline state for multi-step processing
    pipeline_state: Optional[Dict[str, Any]] = Field(
        default=None,
        description="State passed between pipeline steps (scraped data, filter results, etc.)",
    )
    parent_item_id: Optional[str] = Field(
        default=None, description="Document ID of parent item that spawned this sub-task"
    )

    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata blob")

    # Loop prevention - tracking_id links related items
    tracking_id: str = Field(
        default_factory=lambda: str(__import__("uuid").uuid4()),
        description="UUID that tracks entire job lineage. Generated at root, inherited by all spawned children.",
    )

    model_config = ConfigDict(use_enum_values=True)

    def to_record(self) -> Dict[str, Any]:
        """Convert the queue item into a SQLite-ready dictionary."""

        def enum_val(value: Any) -> Any:
            """Return the raw value for Enum-like inputs."""
            if value is None:
                return None
            return getattr(value, "value", value)

        def serialize(value: Optional[Dict[str, Any]] | Optional[List[Any]]) -> Optional[str]:
            if value is None:
                return None
            return json.dumps(value)

        def dt(value: Optional[datetime]) -> Optional[str]:
            return value.isoformat() if value else None

        return {
            "id": self.id,
            "type": enum_val(self.type),
            "status": enum_val(self.status),
            "url": self.url,
            "company_name": self.company_name,
            "company_id": self.company_id,
            "source": self.source,
            "submitted_by": self.submitted_by,
            "created_at": dt(self.created_at),
            "updated_at": dt(self.updated_at),
            "processed_at": dt(self.processed_at),
            "completed_at": dt(self.completed_at),
            "scraped_data": serialize(self.scraped_data),
            "scrape_config": serialize(
                self.scrape_config.model_dump() if self.scrape_config else None
            ),
            "source_discovery_config": serialize(
                self.source_discovery_config.model_dump() if self.source_discovery_config else None
            ),
            "source_id": self.source_id,
            "source_type": self.source_type,
            "source_config": serialize(self.source_config),
            "source_tier": enum_val(self.source_tier),
            "pipeline_state": serialize(self.pipeline_state),
            "parent_item_id": self.parent_item_id,
            "tracking_id": self.tracking_id,
            "result_message": self.result_message,
            "error_details": self.error_details,
            "metadata": serialize(self.metadata),
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

        return cls(
            id=record["id"],
            type=QueueItemType(record["type"]),
            status=QueueStatus(record["status"]),
            url=record["url"],
            company_name=record.get("company_name", ""),
            company_id=record.get("company_id"),
            source=record.get("source", "scraper"),
            submitted_by=record.get("submitted_by"),
            created_at=parse_dt(record.get("created_at")),
            updated_at=parse_dt(record.get("updated_at")),
            processed_at=parse_dt(record.get("processed_at")),
            completed_at=parse_dt(record.get("completed_at")),
            scraped_data=parse_json(record.get("scraped_data")),
            scrape_config=parse_json(record.get("scrape_config")),
            source_discovery_config=parse_json(record.get("source_discovery_config")),
            source_id=record.get("source_id"),
            source_type=record.get("source_type"),
            source_config=parse_json(record.get("source_config")),
            source_tier=SourceTier(record["source_tier"]) if record.get("source_tier") else None,
            pipeline_state=parse_json(record.get("pipeline_state")),
            parent_item_id=record.get("parent_item_id"),
            tracking_id=record.get("tracking_id", ""),
            result_message=record.get("result_message"),
            error_details=record.get("error_details"),
            metadata=parse_json(record.get("metadata")),
        )
