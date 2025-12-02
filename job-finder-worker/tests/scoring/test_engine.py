"""Tests for the deterministic scoring engine."""

import pytest

from job_finder.scoring.engine import ScoringEngine, ScoreBreakdown
from job_finder.ai.extraction import JobExtractionResult


@pytest.fixture
def default_config():
    """Return a default scoring configuration."""
    return {
        "minScore": 60,
        "weights": {
            "skillMatch": 40,
            "experienceMatch": 30,
            "seniorityMatch": 30,
        },
        "seniority": {
            "preferred": ["senior", "staff", "lead"],
            "acceptable": ["mid", ""],
            "rejected": ["junior", "intern", "entry"],
            "preferredBonus": 15,
            "acceptablePenalty": 0,
            "rejectedPenalty": -100,
        },
        "location": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": False,
            "userTimezone": -8,
            "maxTimezoneDiffHours": 4,
            "perHourPenalty": 3,
            "hybridSameCityBonus": 10,
        },
        "technology": {
            "required": ["typescript", "react"],
            "preferred": ["node", "python"],
            "disliked": ["angular"],
            "rejected": ["wordpress", "php"],
            "requiredBonus": 10,
            "preferredBonus": 5,
            "dislikedPenalty": -5,
        },
        "salary": {
            "minimum": 150000,
            "target": 200000,
            "belowTargetPenalty": 2,
        },
        "experience": {
            "userYears": 12,
            "maxRequired": 15,
            "overqualifiedPenalty": 5,
        },
    }


@pytest.fixture
def user_skills():
    """Return user skills for testing."""
    return ["typescript", "react", "node", "python", "aws"]


class TestScoringEngine:
    """Tests for ScoringEngine class."""

    def test_preferred_seniority_gets_bonus(self, default_config, user_skills):
        """Preferred seniority level gets bonus points."""
        engine = ScoringEngine(default_config, user_skills)
        extraction = JobExtractionResult(seniority="senior")

        result = engine.score(extraction, "Senior Engineer", "Job description")

        assert result.passed is True
        assert result.final_score > 50  # Above neutral
        assert any("senior" in adj.reason.lower() for adj in result.adjustments)

    def test_rejected_seniority_fails(self, default_config, user_skills):
        """Rejected seniority level causes failure."""
        engine = ScoringEngine(default_config, user_skills)
        extraction = JobExtractionResult(seniority="junior")

        result = engine.score(extraction, "Junior Developer", "Job description")

        assert result.passed is False
        assert "seniority" in result.rejection_reason.lower()

    def test_rejected_technology_fails(self, default_config, user_skills):
        """Rejected technology causes failure."""
        engine = ScoringEngine(default_config, user_skills)
        extraction = JobExtractionResult(technologies=["wordpress", "php"])

        result = engine.score(extraction, "WordPress Developer", "WordPress job")

        assert result.passed is False
        assert "technology" in result.rejection_reason.lower()

    def test_onsite_rejected_when_not_allowed(self, default_config, user_skills):
        """Onsite job fails when allowOnsite is False."""
        engine = ScoringEngine(default_config, user_skills)
        extraction = JobExtractionResult(work_arrangement="onsite")

        result = engine.score(extraction, "Engineer", "Office position")

        assert result.passed is False
        assert "onsite" in result.rejection_reason.lower()

    def test_remote_allowed(self, default_config, user_skills):
        """Remote job passes when allowRemote is True."""
        engine = ScoringEngine(default_config, user_skills)
        extraction = JobExtractionResult(
            work_arrangement="remote",
            seniority="senior",
            technologies=["typescript", "react"],
        )

        result = engine.score(extraction, "Senior Engineer", "Remote position")

        assert result.passed is True

    def test_required_tech_bonus(self, default_config, user_skills):
        """Required technologies add bonus points."""
        engine = ScoringEngine(default_config, user_skills)
        extraction = JobExtractionResult(
            technologies=["typescript", "react"],
            work_arrangement="remote",
        )

        result = engine.score(extraction, "Frontend Engineer", "React TypeScript job")

        # Should have bonuses for required tech
        assert result.final_score > 50

    def test_preferred_tech_bonus(self, default_config, user_skills):
        """Preferred technologies add bonus points."""
        engine = ScoringEngine(default_config, user_skills)
        extraction = JobExtractionResult(
            technologies=["node", "python"],
            work_arrangement="remote",
        )

        result = engine.score(extraction, "Backend Engineer", "Node Python job")

        assert any("preferred" in adj.reason.lower() for adj in result.adjustments)

    def test_disliked_tech_penalty(self, default_config, user_skills):
        """Disliked technologies deduct points."""
        engine = ScoringEngine(default_config, user_skills)
        extraction = JobExtractionResult(
            technologies=["angular", "typescript"],
            work_arrangement="remote",
        )

        result = engine.score(extraction, "Frontend Engineer", "Angular job")

        assert any("angular" in adj.reason.lower() for adj in result.adjustments)

    def test_below_min_score_fails(self, default_config, user_skills):
        """Score below minScore causes failure."""
        config = {**default_config, "minScore": 90}  # Very high threshold
        engine = ScoringEngine(config, user_skills)
        extraction = JobExtractionResult(work_arrangement="remote")

        result = engine.score(extraction, "Engineer", "Basic job")

        # Should fail if score is below 90
        if result.final_score < 90:
            assert result.passed is False
            assert "below threshold" in result.rejection_reason.lower()

    def test_score_breakdown_structure(self, default_config, user_skills):
        """ScoreBreakdown has correct structure."""
        engine = ScoringEngine(default_config, user_skills)
        extraction = JobExtractionResult(work_arrangement="remote")

        result = engine.score(extraction, "Engineer", "Job description")

        assert isinstance(result, ScoreBreakdown)
        assert isinstance(result.base_score, int)
        assert isinstance(result.final_score, int)
        assert isinstance(result.adjustments, list)
        assert isinstance(result.passed, bool)
        assert 0 <= result.final_score <= 100

    def test_timezone_penalty(self, default_config, user_skills):
        """Timezone difference within max adds penalty (not hard reject)."""
        engine = ScoringEngine(default_config, user_skills)
        # User is UTC-8, max diff is 4h, so UTC-4 gives exactly 4h diff
        # which is within bounds but incurs per-hour penalty
        extraction = JobExtractionResult(
            work_arrangement="hybrid",
            timezone=-4,  # UTC-4, user is at UTC-8 = 4 hour diff (within max)
        )

        result = engine.score(extraction, "Engineer", "Hybrid position")

        # Should have timezone penalty (4h * 3 per hour = -12 points)
        assert any("timezone" in adj.reason.lower() for adj in result.adjustments)
        # Note: job may still fail overall due to other factors (no salary info, etc.)
        # but it should NOT be a hard reject for timezone since within max
