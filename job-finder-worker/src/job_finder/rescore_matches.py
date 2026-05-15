"""Re-score job_matches using the current match-policy + prefilter config.

This is a one-shot maintenance command. It walks every job_match in the
requested status set and re-runs the deterministic ScoringEngine against the
listing's stored extraction snapshot (filter_result.extraction). That avoids
re-doing any AI work — we only re-apply the math against the new config.

For each match:
  - `match_score` is updated to the new final_score
  - `static_score` is set so the API's live-freshness path takes over
  - `job_listings.match_score` is refreshed in lockstep
  - If `status='active'` AND new score < match-policy.minScore, the row is
    flipped to `status='ignored'` with `status_updated_by='reconciliation-script'`
    and an `application_status_history` audit row.

Statuses NOT touched: `applied`, `acknowledged`, `interviewing`, `denied`.
Their score is updated for visibility but their status is preserved — those
represent real user/recruiter signal that re-scoring must not blow away.

Usage:
    # Dry run (default — prints what would change)
    ENVIRONMENT=production python -m job_finder.rescore_matches --dry-run

    # Apply changes
    ENVIRONMENT=production python -m job_finder.rescore_matches

    # Limit which statuses get re-evaluated (default: active,ignored)
    python -m job_finder.rescore_matches --statuses active

    # Process only N matches (useful for spot-checking)
    python -m job_finder.rescore_matches --limit 25
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

# Add src to path when run as a script
sys.path.insert(0, str(Path(__file__).parent.parent))

from job_finder.ai.extraction import JobExtractionResult
from job_finder.filters.title_filter import TitleFilter
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.profile.reducer import load_scoring_profile
from job_finder.scoring.engine import ScoringEngine
from job_finder.scoring.taxonomy import SkillTaxonomyRepository
from job_finder.storage.sqlite_client import sqlite_connection, utcnow_iso

logger = logging.getLogger(__name__)

DEFAULT_STATUSES = ("active", "ignored")
TERMINAL_USER_STATUSES = frozenset({"applied", "acknowledged", "interviewing", "denied"})


def build_engine(config_loader: ConfigLoader, db_path: Optional[str]) -> ScoringEngine:
    match_policy = config_loader.get_match_policy()
    personal_info = config_loader.get_personal_info() or {}
    location_config = match_policy.setdefault("location", {})
    if personal_info.get("timezone") is not None:
        location_config["userTimezone"] = personal_info["timezone"]
    if personal_info.get("city"):
        location_config["userCity"] = personal_info["city"]
    if "relocationAllowed" in personal_info:
        location_config["relocationAllowed"] = personal_info["relocationAllowed"]

    relevant_exp_start = match_policy.get("experience", {}).get("relevantExperienceStart")
    profile = load_scoring_profile(db_path, relevant_experience_start=relevant_exp_start)
    taxonomy_repo = SkillTaxonomyRepository(db_path)

    return ScoringEngine(
        match_policy,
        skill_years=profile.skill_years,
        user_experience_years=profile.total_experience_years,
        taxonomy_repo=taxonomy_repo,
    )


def parse_filter_result(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


def fetch_candidates(
    db_path: str, statuses: Set[str], limit: Optional[int]
) -> List[Dict[str, Any]]:
    placeholders = ",".join("?" for _ in statuses)
    sql = f"""
        SELECT m.id            AS match_id,
               m.status        AS status,
               m.match_score   AS old_match_score,
               m.static_score  AS old_static_score,
               l.id            AS listing_id,
               l.title         AS title,
               l.description   AS description,
               l.filter_result AS filter_result
          FROM job_matches m
          JOIN job_listings l ON l.id = m.job_listing_id
         WHERE m.status IN ({placeholders})
           AND m.is_ghost = 0
         ORDER BY m.analyzed_at DESC
    """
    params: List[Any] = list(statuses)
    if limit:
        sql += " LIMIT ?"
        params.append(limit)

    with sqlite_connection(db_path) as conn:
        return [dict(row) for row in conn.execute(sql, params).fetchall()]


def rescore_one(
    engine: ScoringEngine,
    record: Dict[str, Any],
    min_score: int,
    title_filter: Optional[TitleFilter] = None,
) -> Optional[Dict[str, Any]]:
    """Return a diff dict if the row needs an UPDATE, else None."""
    filter_result = parse_filter_result(record.get("filter_result"))
    extraction_dict = (filter_result or {}).get("extraction")
    if not extraction_dict:
        return None  # No snapshot to re-score against; skip silently

    extraction = JobExtractionResult.from_dict(extraction_dict)
    breakdown = engine.score(extraction, record.get("title") or "", record.get("description") or "")

    new_match_score = breakdown.final_score
    new_static_score = breakdown.static_score
    old_match_score = int(record.get("old_match_score") or 0)
    old_static_score = record.get("old_static_score")

    status = record["status"]
    next_status = status
    note: Optional[str] = None

    # If the current title prefilter would now reject this listing, take that
    # as a stronger signal than the numeric score and ignore the row.
    title = record.get("title") or ""
    if title_filter is not None and status == "active":
        title_result = title_filter.filter(title)
        if not title_result.passed:
            next_status = "ignored"
            note = (
                f"auto-reconciled: current title prefilter rejects this listing "
                f"({title_result.reason})"
            )

    # Only auto-flip ACTIVE rows; ignored stays ignored, terminal stays terminal.
    if next_status == status and status == "active" and new_match_score < min_score:
        next_status = "ignored"
        note = (
            f"auto-reconciled: re-score dropped {old_match_score} -> {new_match_score} "
            f"(below minScore {min_score})"
        )

    if (
        new_match_score == old_match_score
        and new_static_score == old_static_score
        and next_status == status
    ):
        return None  # No-op

    return {
        "match_id": record["match_id"],
        "listing_id": record["listing_id"],
        "old_match_score": old_match_score,
        "old_static_score": old_static_score,
        "new_match_score": new_match_score,
        "new_static_score": new_static_score,
        "status": status,
        "next_status": next_status,
        "note": note,
        "breakdown": breakdown.to_dict(),
    }


def apply_changes(db_path: str, changes: List[Dict[str, Any]]) -> None:
    if not changes:
        return
    now = utcnow_iso()
    with sqlite_connection(db_path) as conn:
        for change in changes:
            conn.execute(
                """
                UPDATE job_matches
                   SET match_score = ?,
                       static_score = ?,
                       updated_at = ?
                 WHERE id = ?
                """,
                (
                    change["new_match_score"],
                    change["new_static_score"],
                    now,
                    change["match_id"],
                ),
            )

            if change["next_status"] != change["status"]:
                conn.execute(
                    """
                    UPDATE job_matches
                       SET status = ?,
                           status_note = ?,
                           status_updated_by = 'reconciliation-script',
                           ignored_at = CASE WHEN ? = 'ignored' THEN ? ELSE ignored_at END
                     WHERE id = ?
                    """,
                    (
                        change["next_status"],
                        change["note"],
                        change["next_status"],
                        now,
                        change["match_id"],
                    ),
                )
                conn.execute(
                    """
                    INSERT INTO application_status_history
                       (id, job_match_id, from_status, to_status, changed_by,
                        application_email_id, note, created_at)
                    VALUES (?, ?, ?, ?, 'reconciliation-script', NULL, ?, ?)
                    """,
                    (
                        str(uuid.uuid4()),
                        change["match_id"],
                        change["status"],
                        change["next_status"],
                        change["note"],
                        now,
                    ),
                )

            conn.execute(
                "UPDATE job_listings SET match_score = ?, updated_at = ? WHERE id = ?",
                (change["new_match_score"], now, change["listing_id"]),
            )
        conn.commit()


def main() -> int:
    parser = argparse.ArgumentParser(description="Re-score job_matches under current config")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without applying")
    parser.add_argument(
        "--statuses",
        type=str,
        default=",".join(DEFAULT_STATUSES),
        help=f"Comma-separated job_matches.status values to consider (default: {','.join(DEFAULT_STATUSES)})",
    )
    parser.add_argument("--limit", type=int, default=None, help="Max matches to process")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    statuses = {s.strip().lower() for s in args.statuses.split(",") if s.strip()}
    overlap = statuses & TERMINAL_USER_STATUSES
    if overlap:
        logger.warning(
            "Including user-terminal statuses %s — these will be re-scored but never auto-flipped.",
            sorted(overlap),
        )

    import os

    db_path: Optional[str] = os.environ.get("SQLITE_DB_PATH")
    if not db_path:
        try:
            from job_finder.storage.sqlite_client import resolve_db_path

            resolved = resolve_db_path(None)
            db_path = str(resolved) if resolved else None
        except Exception as exc:
            logger.error("Could not resolve a SQLite path: %s", exc)
            return 2
    if not db_path:
        logger.error("SQLITE_DB_PATH is not set and could not be resolved.")
        return 2
    config_loader = ConfigLoader(db_path=db_path)

    match_policy = config_loader.get_match_policy()
    min_score = int(match_policy.get("minScore", 0))
    engine = build_engine(config_loader, db_path)

    prefilter_policy = config_loader.get_prefilter_policy() or {}
    title_filter = (
        TitleFilter(prefilter_policy.get("title") or {})
        if (prefilter_policy.get("title") or {}).get("requiredKeywords")
        else None
    )

    candidates = fetch_candidates(db_path, statuses, args.limit)
    logger.info("Loaded %d candidate matches (statuses=%s)", len(candidates), sorted(statuses))

    changes: List[Dict[str, Any]] = []
    flipped = 0
    skipped_no_extraction = 0

    for rec in candidates:
        diff = rescore_one(engine, rec, min_score, title_filter=title_filter)
        if diff is None:
            if not parse_filter_result(rec.get("filter_result")).get("extraction"):
                skipped_no_extraction += 1
            continue
        changes.append(diff)
        if diff["next_status"] != diff["status"]:
            flipped += 1

    logger.info(
        "Planned changes: %d (status flips: %d, skipped no-extraction: %d)",
        len(changes),
        flipped,
        skipped_no_extraction,
    )

    if args.verbose:
        for c in changes[:20]:
            logger.info(
                "  %s: %s->%s, score %d->%d (static %s->%d)%s",
                c["match_id"][:8],
                c["status"],
                c["next_status"],
                c["old_match_score"],
                c["new_match_score"],
                c["old_static_score"],
                c["new_static_score"],
                f"  [{c['note']}]" if c["note"] else "",
            )

    if args.dry_run:
        logger.info("[DRY RUN] no changes applied")
        return 0

    apply_changes(db_path, changes)
    logger.info("Applied %d changes", len(changes))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
