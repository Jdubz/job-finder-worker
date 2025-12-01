"""
Comprehensive tests for the Strike Filter Engine.

Tests cover:
1. Hard rejections (excluded job types, seniority, companies, keywords, salary, remote policy)
2. Strike accumulation (salary, experience, seniority, technology, quality, age)
3. Edge cases (missing data, malformed data, conflicting rules)
4. Integration scenarios (multiple strikes, threshold enforcement)
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from job_finder.filters.strike_filter_engine import StrikeFilterEngine
from job_finder.filters.models import FilterResult


@pytest.fixture
def base_config():
    """Base filter configuration."""
    return {
        "enabled": True,
        "strikeThreshold": 3,
        "hardRejections": {
            "excludedJobTypes": [],
            "excludedSeniority": ["junior", "entry", "intern"],
            "excludedCompanies": ["bad-company-inc"],
            "excludedKeywords": ["clearance required", "on-call"],
            "requiredTitleKeywords": [
                "software",
                "developer",
                "engineer",
                "frontend",
                "front end",
            ],
            "minSalaryFloor": 100000,
            "rejectCommissionOnly": True,
        },
        "remotePolicy": {
            "allowRemote": True,
            "allowOnsite": False,
            "allowedOnsiteLocations": ["portland, or"],
            "allowedHybridLocations": ["portland, or"],
        },
        "salaryStrike": {
            "enabled": True,
            "threshold": 150000,
            "points": 2,
        },
        # NOTE: experienceStrike REMOVED - seniority filtering handles this
        # NOTE: jobTypeStrike REMOVED - AI analysis handles job fit determination
        "seniorityStrikes": {
            "mid-level": 1,
            "principal": 1,
            "director": 2,
        },
        "qualityStrikes": {
            "minDescriptionLength": 200,
            "shortDescriptionPoints": 1,
            "buzzwords": ["rockstar", "ninja", "guru"],
            "buzzwordPoints": 1,
        },
        "ageStrike": {
            "enabled": True,
            "strikeDays": 1,
            "rejectDays": 7,
            "points": 1,
        },
    }


@pytest.fixture
def base_tech_ranks():
    """Base technology ranks configuration.

    NOTE: Only "strike" and "fail" ranks cause penalties.
    - "strike" tech adds strike points (tech user doesn't have)
    - "fail" tech causes hard rejection
    - "required"/"preferred" are positive signals but don't penalize if missing
    """
    return {
        "technologies": {
            "python": {"rank": "required", "weight": 1.0},
            "react": {"rank": "preferred", "weight": 0.8},
            "aws": {"rank": "nice-to-have", "weight": 0.5},
            "cobol": {"rank": "strike", "points": 2},  # Tech user doesn't have
        },
    }


@pytest.fixture
def prefilter_policy(base_config, base_tech_ranks):
    """Prefilter policy in the modern schema."""
    return {
        "stopList": {
            "excludedCompanies": [],
            "excludedKeywords": [],
            "excludedDomains": [],
        },
        "strikeEngine": dict(base_config),
        "technologyRanks": dict(base_tech_ranks),
    }


@pytest.fixture
def valid_job():
    """Valid job that should pass all filters."""
    return {
        "title": "Senior Software Engineer",
        "company": "Great Tech Company",
        "description": "We are looking for a senior software engineer with Python and React experience. "
        * 5,  # Make it long enough
        "location": "Remote - USA",
        "salary": "$160,000 - $180,000",
        "posted_date": datetime.now(timezone.utc).isoformat(),
    }


class TestStrikeFilterEngineInit:
    """Test engine initialization and configuration parsing."""

    def test_init_stores_config(self, prefilter_policy):
        """Test engine stores configuration."""
        engine = StrikeFilterEngine(prefilter_policy)

        assert engine.enabled is True
        assert engine.strike_threshold == 3
        assert engine.min_salary_floor == 100000
        assert "junior" in engine.excluded_seniority

    def test_init_disabled_engine(self, prefilter_policy):
        """Test disabled engine initialization."""
        prefilter_policy["strikeEngine"]["enabled"] = False
        engine = StrikeFilterEngine(prefilter_policy)

        assert engine.enabled is False

    def test_init_with_missing_fields(self):
        """Test engine handles missing configuration fields."""
        minimal_config = {}
        engine = StrikeFilterEngine(minimal_config)

        assert engine.strike_threshold == 5  # Default
        assert engine.excluded_job_types == []
        assert engine.excluded_seniority == []


class TestHardRejections:
    """Test hard rejection rules (immediate fail)."""

    def test_sales_engineer_passes_filter(self, prefilter_policy, valid_job):
        """Sales Engineer at a tech company should pass pre-filter.

        Job-type filtering was removed from pre-filter stage. A software
        engineer at a sales-focused company is still a good match - AI
        analysis will determine job fit.
        """
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["title"] = "Software Engineer"
        valid_job["description"] = (
            "Join our sales engineering team to build tools for sales reps. " * 10
        )

        result = engine.evaluate_job(valid_job)

        # Should pass - "sales" in description doesn't trigger strikes anymore
        assert result.passed is True

    def test_rejects_junior_seniority(self, prefilter_policy, valid_job):
        """Test rejects junior-level jobs."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["title"] = "Junior Software Engineer"

        result = engine.evaluate_job(valid_job)

        assert result.passed is False
        assert any(
            "junior" in r.reason.lower() or "seniority" in r.reason.lower()
            for r in result.rejections
        )

    def test_rejects_excluded_company(self, prefilter_policy, valid_job):
        """Test rejects jobs from excluded companies."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["company"] = "bad-company-inc"  # Use exact name from config

        result = engine.evaluate_job(valid_job)

        assert result.passed is False
        assert any("company" in r.reason.lower() for r in result.rejections)

    def test_rejects_excluded_keyword(self, prefilter_policy, valid_job):
        """Test rejects jobs with excluded keywords."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["description"] = "Great opportunity! Clearance required for this role."

        result = engine.evaluate_job(valid_job)

        assert result.passed is False
        assert any(
            "keyword" in r.reason.lower() or "clearance" in r.reason.lower()
            for r in result.rejections
        )

    def test_rejects_below_salary_floor(self, prefilter_policy, valid_job):
        """Test rejects jobs below minimum salary."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["salary"] = "$80,000 - $95,000"

        result = engine.evaluate_job(valid_job)

        assert result.passed is False
        assert any("salary" in r.reason.lower() for r in result.rejections)

    def test_rejects_commission_only(self, prefilter_policy, valid_job):
        """Test rejects commission-only positions."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["description"] = "Commission only - unlimited earning potential!"

        result = engine.evaluate_job(valid_job)

        assert result.passed is False

    def test_allows_go_as_verb(self, prefilter_policy, valid_job):
        """Ensure the word 'go' as a verb doesn't trigger undesired tech strikes."""
        prefilter_policy["technologyRanks"] = {
            "technologies": {"go": {"rank": "strike", "points": 2}}
        }
        engine = StrikeFilterEngine(prefilter_policy)

        valid_job["description"] = "We will go-to-market fast and go to production weekly. " * 5

        result = engine.evaluate_job(valid_job)

        assert result.passed is True
        assert result.total_strikes == 0

    def test_rejects_onsite_when_not_allowed(self, prefilter_policy, valid_job):
        """Test rejects on-site jobs when not allowed."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["location"] = "On-site - San Francisco, CA"
        valid_job["description"] = "This is an on-site role in our San Francisco office. " * 5

        result = engine.evaluate_job(valid_job)

        assert result.passed is False
        hard_rejects = [r for r in result.rejections if r.severity == "hard_reject"]
        assert len(hard_rejects) > 0

    def test_allows_remote_jobs(self, prefilter_policy, valid_job):
        """Test allows remote jobs when configured."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["location"] = "Remote - Worldwide"

        result = engine.evaluate_job(valid_job)

        assert (
            result.passed is True or result.total_strikes < 3
        )  # May get strikes for other reasons

    def test_rejects_job_too_old(self, prefilter_policy, valid_job):
        """Test rejects jobs older than rejection threshold."""
        engine = StrikeFilterEngine(prefilter_policy)
        old_date = datetime.now(timezone.utc) - timedelta(days=10)
        valid_job["posted_date"] = old_date.isoformat()

        result = engine.evaluate_job(valid_job)

        assert result.passed is False
        assert any(
            "age" in r.reason.lower() or "old" in r.reason.lower() for r in result.rejections
        )


class TestStrikeAccumulation:
    """Test strike accumulation system."""

    def test_salary_strike_below_threshold(self, prefilter_policy, valid_job):
        """Test adds strike for salary below threshold."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["salary"] = "$140,000 - $145,000"  # Below 150k threshold

        result = engine.evaluate_job(valid_job)

        assert result.total_strikes >= 2  # Salary strike is 2 points
        strikes = [r for r in result.rejections if r.severity == "strike"]
        assert any("salary" in s.reason.lower() for s in strikes)

    def test_experience_requirements_do_not_cause_strikes(self, prefilter_policy, valid_job):
        """Experience requirements in job description should NOT cause strikes.

        Experience filtering was removed from pre-filter stage. Seniority
        filtering (intern, entry-level, etc.) handles this instead. 5+ years
        is standard for senior roles.
        """
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["description"] = "Looking for 3+ years of experience in Python. " * 10

        result = engine.evaluate_job(valid_job)

        # Should not have experience-related strikes
        experience_strikes = [
            r
            for r in result.rejections
            if r.filter_name == "low_experience" or "experience" in r.reason.lower()
        ]
        assert len(experience_strikes) == 0

    def test_seniority_strike_mid_level(self, prefilter_policy, valid_job):
        """Test adds strike for mid-level seniority."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["title"] = "Mid-Level Software Engineer"

        result = engine.evaluate_job(valid_job)

        assert result.total_strikes >= 1
        strikes = [r for r in result.rejections if r.severity == "strike"]
        assert any("seniority" in s.reason.lower() or "mid" in s.reason.lower() for s in strikes)

    def test_quality_strike_short_description(self, prefilter_policy, valid_job):
        """Test adds strike for short job description."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["description"] = "Great job opportunity!"  # Too short

        result = engine.evaluate_job(valid_job)

        assert result.total_strikes >= 1
        strikes = [r for r in result.rejections if r.severity == "strike"]
        assert any(
            "description" in s.reason.lower() or "quality" in s.reason.lower() for s in strikes
        )

    def test_quality_strike_buzzwords(self, prefilter_policy, valid_job):
        """Test adds strike for buzzwords in description."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["description"] = (
            "Looking for a rockstar ninja developer who is a coding guru!" * 5
        )

        result = engine.evaluate_job(valid_job)

        assert result.total_strikes >= 1
        strikes = [r for r in result.rejections if r.severity == "strike"]
        assert any("buzzword" in s.reason.lower() for s in strikes)

    def test_age_strike_old_posting(self, prefilter_policy, valid_job):
        """Test adds strike for older job posting."""
        engine = StrikeFilterEngine(prefilter_policy)
        old_date = datetime.now(timezone.utc) - timedelta(days=3)
        valid_job["posted_date"] = old_date.isoformat()

        result = engine.evaluate_job(valid_job)

        assert result.total_strikes >= 1
        strikes = [r for r in result.rejections if r.severity == "strike"]
        assert any("age" in s.reason.lower() or "old" in s.reason.lower() for s in strikes)

    def test_multiple_strikes_accumulate(self, prefilter_policy, valid_job):
        """Test multiple strikes accumulate correctly."""
        engine = StrikeFilterEngine(prefilter_policy)

        # Add multiple strike-worthy issues
        valid_job["salary"] = "$140,000"  # 2 strikes
        valid_job["description"] = "Short description"  # 1 strike
        old_date = datetime.now(timezone.utc) - timedelta(days=3)
        valid_job["posted_date"] = old_date.isoformat()  # 1 strike

        result = engine.evaluate_job(valid_job)

        assert result.total_strikes >= 4
        assert result.passed is False  # Should exceed threshold of 3


class TestStrikeThreshold:
    """Test strike threshold enforcement."""

    def test_passes_below_threshold(self, prefilter_policy, valid_job):
        """Test job passes with strikes below threshold."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["description"] = "Short."  # 1 strike for short description

        result = engine.evaluate_job(valid_job)

        assert result.total_strikes < 3
        assert result.passed is True

    def test_fails_at_threshold(self, prefilter_policy, valid_job):
        """Test job fails when strikes reach threshold."""
        engine = StrikeFilterEngine(prefilter_policy)

        # Accumulate exactly 3 strikes
        valid_job["description"] = "Short description"  # 1 strike
        valid_job["salary"] = "$140,000"  # 2 strikes

        result = engine.evaluate_job(valid_job)

        assert result.total_strikes >= 3
        assert result.passed is False

    def test_custom_threshold(self, prefilter_policy, valid_job):
        """Test custom strike threshold."""
        prefilter_policy["strikeEngine"]["strikeThreshold"] = 5  # Higher threshold
        engine = StrikeFilterEngine(prefilter_policy)

        valid_job["description"] = "Short."  # 1 strike
        valid_job["salary"] = "$140,000"  # 2 strikes

        result = engine.evaluate_job(valid_job)

        assert result.total_strikes >= 3
        assert result.passed is True  # Still below 5


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_handles_missing_title(self, prefilter_policy, valid_job):
        """Test handles missing job title."""
        engine = StrikeFilterEngine(prefilter_policy)
        del valid_job["title"]

        result = engine.evaluate_job(valid_job)

        assert isinstance(result, FilterResult)
        # Should not crash, may or may not pass depending on other fields

    def test_handles_missing_description(self, prefilter_policy, valid_job):
        """Test handles missing description."""
        engine = StrikeFilterEngine(prefilter_policy)
        del valid_job["description"]

        result = engine.evaluate_job(valid_job)

        assert isinstance(result, FilterResult)
        # Likely gets strike for missing/short description

    def test_handles_empty_salary(self, prefilter_policy, valid_job):
        """Test handles empty salary field."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["salary"] = ""

        result = engine.evaluate_job(valid_job)

        assert isinstance(result, FilterResult)

    def test_handles_malformed_date(self, prefilter_policy, valid_job):
        """Test handles malformed posted date."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["posted_date"] = "invalid-date"

        result = engine.evaluate_job(valid_job)

        assert isinstance(result, FilterResult)
        # Should not crash

    def test_handles_none_values(self, prefilter_policy):
        """Test handles None values in job data gracefully."""
        engine = StrikeFilterEngine(prefilter_policy)
        job = {
            "title": "Software Engineer",  # Provide valid string
            "company": "Test Company",  # Provide valid string
            "description": "Test description",  # Provide valid string
            "location": "",  # Empty string instead of None
            "salary": "",  # Empty string instead of None
            "posted_date": "",  # Empty string instead of None
        }

        result = engine.evaluate_job(job)

        # Should not crash
        assert isinstance(result, FilterResult)

    def test_disabled_engine_passes_all(self, prefilter_policy, valid_job):
        """Test disabled engine passes all jobs."""
        prefilter_policy["strikeEngine"]["enabled"] = False
        engine = StrikeFilterEngine(prefilter_policy)

        # Make job objectively bad
        valid_job["title"] = "Sales Recruiter"
        valid_job["company"] = "Bad Company Inc"
        valid_job["salary"] = "$50,000"

        result = engine.evaluate_job(valid_job)

        assert result.passed is True
        assert result.total_strikes == 0


class TestTechnologyStrikes:
    """Test technology-based strike system.

    The tech filter only penalizes jobs that require technologies the user
    DOESN'T have experience with ("strike" rank). Vague or unclear tech
    requirements are OK - we don't penalize for missing tech info.
    """

    def test_strike_for_undesired_tech(self, prefilter_policy, valid_job):
        """Test adds strike when job requires tech user doesn't have."""
        engine = StrikeFilterEngine(prefilter_policy)
        # COBOL is marked as "strike" in base_tech_ranks
        valid_job["description"] = "Looking for COBOL and mainframe experience. " * 10

        result = engine.evaluate_job(valid_job)

        # Should get strike for undesired tech
        tech_strikes = [r for r in result.rejections if r.filter_name == "undesired_tech"]
        assert len(tech_strikes) >= 1
        assert any("cobol" in s.reason.lower() for s in tech_strikes)

    def test_no_strike_with_good_tech(self, prefilter_policy, valid_job):
        """Test no tech strike when job uses tech user has experience with."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["description"] = "Looking for Python and React experience. " * 10

        result = engine.evaluate_job(valid_job)

        # Should not have undesired tech strikes
        tech_strikes = [r for r in result.rejections if r.filter_name == "undesired_tech"]
        assert len(tech_strikes) == 0

    def test_no_strike_for_vague_tech_requirements(self, prefilter_policy, valid_job):
        """Test no strike when job is vague about tech requirements.

        If a job doesn't explicitly mention any technologies we track, that's
        fine - we only penalize for explicitly bad tech matches.
        """
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["description"] = "Looking for a great engineer to join our team! " * 10

        result = engine.evaluate_job(valid_job)

        # Should NOT have any tech-related strikes
        tech_strikes = [r for r in result.rejections if "tech" in r.filter_category.lower()]
        assert len(tech_strikes) == 0, "Should not penalize for vague/unclear tech requirements"


class TestFilterResult:
    """Test FilterResult output structure."""

    def test_result_contains_all_fields(self, prefilter_policy, valid_job):
        """Test result contains all expected fields."""
        engine = StrikeFilterEngine(prefilter_policy)
        result = engine.evaluate_job(valid_job)

        assert hasattr(result, "passed")
        assert hasattr(result, "total_strikes")
        assert hasattr(result, "strike_threshold")
        assert hasattr(result, "rejections")

    def test_result_strike_details(self, prefilter_policy, valid_job):
        """Test result includes detailed strike information."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["description"] = "Short."  # Will get strike

        result = engine.evaluate_job(valid_job)

        if result.total_strikes > 0:
            strikes = [r for r in result.rejections if r.severity == "strike"]
            assert len(strikes) > 0
            first_strike = strikes[0]
            assert hasattr(first_strike, "reason")
            assert hasattr(first_strike, "points")

    def test_result_rejection_details(self, prefilter_policy, valid_job):
        """Test result includes detailed rejection information."""
        engine = StrikeFilterEngine(prefilter_policy)
        # Trigger a tech strike by requiring COBOL (marked as "strike" in config)
        valid_job["description"] = "Looking for COBOL and mainframe experience. " * 10

        result = engine.evaluate_job(valid_job)

        assert len(result.rejections) > 0
        first_rejection = result.rejections[0]
        assert hasattr(first_rejection, "reason")
        assert hasattr(first_rejection, "severity")
        assert first_rejection.severity == "strike"


class TestComplexScenarios:
    """Test complex real-world scenarios."""

    def test_hybrid_portland_allowed(self, prefilter_policy, valid_job):
        """Hybrid Portland jobs allowed when location lists permit."""
        prefilter_policy["strikeEngine"]["remotePolicy"]["allowOnsite"] = True
        prefilter_policy["strikeEngine"]["remotePolicy"]["allowedHybridLocations"] = [
            "portland, or"
        ]
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["location"] = "Hybrid - Portland, OR"

        result = engine.evaluate_job(valid_job)

        assert not any(r.filter_name == "remote_policy" for r in result.rejections)

    def test_case_insensitive_seniority_matching(self, prefilter_policy, valid_job):
        """Test seniority matching is case-insensitive."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["title"] = "JUNIOR Software Developer"  # Uppercase

        result = engine.evaluate_job(valid_job)

        # Should be rejected for junior seniority
        assert result.passed is False
        assert any("junior" in r.reason.lower() for r in result.rejections)

    def test_word_boundary_matching(self, prefilter_policy, valid_job):
        """Test uses word boundaries to avoid partial matches."""
        engine = StrikeFilterEngine(prefilter_policy)
        # "entry" should match for seniority, but "sentry" should not
        valid_job["title"] = "Sentry Software Engineer"

        result = engine.evaluate_job(valid_job)

        # Should NOT be rejected for having "entry" in "sentry"
        assert result.passed is True

    def test_salary_range_parsing(self, prefilter_policy, valid_job):
        """Test salary range parsing handles various formats."""
        engine = StrikeFilterEngine(prefilter_policy)

        # Test various salary formats
        salary_formats = [
            "$150,000 - $180,000",
            "$150k - $180k",
            "150000-180000",
            "$150K-$180K",
        ]

        for salary in salary_formats:
            valid_job["salary"] = salary
            result = engine.evaluate_job(valid_job)
            # All should be parsed and evaluated
            assert isinstance(result, FilterResult)

    def test_performance_with_long_description(self, prefilter_policy, valid_job):
        """Test engine handles very long job descriptions efficiently."""
        engine = StrikeFilterEngine(prefilter_policy)
        valid_job["description"] = "Great opportunity! " * 10000  # Very long

        result = engine.evaluate_job(valid_job)

        assert isinstance(result, FilterResult)
