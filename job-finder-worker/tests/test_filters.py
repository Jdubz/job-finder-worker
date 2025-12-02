"""Regression tests for the strike-based job filter."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from job_finder.filters.strike_filter_engine import StrikeFilterEngine


@pytest.fixture()
def base_config():
    """Return a minimal strike-filter configuration that focuses on remote policy."""
    return {
        "userTimezone": -8,
        "userCity": "Portland",
        "strikeEngine": {
            "enabled": True,
            "strikeThreshold": 3,
            "hardRejections": {
                "excludedJobTypes": [],
                "excludedSeniority": [],
                "excludedCompanies": [],
                "excludedKeywords": [],
                "minSalaryFloor": 0,
                "rejectCommissionOnly": False,
            },
            "remotePolicy": {
                "allowRemote": True,
                "allowOnsite": True,  # Enable location-based role checks
                "allowHybridInTimezone": True,
                "maxTimezoneDiffHours": 2,
                "perHourTimezonePenalty": 1,
                "hardTimezonePenalty": 3,
            },
            "salaryStrike": {"enabled": False},
            "experienceStrike": {"enabled": False},
            "seniorityStrikes": {},
            "qualityStrikes": {},
            "ageStrike": {"enabled": False},
        },
        "technologyRanks": {"technologies": {}, "strikes": {}},
    }


def make_job(**overrides):
    job = {
        "title": "Software Engineer",
        "company": "RemoteCo",
        "description": "Fully remote position building features.",
        "location": "Remote - US",
        "salary": "$150,000 - $200,000",
        "posted_date": datetime.now(timezone.utc).isoformat(),
    }
    job.update(overrides)
    return job


class TestRemotePolicy:
    def test_remote_keyword_in_location_passes(self, base_config):
        engine = StrikeFilterEngine(base_config)
        result = engine.evaluate_job(make_job())
        assert result.passed is True

    def test_remote_in_description_detected(self, base_config):
        engine = StrikeFilterEngine(base_config)
        job = make_job(location="United States", description="This is a work from home role")
        result = engine.evaluate_job(job)
        assert result.passed is True

    def test_onsite_rejected_when_disallowed(self, base_config):
        custom = {**base_config}
        custom["strikeEngine"] = {**base_config["strikeEngine"]}
        custom["strikeEngine"]["remotePolicy"] = {
            **base_config["strikeEngine"]["remotePolicy"],
            "allowOnsite": False,
        }
        engine = StrikeFilterEngine(custom)
        job = make_job(location="New York, NY", description="Office-based role in Manhattan")
        result = engine.evaluate_job(job)
        assert result.passed is False
        assert any(
            "outside user city" in (rejection.reason or "").lower()
            for rejection in result.rejections
        )

    def test_portland_hybrid_allowed(self, base_config):
        engine = StrikeFilterEngine(base_config)
        job = make_job(location="Portland, OR", description="Hybrid 2 days in office, 3 remote")
        result = engine.evaluate_job(job)
        assert result.passed is True

    def test_non_portland_hybrid_rejected(self, base_config):
        engine = StrikeFilterEngine(base_config)
        job = make_job(location="Seattle, WA", description="Hybrid schedule with office days")
        result = engine.evaluate_job(job)
        # Outside user's city -> hard reject for onsite/hybrid
        assert result.passed is False
        assert any(rejection.filter_name == "location_policy" for rejection in result.rejections)

    def test_case_insensitive_matching(self, base_config):
        engine = StrikeFilterEngine(base_config)
        job = make_job(location="REMOTE - us", description="WFH opportunity for US engineers")
        result = engine.evaluate_job(job)
        assert result.passed is True
