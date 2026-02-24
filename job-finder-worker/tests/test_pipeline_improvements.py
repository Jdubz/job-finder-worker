"""Tests for pipeline improvements: word boundary, synonyms, config reconciliation,
confidence scoring, extraction repair, and timezone flexibility."""

import pytest
from unittest.mock import MagicMock

from job_finder.filters.title_filter import TitleFilter
from job_finder.filters.prefilter import PreFilter
from job_finder.ai.extraction import JobExtractionResult, JobExtractor
from job_finder.scoring.engine import ScoringEngine

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _base_prefilter_config(**overrides):
    """Return a minimal valid PreFilter config, with optional overrides."""
    config = {
        "title": {
            "requiredKeywords": ["engineer", "developer", "software"],
            "excludedKeywords": ["intern", "junior"],
        },
        "freshness": {"maxAgeDays": 0},
        "workArrangement": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": True,
            "willRelocate": True,
            "userLocation": "Portland, OR",
        },
        "employmentType": {
            "allowFullTime": True,
            "allowPartTime": True,
            "allowContract": True,
        },
        "salary": {"minimum": None},
    }
    config.update(overrides)
    return config


def _scoring_config(**location_overrides):
    """Return a minimal valid ScoringEngine config."""
    loc = {
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
    }
    loc.update(location_overrides)
    return {
        "minScore": 60,
        "seniority": {
            "preferred": ["senior", "staff", "lead"],
            "acceptable": ["mid"],
            "rejected": ["junior"],
            "preferredScore": 15,
            "acceptableScore": 0,
            "rejectedScore": -100,
        },
        "location": loc,
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
        "experience": {},
        "freshness": {
            "freshDays": 2,
            "freshScore": 10,
            "staleDays": 3,
            "staleScore": -5,
            "veryStaleDays": 14,
            "veryStaleScore": -100,
            "repostScore": -5,
        },
        "roleFit": {
            "preferred": ["backend", "fullstack"],
            "acceptable": ["frontend"],
            "penalized": ["consulting"],
            "rejected": ["clearance-required"],
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


# ===========================================================================
# 1. TitleFilter word boundary matching + synonyms
# ===========================================================================


class TestTitleFilterWordBoundary:
    """Word boundary regex prevents substring collisions."""

    def test_java_does_not_match_javascript(self):
        """'java' in excluded should NOT reject 'JavaScript Developer'."""
        config = {
            "requiredKeywords": ["developer"],
            "excludedKeywords": ["java"],
        }
        tf = TitleFilter(config)

        result = tf.filter("JavaScript Developer")
        assert result.passed is True

    def test_java_matches_java_developer(self):
        """'java' in excluded SHOULD reject 'Java Developer'."""
        config = {
            "requiredKeywords": ["developer"],
            "excludedKeywords": ["java"],
        }
        tf = TitleFilter(config)

        result = tf.filter("Java Developer")
        assert result.passed is False
        assert "java" in result.reason.lower()

    def test_go_does_not_match_google(self):
        """'go' in excluded should NOT reject 'Google Engineer'."""
        config = {
            "requiredKeywords": ["engineer"],
            "excludedKeywords": ["go"],
        }
        tf = TitleFilter(config)

        result = tf.filter("Google Engineer")
        assert result.passed is True

    def test_go_matches_go_developer(self):
        """'go' in excluded SHOULD reject 'Go Developer'."""
        config = {
            "requiredKeywords": ["developer"],
            "excludedKeywords": ["go"],
        }
        tf = TitleFilter(config)

        result = tf.filter("Go Developer")
        assert result.passed is False

    def test_intern_does_not_match_internal(self):
        """'intern' in excluded should NOT reject 'Internal Tools Engineer'."""
        config = {
            "requiredKeywords": ["engineer"],
            "excludedKeywords": ["intern"],
        }
        tf = TitleFilter(config)

        result = tf.filter("Internal Tools Engineer")
        assert result.passed is True

    def test_required_keyword_uses_word_boundary(self):
        """Required keywords should also use word boundaries."""
        config = {
            "requiredKeywords": ["engineer"],
            "excludedKeywords": [],
        }
        tf = TitleFilter(config)

        # "engineer" as a whole word passes
        assert tf.filter("Software Engineer").passed is True
        # "engineering" contains "engineer" as substring but not word boundary match
        assert tf.filter("Engineering Manager").passed is False


class TestTitleFilterSynonyms:
    """Synonyms expand the required keyword list."""

    def test_synonym_expands_required(self):
        """SWE should match via 'engineer' synonym."""
        config = {
            "requiredKeywords": ["engineer", "developer"],
            "excludedKeywords": [],
            "synonyms": {
                "engineer": ["swe", "sde"],
            },
        }
        tf = TitleFilter(config)

        result = tf.filter("Senior SWE")
        assert result.passed is True

    def test_synonym_sde_matches(self):
        config = {
            "requiredKeywords": ["engineer"],
            "excludedKeywords": [],
            "synonyms": {
                "engineer": ["swe", "sde"],
            },
        }
        tf = TitleFilter(config)

        result = tf.filter("SDE II")
        assert result.passed is True

    def test_multi_word_synonym(self):
        """Multi-word synonyms like 'full-stack' should work."""
        config = {
            "requiredKeywords": ["fullstack"],
            "excludedKeywords": [],
            "synonyms": {
                "fullstack": ["full-stack", "full stack"],
            },
        }
        tf = TitleFilter(config)

        assert tf.filter("Full-Stack Developer").passed is True
        assert tf.filter("Full Stack Developer").passed is True
        assert tf.filter("Fullstack Developer").passed is True

    def test_synonym_not_duplicated(self):
        """Synonyms that are already in required are not duplicated."""
        config = {
            "requiredKeywords": ["engineer", "swe"],
            "excludedKeywords": [],
            "synonyms": {
                "engineer": ["swe"],  # swe already in required
            },
        }
        tf = TitleFilter(config)
        assert len(tf.required) == 2  # not 3

    def test_synonym_for_missing_canonical_ignored(self):
        """Synonyms for a canonical keyword not in required are ignored."""
        config = {
            "requiredKeywords": ["developer"],
            "excludedKeywords": [],
            "synonyms": {
                "engineer": ["swe"],  # engineer not in required
            },
        }
        tf = TitleFilter(config)
        assert "swe" not in tf.required


# ===========================================================================
# 2. PreFilter word boundary + synonyms
# ===========================================================================


class TestPreFilterWordBoundary:
    """PreFilter._check_title() uses word boundary matching."""

    def test_java_does_not_match_javascript(self):
        """PreFilter should not reject JavaScript when 'java' is excluded."""
        config = _base_prefilter_config()
        config["title"]["excludedKeywords"] = ["java"]
        config["title"]["requiredKeywords"] = ["developer"]
        pf = PreFilter(config)

        result = pf.filter({"title": "JavaScript Developer"})
        assert result.passed is True

    def test_java_rejects_java(self):
        config = _base_prefilter_config()
        config["title"]["excludedKeywords"] = ["java"]
        config["title"]["requiredKeywords"] = ["developer"]
        pf = PreFilter(config)

        result = pf.filter({"title": "Java Developer"})
        assert result.passed is False

    def test_prefilter_synonyms(self):
        """PreFilter should expand synonyms for required keywords."""
        config = _base_prefilter_config()
        config["title"]["requiredKeywords"] = ["engineer"]
        config["title"]["excludedKeywords"] = []
        config["title"]["synonyms"] = {"engineer": ["swe", "sde"]}
        pf = PreFilter(config)

        result = pf.filter({"title": "Senior SWE"})
        assert result.passed is True


# ===========================================================================
# 3. Config reconciliation
# ===========================================================================


class TestReconcileConfigs:
    """_reconcile_configs patches prefilter from match-policy."""

    def _make_processor_stub(self):
        """Create a minimal stub with the _reconcile_configs method."""
        # Import the actual method — it's a simple dict transform
        from job_finder.job_queue.processors.job_processor import JobProcessor

        # We only need the method, create a stub
        stub = object.__new__(JobProcessor)
        return stub

    def test_salary_minimum_overridden(self):
        stub = self._make_processor_stub()
        prefilter = {"salary": {"minimum": 100000}}
        match_policy = {"salary": {"minimum": 150000}}

        result = stub._reconcile_configs(prefilter, match_policy)
        assert result["salary"]["minimum"] == 150000

    def test_freshness_overridden(self):
        stub = self._make_processor_stub()
        prefilter = {"freshness": {"maxAgeDays": 7}}
        match_policy = {"freshness": {"veryStaleDays": 14}}

        result = stub._reconcile_configs(prefilter, match_policy)
        assert result["freshness"]["maxAgeDays"] == 14

    def test_work_arrangement_booleans_overridden(self):
        stub = self._make_processor_stub()
        prefilter = {
            "workArrangement": {
                "allowRemote": False,
                "allowHybrid": False,
                "allowOnsite": True,
            }
        }
        match_policy = {
            "location": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": False,
            }
        }

        result = stub._reconcile_configs(prefilter, match_policy)
        assert result["workArrangement"]["allowRemote"] is True
        assert result["workArrangement"]["allowHybrid"] is True
        assert result["workArrangement"]["allowOnsite"] is False

    def test_missing_match_policy_fields_leave_prefilter_unchanged(self):
        stub = self._make_processor_stub()
        prefilter = {"salary": {"minimum": 100000}, "freshness": {"maxAgeDays": 7}}
        match_policy = {}  # no overlapping fields

        result = stub._reconcile_configs(prefilter, match_policy)
        assert result["salary"]["minimum"] == 100000
        assert result["freshness"]["maxAgeDays"] == 7

    def test_salary_section_created_if_missing(self):
        stub = self._make_processor_stub()
        prefilter = {}
        match_policy = {"salary": {"minimum": 150000}}

        result = stub._reconcile_configs(prefilter, match_policy)
        assert result["salary"]["minimum"] == 150000


# ===========================================================================
# 4. Confidence scoring
# ===========================================================================


class TestConfidenceScoring:
    """compute_confidence() returns correct fraction."""

    def test_all_fields_filled(self):
        result = JobExtractionResult(
            seniority="senior",
            work_arrangement="remote",
            timezone=-8.0,
            salary_min=150000,
            employment_type="full-time",
            technologies=["python", "react"],
        )
        assert result.compute_confidence() == 1.0

    def test_all_fields_missing(self):
        result = JobExtractionResult()
        assert result.compute_confidence() == 0.0

    def test_partial_fields(self):
        result = JobExtractionResult(
            seniority="senior",
            work_arrangement="unknown",
            timezone=None,
            salary_min=150000,
            employment_type="unknown",
            technologies=[],
        )
        # seniority=filled, work_arrangement=unknown, timezone=None,
        # salary_min=filled, employment_type=unknown, technologies=empty
        # 2 filled out of 6
        assert result.compute_confidence() == pytest.approx(2 / 6)

    def test_from_dict_computes_confidence(self):
        """from_dict should auto-compute confidence."""
        data = {
            "seniority": "senior",
            "workArrangement": "remote",
            "timezone": -5,
            "salaryMin": 150000,
            "salaryMax": 200000,
            "employmentType": "full-time",
            "technologies": ["python"],
        }
        result = JobExtractionResult.from_dict(data)
        assert result.confidence == 1.0


class TestMissingFields:
    """missing_fields() returns correct list."""

    def test_all_missing(self):
        result = JobExtractionResult()
        missing = result.missing_fields()
        assert set(missing) == {
            "seniority",
            "work_arrangement",
            "timezone",
            "salary_min",
            "employment_type",
            "technologies",
        }

    def test_none_missing(self):
        result = JobExtractionResult(
            seniority="senior",
            work_arrangement="remote",
            timezone=-8.0,
            salary_min=150000,
            employment_type="full-time",
            technologies=["python"],
        )
        assert result.missing_fields() == []


class TestMerge:
    """merge() correctly fills in missing fields from repair data."""

    def test_merge_fills_missing(self):
        original = JobExtractionResult(
            seniority="senior",
            work_arrangement="unknown",
            timezone=None,
            salary_min=None,
            employment_type="unknown",
            technologies=[],
        )
        repair = JobExtractionResult(
            seniority="unknown",  # worse than original, should not overwrite
            work_arrangement="remote",
            timezone=-5.0,
            salary_min=160000,
            employment_type="full-time",
            technologies=["python", "react"],
        )

        original.merge(repair)

        assert original.seniority == "senior"  # kept
        assert original.work_arrangement == "remote"  # filled
        assert original.timezone == -5.0  # filled
        assert original.salary_min == 160000  # filled
        assert original.employment_type == "full-time"  # filled
        assert original.technologies == ["python", "react"]  # filled

    def test_merge_does_not_overwrite_good_values(self):
        original = JobExtractionResult(
            seniority="senior",
            work_arrangement="remote",
            timezone=-8.0,
            salary_min=200000,
            employment_type="full-time",
            technologies=["python"],
        )
        repair = JobExtractionResult(
            seniority="mid",
            work_arrangement="hybrid",
            timezone=-5.0,
            salary_min=150000,
            employment_type="contract",
            technologies=["java"],
        )

        original.merge(repair)

        # Nothing should change since all original fields are good
        assert original.seniority == "senior"
        assert original.work_arrangement == "remote"
        assert original.timezone == -8.0
        assert original.salary_min == 200000
        assert original.employment_type == "full-time"
        assert original.technologies == ["python"]

    def test_merge_timezone_flexible(self):
        original = JobExtractionResult(timezone_flexible=False)
        repair = JobExtractionResult(timezone_flexible=True)
        original.merge(repair)
        assert original.timezone_flexible is True


# ===========================================================================
# 5. extract_with_repair()
# ===========================================================================


class TestExtractWithRepair:
    """extract_with_repair() does a repair pass when confidence is low."""

    def _make_extractor(self, initial_result, repair_result=None):
        """Create extractor with mocked agent_manager."""
        agent_manager = MagicMock()
        extractor = JobExtractor(agent_manager)

        # First call returns initial, second call returns repair
        responses = [MagicMock(text="{}")]
        if repair_result:
            responses.append(MagicMock(text="{}"))
        agent_manager.execute.side_effect = responses

        # Patch _parse_response to return our predetermined results
        results = [initial_result]
        if repair_result:
            results.append(repair_result)
        extractor._parse_response = MagicMock(side_effect=results)

        return extractor

    def test_skips_repair_when_confidence_high(self):
        initial = JobExtractionResult(
            seniority="senior",
            work_arrangement="remote",
            timezone=-8.0,
            salary_min=150000,
            employment_type="full-time",
            technologies=["python"],
        )
        initial.confidence = initial.compute_confidence()

        extractor = self._make_extractor(initial)
        result = extractor.extract_with_repair("Title", "Description")

        assert result is initial
        # Agent manager should only be called once (no repair)
        assert extractor.agent_manager.execute.call_count == 1

    def test_attempts_repair_when_confidence_low(self):
        initial = JobExtractionResult(
            seniority="unknown",
            work_arrangement="unknown",
            timezone=None,
            salary_min=None,
            employment_type="unknown",
            technologies=[],
        )
        initial.confidence = initial.compute_confidence()

        repair = JobExtractionResult(
            seniority="senior",
            work_arrangement="remote",
            timezone=-5.0,
            salary_min=160000,
            employment_type="full-time",
            technologies=["python"],
        )

        extractor = self._make_extractor(initial, repair)
        result = extractor.extract_with_repair("Title", "Description")

        # Should have called agent_manager twice
        assert extractor.agent_manager.execute.call_count == 2
        # Merged values should be present
        assert result.seniority == "senior"
        assert result.work_arrangement == "remote"
        assert result.confidence > 0.0

    def test_repair_failure_keeps_original(self):
        initial = JobExtractionResult(
            seniority="unknown",
            work_arrangement="unknown",
        )
        initial.confidence = initial.compute_confidence()

        agent_manager = MagicMock()
        extractor = JobExtractor(agent_manager)

        # First call succeeds, second raises
        call_count = [0]

        def mock_execute(**kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return MagicMock(text="{}")
            raise Exception("API error")

        agent_manager.execute.side_effect = mock_execute
        parse_results = [initial]
        extractor._parse_response = MagicMock(side_effect=parse_results)

        result = extractor.extract_with_repair("Title", "Description")
        # Should return original result despite repair failure
        assert result.seniority == "unknown"


# ===========================================================================
# 6. Timezone flexibility exemption in scoring
# ===========================================================================


class TestTimezoneFlexibility:
    """timezone_flexible=True exempts remote jobs from timezone penalty."""

    def test_timezone_flexible_no_penalty(self):
        """A timezone-flexible remote job should get no timezone penalty."""
        config = _scoring_config(
            userTimezone=-8,
            maxTimezoneDiffHours=4,
            perHourScore=-3,
        )
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="remote",
            timezone=3,  # Would be 11h diff, normally hard reject
            seniority="senior",
            timezone_flexible=True,
        )

        result = engine.score(extraction, "Senior Engineer", "Remote anywhere")

        # Should NOT be rejected for timezone
        if not result.passed:
            assert "timezone" not in (result.rejection_reason or "").lower()

    def test_timezone_not_flexible_still_penalized(self):
        """A non-flexible remote job should still get timezone penalty."""
        config = _scoring_config(
            userTimezone=-8,
            maxTimezoneDiffHours=4,
            perHourScore=-3,
        )
        engine = ScoringEngine(config)
        extraction = JobExtractionResult(
            work_arrangement="remote",
            timezone=3,  # 11h diff, should be hard rejected
            seniority="senior",
            timezone_flexible=False,
        )

        result = engine.score(extraction, "Senior Engineer", "Remote EU")

        assert result.passed is False
        assert "timezone" in result.rejection_reason.lower()

    def test_timezone_flexible_field_in_to_dict(self):
        """timezone_flexible should appear in to_dict output."""
        result = JobExtractionResult(timezone_flexible=True)
        d = result.to_dict()
        assert d["timezoneFlexible"] is True

    def test_timezone_flexible_from_dict(self):
        """timezone_flexible should be parsed from dict."""
        data = {"timezoneFlexible": True}
        result = JobExtractionResult.from_dict(data)
        assert result.timezone_flexible is True
