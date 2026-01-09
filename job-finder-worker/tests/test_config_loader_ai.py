"""Tests for ConfigLoader AI configuration methods.

Tests the get_ai_settings method of ConfigLoader which retrieves
AI provider configuration.

Supported agents: claude.cli, gemini.api

Note: get_job_match was removed during hybrid scoring migration.
Job matching now uses match-policy and prefilter-policy.title instead.
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
        """Should return stored AI settings from database (new schema)."""
        conn = sqlite3.connect(db_path)
        payload = {
            "agents": {
                "claude.cli": {
                    "provider": "claude",
                    "interface": "cli",
                    "defaultModel": "claude-sonnet-4-5-latest",
                    "dailyBudget": 100,
                    "dailyUsage": 0,
                    "runtimeState": {
                        "worker": {"enabled": True, "reason": None},
                        "backend": {"enabled": True, "reason": None},
                    },
                    "authRequirements": {"type": "cli", "requiredEnv": ["CLAUDE_CODE_OAUTH_TOKEN"]},
                }
            },
            "taskFallbacks": {
                "extraction": ["claude.cli"],
                "analysis": ["claude.cli"],
                "document": ["claude.cli"],
            },
            "modelRates": {"claude-sonnet-4-5-latest": 1.0},
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

        assert ai_settings["agents"]["claude.cli"]["defaultModel"] == "claude-sonnet-4-5-latest"
        assert ai_settings["taskFallbacks"]["document"] == ["claude.cli"]

    def test_get_ai_settings_missing_raises(self, db_path):
        """Should fail loudly when ai-settings is missing."""
        loader = ConfigLoader(db_path)
        with pytest.raises(Exception):
            loader.get_ai_settings()

    def test_get_ai_settings_with_full_config(self, db_path):
        """Should handle full AI settings with providers array."""
        conn = sqlite3.connect(db_path)
        payload = {
            "agents": {
                "gemini.api": {
                    "provider": "gemini",
                    "interface": "api",
                    "defaultModel": "gemini-2.0-flash",
                    "dailyBudget": 100,
                    "dailyUsage": 0,
                    "runtimeState": {
                        "worker": {"enabled": True, "reason": None},
                        "backend": {"enabled": True, "reason": None},
                    },
                    "authRequirements": {
                        "type": "api",
                        "requiredEnv": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
                    },
                }
            },
            "taskFallbacks": {
                "extraction": ["gemini.api"],
                "analysis": ["gemini.api"],
                "document": ["gemini.api"],
            },
            "modelRates": {"gemini-2.0-flash": 0.5},
            "options": [
                {
                    "value": "gemini",
                    "interfaces": [
                        {"value": "api", "models": ["gemini-2.0-flash"], "enabled": True}
                    ],
                }
            ],
        }
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("ai-settings", json.dumps(payload), "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)
        ai_settings = loader.get_ai_settings()

        assert ai_settings["agents"]["gemini.api"]["defaultModel"] == "gemini-2.0-flash"
        assert ai_settings["taskFallbacks"]["document"] == ["gemini.api"]


# NOTE: TestConfigLoaderJobMatch was removed during hybrid scoring migration.
# Job matching now uses match-policy and prefilter-policy.title instead.


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

    def test_ai_settings_and_match_policy_are_separate(self, db_path):
        """Should store and retrieve AI settings and match-policy independently."""
        conn = sqlite3.connect(db_path)

        # Insert both configs
        ai_payload = {
            "agents": {
                "claude.cli": {
                    "provider": "claude",
                    "interface": "cli",
                    "defaultModel": "claude-sonnet-4-5-latest",
                    "dailyBudget": 100,
                    "dailyUsage": 0,
                    "runtimeState": {
                        "worker": {"enabled": True, "reason": None},
                        "backend": {"enabled": True, "reason": None},
                    },
                    "authRequirements": {"type": "cli", "requiredEnv": ["CLAUDE_CODE_OAUTH_TOKEN"]},
                },
            },
            "taskFallbacks": {
                "extraction": ["claude.cli"],
                "analysis": ["claude.cli"],
                "document": ["claude.cli"],
            },
            "modelRates": {"claude-sonnet-4-5-latest": 1.0},
            "options": [],
        }
        # Complete match-policy (all sections required, no defaults)
        match_policy_payload = {
            "minScore": 60,
            "seniority": {
                "preferred": ["senior"],
                "acceptable": ["mid"],
                "rejected": ["junior"],
                "preferredScore": 15,
                "acceptableScore": 0,
                "rejectedScore": -100,
            },
            "location": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": False,
                "userTimezone": -8,
                "maxTimezoneDiffHours": 4,
                "perHourScore": -3,
                "hybridSameCityScore": 10,
                "remoteScore": 5,
                "relocationScore": -50,
                "unknownTimezoneScore": -5,
                "relocationAllowed": False,
            },
            "skillMatch": {
                "baseMatchScore": 1,
                "yearsMultiplier": 0.5,
                "maxYearsBonus": 5,
                "missingScore": -1,
                "analogScore": 0,
                "maxBonus": 25,
                "maxPenalty": -15,
                "missingIgnore": [],
            },
            "skills": {
                "bonusPerSkill": 2,
                "maxSkillBonus": 15,
            },
            "salary": {
                "minimum": None,
                "target": None,
                "belowTargetScore": -2,
                "belowTargetMaxPenalty": -20,
                "missingSalaryScore": 0,
                "meetsTargetScore": 0,
                "equityScore": 0,
                "contractScore": 0,
            },
            "experience": {"maxRequired": 15, "overqualifiedScore": -5},
            "freshness": {
                "freshDays": 2,
                "freshScore": 10,
                "staleDays": 3,
                "staleScore": -10,
                "veryStaleDays": 12,
                "veryStaleScore": -20,
                "repostScore": -5,
            },
            "roleFit": {
                "preferred": ["backend", "ml-ai", "devops", "data", "security"],
                "acceptable": ["fullstack"],
                "penalized": ["frontend", "consulting"],
                "rejected": ["clearance-required", "management"],
                "preferredScore": 5,
                "penalizedScore": -5,
            },
            "company": {
                "preferredCityScore": 20,
                "preferredCity": "Portland",
                "remoteFirstScore": 15,
                "aiMlFocusScore": 10,
                "largeCompanyScore": 10,
                "smallCompanyScore": -5,
                "largeCompanyThreshold": 10000,
                "smallCompanyThreshold": 100,
                "startupScore": 0,
            },
        }

        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("ai-settings", json.dumps(ai_payload), "2024-01-01", "2024-01-01"),
        )
        conn.execute(
            "INSERT INTO job_finder_config (id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?)",
            ("match-policy", json.dumps(match_policy_payload), "2024-01-01", "2024-01-01"),
        )
        conn.commit()
        conn.close()

        loader = ConfigLoader(db_path)

        ai_settings = loader.get_ai_settings()
        match_policy = loader.get_match_policy()

        # Verify they are separate
        assert ai_settings["agents"]["claude.cli"]["provider"] == "claude"
        assert match_policy["minScore"] == 60

        # AI settings should not have match-policy fields
        assert "minScore" not in ai_settings
        # Match-policy should not have AI settings fields
        assert "worker" not in match_policy

    def test_loading_ai_settings_multiple_times_is_consistent(self, db_path):
        """Should return consistent results across multiple calls."""
        conn = sqlite3.connect(db_path)
        payload = {
            "agents": {
                "gemini.api": {
                    "provider": "gemini",
                    "interface": "api",
                    "defaultModel": "gemini-2.0-flash",
                    "dailyBudget": 100,
                    "dailyUsage": 0,
                    "runtimeState": {
                        "worker": {"enabled": True, "reason": None},
                        "backend": {"enabled": True, "reason": None},
                    },
                    "authRequirements": {
                        "type": "api",
                        "requiredEnv": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
                    },
                }
            },
            "taskFallbacks": {
                "extraction": ["gemini.api"],
                "analysis": ["gemini.api"],
                "document": ["gemini.api"],
            },
            "modelRates": {"gemini-2.0-flash": 0.5},
            "options": [],
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
