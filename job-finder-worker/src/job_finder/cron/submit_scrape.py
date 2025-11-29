"""Enqueue a SCRAPE job for the worker queue (cron-safe).

This is the canonical entrypoint for automated scrape scheduling. It is
kept tiny and relies only on public queue/config helpers so it stays stable
as schema or pipeline details evolve.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Optional

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - optional dependency in prod container
    load_dotenv = None

from job_finder.logging_config import setup_logging
from job_finder.job_queue import ConfigLoader, JobQueueItem, QueueItemType, QueueManager
from job_finder.job_queue.models import ScrapeConfig
from job_finder.storage.sqlite_client import resolve_db_path


def _coalesce(*values):
    for v in values:
        if v is not None:
            return v
    return None


def _extract_scrape_settings(scheduler_settings: Dict[str, Any]) -> Dict[str, Any]:
    """Pull scrape-related knobs from scheduler settings, tolerating key drift."""

    scrape_cfg: Dict[str, Any] = scheduler_settings.get("scrapeConfig") or {}

    # Handle camelCase and snake_case variants for forward/backward compatibility
    def pick(*keys):
        return _coalesce(*(scrape_cfg.get(k) for k in keys))

    return {
        "target_matches": pick("targetMatches", "target_matches"),
        "max_sources": pick("maxSources", "max_sources"),
        "min_match_score": pick("minMatchScore", "min_match_score"),
        "source_ids": pick("sourceIds", "source_ids"),
    }


def _parse_source_ids(raw: Optional[str]):
    if raw is None:
        return None
    if isinstance(raw, list):
        return raw
    # Comma or whitespace separated
    parts = [p.strip() for p in str(raw).replace("\n", ",").split(",")]
    return [p for p in parts if p]


def build_scrape_config(args, scheduler_settings: Dict[str, Any]) -> ScrapeConfig:
    scrape_settings = _extract_scrape_settings(scheduler_settings)

    target_matches = _coalesce(args.target_matches, scrape_settings.get("target_matches"))
    max_sources = _coalesce(args.max_sources, scrape_settings.get("max_sources"))
    min_match_score = _coalesce(args.min_match_score, scrape_settings.get("min_match_score"))
    source_ids = _coalesce(args.source_ids, scrape_settings.get("source_ids"))

    return ScrapeConfig(
        target_matches=target_matches,
        max_sources=max_sources,
        min_match_score=min_match_score,
        source_ids=_parse_source_ids(source_ids),
    )


def enqueue_scrape(db_path: Optional[str], scrape_config: ScrapeConfig) -> str:
    queue_manager = QueueManager(db_path=db_path)

    item = JobQueueItem(
        type=QueueItemType.SCRAPE,
        url="",
        company_name="",
        source="automated_scan",
        scrape_config=scrape_config,
        metadata={
            "trigger": "cron",
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    return queue_manager.add_item(item)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Enqueue a SCRAPE job for the worker queue")
    parser.add_argument("--db-path", help="Optional override for SQLite db path")
    parser.add_argument("--target-matches", type=int, help="Stop after N matches (default: config)")
    parser.add_argument(
        "--max-sources", type=int, help="Scrape at most N sources (default: config)"
    )
    parser.add_argument("--min-match-score", type=int, help="Override minimum match score")
    parser.add_argument(
        "--source-ids",
        help="Comma or newline separated source IDs to scrape (default: all with rotation)",
    )

    args = parser.parse_args(argv)

    # Load .env if available for local runs; cron will rely on entrypoint exporting env
    if load_dotenv:
        load_dotenv()

    setup_logging()

    resolved_db = resolve_db_path(args.db_path)
    config_loader = ConfigLoader(str(resolved_db))
    scheduler_settings = config_loader.get_scheduler_settings()

    scrape_config = build_scrape_config(args, scheduler_settings)
    item_id = enqueue_scrape(str(resolved_db), scrape_config)

    # Structured, cron-friendly log line
    print(
        json.dumps(
            {
                "level": "info",
                "event": "cron_scrape_enqueued",
                "item_id": item_id,
                "target_matches": scrape_config.target_matches,
                "max_sources": scrape_config.max_sources,
                "min_match_score": scrape_config.min_match_score,
                "source_ids": scrape_config.source_ids,
                "db_path": str(resolved_db),
            }
        )
    )

    return 0


if __name__ == "__main__":  # pragma: no cover - thin CLI wrapper
    sys.exit(main())
