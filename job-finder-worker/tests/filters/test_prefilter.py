"""Tests for structured data pre-filter."""

import pytest
from datetime import datetime, timezone, timedelta

from job_finder.filters.prefilter import PreFilter, PreFilterResult


class TestPreFilterResult:
    """Tests for PreFilterResult dataclass."""

    def test_to_dict_passed(self):
        result = PreFilterResult(
            passed=True,
            checks_performed=["title", "freshness"],
            checks_skipped=["salary"],
        )
        d = result.to_dict()
        assert d["passed"] is True
        assert d["reason"] is None
        assert d["checksPerformed"] == ["title", "freshness"]
        assert d["checksSkipped"] == ["salary"]

    def test_to_dict_failed(self):
        result = PreFilterResult(
            passed=False,
            reason="Job is too old",
            checks_performed=["freshness"],
            checks_skipped=[],
        )
        d = result.to_dict()
        assert d["passed"] is False
        assert d["reason"] == "Job is too old"


class TestPreFilterTitleCheck:
    """Tests for title keyword filtering."""

    @pytest.fixture
    def config_with_title_keywords(self):
        return {
            "title": {
                "requiredKeywords": ["engineer", "developer"],
                "excludedKeywords": ["intern", "sales"],
            },
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }

    def test_passes_with_required_keyword(self, config_with_title_keywords):
        pf = PreFilter(config_with_title_keywords)
        result = pf.filter({"title": "Senior Software Engineer"})
        assert result.passed is True
        assert "title" in result.checks_performed

    def test_fails_without_required_keyword(self, config_with_title_keywords):
        pf = PreFilter(config_with_title_keywords)
        result = pf.filter({"title": "Product Manager"})
        assert result.passed is False
        assert "Title missing required keywords" in result.reason

    def test_fails_with_excluded_keyword(self, config_with_title_keywords):
        pf = PreFilter(config_with_title_keywords)
        result = pf.filter({"title": "Software Engineer Intern"})
        assert result.passed is False
        assert "excluded keyword" in result.reason.lower()

    def test_excluded_takes_precedence(self, config_with_title_keywords):
        pf = PreFilter(config_with_title_keywords)
        # Has both required "engineer" and excluded "intern"
        result = pf.filter({"title": "Software Engineer Intern"})
        assert result.passed is False

    def test_empty_title_skipped(self, config_with_title_keywords):
        pf = PreFilter(config_with_title_keywords)
        result = pf.filter({"title": ""})
        assert result.passed is True  # Missing data = pass
        assert "title" in result.checks_skipped


class TestPreFilterFreshnessCheck:
    """Tests for job freshness/age filtering."""

    @pytest.fixture
    def config_with_freshness(self):
        return {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 30},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }

    def test_fresh_job_passes(self, config_with_freshness):
        pf = PreFilter(config_with_freshness)
        recent_date = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
        result = pf.filter({"title": "Engineer", "posted_date": recent_date})
        assert result.passed is True
        assert "freshness" in result.checks_performed

    def test_stale_job_fails(self, config_with_freshness):
        pf = PreFilter(config_with_freshness)
        old_date = (datetime.now(timezone.utc) - timedelta(days=45)).isoformat()
        result = pf.filter({"title": "Engineer", "posted_date": old_date})
        assert result.passed is False
        assert "days old" in result.reason

    def test_missing_date_skipped(self, config_with_freshness):
        pf = PreFilter(config_with_freshness)
        result = pf.filter({"title": "Engineer"})
        assert result.passed is True
        assert "freshness" in result.checks_skipped

    def test_unparseable_date_passes(self, config_with_freshness):
        pf = PreFilter(config_with_freshness)
        result = pf.filter({"title": "Engineer", "posted_date": "invalid-date"})
        # Unparseable date should pass conservatively
        assert result.passed is True

    def test_disabled_when_max_age_zero(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},  # Disabled
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        old_date = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()
        result = pf.filter({"title": "Engineer", "posted_date": old_date})
        assert result.passed is True
        # Freshness check should not be in performed or skipped (disabled)
        assert "freshness" not in result.checks_performed


class TestPreFilterWorkArrangement:
    """Tests for work arrangement filtering."""

    def test_remote_rejected_when_not_allowed(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": False, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "is_remote": True})
        assert result.passed is False
        assert "Remote" in result.reason

    def test_remote_passes_when_allowed(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "is_remote": True})
        assert result.passed is True

    def test_hybrid_from_metadata(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": False, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "metadata": {"Location Type": "Hybrid"}})
        assert result.passed is False
        assert "Hybrid" in result.reason

    def test_onsite_from_location_string(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": False},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        # Note: location string with just city name doesn't infer onsite
        # Need explicit onsite/office in metadata or location
        result = pf.filter(
            {"title": "Engineer", "metadata": {"Location Type": "Onsite - Portland, OR"}}
        )
        assert result.passed is False
        assert "Onsite" in result.reason

    def test_hybrid_outside_portland_rejected(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {
                "allowFullTime": True,
                "allowPartTime": True,
                "allowContract": True,
            },
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter(
            {
                "title": "Engineer",
                "metadata": {"Location Type": "Hybrid"},
                "location": "Seattle, WA",
            }
        )
        assert result.passed is False
        assert "Portland" in result.reason

    def test_hybrid_portland_allowed(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {
                "allowFullTime": True,
                "allowPartTime": True,
                "allowContract": True,
            },
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter(
            {
                "title": "Engineer",
                "metadata": {"Location Type": "Hybrid"},
                "location": "Portland, OR",
            }
        )
        assert result.passed is True
        assert "workArrangement" in result.checks_performed

    def test_onsite_outside_portland_rejected(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {
                "allowFullTime": True,
                "allowPartTime": True,
                "allowContract": True,
            },
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter(
            {
                "title": "Engineer",
                "metadata": {"Location Type": "Onsite"},
                "location": "San Francisco, CA",
            }
        )
        assert result.passed is False
        assert "Portland" in result.reason

    def test_unknown_arrangement_skipped(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": False, "allowHybrid": False, "allowOnsite": False},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        # No work arrangement data - should pass (missing data = pass)
        result = pf.filter({"title": "Engineer", "location": "Portland, OR"})
        assert result.passed is True
        assert "workArrangement" in result.checks_skipped


class TestPreFilterEmploymentType:
    """Tests for employment type filtering."""

    def test_full_time_rejected(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {
                "allowFullTime": False,
                "allowPartTime": True,
                "allowContract": True,
            },
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "employment_type": "Full-time"})
        assert result.passed is False
        assert "Full-time" in result.reason

    def test_contract_rejected(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {
                "allowFullTime": True,
                "allowPartTime": True,
                "allowContract": False,
            },
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "job_type": "Contract"})
        assert result.passed is False
        assert "Contract" in result.reason

    def test_unknown_employment_type_skipped(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {
                "allowFullTime": False,
                "allowPartTime": False,
                "allowContract": False,
            },
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        # Unknown format - should skip
        result = pf.filter({"title": "Engineer", "employment_type": "Permanent"})
        assert result.passed is True
        assert "employmentType" in result.checks_skipped


class TestPreFilterSalary:
    """Tests for salary floor filtering."""

    def test_salary_below_minimum_fails(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": 100000},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "salary_max": 80000})
        assert result.passed is False
        assert "$80,000" in result.reason
        assert "$100,000" in result.reason

    def test_salary_above_minimum_passes(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": 100000},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "salary_max": 150000})
        assert result.passed is True
        assert "salary" in result.checks_performed

    def test_salary_string_parsed(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": 100000},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "salary": "$80k - $120k"})
        # Should extract 120k as max and pass
        assert result.passed is True

    def test_missing_salary_skipped(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": 100000},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer"})
        assert result.passed is True
        assert "salary" in result.checks_skipped

    def test_salary_disabled_when_none(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": []},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "salary_max": 50000})
        assert result.passed is True
        # Salary check disabled, should not appear in performed or skipped


class TestPreFilterTechnology:
    """Tests for technology rejection filtering."""

    def test_rejected_tech_in_tags_fails(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": ["php", "wordpress"]},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "tags": ["python", "php", "react"]})
        assert result.passed is False
        assert "php" in result.reason.lower()

    def test_no_rejected_tech_passes(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": ["php", "wordpress"]},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "tags": ["python", "react", "typescript"]})
        assert result.passed is True
        assert "technology" in result.checks_performed

    def test_empty_tags_skipped(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": ["php"]},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "tags": []})
        assert result.passed is True
        assert "technology" in result.checks_skipped

    def test_case_insensitive_matching(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {"allowRemote": True, "allowHybrid": True, "allowOnsite": True},
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "technology": {"rejected": ["PHP", "WordPress"]},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "tags": ["php", "wordpress"]})
        assert result.passed is False


class TestPreFilterBypass:
    """Tests for filter bypass functionality."""

    def test_filter_does_not_handle_bypass(self):
        """Test that PreFilter.filter does not handle bypass logic itself.

        Bypass logic is handled in job_processor._execute_prefilter, not in
        the PreFilter class. This test verifies that PreFilter.filter will
        reject jobs that violate filter rules, regardless of any bypass intent.
        """
        config = {
            "title": {"requiredKeywords": ["engineer"], "excludedKeywords": ["intern"]},
            "freshness": {"maxAgeDays": 1},
            "workArrangement": {"allowRemote": False, "allowHybrid": False, "allowOnsite": False},
            "employmentType": {
                "allowFullTime": False,
                "allowPartTime": False,
                "allowContract": False,
            },
            "salary": {"minimum": 999999},
            "technology": {"rejected": ["everything"]},
        }
        pf = PreFilter(config)

        # Job that would normally fail all checks
        job_data = {
            "title": "Intern",  # Excluded
            "posted_date": (
                datetime.now(timezone.utc) - timedelta(days=365)
            ).isoformat(),  # Too old
            "is_remote": True,  # Not allowed
            "employment_type": "Full-time",  # Not allowed
            "salary_max": 1000,  # Below minimum
            "tags": ["everything"],  # Rejected
        }

        # PreFilter.filter() does not handle bypass - it always applies filter rules
        # Bypass is handled at the job_processor level in _execute_prefilter()
        result = pf.filter(job_data)
        assert result.passed is False
