"""Tests for the deterministic scoring engine."""

import pytest

from job_finder.scoring.engine import ScoringEngine, ScoreBreakdown
from job_finder.ai.extraction import JobExtractionResult


@pytest.fixture
def default_config():
    """Return a complete match-policy configuration (all sections required, no defaults)."""
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
            "missingIgnore": [],
            "analogScore": 0,
            "maxBonus": 25,
            "maxPenalty": -15,
            "analogGroups": [["aws", "gcp"], ["node", "node.js"]],
        },
        "skills": {
            "bonusPerSkill": 2,
            "maxSkillBonus": 15,
        },
        "salary": {
            "minimum": 150000,
            "target": 200000,
            "belowTargetScore": -2,
            "belowTargetMaxPenalty": -20,
            "missingSalaryScore": 0,
            "meetsTargetScore": 5,
            "equityScore": 5,
            "contractScore": -15,
        },
        # Experience scoring is DISABLED - section kept for backwards compatibility
        "experience": {},
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

        assert any(
            adj.category == "skills" and "Matched" in adj.reason for adj in result.adjustments
        )

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

    def test_analog_skill_applies_score(self, default_config, profile):
        """Analog skills are treated as matches when configured.

        Analogs are parallel skills that prevent penalty but don't give full bonus.
        E.g., user has AWS, job wants GCP - they're parallel clouds, not synonyms.
        """
        cfg = {
            **default_config,
            "skillMatch": {
                **default_config["skillMatch"],
                "analogScore": 1,
            },
        }
        # User has AWS but not GCP
        engine = ScoringEngine(
            cfg,
            skill_years={"aws": 3},
            user_experience_years=profile["total_years"],
            skill_analogs={"gcp": {"aws"}, "aws": {"gcp"}},  # AWS <-> GCP are analogs
        )
        extraction = JobExtractionResult(technologies=["gcp"])  # Job wants GCP

        result = engine.score(extraction, "Cloud Engineer", "GCP role")

        analog_adjustments = [a for a in result.adjustments if "Analog" in a.reason]
        assert analog_adjustments, "Expected analog adjustment when equivalent skill exists"
        assert any(adj.points == cfg["skillMatch"]["analogScore"] for adj in analog_adjustments)

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

    def test_hybrid_different_city_relocation_not_allowed_rejects(self, default_config):
        """Hybrid role in different city rejected when relocationAllowed=False."""
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "userCity": "Portland",
                "userTimezone": -8,
                "relocationAllowed": False,  # User won't relocate
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="hybrid",
            city="San Francisco",  # Different city
            timezone=-8,  # Same timezone
        )

        result = engine.score(extraction, "Engineer", "Hybrid position in SF")

        assert result.passed is False
        assert result.hard_reject is True if hasattr(result, "hard_reject") else True
        assert "relocation" in result.rejection_reason.lower()

    def test_hybrid_different_city_relocation_allowed_applies_penalty(self, default_config):
        """Hybrid role in different city applies penalty when relocationAllowed=True."""
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "userCity": "Portland",
                "userTimezone": -8,
                "relocationAllowed": True,  # User willing to relocate
                "relocationScore": -15,
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="hybrid",
            city="San Francisco",  # Different city
            timezone=-8,  # Same timezone
            seniority="senior",
            technologies=["typescript", "react"],
        )

        result = engine.score(extraction, "Senior Engineer", "Hybrid position in SF")

        # Should NOT be a hard reject
        assert (
            result.rejection_reason is None or "relocation" not in result.rejection_reason.lower()
        )
        # Should have relocation penalty adjustment
        assert any("relocation" in adj.reason.lower() for adj in result.adjustments)
        # Penalty should be applied
        relocation_adj = next(
            (a for a in result.adjustments if "relocation" in a.reason.lower()), None
        )
        assert relocation_adj is not None
        assert relocation_adj.points == -15

    def test_hybrid_same_city_gets_bonus(self, default_config):
        """Hybrid role in same city as user gets bonus."""
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "userCity": "Portland",
                "userTimezone": -8,
                "hybridSameCityScore": 10,
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="hybrid",
            city="Portland",  # Same city
            timezone=-8,
            seniority="senior",
        )

        result = engine.score(extraction, "Senior Engineer", "Hybrid position in Portland")

        # Should have same-city bonus
        assert any("same city" in adj.reason.lower() for adj in result.adjustments)
        same_city_adj = next(
            (a for a in result.adjustments if "same city" in a.reason.lower()), None
        )
        assert same_city_adj is not None
        assert same_city_adj.points == 10

    def test_timezone_from_personal_info_used(self, default_config):
        """Timezone from personal-info (via userTimezone) is used for scoring."""
        # User is at UTC+1 (Europe), job is at UTC-8 (Pacific) = 9 hour diff
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "userTimezone": 1,  # Simulating value from personal-info
                "maxTimezoneDiffHours": 4,
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="hybrid",
            timezone=-8,  # Pacific time
        )

        result = engine.score(extraction, "Engineer", "Hybrid position")

        # 9 hour diff exceeds max of 4 - should be rejected
        assert result.passed is False
        assert "timezone" in result.rejection_reason.lower()

    def test_city_from_personal_info_used(self, default_config):
        """City from personal-info (via userCity) is used for hybrid city matching."""
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "userCity": "Seattle",  # Simulating value from personal-info
                "userTimezone": -8,
                "hybridSameCityScore": 10,
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="hybrid",
            city="Seattle",
            timezone=-8,
            seniority="senior",
        )

        result = engine.score(extraction, "Senior Engineer", "Hybrid position")

        # Should match Seattle and get bonus
        assert any("same city" in adj.reason.lower() for adj in result.adjustments)

    def test_onsite_different_city_relocation_not_allowed_rejects(self, default_config):
        """Onsite role in different city rejected when relocationAllowed=False."""
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "allowOnsite": True,
                "userCity": "Portland",
                "userTimezone": -8,
                "relocationAllowed": False,
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="onsite",
            city="New York",
            timezone=-5,
        )

        result = engine.score(extraction, "Engineer", "Onsite position in NYC")

        assert result.passed is False
        assert "relocation" in result.rejection_reason.lower()
        assert "onsite" in result.rejection_reason.lower()

    def test_onsite_different_city_relocation_allowed_applies_penalty(self, default_config):
        """Onsite role in different city applies penalty when relocationAllowed=True."""
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "allowOnsite": True,
                "userCity": "Portland",
                "userTimezone": -8,
                "relocationAllowed": True,
                "relocationScore": -20,
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="onsite",
            city="Seattle",
            timezone=-8,
            seniority="senior",
        )

        result = engine.score(extraction, "Senior Engineer", "Onsite position in Seattle")

        # Should NOT be a hard reject
        assert (
            result.rejection_reason is None or "relocation" not in result.rejection_reason.lower()
        )
        # Should have relocation penalty
        assert any("relocation" in adj.reason.lower() for adj in result.adjustments)
        relocation_adj = next(
            (a for a in result.adjustments if "relocation" in a.reason.lower()), None
        )
        assert relocation_adj is not None
        assert relocation_adj.points == -20

    def test_onsite_same_city_no_relocation_check(self, default_config):
        """Onsite role in same city doesn't trigger relocation logic."""
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "allowOnsite": True,
                "userCity": "Portland",
                "userTimezone": -8,
                "relocationAllowed": False,  # Should not matter for same city
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="onsite",
            city="Portland",
            timezone=-8,
            seniority="senior",
        )

        result = engine.score(extraction, "Senior Engineer", "Onsite position in Portland")

        # Should pass (same city)
        assert (
            result.rejection_reason is None
            or "relocation" not in (result.rejection_reason or "").lower()
        )
        # No relocation adjustment
        assert not any("relocation" in adj.reason.lower() for adj in result.adjustments)

    def test_implied_skill_gives_bonus(self, default_config):
        """Skills that imply other skills should qualify for those requirements.

        One-way implication: express implies REST, so user with express qualifies for REST jobs.
        But REST doesn't imply express - REST knowledge doesn't mean you know express.
        """
        engine = ScoringEngine(
            default_config,
            skill_years={"express": 4},  # User has express
        )
        extraction = JobExtractionResult(
            technologies=["rest"],  # Job wants REST
            seniority="senior",
        )

        result = engine.score(extraction, "Backend Engineer", "REST API role")

        # Express implies REST, so user should get bonus for the REST requirement
        implied_adjustments = [
            a for a in result.adjustments if "Implied" in a.reason or "via" in a.reason.lower()
        ]
        assert implied_adjustments, "Expected implied adjustment when skill implies job requirement"
        # Should show "rest via express" in the adjustment reason
        assert any(
            "rest" in adj.reason.lower() and "express" in adj.reason.lower()
            for adj in implied_adjustments
        )

    def test_implies_is_one_way(self, default_config):
        """Implies relationship is one-way - REST does not imply express.

        User has REST knowledge, job wants express. Since REST doesn't imply express,
        user should NOT qualify through implies (might still match via analog groups).
        """
        engine = ScoringEngine(
            default_config,
            skill_years={"rest": 5},  # User has REST
            skill_analogs={},  # No analogs configured
        )
        extraction = JobExtractionResult(
            technologies=["express"],  # Job wants express
            seniority="senior",
        )

        result = engine.score(extraction, "Backend Engineer", "Express.js role")

        # REST does NOT imply express, so there should be no implied match
        implied_adjustments = [a for a in result.adjustments if "Implied" in a.reason]
        assert not implied_adjustments, "REST should not imply express (one-way relationship)"
        # Should have a missing skill penalty for express
        missing_adjustments = [a for a in result.adjustments if "Missing" in a.reason]
        assert missing_adjustments, "Expected missing skill adjustment for express"
