import sqlite3
from pathlib import Path

from job_finder.storage.job_sources_manager import JobSourcesManager


def _bootstrap_db(path: Path):
    with sqlite3.connect(path) as conn:
        conn.execute(
            """
            CREATE TABLE job_sources (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              source_type TEXT NOT NULL,
              status TEXT NOT NULL,
              config_json TEXT NOT NULL,
              tags TEXT,
              company_id TEXT,
              aggregator_domain TEXT,
              last_scraped_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            """
        )


def test_create_from_discovery_persists_metadata(tmp_path):
    """Test that create_from_discovery persists source with company_id."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))
    source_id = mgr.create_from_discovery(
        name="Acme Greenhouse",
        source_type="greenhouse",
        config={"board_token": "acme"},
        company_id="comp-1",
        tags=["gh"],
    )

    stored = mgr.get_source_by_id(source_id)
    assert stored["name"] == "Acme Greenhouse"
    assert stored["sourceType"] == "greenhouse"
    assert stored["companyId"] == "comp-1"
    assert stored["aggregatorDomain"] is None
    assert stored["status"] == "active"
    assert stored["tags"] == ["gh"]


def test_create_from_discovery_aggregator_source(tmp_path):
    """Test that create_from_discovery persists aggregator source."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))
    source_id = mgr.create_from_discovery(
        name="Remotive Jobs",
        source_type="api",
        config={"url": "https://remotive.com/api/jobs"},
        aggregator_domain="remotive.com",
        tags=["remote"],
    )

    stored = mgr.get_source_by_id(source_id)
    assert stored["name"] == "Remotive Jobs"
    assert stored["sourceType"] == "api"
    assert stored["companyId"] is None
    assert stored["aggregatorDomain"] == "remotive.com"
    assert stored["status"] == "active"
    assert stored["tags"] == ["remote"]


def test_row_to_source_includes_disabled_tags(tmp_path):
    """Test that _row_to_source extracts disabledTags from config."""
    from job_finder.job_queue.models import SourceStatus

    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))
    source_id = mgr.create_from_discovery(
        name="Protected Source",
        source_type="api",
        config={
            "url": "https://api.example.com/jobs",
            "disabled_tags": ["protected_api", "auth_required"],
            "disabled_notes": "API requires authentication",
        },
        aggregator_domain="example.com",
        status=SourceStatus.DISABLED,
    )

    stored = mgr.get_source_by_id(source_id)
    assert stored["disabledTags"] == ["protected_api", "auth_required"]
    assert stored["disabledNotes"] == "API requires authentication"


def test_disable_source_with_tags_creates_tags(tmp_path):
    """Test that disable_source_with_tags creates disabled_tags array."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))
    source_id = mgr.create_from_discovery(
        name="Normal Source",
        source_type="html",
        config={"url": "https://example.com/careers"},
        aggregator_domain="example.com",
    )

    # Verify initially no disabled_tags
    stored = mgr.get_source_by_id(source_id)
    assert stored["status"] == "active"
    assert stored["disabledTags"] == []

    # Disable with tags
    mgr.disable_source_with_tags(
        source_id,
        "Bot protection detected",
        tags=["anti_bot"],
    )

    stored = mgr.get_source_by_id(source_id)
    assert stored["status"] == "disabled"
    assert stored["disabledTags"] == ["anti_bot"]
    assert "Bot protection detected" in stored["disabledNotes"]


def test_disable_source_with_tags_merges_existing(tmp_path):
    """Test that new tags are merged with existing ones without duplicates."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))
    # Create source already with a disabled tag
    source_id = mgr.create_from_discovery(
        name="Partially Tagged Source",
        source_type="api",
        config={
            "url": "https://api.example.com/jobs",
            "disabled_tags": ["anti_bot"],
        },
        aggregator_domain="example.com",
    )

    # Disable with additional tag
    mgr.disable_source_with_tags(
        source_id,
        "Also requires auth",
        tags=["auth_required", "anti_bot"],  # Include duplicate
    )

    stored = mgr.get_source_by_id(source_id)
    # Should have both tags, sorted, no duplicates
    assert stored["disabledTags"] == ["anti_bot", "auth_required"]


def test_disable_source_with_tags_appends_notes(tmp_path):
    """Test that calling disable_source_with_tags twice appends notes."""
    db = tmp_path / "sources.db"
    _bootstrap_db(db)

    mgr = JobSourcesManager(str(db))
    source_id = mgr.create_from_discovery(
        name="Multi-Disable Source",
        source_type="html",
        config={"url": "https://example.com/careers"},
        aggregator_domain="example.com",
    )

    # First disable
    mgr.disable_source_with_tags(
        source_id,
        "Bot protection detected",
        tags=["anti_bot"],
    )

    stored = mgr.get_source_by_id(source_id)
    assert "Bot protection detected" in stored["disabledNotes"]

    # Second disable (DISABLED -> DISABLED transition)
    mgr.disable_source_with_tags(
        source_id,
        "Also requires authentication",
        tags=["auth_required"],
    )

    stored = mgr.get_source_by_id(source_id)
    # Notes should contain both reasons
    assert "Bot protection detected" in stored["disabledNotes"]
    assert "Also requires authentication" in stored["disabledNotes"]
    # Tags should be merged
    assert stored["disabledTags"] == ["anti_bot", "auth_required"]
