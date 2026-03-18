"""
Migration script to convert legacy source configs to new SourceConfig format.

Run this script once to migrate all job_sources entries to the new config format.

Usage:
    python -m job_finder.migrations.migrate_source_configs /path/to/database.db
"""

import json
import logging
import sqlite3
import sys
from typing import Any, Dict, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# New config templates for each source type
GREENHOUSE_CONFIG_TEMPLATE = {
    "type": "api",
    "url": "https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true",
    "response_path": "jobs",
    "fields": {
        "title": "title",
        "location": "location.name",
        "description": "content",
        "url": "absolute_url",
        "posted_date": "updated_at",
    },
}

RSS_CONFIG_TEMPLATE = {
    "type": "rss",
    "fields": {
        "title": "title",
        "description": "summary",
        "url": "link",
        "posted_date": "published",
    },
}

REMOTEOK_CONFIG = {
    "type": "api",
    "url": "https://remoteok.com/api",
    "response_path": "[1:]",
    "fields": {
        "title": "position",
        "company": "company",
        "location": "location",
        "description": "description",
        "url": "url",
        "posted_date": "date",
    },
    "salary_min_field": "salary_min",
    "salary_max_field": "salary_max",
}


def migrate_greenhouse_config(old_config: Dict[str, Any], source_name: str) -> Dict[str, Any]:
    """Convert legacy Greenhouse config to new format."""
    board_token = old_config.get("board_token", "")
    if not board_token:
        logger.warning(f"Greenhouse source '{source_name}' missing board_token")
        return {}

    new_config = GREENHOUSE_CONFIG_TEMPLATE.copy()
    new_config["url"] = new_config["url"].format(board_token=board_token)
    new_config["company_name"] = old_config.get("name", source_name)
    new_config["fields"] = dict(GREENHOUSE_CONFIG_TEMPLATE["fields"])

    return new_config


def migrate_rss_config(old_config: Dict[str, Any], source_name: str) -> Dict[str, Any]:
    """Convert legacy RSS config to new format."""
    rss_url = old_config.get("url", "")
    if not rss_url:
        logger.warning(f"RSS source '{source_name}' missing url")
        return {}

    new_config = {
        "type": "rss",
        "url": rss_url,
        "fields": {
            "title": old_config.get("title_field", "title"),
            "description": old_config.get("description_field", "summary"),
            "url": old_config.get("link_field", "link"),
            "posted_date": "published",
        },
    }

    # Add company extraction field if configured
    if old_config.get("company_field"):
        new_config["fields"]["company"] = old_config["company_field"]

    return new_config


def migrate_api_config(old_config: Dict[str, Any], source_name: str) -> Dict[str, Any]:
    """Convert legacy API config to new format."""
    base_url = old_config.get("base_url", "")

    # Check for RemoteOK
    if "remoteok" in base_url.lower():
        return dict(REMOTEOK_CONFIG)

    # Generic API - needs manual field mapping
    if not base_url:
        logger.warning(f"API source '{source_name}' missing base_url")
        return {}

    return {
        "type": "api",
        "url": base_url,
        "response_path": old_config.get("response_path", ""),
        "fields": {
            "title": "title",
            "url": "url",
        },
        "_needs_field_mapping": True,  # Flag for manual review
    }


def migrate_company_page_config(old_config: Dict[str, Any], source_name: str) -> Dict[str, Any]:
    """Convert legacy company-page config to new format."""
    # company-page configs are typically custom HTML scrapers
    api_endpoint = old_config.get("api_endpoint", "")
    selectors = old_config.get("selectors", {})

    if api_endpoint:
        # It's actually an API
        return {
            "type": "api",
            "url": api_endpoint,
            "response_path": old_config.get("response_path", ""),
            "fields": {
                "title": "title",
                "url": "url",
            },
            "_needs_field_mapping": True,
        }
    elif selectors:
        # HTML scraper with selectors
        return {
            "type": "html",
            "url": old_config.get("url", ""),
            "job_selector": selectors.get("job_item", ""),
            "fields": {
                "title": selectors.get("title", ".title"),
                "url": selectors.get("apply_url", "a@href"),
                "company": selectors.get("company", ""),
                "location": selectors.get("location", ""),
                "description": selectors.get("description", ""),
            },
            "_needs_validation": True,
        }

    logger.warning(f"company-page source '{source_name}' has unclear config")
    return {}


def migrate_source(source: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Migrate a single source to new config format."""
    source_name = source["name"]
    source_type = source["source_type"]
    old_config = source["config"]

    # Skip if already migrated
    if isinstance(old_config, dict) and "type" in old_config:
        logger.info(f"  Skipping '{source_name}' - already migrated")
        return None

    logger.info(f"  Migrating '{source_name}' (type={source_type})")

    if source_type == "greenhouse":
        new_config = migrate_greenhouse_config(old_config, source_name)
    elif source_type == "rss":
        new_config = migrate_rss_config(old_config, source_name)
    elif source_type == "api":
        new_config = migrate_api_config(old_config, source_name)
    elif source_type == "company-page":
        new_config = migrate_company_page_config(old_config, source_name)
    else:
        logger.warning(f"  Unknown source type: {source_type}")
        return None

    if not new_config:
        return None

    return new_config


def run_migration(db_path: str, dry_run: bool = False) -> None:
    """Run the migration on a database."""
    logger.info(f"Starting migration on {db_path}")
    logger.info(f"Dry run: {dry_run}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Get all sources
    cursor.execute(
        """
        SELECT id, name, sourceType as source_type, config_json
        FROM job_sources
        WHERE enabled = 1
        """
    )

    sources = []
    for row in cursor.fetchall():
        try:
            config = json.loads(row["config_json"]) if row["config_json"] else {}
        except json.JSONDecodeError:
            config = {}

        sources.append(
            {
                "id": row["id"],
                "name": row["name"],
                "source_type": row["source_type"],
                "config": config,
            }
        )

    logger.info(f"Found {len(sources)} active sources")

    migrated = 0
    skipped = 0
    failed = 0
    needs_review = []

    for source in sources:
        try:
            new_config = migrate_source(source)

            if new_config is None:
                skipped += 1
                continue

            # Check if needs manual review
            if new_config.get("_needs_field_mapping") or new_config.get("_needs_validation"):
                needs_review.append((source["name"], new_config))
                # Remove flags before saving
                new_config.pop("_needs_field_mapping", None)
                new_config.pop("_needs_validation", None)

            if not dry_run:
                cursor.execute(
                    """
                    UPDATE job_sources
                    SET config_json = ?
                    WHERE id = ?
                    """,
                    (json.dumps(new_config), source["id"]),
                )

            migrated += 1

        except Exception as e:
            logger.error(f"  Error migrating '{source['name']}': {e}")
            failed += 1

    if not dry_run:
        conn.commit()

    conn.close()

    logger.info("\n" + "=" * 50)
    logger.info("Migration Complete")
    logger.info("=" * 50)
    logger.info(f"  Migrated: {migrated}")
    logger.info(f"  Skipped: {skipped}")
    logger.info(f"  Failed: {failed}")

    if needs_review:
        logger.warning("\nSources needing manual review:")
        for name, config in needs_review:
            logger.warning(f"  - {name}: {json.dumps(config, indent=2)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m job_finder.migrations.migrate_source_configs <db_path> [--dry-run]")
        sys.exit(1)

    db_path = sys.argv[1]
    dry_run = "--dry-run" in sys.argv

    run_migration(db_path, dry_run)
