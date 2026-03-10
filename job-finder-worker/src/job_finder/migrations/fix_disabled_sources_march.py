"""
Fix disabled/failed sources identified on 2026-03-09.

Categories of fixes:
1. Re-enable sources fixed by relative URL code change (Cummins, CyberCoders, allstate/jobsoid)
2. Re-enable transient failures (Customertimes 429, Jobgether timeout)
3. Fix Workday URL configs (Alkami, Veritone) — code change handles Alkami; Veritone needs URL fix
4. Platform migrations: companies that moved ATS (Redis→Ashby, TRM Labs→Ashby, Epoch AI→Lever)
5. Config corrections: Clarity→Ashby API, Sei Labs→Lever API, Creative Chaos→Recruitee
6. Fix failed HTML sources (bloXroute, Swanky→RSS)
7. Fix workable misconfigs (AskVinny→SmartRecruiters, Presight→SmartRecruiters, Raw Power→SmartRecruiters)
8. Delete genuinely dead sources (Lemon.io, DeweyLearn, Nuclear Promise X, Microsoft/recruitee)
9. Delete unfixable failed sources (Rapinno Tech, Great Good — Angular SPAs without ATS)

Usage:
    python -m job_finder.migrations.fix_disabled_sources_march /path/to/database.db --dry-run
    python -m job_finder.migrations.fix_disabled_sources_march /path/to/database.db
"""

import json
import logging
import sqlite3
import sys
from datetime import datetime, timezone
from typing import Any, Dict

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


# ── Standard field sets ─────────────────────────────────────────────────

_ASHBY_FIELDS = {
    "title": "title",
    "location": "location",
    "description": "descriptionHtml",
    "url": "jobUrl",
    "posted_date": "publishedAt",
    "employment_type": "employmentType",
    "is_remote": "isRemote",
    "department": "department",
    "team": "team",
}

_LEVER_FIELDS = {
    "title": "text",
    "url": "hostedUrl",
    "location": "categories.location",
    "description": "descriptionPlain",
    "posted_date": "createdAt",
    "department": "categories.department",
}

_GREENHOUSE_FIELDS = {
    "title": "title",
    "url": "absolute_url",
    "location": "location.name",
    "description": "content",
    "posted_date": "updated_at",
    "first_published": "first_published",
    "requisition_id": "requisition_id",
    "departments": "departments",
    "offices": "offices",
    "metadata": "metadata",
}

_WORKDAY_FIELDS = {
    "title": "title",
    "url": "externalPath",
    "location": "locationsText",
    "posted_date": "postedOn",
}

_SMARTRECRUITERS_FIELDS = {
    "title": "name",
    "company": "company.name",
    "location": "location.fullLocation",
    "url": "ref",
    "posted_date": "releasedDate",
    "job_type": "typeOfEmployment.label",
    "department": "department.label",
    "description": "jobAd.sections.jobDescription.text",
}

_RECRUITEE_FIELDS = {
    "title": "title",
    "url": "careers_url",
    "location": "location",
    "description": "description",
    "posted_date": "published_at",
    "department": "department",
}


# ── Fixes ────────────────────────────────────────────────────────────────

# Sources to simply re-enable (bugs now fixed in code, or transient errors)
REENABLE = [
    # Relative URL bug fixed in generic_scraper.py
    "Cummins Jobs",
    "CyberCoders Jobs",
    "allstate-plumbing Jobs (jobsoid.com)",
    # Transient errors — retry
    "Customertimes Jobs (careers-page.com)",
    "Jobgether Jobs",
    # Workday URL auto-conversion now handled by expand_config
    "Alkami Technology, Inc. Jobs",
    # Sei Labs: jobs.lever.co URL now auto-converts to API via expand_config
    "Sei Labs Jobs",
]

# Sources that need config replacement + re-enable
CONFIG_FIXES: Dict[str, Dict[str, Any]] = {
    # Veritone: doubled Workday URL path, wrong XPath fields
    "Veritone, Inc. Jobs": {
        "type": "api",
        "url": "https://veritone.wd1.myworkdayjobs.com/wday/cxs/veritone/Veritone_Career_Site/jobs",
        "method": "POST",
        "post_body": {"limit": 20, "offset": 0},
        "response_path": "jobPostings",
        "base_url": "https://veritone.wd1.myworkdayjobs.com/Veritone_Career_Site",
        "fields": _WORKDAY_FIELDS,
        "headers": {"Content-Type": "application/json"},
        "follow_detail": True,
    },
    # Redis: moved from Greenhouse to Ashby (98 jobs verified)
    "Redis Careers": {
        "type": "api",
        "url": "https://api.ashbyhq.com/posting-api/job-board/redis?includeCompensation=true",
        "response_path": "jobs",
        "fields": _ASHBY_FIELDS,
        "salary_min_field": "compensation.summaryComponents[compensationType=Salary].minValue",
        "salary_max_field": "compensation.summaryComponents[compensationType=Salary].maxValue",
    },
    # TRM Labs: moved from Greenhouse to Ashby (88 jobs verified)
    "TRM Labs Jobs (greenhouse.io)": {
        "type": "api",
        "url": "https://api.ashbyhq.com/posting-api/job-board/trm-labs?includeCompensation=true",
        "response_path": "jobs",
        "fields": _ASHBY_FIELDS,
        "salary_min_field": "compensation.summaryComponents[compensationType=Salary].minValue",
        "salary_max_field": "compensation.summaryComponents[compensationType=Salary].maxValue",
    },
    # Clarity: was HTML on jobs.ashbyhq.com, use Ashby API (5 jobs verified)
    "Clarity Jobs": {
        "type": "api",
        "url": "https://api.ashbyhq.com/posting-api/job-board/clarity?includeCompensation=true",
        "response_path": "jobs",
        "fields": _ASHBY_FIELDS,
        "salary_min_field": "compensation.summaryComponents[compensationType=Salary].minValue",
        "salary_max_field": "compensation.summaryComponents[compensationType=Salary].maxValue",
    },
    # Creative Chaos: was broken HTML, actually on Recruitee (12 jobs verified)
    "Creative Chaos Jobs": {
        "type": "api",
        "url": "https://chaos.recruitee.com/api/offers",
        "response_path": "offers",
        "fields": _RECRUITEE_FIELDS,
    },
    # Epoch AI: wrong workable slug, actually on Lever (2 jobs verified)
    "Epoch AI Jobs (workable.com)": {
        "type": "api",
        "url": "https://api.lever.co/v0/postings/epoch-ai?mode=json",
        "response_path": "",
        "fields": _LEVER_FIELDS,
        "company_name": "Epoch AI",
    },
    # AskVinny: wrong workable slug, found on SmartRecruiters (0 jobs but active)
    "AskVinny Jobs (workable.com)": {
        "type": "api",
        "url": "https://api.smartrecruiters.com/v1/companies/askvinny/postings?limit=100",
        "response_path": "content",
        "fields": _SMARTRECRUITERS_FIELDS,
        "follow_detail": True,
        "pagination_type": "offset",
        "pagination_param": "offset",
        "page_size": 100,
    },
    # Presight Solutions: wrong workable slug, found on SmartRecruiters (0 jobs but active)
    "Presight Solutions AS Jobs (workable.com)": {
        "type": "api",
        "url": "https://api.smartrecruiters.com/v1/companies/presightsolutions/postings?limit=100",
        "response_path": "content",
        "fields": _SMARTRECRUITERS_FIELDS,
        "follow_detail": True,
        "pagination_type": "offset",
        "pagination_param": "offset",
        "page_size": 100,
    },
    # Raw Power Games: wrong workable slug, found on SmartRecruiters (0 jobs but active)
    "Raw Power Games Jobs (workable.com)": {
        "type": "api",
        "url": "https://api.smartrecruiters.com/v1/companies/rawpowergames/postings?limit=100",
        "response_path": "content",
        "fields": _SMARTRECRUITERS_FIELDS,
        "follow_detail": True,
        "pagination_type": "offset",
        "pagination_param": "offset",
        "page_size": 100,
    },
    # bloXroute Labs: empty title field, fix selectors (WordPress site, 9 jobs verified)
    "bloXroute Labs Jobs": {
        "type": "html",
        "url": "https://bloxroute.com/careers/",
        "job_selector": "li.elementor-icon-list-item",
        "fields": {
            "title": "a span",
            "url": "a@href",
        },
        "company_name": "bloXroute Labs",
        "base_url": "https://bloxroute.com",
    },
    # Swanky: empty title field, switch to RSS feed (10 items verified)
    "Swanky (Shopify Platinum Partner) Jobs": {
        "type": "rss",
        "url": "https://swankyagency.com/job/feed/",
        "fields": {
            "title": "title",
            "url": "link",
            "description": "description",
            "posted_date": "pubDate",
        },
        "company_name": "Swanky",
    },
    # Microsoft (recruitee): generic recruitee URL returns non-Microsoft jobs
    # Fix to use company-specific subdomain (1 job verified)
    "Microsoft Jobs (recruitee.com)": {
        "type": "api",
        "url": "https://microsoft.recruitee.com/api/offers",
        "response_path": "offers",
        "fields": _RECRUITEE_FIELDS,
    },
}

# Sources to delete (company no longer exists, points to wrong site, or no ATS found)
DELETE = [
    # Template variable {{slug}} never expanded, not on any known ATS (0 jobs everywhere)
    "Lemon.io Jobs",
    # Points to LinkedIn (not a real careers page), SmartRecruiters has 0 jobs
    "DeweyLearn Inc. Jobs",
    # 404 on Greenhouse, SmartRecruiters has 0 jobs, company may be defunct
    "Nuclear Promise X Jobs (greenhouse.io)",
    # Angular SPA, no ATS found, no job links in HTML
    "Rapinno Tech Jobs",
    # Angular SPA, no ATS found, no job links in HTML
    "Great Good Jobs",
]


def run(db_path: str, dry_run: bool = False) -> None:
    """Execute the migration."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    now = datetime.now(timezone.utc).isoformat()
    total_fixed = 0

    # 1. Re-enable sources (clear error state, set active)
    for name in REENABLE:
        row = conn.execute(
            "SELECT id, status, config_json FROM job_sources WHERE name = ?", (name,)
        ).fetchone()
        if not row:
            logger.warning("SKIP (not found): %s", name)
            continue
        if row["status"] == "active":
            logger.info("SKIP (already active): %s", name)
            continue

        config = json.loads(row["config_json"]) if row["config_json"] else {}
        # Clear failure tracking
        config.pop("consecutive_failures", None)
        config.pop("disabled_at", None)
        config.pop("disabled_tags", None)
        notes = config.get("disabled_notes", "")
        config["disabled_notes"] = f"{notes}\n[{now}] Re-enabled: bug fix deployed".strip()

        logger.info("RE-ENABLE: %s (was %s)", name, row["status"])
        if not dry_run:
            conn.execute(
                "UPDATE job_sources SET status = 'active', last_error = NULL, "
                "config_json = ?, updated_at = ? WHERE id = ?",
                (json.dumps(config), now, row["id"]),
            )
        total_fixed += 1

    # 2. Fix configs and re-enable
    for name, new_config in CONFIG_FIXES.items():
        row = conn.execute(
            "SELECT id, status, source_type, config_json FROM job_sources WHERE name = ?",
            (name,),
        ).fetchone()
        if not row:
            logger.warning("SKIP (not found): %s", name)
            continue

        old_config = json.loads(row["config_json"]) if row["config_json"] else {}
        # Preserve company_name from old config if not in new config
        if "company_name" not in new_config and old_config.get("company_name"):
            new_config["company_name"] = old_config["company_name"]
        # Add migration note
        old_notes = old_config.get("disabled_notes", "")
        new_config["disabled_notes"] = f"{old_notes}\n[{now}] Config fixed by migration".strip()

        # Determine new source_type from config type
        new_source_type = new_config.get("type", row["source_type"])

        logger.info(
            "FIX CONFIG: %s — %s → %s",
            name,
            old_config.get("url", "?")[:60],
            new_config.get("url", "?")[:60],
        )
        if not dry_run:
            conn.execute(
                "UPDATE job_sources SET status = 'active', last_error = NULL, "
                "source_type = ?, config_json = ?, updated_at = ? WHERE id = ?",
                (new_source_type, json.dumps(new_config), now, row["id"]),
            )
        total_fixed += 1

    # 3. Delete dead sources
    for name in DELETE:
        row = conn.execute("SELECT id FROM job_sources WHERE name = ?", (name,)).fetchone()
        if not row:
            logger.warning("SKIP (not found): %s", name)
            continue
        logger.info("DELETE: %s", name)
        if not dry_run:
            # Clean up seen_urls first
            conn.execute("DELETE FROM seen_urls WHERE source_id = ?", (row["id"],))
            conn.execute("DELETE FROM job_sources WHERE id = ?", (row["id"],))
        total_fixed += 1

    if not dry_run:
        conn.commit()
    conn.close()

    action = "would fix" if dry_run else "fixed"
    logger.info("Done: %s %d sources", action, total_fixed)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python -m {__name__} <db_path> [--dry-run]")
        sys.exit(1)

    db_path = sys.argv[1]
    dry_run = "--dry-run" in sys.argv

    if dry_run:
        logger.info("DRY RUN — no changes will be made")

    run(db_path, dry_run=dry_run)
