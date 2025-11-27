"""
Migration to normalize job_sources config_json shapes.

This migration:
1. Fixes source_type for misclassified Greenhouse sources (api/company-page -> greenhouse)
2. Simplifies Greenhouse configs to just {"board_token": "xxx"}
3. Removes redundant "type" field from configs (now derived from source_type column)

Usage:
    python -m job_finder.migrations.normalize_source_configs /path/to/database.db [--dry-run]
"""

import json
import logging
import re
import sqlite3
import sys
from typing import Any, Dict, Optional, Tuple

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


def extract_greenhouse_board_token(config: Dict[str, Any]) -> Optional[str]:
    """
    Extract Greenhouse board_token from various config formats.

    Returns board_token if found, None otherwise.
    """
    # Direct board_token
    if config.get("board_token"):
        return config["board_token"]

    # Extract from URL like boards-api.greenhouse.io/v1/boards/{token}/jobs
    url = config.get("url", "")
    match = re.search(r"boards-api\.greenhouse\.io/v1/boards/([^/]+)/jobs", url)
    if match:
        return match.group(1)

    # Check URL for boards.greenhouse.io/{token}
    match = re.search(r"boards\.greenhouse\.io/([^/]+)", url)
    if match:
        return match.group(1)

    return None


def is_greenhouse_source(config: Dict[str, Any]) -> bool:
    """Check if config is actually a Greenhouse source."""
    url = config.get("url", "")
    return "greenhouse.io" in url or config.get("board_token")


def normalize_greenhouse_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize Greenhouse config to simple board_token format.

    The full API URL and field mappings are derived at runtime by expand_config().
    """
    board_token = extract_greenhouse_board_token(config)
    if not board_token:
        logger.warning(f"  Could not extract board_token from config: {config}")
        return config  # Return as-is if can't normalize

    return {"board_token": board_token}


def normalize_rss_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize RSS config to remove redundant fields.

    Keep only: url, fields (for custom mappings)
    """
    result: Dict[str, Any] = {}

    # URL is required
    url = config.get("url", "")
    if not url:
        return config
    result["url"] = url

    # Keep custom field mappings if they differ from defaults
    fields = config.get("fields")
    if fields:
        result["fields"] = fields
    elif any(k in config for k in ["title_field", "description_field", "link_field"]):
        # Convert legacy format
        result["fields"] = {
            "title": config.get("title_field", "title"),
            "description": config.get("description_field", "summary"),
            "url": config.get("link_field", "link"),
            "posted_date": "published",
        }

    return result


def normalize_api_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize generic API config by removing redundant 'type' field.

    Keep: url, response_path, fields, headers, auth_*, salary_* fields
    """
    result: Dict[str, Any] = {}

    # Required fields
    url = config.get("url") or config.get("base_url", "")
    if not url:
        return config
    result["url"] = url

    # Optional but important fields
    if config.get("response_path"):
        result["response_path"] = config["response_path"]
    if config.get("fields"):
        result["fields"] = config["fields"]
    if config.get("headers"):
        result["headers"] = config["headers"]
    if config.get("company_name"):
        result["company_name"] = config["company_name"]

    # Auth fields
    if config.get("api_key"):
        result["api_key"] = config["api_key"]
    if config.get("auth_type"):
        result["auth_type"] = config["auth_type"]
    if config.get("auth_param"):
        result["auth_param"] = config["auth_param"]

    # Salary fields
    if config.get("salary_min_field"):
        result["salary_min_field"] = config["salary_min_field"]
    if config.get("salary_max_field"):
        result["salary_max_field"] = config["salary_max_field"]

    return result


def normalize_company_page_config(config: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """
    Normalize company-page config.

    Returns (new_source_type, normalized_config).
    May reclassify to 'api', 'html', or keep as 'company-page'.
    """
    # Check if it's actually a Greenhouse source
    if is_greenhouse_source(config):
        return "greenhouse", normalize_greenhouse_config(config)

    # Check if it's an API config
    if config.get("type") == "api" or config.get("api_endpoint"):
        result: Dict[str, Any] = {}
        url = config.get("url") or config.get("api_endpoint", "")
        if url:
            result["url"] = url
        if config.get("response_path"):
            result["response_path"] = config["response_path"]
        if config.get("fields"):
            result["fields"] = config["fields"]
        if config.get("company_name"):
            result["company_name"] = config["company_name"]
        return "api", result

    # Check if it's an HTML scraper config
    if config.get("type") == "html" or config.get("job_selector"):
        result = {}
        if config.get("url"):
            result["url"] = config["url"]
        if config.get("job_selector"):
            result["job_selector"] = config["job_selector"]
        if config.get("fields"):
            result["fields"] = config["fields"]
        if config.get("company_name"):
            result["company_name"] = config["company_name"]
        return "html", result

    # Can't determine - keep as company-page
    # Remove type field if present
    result = {k: v for k, v in config.items() if k != "type"}
    return "company-page", result


def normalize_source(source_type: str, config: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """
    Normalize a source's type and config.

    Returns (new_source_type, normalized_config).
    """
    # First, check if source_type is misclassified
    if source_type in ("api", "company-page") and is_greenhouse_source(config):
        logger.info(f"  Reclassifying from '{source_type}' to 'greenhouse'")
        return "greenhouse", normalize_greenhouse_config(config)

    # Normalize based on source_type
    if source_type == "greenhouse":
        return "greenhouse", normalize_greenhouse_config(config)
    elif source_type == "rss":
        return "rss", normalize_rss_config(config)
    elif source_type == "api":
        return "api", normalize_api_config(config)
    elif source_type == "company-page":
        return normalize_company_page_config(config)
    else:
        # Unknown type - just remove 'type' field if present
        result = {k: v for k, v in config.items() if k != "type"}
        return source_type, result


def run_migration(db_path: str, dry_run: bool = False) -> None:
    """Run the normalization migration."""
    logger.info(f"Normalizing job_sources configs in {db_path}")
    logger.info(f"Dry run: {dry_run}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Get all sources
    cursor.execute("SELECT id, name, source_type, config_json FROM job_sources")
    sources = cursor.fetchall()

    logger.info(f"Found {len(sources)} sources")

    updated = 0
    reclassified = 0
    errors = 0

    for row in sources:
        source_id = row["id"]
        name = row["name"]
        source_type = row["source_type"]

        try:
            config = json.loads(row["config_json"]) if row["config_json"] else {}
        except json.JSONDecodeError:
            logger.warning(f"  Invalid JSON for {name}, skipping")
            errors += 1
            continue

        logger.info(f"Processing: {name} ({source_type})")

        try:
            new_type, new_config = normalize_source(source_type, config)
        except Exception as e:
            logger.error(f"  Error normalizing {name}: {e}")
            errors += 1
            continue

        # Check if anything changed
        type_changed = new_type != source_type
        config_changed = new_config != config

        if not type_changed and not config_changed:
            logger.info("  No changes needed")
            continue

        if type_changed:
            logger.info(f"  Type: {source_type} -> {new_type}")
            reclassified += 1

        if config_changed:
            logger.info(f"  Config: {json.dumps(config)[:80]}...")
            logger.info(f"      -> {json.dumps(new_config)[:80]}...")

        if not dry_run:
            cursor.execute(
                """
                UPDATE job_sources
                SET source_type = ?, config_json = ?, updated_at = datetime('now')
                WHERE id = ?
                """,
                (new_type, json.dumps(new_config), source_id),
            )
        updated += 1

    if not dry_run:
        conn.commit()

    conn.close()

    logger.info("\n" + "=" * 50)
    logger.info("Migration Complete")
    logger.info("=" * 50)
    logger.info(f"  Updated: {updated}")
    logger.info(f"  Reclassified: {reclassified}")
    logger.info(f"  Errors: {errors}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m job_finder.migrations.normalize_source_configs <db_path> [--dry-run]")
        sys.exit(1)

    db_path = sys.argv[1]
    dry_run = "--dry-run" in sys.argv

    run_migration(db_path, dry_run)
