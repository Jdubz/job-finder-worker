"""Tests for ConfigLoader AI configuration methods.

Tests the get_ai_settings method of ConfigLoader which retrieves
AI provider configuration.

Note: get_job_match was removed during hybrid scoring migration.
Job matching now uses scoring-config and title-filter instead.
"""

import sqlite3
import json
import pytest
from job_finder.job_queue.config_loader import ConfigLoader


class TestConfigLoaderAISettings:
    """Test ConfigLoader.get_ai_settings method."""

    @pytest.fixture
    def db_path(self, tmp_path):
        """Create a temporary SQLite database with config table."""
        db_file = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_file))
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS job_finder_config (
                id TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT,
                updated_by TEXT
            )
        """
        )
        conn.commit()
        conn.close()
        return str(db_file)

    def test_get_ai_settings_returns_stored_config(self, db_path):
        """Should return stored AI settings from database."""
        # Insert AI settings
        conn = sqlite3.connect(db_path)
        payload = {
            "worker": {
                "selected": {
                    "provider": "claude",
                    "interface": "api",
                    "model": "claude-sonnet-4-5-20250929",
                },
            },
            "documentGenerator": {
                "selected": {
                    "provider": "openai",
                    "interface": "api",
                    "model": "gpt-4o",
                },
            },
            "options": [],
        }
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("ai-settings", json.dumps(payload), "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)
        ai_settings = loader.get_ai_settings()

        assert ai_settings["worker"]["selected"]["provider"] == "claude"
        assert ai_settings["worker"]["selected"]["interface"] == "api"
        assert ai_settings["worker"]["selected"]["model"] == "claude-sonnet-4-5-20250929"
        assert ai_settings["documentGenerator"]["selected"]["provider"] == "openai"

    def test_get_ai_settings_missing_raises(self, db_path):
        """Should fail loudly when ai-settings is missing."""
        loader = ConfigLoader(db_path)
        with pytest.raises(Exception):
            loader.get_ai_settings()

    def test_get_ai_settings_with_full_config(self, db_path):
        """Should handle full AI settings with providers array."""
        conn = sqlite3.connect(db_path)
        payload = {
            "worker": {
                "selected": {
                    "provider": "openai",
                    "interface": "api",
                    "model": "gpt-4o",
                }
            },
            "documentGenerator": {
                "selected": {
                    "provider": "claude",
                    "interface": "api",
                    "model": "claude-sonnet-4-5-20250929",
                }
            },
        }
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("ai-settings", json.dumps(payload), "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)
        ai_settings = loader.get_ai_settings()

        assert ai_settings["worker"]["selected"]["provider"] == "openai"
        assert ai_settings["documentGenerator"]["selected"]["provider"] == "claude"
        assert "options" in ai_settings


# NOTE: TestConfigLoaderJobMatch was removed during hybrid scoring migration.
# Job matching now uses scoring-config and title-filter instead of match-policy.


class TestConfigLoaderIntegration:
    """Integration tests for ConfigLoader AI methods."""

    @pytest.fixture
    def db_path(self, tmp_path):
        """Create a temporary SQLite database with config table."""
        db_file = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_file))
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS job_finder_config (
                id TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                created_at TEXT,
                updated_at TEXT,
                updated_by TEXT
            )
        """
        )
        conn.commit()
        conn.close()
        return str(db_file)

    def test_ai_settings_and_scoring_config_are_separate(self, db_path):
        """Should store and retrieve AI settings and scoring-config independently."""
        conn = sqlite3.connect(db_path)

        # Insert both configs
        ai_payload = {
            "worker": {
                "selected": {"provider": "claude", "interface": "api", "model": "claude-sonnet"}
            },
            "documentGenerator": {
                "selected": {"provider": "openai", "interface": "api", "model": "gpt-4o"}
            },
            "options": [],
        }
        scoring_config_payload = {
            "minScore": 60,
            "weights": {"skillMatch": 40, "experienceMatch": 30, "seniorityMatch": 30},
            "seniority": {"preferred": ["senior"], "acceptable": ["mid"], "rejected": ["junior"]},
        }

        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("ai-settings", json.dumps(ai_payload), "2024-01-01", "2024-01-01"),
        )
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("scoring-config", json.dumps(scoring_config_payload), "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)

        ai_settings = loader.get_ai_settings()
        scoring_config = loader.get_scoring_config()

        # Verify they are separate
        assert ai_settings["worker"]["selected"]["provider"] == "claude"
        assert scoring_config["minScore"] == 60

        # AI settings should not have scoring fields
        assert "minScore" not in ai_settings
        # Scoring config should not have AI settings fields
        assert "worker" not in scoring_config

    def test_loading_ai_settings_multiple_times_is_consistent(self, db_path):
        """Should return consistent results across multiple calls."""
        conn = sqlite3.connect(db_path)
        payload = {
            "worker": {
                "selected": {"provider": "openai", "interface": "api", "model": "gpt-4o"}
            },
            "documentGenerator": {
                "selected": {"provider": "claude", "interface": "api", "model": "claude-sonnet"}
            },
        }
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("ai-settings", json.dumps(payload), "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)

        # Call multiple times
        result1 = loader.get_ai_settings()
        result2 = loader.get_ai_settings()
        result3 = loader.get_ai_settings()

        assert result1 == result2 == result3
