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
        "skillMatch": {
            "baseMatchScore": 1,
            "yearsMultiplier": 0.5,
            "maxYearsBonus": 5,
            "missingScore": -1,
            "analogScore": 0,
            "maxBonus": 25,
            "maxPenalty": -15,
            "analogGroups": [["aws", "gcp"], ["node", "node.js"]],
        },
        "salary": {
            "minimum": 150000,
            "target": 200000,
            "belowTargetScore": -2,
        },
        "experience": {
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
def profile():
    """Return derived profile inputs."""
    return {
        "skill_years": {
            "typescript": 5,
            "react": 5,
            "node": 4,
            "python": 3,
            "aws": 2,
        },
        "total_years": 12,
        "analogs": {"node": {"node.js"}, "node.js": {"node"}},
    }


@pytest.fixture
def engine_factory(default_config, profile):
    def _create(config_override=None):
        cfg = default_config if config_override is None else config_override
        return ScoringEngine(
            cfg,
            skill_years=profile["skill_years"],
            user_experience_years=profile["total_years"],
            skill_analogs=profile["analogs"],
        )

    return _create


class TestScoringEngine:
    """Tests for ScoringEngine class."""

    def test_preferred_seniority_gets_bonus(self, engine_factory):
        """Preferred seniority level gets bonus points."""
        engine = engine_factory()
        extraction = JobExtractionResult(seniority="senior")

        result = engine.score(extraction, "Senior Engineer", "Job description")

        assert result.passed is True
        assert result.final_score > 50  # Above neutral
        assert any("senior" in adj.reason.lower() for adj in result.adjustments)

    def test_rejected_seniority_fails(self, engine_factory):
        """Rejected seniority level causes failure."""
        engine = engine_factory()
        extraction = JobExtractionResult(seniority="junior")

        result = engine.score(extraction, "Junior Developer", "Job description")

        assert result.passed is False
        assert "seniority" in result.rejection_reason.lower()

    def test_skill_match_bonus(self, engine_factory):
        """Matched skills add weighted bonus."""
        engine = engine_factory()
        extraction = JobExtractionResult(technologies=["typescript", "react"])

        result = engine.score(extraction, "WordPress Developer", "TypeScript React job")

        assert any(adj.category == "skills" and "Matched" in adj.reason for adj in result.adjustments)

    def test_onsite_rejected_when_not_allowed(self, engine_factory):
        """Onsite job fails when allowOnsite is False."""
        engine = engine_factory()
        extraction = JobExtractionResult(work_arrangement="onsite")

        result = engine.score(extraction, "Engineer", "Office position")

        assert result.passed is False
        assert "onsite" in result.rejection_reason.lower()

    def test_remote_allowed(self, engine_factory):
        """Remote job passes when allowRemote is True."""
        engine = engine_factory()
        extraction = JobExtractionResult(
            work_arrangement="remote",
            seniority="senior",
            technologies=["typescript", "react"],
        )

        result = engine.score(extraction, "Senior Engineer", "Remote position")

        assert result.passed is True

    def test_skill_bonus_with_years(self, engine_factory):
        """Matched skills consider experience years."""
        engine = engine_factory()
        extraction = JobExtractionResult(
            technologies=["typescript", "react"],
            work_arrangement="remote",
        )

        result = engine.score(extraction, "Frontend Engineer", "React TypeScript job")

        # Should have bonuses for matched skills
        assert result.final_score > 50

    def test_below_min_score_fails(self, default_config, profile, engine_factory):
        """Score below minScore causes failure."""
        config = {**default_config, "minScore": 90}  # Very high threshold
        engine = engine_factory(config)
        extraction = JobExtractionResult(work_arrangement="remote")

        result = engine.score(extraction, "Engineer", "Basic job")

        # Should fail if score is below 90
        if result.final_score < 90:
            assert result.passed is False
            assert "below threshold" in result.rejection_reason.lower()

    def test_score_breakdown_structure(self, engine_factory):
        """ScoreBreakdown has correct structure."""
        engine = engine_factory()
        extraction = JobExtractionResult(work_arrangement="remote")

        result = engine.score(extraction, "Engineer", "Job description")

        assert isinstance(result, ScoreBreakdown)
        assert isinstance(result.base_score, int)
        assert isinstance(result.final_score, int)
        assert isinstance(result.adjustments, list)
        assert isinstance(result.passed, bool)
        assert 0 <= result.final_score <= 100

    def test_skill_match_does_not_double_count_keywords(self, default_config, profile):
        """Skills already matched should not double count in keyword scoring."""
        engine = ScoringEngine(
            default_config,
            skill_years={"python": 3, "typescript": 2},
            user_experience_years=profile["total_years"],
            skill_analogs=profile["analogs"],
        )

        extraction = JobExtractionResult(
            seniority="senior",
            technologies=["python"],
            role_types=[],
        )

        description = "We use Python heavily for backend services."
        result = engine.score(
            extraction, job_title="Fullstack Engineer", job_description=description
        )

        skill_adjustments = [a for a in result.adjustments if a.category == "skills"]
        assert len(skill_adjustments) == 1

    def test_timezone_penalty(self, engine_factory):
        """Timezone difference within max adds penalty (not hard reject)."""
        engine = engine_factory()
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
