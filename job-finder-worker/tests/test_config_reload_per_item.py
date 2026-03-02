"""Tests for per-item config reload in processors.

Verifies that config changes in the database are picked up by the next item
processed, without requiring a worker restart.
"""

import ast
import json
import sqlite3
from pathlib import Path

import pytest

from job_finder.job_queue.config_loader import ConfigLoader


def create_test_db(db_path: str) -> None:
    """Create a test database with required tables and minimal config."""
    conn = sqlite3.connect(db_path)

    # Create config table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS job_finder_config (
            id TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT,
            updated_by TEXT
        )
    """)

    # Create minimal prefilter-policy
    prefilter_policy = {
        "title": {
            "rejectPatterns": ["intern"],
            "rejectKeywords": [],
        },
        "freshness": {"maxAgeDays": 30},
        "workArrangement": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": True,
            "willRelocate": False,
            "userLocation": "Portland, OR",
        },
        "employmentType": {"allowContract": True, "allowFullTime": True},
        "salary": {"minimumSalary": 0},
    }

    # Create minimal worker-settings
    worker_settings = {
        "scraping": {},
        "textLimits": {},
        "runtime": {
            "processingTimeoutSeconds": 300,
            "isProcessingEnabled": True,
            "taskDelaySeconds": 0,
            "pollIntervalSeconds": 60,
        },
    }

    conn.execute(
        "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
        ("prefilter-policy", json.dumps(prefilter_policy), "2024-01-01", "2024-01-01"),
    )
    conn.execute(
        "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
        ("worker-settings", json.dumps(worker_settings), "2024-01-01", "2024-01-01"),
    )

    conn.commit()
    conn.close()


def update_prefilter_config(db_path: str, reject_patterns: list) -> None:
    """Update prefilter-policy with new reject patterns."""
    conn = sqlite3.connect(db_path)
    row = conn.execute(
        "SELECT payload_json FROM job_finder_config WHERE id = ?", ("prefilter-policy",)
    ).fetchone()
    config = json.loads(row[0])
    config["title"]["rejectPatterns"] = reject_patterns
    conn.execute(
        "UPDATE job_finder_config SET payload_json = ? WHERE id = ?",
        (json.dumps(config), "prefilter-policy"),
    )
    conn.commit()
    conn.close()


class TestConfigReloadPerItem:
    """Test that config changes are picked up per-item."""

    @pytest.fixture
    def db_path(self, tmp_path):
        """Create a temporary SQLite database with config."""
        db_file = tmp_path / "test.db"
        create_test_db(str(db_file))
        return str(db_file)

    def test_config_loader_returns_fresh_config_each_call(self, db_path):
        """ConfigLoader should return fresh config on each call, not cached."""
        loader = ConfigLoader(db_path)

        # Get initial config
        config1 = loader.get_prefilter_policy()
        assert config1["title"]["rejectPatterns"] == ["intern"]

        # Update config in database
        update_prefilter_config(db_path, ["intern", "junior"])

        # Get config again - should reflect the change
        config2 = loader.get_prefilter_policy()
        assert config2["title"]["rejectPatterns"] == ["intern", "junior"]

    def test_config_loader_get_personal_info_graceful_when_missing(self, db_path):
        """get_personal_info should return empty dict when config missing."""
        loader = ConfigLoader(db_path)

        # personal-info not in test db - should return empty dict
        result = loader.get_personal_info()
        assert result == {}

    def test_config_loader_get_personal_info_returns_data_when_present(self, db_path):
        """get_personal_info should return config when present."""
        # Add personal-info to database
        conn = sqlite3.connect(db_path)
        personal_info = {
            "name": "Test User",
            "city": "Portland",
            "timezone": -8,
            "relocationAllowed": True,
        }
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("personal-info", json.dumps(personal_info), "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)
        result = loader.get_personal_info()

        assert result["city"] == "Portland"
        assert result["timezone"] == -8
        assert result["relocationAllowed"] is True

    def test_config_changes_reflected_in_successive_calls(self, db_path):
        """Config changes should be reflected immediately in next call."""
        loader = ConfigLoader(db_path)

        # Add personal-info
        conn = sqlite3.connect(db_path)
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (
                "personal-info",
                json.dumps({"city": "Portland", "timezone": -8}),
                "2024-01-01",
                "2024-01-01",
            ),
        )
        conn.commit()
        conn.close()

        # First call
        result1 = loader.get_personal_info()
        assert result1["city"] == "Portland"

        # Update config
        conn = sqlite3.connect(db_path)
        conn.execute(
            "UPDATE job_finder_config SET payload_json = ? WHERE id = ?",
            (json.dumps({"city": "Seattle", "timezone": -8}), "personal-info"),
        )
        conn.commit()
        conn.close()

        # Second call - should reflect update
        result2 = loader.get_personal_info()
        assert result2["city"] == "Seattle"


def _class_has_method(source_path: Path, class_name: str, method_name: str) -> bool:
    """Check if a class in the source file has a specific method defined."""
    source = source_path.read_text()
    tree = ast.parse(source)

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name == method_name:
                    return True
    return False


class TestProcessorRefreshMethods:
    """Test that processors have _refresh_runtime_config methods.

    Uses AST inspection to avoid import chain issues with optional dependencies.
    """

    @pytest.fixture
    def processors_dir(self):
        """Return path to processors directory."""
        return Path(__file__).parent.parent / "src" / "job_finder" / "job_queue" / "processors"

    def test_job_processor_has_refresh_method(self, processors_dir):
        """JobProcessor should have _refresh_runtime_config method."""
        source_path = processors_dir / "job_processor.py"
        assert source_path.exists(), f"JobProcessor source not found at {source_path}"
        assert _class_has_method(source_path, "JobProcessor", "_refresh_runtime_config")

    def test_source_processor_has_refresh_method(self, processors_dir):
        """SourceProcessor should have _refresh_runtime_config method."""
        source_path = processors_dir / "source_processor.py"
        assert source_path.exists(), f"SourceProcessor source not found at {source_path}"
        assert _class_has_method(source_path, "SourceProcessor", "_refresh_runtime_config")
