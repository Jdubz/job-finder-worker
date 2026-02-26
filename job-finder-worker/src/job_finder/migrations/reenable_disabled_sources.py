"""
Combined migration to fix and re-enable all recoverable disabled/failed sources.

Subsumes the previous reenable_transient_sources.py migration (never run).

Fixes 35 sources across 4 categories:

1. Workday transient outage (18 disabled on 2026-02-20 ~08:01 UTC):
   All hit HTTP 400 simultaneously during a Workday-wide outage and were
   auto-disabled by the 3-strike rule. All endpoints now return HTTP 200.
   - Red Hat: fix source_type html→api, clear aggregator_domain, add company_name
   - Salesforce: fix garbage "100" prefix in name

2. Workday config/naming errors (12 failed):
   Auto-discovered sources with wrong company names or broken config formats.
   - 5 misnamed (URL points to different company than name suggests)
   - 4 with broken config format (missing fields, wrong key names)
   - 3 simple re-enables (config is fine)
   Also fixes 7 phantom company records created from wrong names.

3. Non-Workday config replacements (4 still disabled from prior migration):
   - Kforce: Azure Search API (replacing timed-out JS render)
   - Cotiviti: iCIMS static iframe (replacing timed-out JS render)
   - Jobgether: Lever API with pagination (avoiding 36MB unbounded response)
   - Insight Global: transient timeout, re-enable

4. Non-Workday failed (1):
   - Cummins: transient failure, re-enable

All endpoints verified returning live data as of 2026-02-25.

Usage:
    python -m job_finder.migrations.reenable_disabled_sources /path/to/database.db --dry-run
    python -m job_finder.migrations.reenable_disabled_sources /path/to/database.db
"""

import json
import logging
import sqlite3
import sys
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


# ── Standard Workday config builder ──────────────────────────────────────

_WORKDAY_FIELDS = {
    "title": "title",
    "url": "externalPath",
    "location": "locationsText",
    "posted_date": "postedOn",
}


def _workday_config(
    tenant: str,
    wd_instance: str,
    site_id: str,
    company_name: str,
    limit: int = 20,
) -> dict:
    """Build a standard Workday POST API config."""
    return {
        "type": "api",
        "url": f"https://{tenant}.{wd_instance}.myworkdayjobs.com/wday/cxs/{tenant}/{site_id}/jobs",
        "method": "POST",
        "post_body": {"limit": limit, "offset": 0},
        "response_path": "jobPostings",
        "base_url": f"https://{tenant}.{wd_instance}.myworkdayjobs.com/{site_id}",
        "fields": _WORKDAY_FIELDS,
        "headers": {"Content-Type": "application/json"},
        "company_name": company_name,
    }


# ── Kforce Azure Search API (replacing timed-out JS render) ─────────────

KFORCE_CONFIG = {
    "type": "api",
    "url": (
        "https://kforcewebeast.search.windows.net/indexes/kforcewebjobentity/docs"
        "?api-version=2016-09-01&search=*&$top=25&$count=true"
        "&$select=Title,Id,PostDate,City,State,SalaryMin,SalaryMax,SalaryText,"
        "ApplyUrl,Responsibilities,TypeCode"
    ),
    "response_path": "value",
    "headers": {"api-key": "1603E4DC4C87A8E41D6BBDE4EEA4EFB7"},
    "fields": {
        "title": "Title",
        "url": "ApplyUrl",
        "location": "City",
        "description": "Responsibilities",
        "posted_date": "PostDate",
    },
    "salary_min_field": "SalaryMin",
    "salary_max_field": "SalaryMax",
    "company_name": "Kforce",
    "pagination_type": "offset",
    "pagination_param": "$skip",
    "page_size": 25,
    "max_pages": 60,
}

# ── Cotiviti iCIMS (static iframe HTML, no JS needed) ───────────────────

COTIVITI_CONFIG = {
    "type": "html",
    "url": "https://careers-cotiviti.icims.com/jobs/search?pr=0&in_iframe=1&searchRelation=keyword_all",
    "job_selector": ".iCIMS_JobsTable .row",
    "requires_js": False,
    "fields": {
        "title": ".title h3",
        "url": ".title a@href",
        "location": ".header.left",
        "description": ".description",
    },
    "company_name": "Cotiviti",
    "base_url": "https://careers-cotiviti.icims.com",
    "pagination_type": "page_num",
    "pagination_param": "pr",
    "page_start": 0,
    "page_size": 50,
    "max_pages": 10,
}

# ── Jobgether Lever API with pagination ─────────────────────────────────

JOBGETHER_CONFIG = {
    "type": "api",
    "url": "https://api.lever.co/v0/postings/jobgether?mode=json&limit=100",
    "response_path": "",
    "fields": {
        "title": "text",
        "url": "hostedUrl",
        "location": "categories.location",
        "description": "descriptionPlain",
        "posted_date": "createdAt",
        "department": "categories.department",
    },
    "company_extraction": "from_title",
    "is_remote_source": True,
    "pagination_type": "offset",
    "pagination_param": "offset",
    "page_size": 100,
    "max_pages": 50,
}


# ── Source fix registry ─────────────────────────────────────────────────
#
# Each entry can specify:
#   config:      new config dict, or None to keep existing (just clear disable fields)
#   source_type: new source_type column value, or None to keep existing
#   name:        new source name, or None to keep existing
#   clear_aggregator_domain: if True, set aggregator_domain column to NULL
#   company_fix: dict with {name, website} to update the linked company record

SOURCES_TO_FIX = {
    # ── Category 1: Workday transient outage (18 disabled) ──────────────
    # All disabled 2026-02-20 ~08:01 UTC, all endpoints returning HTTP 200.
    # Config is correct, just needs status reset + disable fields cleared.
    "08e707a7-ac4a-4f20-989a-a83ab86cb55b": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Boeing
    "48d9e092-4c4c-4550-9919-ee1f8d8c3909": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Cardlytics
    "78a53e15-381a-46f2-bcef-358164d8e81b": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Centene
    "ce9da8cd-fba9-49da-b69f-42253c63ecc9": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Ciena
    "f2e3b3f8-15dc-495e-9a37-36174dfe514a": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Cleveland Clinic
    "de0a84a2-6f51-4aea-9193-72176d285be4": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Concentrix
    "c61804a6-ddf3-4ffc-9a42-f69db1417960": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # CSG
    "08cceb92-edce-43dc-b9c0-037fa40c3e0d": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Duck Creek
    "09888518-4afd-4bd6-a336-840cd99bfb93": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Eos Energy
    "325508a5-34b1-4ba0-8002-74b94d6098b8": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # GE HealthCare
    "492c3f3b-cc04-4230-8c66-3f4b4b772e94": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Green Dot
    "e074463e-3818-4309-9fbd-1f9c92d1c310": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Pluralsight
    "8fe2848a-65a7-45c6-9aa2-93138512e0fb": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Press Ganey
    "e5b59279-8d1a-4429-a84c-1f01c0f5c988": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Progressive Leasing
    "65b329b3-d341-4476-bfd9-cc1e11507309": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # RELX
    "1a30afb7-380b-430b-8e17-6db8dc83edad": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Solenis
    # Red Hat: fix source_type html→api, clear aggregator_domain, add company_name
    "b4dcee66-9724-4a2d-b938-9469cc35ccc7": {
        "name": None,
        "config": _workday_config("redhat", "wd5", "jobs", "Red Hat", limit=50),
        "source_type": "api",
        "clear_aggregator_domain": True,
    },
    # Salesforce: fix "100" prefix in source name and company name
    "09dbf836-bb8a-4137-af91-b08df0f93d6d": {
        "name": "Salesforce Jobs (myworkdayjobs.com)",
        "config": None,
        "source_type": None,
        "company_fix": {"name": "Salesforce, Inc."},
    },
    # ── Category 2: Workday config/naming errors (12 failed) ───────────
    # Simple re-enables (config is fine):
    "06107a85-f63c-48e0-bc2d-50da7418d029": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Astreya
    "85823756-108f-4189-b2e6-e2a30fbc58a2": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Yahoo
    "62a5a98a-50fe-4998-ab4a-55975feb79e3": {
        "name": "GE Vernova Jobs (myworkdayjobs.com)",
        "config": None,
        "source_type": None,
    },
    # Config format fixes:
    "ca84be0c-60ff-45b2-9f33-3a9319da0ae8": {
        "name": "WEX Inc. Jobs (myworkdayjobs.com)",
        "config": _workday_config("wexinc", "wd5", "WEXInc", "WEX Inc."),
        "source_type": "api",
        "company_fix": {"name": "WEX Inc.", "website": "https://www.wexinc.com"},
    },
    "76bf4e57-5b47-4ad9-9491-c9b85e52a250": {
        "name": "GD Information Technology Jobs (myworkdayjobs.com)",
        "config": _workday_config(
            "gdit", "wd5", "External_Career_Site", "GD Information Technology"
        ),
        "source_type": "api",
    },
    "1465aa9f-72a0-4d19-af2e-90093e17b2fd": {
        "name": None,
        "config": _workday_config("bristolmyerssquibb", "wd5", "BMS", "Bristol Myers Squibb"),
        "source_type": "api",
    },
    "107263fa-8e34-4122-a934-3b60cace30a7": {
        "name": "Autodesk Jobs (myworkdayjobs.com)",
        "config": _workday_config("autodesk", "wd1", "Ext", "Autodesk"),
        "source_type": "api",
    },
    # Misnamed sources (URL points to different company than name):
    "6be1efed-4d88-4c92-a79f-44f6630340f7": {
        # "Chipcolate" → Mondelez International (mdlz = stock ticker)
        "name": "Mondelez International Jobs (myworkdayjobs.com)",
        "config": _workday_config("mdlz", "wd3", "External", "Mondelez International"),
        "source_type": "api",
        "company_fix": {
            "name": "Mondelez International",
            "website": "https://www.mondelezinternational.com",
        },
    },
    "d8c5d20b-ff40-4dbe-a367-f69936b45a2f": {
        # "ECS" → ASCO (American Society of Clinical Oncology)
        "name": "ASCO Jobs (myworkdayjobs.com)",
        "config": _workday_config("asco", "wd5", "ASCO", "ASCO"),
        "source_type": "api",
        "company_fix": {
            "name": "ASCO",
            "website": "https://www.asco.org",
        },
    },
    "795c3c49-d099-498b-9b02-913f62ac058f": {
        # "GeneEase" → Genesys
        "name": "Genesys Jobs (myworkdayjobs.com)",
        "config": _workday_config("genesys", "wd1", "Genesys", "Genesys"),
        "source_type": "api",
        "company_fix": {
            "name": "Genesys",
            "website": "https://www.genesys.com",
        },
    },
    "e1f38967-adb4-4820-a188-fc11124b3281": {
        # "Intelerad" → Insulet Corporation
        "name": "Insulet Corporation Jobs (myworkdayjobs.com)",
        "config": _workday_config("insulet", "wd5", "insuletcareers", "Insulet Corporation"),
        "source_type": "api",
        "company_fix": {
            "name": "Insulet Corporation",
            "website": "https://www.insulet.com",
        },
    },
    "1bcac583-1e3a-458a-845d-4d1389192ac0": {
        # "World Wide Technology" → Dow Inc.
        "name": "Dow Jobs (myworkdayjobs.com)",
        "config": _workday_config("dow", "wd1", "externalcareers", "Dow"),
        "source_type": "api",
        "company_fix": {
            "name": "Dow",
            "website": "https://www.dow.com",
        },
    },
    # ── Category 3: Non-Workday config replacements (4 still disabled) ──
    "0f07bf49-1296-457b-81aa-bd8b9ac46809": {
        "name": None,
        "config": KFORCE_CONFIG,
        "source_type": "api",
    },
    "90916a4e-9130-4033-a9ac-18693a0fc07e": {
        "name": None,
        "config": COTIVITI_CONFIG,
        "source_type": "html",
    },
    "ae7c7804-20cf-4830-b324-24e0042b5dfd": {
        "name": None,
        "config": JOBGETHER_CONFIG,
        "source_type": "api",
    },
    "0deac23a-1814-45da-9ccd-7028216fd56e": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Insight Global
    # ── Category 4: Non-Workday failed (1) ──────────────────────────────
    "09d6de0d-91fe-4a61-90e1-23d3b286df8d": {
        "name": None,
        "config": None,
        "source_type": None,
    },  # Cummins
}


def run_migration(db_path: str, dry_run: bool = False) -> None:
    """Fix and re-enable disabled/failed sources with verified configs."""
    logger.info("=" * 60)
    logger.info("Combined source recovery migration")
    logger.info("=" * 60)
    logger.info(f"Database: {db_path}")
    logger.info(f"Dry run: {dry_run}")
    logger.info(f"Sources to process: {len(SOURCES_TO_FIX)}")
    logger.info("")

    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        fixed = 0
        skipped = 0
        companies_fixed = 0

        for source_id, fix in SOURCES_TO_FIX.items():
            new_name = fix.get("name")
            new_config = fix.get("config")
            new_source_type = fix.get("source_type")
            clear_aggregator = fix.get("clear_aggregator_domain", False)
            company_fix = fix.get("company_fix")

            cursor.execute(
                "SELECT id, name, status, source_type, config_json, company_id, "
                "aggregator_domain FROM job_sources WHERE id = ?",
                (source_id,),
            )
            row = cursor.fetchone()

            if not row:
                logger.warning(f"  NOT FOUND: {source_id}")
                skipped += 1
                continue

            name = row["name"]
            status = row["status"]

            if status not in ("disabled", "failed"):
                logger.info(f"  SKIP (status={status}): {name}")
                skipped += 1
                continue

            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            display_name = new_name or name
            changes = []

            if new_config is not None:
                # Full config replacement
                config_json = json.dumps(new_config)
                source_type = new_source_type or row["source_type"]
                changes.append(f"config → {new_config['type']}:{new_config['url']}")
            else:
                # Keep existing config, clear disable-related fields
                try:
                    config = json.loads(row["config_json"]) if row["config_json"] else {}
                except json.JSONDecodeError:
                    logger.warning(f"  SKIP (bad JSON): {name}")
                    skipped += 1
                    continue

                removed = []
                for key in ("disabled_notes", "disabled_tags", "consecutive_failures"):
                    if key in config:
                        removed.append(key)
                        config.pop(key)

                config_json = json.dumps(config)
                source_type = new_source_type or row["source_type"]
                if removed:
                    changes.append(f"cleared {', '.join(removed)}")

            if new_name and new_name != name:
                changes.append(f"name: {name} → {new_name}")

            if new_source_type and new_source_type != row["source_type"]:
                changes.append(f"source_type: {row['source_type']} → {new_source_type}")

            if clear_aggregator and row["aggregator_domain"]:
                changes.append(f"aggregator_domain: {row['aggregator_domain']} → NULL")

            logger.info(f"  FIX: {display_name} ({status} → active)")
            for change in changes:
                logger.info(f"    {change}")

            if not dry_run:
                if clear_aggregator:
                    cursor.execute(
                        """
                        UPDATE job_sources
                        SET status = 'active',
                            name = COALESCE(?, name),
                            config_json = ?,
                            source_type = ?,
                            aggregator_domain = NULL,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (new_name, config_json, source_type, now, source_id),
                    )
                else:
                    cursor.execute(
                        """
                        UPDATE job_sources
                        SET status = 'active',
                            name = COALESCE(?, name),
                            config_json = ?,
                            source_type = ?,
                            updated_at = ?
                        WHERE id = ?
                        """,
                        (new_name, config_json, source_type, now, source_id),
                    )

            # Fix linked company record if needed
            if company_fix and row["company_id"]:
                company_id = row["company_id"]
                fix_name = company_fix.get("name")
                fix_website = company_fix.get("website")

                parts = []
                if fix_name:
                    parts.append(f"name → {fix_name}")
                if fix_website:
                    parts.append(f"website → {fix_website}")
                logger.info(f"    company ({company_id}): {', '.join(parts)}")

                if not dry_run:
                    if fix_name and fix_website:
                        cursor.execute(
                            "UPDATE companies SET name = ?, website = ?, updated_at = ? WHERE id = ?",
                            (fix_name, fix_website, now, company_id),
                        )
                    elif fix_name:
                        cursor.execute(
                            "UPDATE companies SET name = ?, updated_at = ? WHERE id = ?",
                            (fix_name, now, company_id),
                        )
                companies_fixed += 1

            fixed += 1

        if not dry_run:
            conn.commit()
    finally:
        if conn:
            conn.close()

    logger.info("")
    logger.info("=" * 60)
    logger.info("Migration Complete")
    logger.info("=" * 60)
    logger.info(f"  Sources fixed & re-enabled: {fixed}")
    logger.info(f"  Company records corrected:  {companies_fixed}")
    logger.info(f"  Skipped (not disabled/failed or not found): {skipped}")
    if dry_run:
        logger.info("  (dry run — no changes written)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: python -m job_finder.migrations.reenable_disabled_sources"
            " <db_path> [--dry-run]"
        )
        sys.exit(1)

    db_path = sys.argv[1]
    dry_run = "--dry-run" in sys.argv

    run_migration(db_path, dry_run)
