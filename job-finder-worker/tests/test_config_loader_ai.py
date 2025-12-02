"""Tests for ConfigLoader AI and job match configuration methods.

Tests the get_ai_settings and get_job_match methods of ConfigLoader
which retrieve AI provider and job matching configuration.
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
        assert (
            ai_settings["worker"]["selected"]["model"] == "claude-sonnet-4-5-20250929"
        )
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


class TestConfigLoaderJobMatch:
    """Test ConfigLoader.get_job_match method."""

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

    def test_get_job_match_returns_stored_config(self, db_path):
        """Should return stored job match config from match-policy.jobMatch."""
        conn = sqlite3.connect(db_path)
        # match-policy contains jobMatch as a nested key
        payload = {
            "jobMatch": {
                "minMatchScore": 80,
                "portlandOfficeBonus": 20,
                "userTimezone": -7,
                "preferLargeCompanies": False,
                "generateIntakeData": False,
            },
            "companyWeights": {},
            "dealbreakers": {},
        }
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("match-policy", json.dumps(payload), "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)
        job_match = loader.get_job_match()

        assert job_match["minMatchScore"] == 80
        assert job_match["portlandOfficeBonus"] == 20
        assert job_match["userTimezone"] == -7
        assert job_match["preferLargeCompanies"] is False
        assert job_match["generateIntakeData"] is False

    def test_get_job_match_missing_raises(self, db_path):
        """Should fail loudly when match-policy is missing."""
        loader = ConfigLoader(db_path)
        with pytest.raises(Exception):
            loader.get_job_match()

    def test_get_job_match_returns_partial_config(self, db_path):
        """Should merge partial jobMatch with defaults."""
        conn = sqlite3.connect(db_path)
        # Only store some jobMatch fields
        payload = {
            "jobMatch": {
                "minMatchScore": 85,
                "generateIntakeData": False,
            },
            "companyWeights": {
                "priorityThresholds": {"high": 85, "medium": 70},
            },
        }
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("match-policy", json.dumps(payload), "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)
        job_match = loader.get_job_match()

        # Stored values should be returned without backfilling defaults
        assert job_match["minMatchScore"] == 85
        assert job_match["generateIntakeData"] is False
        assert "portlandOfficeBonus" not in job_match
        assert job_match["companyWeights"]["priorityThresholds"]["high"] == 85

    def test_get_job_match_handles_invalid_json(self, db_path):
        """Invalid JSON should raise InitializationError."""
        conn = sqlite3.connect(db_path)
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("match-policy", "invalid json", "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)
        with pytest.raises(Exception):
            loader.get_job_match()

    def test_get_job_match_score_range(self, db_path):
        """Should accept various valid match scores."""
        for score in [0, 50, 70, 100]:
            conn = sqlite3.connect(db_path)
            conn.execute("DELETE FROM job_finder_config WHERE id = 'match-policy'")
            payload = {"jobMatch": {"minMatchScore": score}}
            conn.execute(
                "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
                ("match-policy", json.dumps(payload), "2024-01-01", "2024-01-01"),
            )
            conn.commit()
            conn.close()

            loader = ConfigLoader(db_path)
            job_match = loader.get_job_match()
            assert job_match["minMatchScore"] == score

    def test_get_job_match_timezone_range(self, db_path):
        """Should accept various timezone offsets."""
        for tz in [-12, -8, 0, 5.5, 12]:
            conn = sqlite3.connect(db_path)
            conn.execute("DELETE FROM job_finder_config WHERE id = 'match-policy'")
            payload = {"jobMatch": {"userTimezone": tz}}
            conn.execute(
                "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
                ("match-policy", json.dumps(payload), "2024-01-01", "2024-01-01"),
            )
            conn.commit()
            conn.close()

            loader = ConfigLoader(db_path)
            job_match = loader.get_job_match()
            assert job_match["userTimezone"] == tz


class TestConfigLoaderIntegration:
    """Integration tests for ConfigLoader AI/match-policy methods."""

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

    def test_ai_settings_and_match_policy_are_separate(self, db_path):
        """Should store and retrieve AI settings and match-policy independently."""
        conn = sqlite3.connect(db_path)

        # Insert both configs
        ai_payload = {
            "worker": {
                "selected": {
                    "provider": "claude",
                    "interface": "api",
                    "model": "claude-sonnet",
                }
            },
            "documentGenerator": {
                "selected": {
                    "provider": "openai",
                    "interface": "api",
                    "model": "gpt-4o",
                }
            },
            "options": [],
        }
        match_policy_payload = {
            "jobMatch": {
                "minMatchScore": 90,
                "portlandOfficeBonus": 25,
            },
            "companyWeights": {},
            "dealbreakers": {},
        }

        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("ai-settings", json.dumps(ai_payload), "2024-01-01", "2024-01-01"),
        )
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (
                "match-policy",
                json.dumps(match_policy_payload),
                "2024-01-01",
                "2024-01-01",
            ),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)

        ai_settings = loader.get_ai_settings()
        job_match = loader.get_job_match()

        # Verify they are separate
        assert ai_settings["worker"]["selected"]["provider"] == "claude"
        assert job_match["minMatchScore"] == 90

        # AI settings should not have job match fields
        assert "minMatchScore" not in ai_settings
        # Job match should not have AI settings fields
        assert "worker" not in job_match

    def test_loading_multiple_times_is_consistent(self, db_path):
        """Should return consistent results across multiple calls."""
        conn = sqlite3.connect(db_path)
        payload = {
            "jobMatch": {
                "minMatchScore": 75,
                "portlandOfficeBonus": 15,
            },
        }
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("match-policy", json.dumps(payload), "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)

        # Call multiple times
        result1 = loader.get_job_match()
        result2 = loader.get_job_match()
        result3 = loader.get_job_match()

        assert result1 == result2 == result3
