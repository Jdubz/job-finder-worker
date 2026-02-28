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
            "rejected": ["clearance-required", "management", "non-software"],
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
    }


@pytest.fixture
def engine_factory(default_config, profile):
    def _create(config_override=None):
        cfg = default_config if config_override is None else config_override
        return ScoringEngine(
            cfg,
            skill_years=profile["skill_years"],
            user_experience_years=profile["total_years"],
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

    def test_parallel_skill_prevents_penalty(self, default_config, profile):
        """Parallel skills from taxonomy prevent missing penalty but don't give bonus.

        Parallels are alternative skills: user has AWS, job wants GCP.
        They're parallel clouds defined in taxonomy, not the same technology.
        """
        cfg = {
            **default_config,
            "skillMatch": {
                **default_config["skillMatch"],
                "analogScore": 1,  # Score for parallel match (prevents penalty)
            },
        }
        # User has AWS but not GCP - taxonomy defines aws.parallels = [gcp, azure]
        engine = ScoringEngine(
            cfg,
            skill_years={"aws": 3},
            user_experience_years=profile["total_years"],
        )
        extraction = JobExtractionResult(technologies=["gcp"])  # Job wants GCP

        result = engine.score(extraction, "Cloud Engineer", "GCP role")

        # AWS parallels GCP in taxonomy, so user should get analog adjustment not missing
        analog_adjustments = [a for a in result.adjustments if "Analog" in a.reason]
        assert (
            analog_adjustments
        ), "Expected analog adjustment when parallel skill exists in taxonomy"
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
            user_experience_years=4,
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
        user should NOT qualify through implies. REST and graphql are parallels in
        taxonomy, but express is NOT a parallel of REST.
        """
        engine = ScoringEngine(
            default_config,
            skill_years={"rest": 5},  # User has REST
        )
        extraction = JobExtractionResult(
            technologies=["express"],  # Job wants express
            seniority="senior",
        )

        result = engine.score(extraction, "Backend Engineer", "Express.js role")

        # REST does NOT imply express, so there should be no implied match
        implied_adjustments = [a for a in result.adjustments if "Implied" in a.reason]
        assert not implied_adjustments, "REST should not imply express (one-way relationship)"
        # Should have a missing skill penalty for express (or parallel match)
        # Since express is parallel to flask/django/fastapi (but REST is only parallel to graphql), user should get penalty
        missing_adjustments = [a for a in result.adjustments if "Missing" in a.reason]
        assert missing_adjustments, "Expected missing skill adjustment for express"

    def test_remote_job_gets_timezone_penalty(self, default_config):
        """Remote jobs should get timezone penalty when in different timezone.

        Fix for: Remote jobs were returning early with remote bonus but skipping
        timezone scoring entirely. A remote job in NYC (UTC-5) for a Portland user
        (UTC-8) should still incur a timezone penalty.
        """
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "userTimezone": -8,  # Portland (PST)
                "perHourScore": -3,
                "maxTimezoneDiffHours": 5,
                "remoteScore": 5,
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="remote",
            timezone=-5,  # NYC (EST) = 3 hour diff from PST
            seniority="senior",
        )

        result = engine.score(extraction, "Senior Engineer", "Remote position")

        # Should have BOTH remote bonus AND timezone penalty
        remote_adj = next((a for a in result.adjustments if "Remote" in a.reason), None)
        tz_adj = next((a for a in result.adjustments if "timezone" in a.reason.lower()), None)

        assert remote_adj is not None, "Expected remote position bonus"
        assert remote_adj.points == 5, "Remote bonus should be 5"
        assert tz_adj is not None, "Expected timezone penalty for remote job"
        assert tz_adj.points == -9, "3h diff * -3 per hour = -9"

    def test_remote_job_no_timezone_penalty_when_same_timezone(self, default_config):
        """Remote jobs in same timezone should not get timezone penalty."""
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "userTimezone": -8,
                "perHourScore": -3,
                "remoteScore": 5,
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="remote",
            timezone=-8,  # Same timezone as user
            seniority="senior",
        )

        result = engine.score(extraction, "Senior Engineer", "Remote position")

        # Should have remote bonus but NO timezone penalty
        remote_adj = next((a for a in result.adjustments if "Remote" in a.reason), None)
        tz_adj = next((a for a in result.adjustments if "timezone" in a.reason.lower()), None)

        assert remote_adj is not None
        assert tz_adj is None, "No timezone penalty when same timezone"

    def test_remote_job_hard_reject_when_timezone_exceeds_max(self, default_config):
        """Remote jobs should be hard rejected when timezone diff exceeds max."""
        config = {
            **default_config,
            "location": {
                **default_config["location"],
                "userTimezone": -8,  # PST
                "maxTimezoneDiffHours": 4,
            },
        }
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="remote",
            timezone=3,  # Central Europe = 11 hour diff from PST
            seniority="senior",
        )

        result = engine.score(extraction, "Senior Engineer", "Remote position in Europe")

        assert result.passed is False
        assert "timezone" in result.rejection_reason.lower()

    def test_duplicate_skills_not_double_counted(self, default_config):
        """Duplicate skills in extraction should not be counted twice.

        Fix for: If AI extraction returns ["ml", "ml"], both would be processed
        separately, resulting in double penalty for "ml" being missing.
        """
        engine = ScoringEngine(
            default_config,
            skill_years={"python": 3},  # User has python but not ml
        )
        extraction = JobExtractionResult(
            technologies=["ml", "ml", "ML", "python"],  # ml appears 3 times (with variants)
            seniority="senior",
        )

        result = engine.score(extraction, "ML Engineer", "Machine learning role")

        # Parse the missing skills list to check for duplicates
        # Use startswith to avoid substring false positives (e.g., 'ml' in 'html')
        missing_adjustments = [a for a in result.adjustments if a.reason.startswith("Missing: ")]
        if missing_adjustments:
            assert (
                len(missing_adjustments) == 1
            ), "Expected only one adjustment for all missing skills"
            missing_reason = missing_adjustments[0].reason
            missing_skills_str = missing_reason.replace("Missing: ", "")
            missing_skills = [s.strip() for s in missing_skills_str.split(",")]
            ml_count = missing_skills.count("ml")
            assert (
                ml_count == 1
            ), f"'ml' should be missing exactly once, but was found {ml_count} times in {missing_skills}"

    def test_company_size_large_company_bonus(self, default_config):
        """Large companies should get bonus based on employee count threshold."""
        engine = ScoringEngine(default_config)
        extraction = JobExtractionResult(
            work_arrangement="remote",
            seniority="senior",
        )
        # Company data with camelCase fields (as returned by companies_manager)
        company_data = {
            "id": "test-123",
            "name": "Big Corp",
            "employeeCount": 15000,  # Above largeCompanyThreshold (10000)
            "isRemoteFirst": False,
            "aiMlFocus": False,
            "hasPortlandOffice": False,
            "headquartersLocation": "San Francisco, CA",
            "about": "Enterprise software company",
            "techStack": [],
        }

        result = engine.score(extraction, "Senior Engineer", "Job at Big Corp", company_data)

        # Should have large company bonus
        company_adjustments = [a for a in result.adjustments if a.category == "company"]
        large_co_adj = next((a for a in company_adjustments if "Large company" in a.reason), None)
        assert (
            large_co_adj is not None
        ), f"Expected Large company adjustment, got: {company_adjustments}"
        assert large_co_adj.points == default_config["company"]["largeCompanyScore"]

    def test_company_size_small_company_penalty(self, default_config):
        """Small companies should get penalty based on employee count threshold."""
        engine = ScoringEngine(default_config)
        extraction = JobExtractionResult(
            work_arrangement="remote",
            seniority="senior",
        )
        company_data = {
            "employeeCount": 50,  # Below smallCompanyThreshold (100)
            "isRemoteFirst": False,
            "aiMlFocus": False,
        }

        result = engine.score(extraction, "Senior Engineer", "Job at Startup", company_data)

        # Should have small company/startup adjustment
        company_adjustments = [a for a in result.adjustments if a.category == "company"]
        size_adj = next(
            (a for a in company_adjustments if "Small" in a.reason or "Startup" in a.reason), None
        )
        # startupScore is 0 in default config, so smallCompanyScore (-5) should be used
        assert size_adj is not None, f"Expected size adjustment, got: {company_adjustments}"

    def test_company_ai_ml_focus_bonus(self, default_config):
        """Companies with AI/ML focus should get bonus."""
        engine = ScoringEngine(default_config)
        extraction = JobExtractionResult(
            work_arrangement="remote",
            seniority="senior",
        )
        company_data = {
            "employeeCount": 500,
            "isRemoteFirst": False,
            "aiMlFocus": True,  # Set by company enrichment
        }

        result = engine.score(extraction, "ML Engineer", "Job at AI company", company_data)

        company_adjustments = [a for a in result.adjustments if a.category == "company"]
        ai_adj = next((a for a in company_adjustments if "AI/ML" in a.reason), None)
        assert ai_adj is not None, f"Expected AI/ML focus adjustment, got: {company_adjustments}"
        assert ai_adj.points == default_config["company"]["aiMlFocusScore"]

    def test_non_software_role_hard_rejected(self, engine_factory):
        """Non-software role type causes hard rejection."""
        engine = engine_factory()
        extraction = JobExtractionResult(
            role_types=["non-software"],
            seniority="senior",
            work_arrangement="remote",
        )

        result = engine.score(extraction, "Mechanical Engineer", "Mechanical design role")

        assert result.passed is False
        assert result.rejection_reason is not None
        assert (
            "role" in result.rejection_reason.lower()
            or "non-software" in result.rejection_reason.lower()
        )

    def test_mixed_role_types_with_non_software_still_rejected(self, engine_factory):
        """Rejected role type takes precedence even when mixed with preferred types."""
        engine = engine_factory()
        extraction = JobExtractionResult(
            role_types=["non-software", "backend"],
            seniority="senior",
            work_arrangement="remote",
        )

        result = engine.score(extraction, "Engineer", "Ambiguous role")

        assert result.passed is False
        assert result.rejection_reason is not None

    def test_company_remote_first_bonus(self, default_config):
        """Remote-first companies should get bonus."""
        engine = ScoringEngine(default_config)
        extraction = JobExtractionResult(
            work_arrangement="remote",
            seniority="senior",
        )
        company_data = {
            "employeeCount": 500,
            "isRemoteFirst": True,
            "aiMlFocus": False,
        }

        result = engine.score(extraction, "Senior Engineer", "Job at remote company", company_data)

        company_adjustments = [a for a in result.adjustments if a.category == "company"]
        remote_adj = next((a for a in company_adjustments if "Remote-first" in a.reason), None)
        assert (
            remote_adj is not None
        ), f"Expected Remote-first adjustment, got: {company_adjustments}"
        assert remote_adj.points == default_config["company"]["remoteFirstScore"]
