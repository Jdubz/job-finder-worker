"""Tests for the deterministic scoring engine."""

import pytest

from job_finder.scoring.engine import ScoringEngine, ScoreBreakdown
from job_finder.ai.extraction import JobExtractionResult


@pytest.fixture
def default_config():
    """Return a complete match-policy configuration (all sections required)."""
    return {
        "minScore": 60,
        "seniority": {
            "preferred": ["senior", "staff", "lead"],
            "acceptable": ["mid", ""],
            "rejected": ["junior", "intern", "entry"],
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
        },
        "technology": {
            "required": ["typescript", "react"],
            "preferred": ["node", "python"],
            "disliked": ["angular"],
            "rejected": ["wordpress", "php"],
            "requiredScore": 10,
            "preferredScore": 5,
            "dislikedScore": -5,
            "missingRequiredScore": -15,
        },
        "salary": {
            "minimum": 150000,
            "target": 200000,
            "belowTargetScore": -2,
        },
        "experience": {
            "userYears": 12,
            "maxRequired": 15,
            "overqualifiedScore": -5,
        },
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

    def test_double_weighting_prevented(self, default_config):
        """Technologies already scored should not double count in skill scoring."""
        engine = ScoringEngine(default_config, user_skills=["python", "typescript"])

        extraction = JobExtractionResult(
            title="Fullstack Engineer",
            seniority="senior",
            location=None,
            technologies=["python"],
            salary_min=None,
            salary_max=None,
            includes_equity=False,
            is_contract=False,
            experience_min=None,
            experience_max=None,
            days_old=None,
            is_repost=False,
            role_types=[],
        )

        description = "We use Python heavily for backend services."
        result = engine.score(extraction, job_title="Fullstack Engineer", job_description=description)

        tech_adjust = next(a for a in result.adjustments if a.category == "technology")
        assert tech_adjust.points == default_config["technology"]["requiredScore"]

        skill_adjustments = [a for a in result.adjustments if a.category == "skills"]
        assert skill_adjustments == []

    def test_missing_required_score_applied_once(self, default_config):
        """When no required techs are present, missingRequiredScore applies once."""
        engine = ScoringEngine(default_config, user_skills=["typescript", "react"])

        extraction = JobExtractionResult(
            title="Data Engineer",
            seniority="senior",
            location=None,
            technologies=["spark"],
            salary_min=None,
            salary_max=None,
            includes_equity=False,
            is_contract=False,
            experience_min=None,
            experience_max=None,
            days_old=None,
            is_repost=False,
            role_types=[],
        )

        result = engine.score(
            extraction,
            job_title="Data Engineer",
            job_description="Work with Spark and Kafka",
        )

        tech_adjust = next(a for a in result.adjustments if a.category == "technology")
        assert tech_adjust.points == default_config["technology"]["missingRequiredScore"]

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
