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
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
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
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
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
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
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
            "workArrangement": {
                "allowRemote": False,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "is_remote": True})
        assert result.passed is False
        assert "Remote" in result.reason

    def test_remote_passes_when_allowed(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "is_remote": True})
        assert result.passed is True

    def test_hybrid_from_metadata(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": False,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "metadata": {"Location Type": "Hybrid"}})
        assert result.passed is False
        assert "Hybrid" in result.reason

    def test_onsite_from_location_string(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": False,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
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
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
            },
            "employmentType": {
                "allowFullTime": True,
                "allowPartTime": True,
                "allowContract": True,
            },
            "salary": {"minimum": None},
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

    def test_hybrid_outside_city_allowed_when_relocation_true(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
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
        pf = PreFilter(config)
        result = pf.filter(
            {
                "title": "Engineer",
                "metadata": {"Location Type": "Hybrid"},
                "location": "Seattle, WA",
            }
        )

        assert result.passed is True
        assert "workArrangement" in result.checks_performed

    def test_hybrid_portland_allowed(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
            },
            "employmentType": {
                "allowFullTime": True,
                "allowPartTime": True,
                "allowContract": True,
            },
            "salary": {"minimum": None},
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

    def test_hybrid_no_location_data_when_relocation_false_passes(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
            },
            "employmentType": {
                "allowFullTime": True,
                "allowPartTime": True,
                "allowContract": True,
            },
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "metadata": {"Location Type": "Hybrid"}})
        assert result.passed is True
        assert "workArrangement" in result.checks_performed

    def test_onsite_outside_portland_rejected(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
            },
            "employmentType": {
                "allowFullTime": True,
                "allowPartTime": True,
                "allowContract": True,
            },
            "salary": {"minimum": None},
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

    def test_onsite_no_location_data_when_relocation_false_passes(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
            },
            "employmentType": {
                "allowFullTime": True,
                "allowPartTime": True,
                "allowContract": True,
            },
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "metadata": {"Location Type": "Onsite"}})
        assert result.passed is True
        assert "workArrangement" in result.checks_performed

    def test_unknown_arrangement_skipped(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": False,
                "allowHybrid": False,
                "allowOnsite": False,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
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
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {
                "allowFullTime": False,
                "allowPartTime": True,
                "allowContract": True,
            },
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "employment_type": "Full-time"})
        assert result.passed is False
        assert "Full-time" in result.reason

    def test_contract_rejected(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
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
                "allowContract": False,
            },
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "job_type": "Contract"})
        assert result.passed is False
        assert "Contract" in result.reason

    def test_unknown_employment_type_skipped(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {
                "allowFullTime": False,
                "allowPartTime": False,
                "allowContract": False,
            },
            "salary": {"minimum": None},
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
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": 100000},
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
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": 100000},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "salary_max": 150000})
        assert result.passed is True
        assert "salary" in result.checks_performed

    def test_salary_string_parsed(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": 100000},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "salary": "$80k - $120k"})
        # Should extract 120k as max and pass
        assert result.passed is True

    def test_missing_salary_skipped(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": 100000},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer"})
        assert result.passed is True
        assert "salary" in result.checks_skipped

    def test_salary_disabled_when_none(self):
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "salary_max": 50000})
        assert result.passed is True
        # Salary check disabled, should not appear in performed or skipped


class TestPreFilterOfficesArray:
    """Tests for remote detection via Greenhouse offices array."""

    @pytest.fixture
    def base_config(self):
        return {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }

    def test_remote_detected_from_offices_array(self, base_config):
        """Offices array with 'Remote' should be detected as remote."""
        pf = PreFilter(base_config)
        result = pf.filter(
            {
                "title": "Engineer",
                "offices": ["Remote (International)"],
            }
        )
        assert result.passed is True
        assert "workArrangement" in result.checks_performed

    def test_remote_detected_from_offices_dict(self, base_config):
        """Offices array with dict objects containing 'Remote' should be detected."""
        pf = PreFilter(base_config)
        result = pf.filter(
            {
                "title": "Engineer",
                "offices": [{"name": "Remote", "id": 123}],
            }
        )
        assert result.passed is True
        assert "workArrangement" in result.checks_performed

    def test_non_remote_offices_skipped(self, base_config):
        """Offices without remote keyword should not infer work arrangement."""
        pf = PreFilter(base_config)
        result = pf.filter(
            {
                "title": "Engineer",
                "offices": ["San Francisco", "New York"],
            }
        )
        assert result.passed is True
        assert "workArrangement" in result.checks_skipped


class TestPreFilterRemoteKeywords:
    """Tests for configurable remote keywords."""

    def test_distributed_detected_as_remote(self):
        """'Distributed' in location should be detected as remote by default."""
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": False,  # Reject remote to verify detection
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "location": "Distributed"})
        assert result.passed is False
        assert "Remote" in result.reason

    def test_custom_remote_keywords(self):
        """Custom remote keywords should be used when configured."""
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": False,  # Reject remote to verify detection
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
                "remoteKeywords": ["wfh", "telecommute"],  # Custom keywords
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        # Default keyword should not trigger
        result = pf.filter({"title": "Engineer", "location": "Remote"})
        assert result.passed is True  # Not detected as remote

        # Custom keyword should trigger
        result = pf.filter({"title": "Engineer", "location": "WFH Available"})
        assert result.passed is False
        assert "Remote" in result.reason


class TestPreFilterLinkedInHashtags:
    """Tests for LinkedIn work-arrangement hashtags inside descriptions."""

    @pytest.fixture
    def base_config(self):
        return {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": False,  # Flip to see rejection when detected
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }

    @pytest.mark.parametrize(
        "description, arrangement_to_reject, expected_reason",
        [
            ("Great role #LI-Remote with global team", "allowRemote", "Remote"),
            ("Join us #li_Hybrid in NYC", "allowHybrid", "Hybrid"),
            ("Office-first culture #LI Onsite", "allowOnsite", "Onsite"),
            ("Another role with #li-REMOTE tag", "allowRemote", "Remote"),
        ],
    )
    def test_li_work_arrangement_detected_in_description(
        self, base_config, description, arrangement_to_reject, expected_reason
    ):
        """Hashtags for LI remote/hybrid/onsite should override allow flags."""

        base_config["workArrangement"][arrangement_to_reject] = False
        pf = PreFilter(base_config)
        result = pf.filter({"title": "Engineer", "description": description})

        assert result.passed is False
        assert expected_reason in result.reason


class TestPreFilterDescriptionBasedRemoteDetection:
    """Tests for remote/hybrid detection from job descriptions using pre-compiled patterns."""

    @pytest.fixture
    def base_config(self):
        return {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
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

    def test_remote_first_detected(self, base_config):
        """Should detect 'remote-first' as remote."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Software Engineer",
            "location": "US",
            "description": "We are a remote-first company with distributed teams.",
        }
        result = pf.filter(job_data)
        assert result.passed is True
        assert "workArrangement" in result.checks_performed

    def test_distributed_team_detected(self, base_config):
        """Should detect 'distributed team' as remote."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Backend Engineer",
            "location": "Canada",
            "description": "Join our distributed team working across multiple time zones.",
        }
        result = pf.filter(job_data)
        assert result.passed is True
        assert "workArrangement" in result.checks_performed

    def test_work_from_anywhere_detected(self, base_config):
        """Should detect 'work from anywhere' as remote."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Full Stack Developer",
            "location": "US",
            "description": "You can work from anywhere in the United States.",
        }
        result = pf.filter(job_data)
        assert result.passed is True

    def test_hybrid_team_detected(self, base_config):
        """Should detect 'hybrid team' as hybrid."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Software Engineer",
            "location": "Seattle",
            "description": "Collaborate in a hybrid team environment with flexible schedule.",
        }
        result = pf.filter(job_data)
        assert result.passed is True
        assert "workArrangement" in result.checks_performed

    def test_distributed_and_hybrid_detected(self, base_config):
        """Should detect 'distributed and hybrid' as hybrid."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Engineer",
            "location": "US",
            "description": "Work in a distributed and hybrid team with colleagues worldwide.",
        }
        result = pf.filter(job_data)
        assert result.passed is True

    def test_flexible_work_arrangement_detected(self, base_config):
        """Should detect 'flexible work arrangement' as hybrid."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Developer",
            "location": "New York",
            "description": "We offer flexible work arrangements for all team members.",
        }
        result = pf.filter(job_data)
        assert result.passed is True

    def test_distributed_systems_not_detected(self, base_config):
        """Should NOT detect 'distributed systems' (technical term) as remote."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Software Engineer",
            "location": "San Francisco",
            "description": "Build large-scale distributed systems using microservices architecture.",
        }
        arrangement = pf._infer_work_arrangement(job_data)
        # Should return None (unknown) since this is a technical term, not work arrangement
        assert arrangement is None

    def test_distributed_data_processing_not_detected(self, base_config):
        """Should NOT detect 'distributed data processing' (technical term) as remote."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Data Engineer",
            "location": "Seattle",
            "description": "Experience with distributed data frameworks like Spark and Hadoop required.",
        }
        arrangement = pf._infer_work_arrangement(job_data)
        assert arrangement is None

    def test_anywhere_in_multiword_region_detected(self, base_config):
        """Should detect 'anywhere in United States' with multi-word region name."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Engineer",
            "location": "US",
            "description": "Position available anywhere in the United States.",
        }
        result = pf.filter(job_data)
        assert result.passed is True

    def test_fully_remote_detected(self, base_config):
        """Should detect 'fully remote' as remote."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Software Developer",
            "location": "Canada",
            "description": "This is a fully remote position with no office requirement.",
        }
        result = pf.filter(job_data)
        assert result.passed is True

    def test_remote_position_detected(self, base_config):
        """Should detect 'remote position' as remote."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Backend Engineer",
            "location": "UK",
            "description": "We're hiring for a remote position on our platform team.",
        }
        result = pf.filter(job_data)
        assert result.passed is True

    def test_case_insensitive_matching(self, base_config):
        """Patterns should match case-insensitively."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Engineer",
            "location": "US",
            "description": "Join our DISTRIBUTED TEAM working REMOTELY across time zones.",
        }
        result = pf.filter(job_data)
        assert result.passed is True

    def test_no_false_positive_from_hybrid_infrastructure(self, base_config):
        """Should NOT detect 'hybrid cloud' or 'hybrid infrastructure' as work arrangement."""
        pf = PreFilter(base_config)
        job_data = {
            "title": "Cloud Engineer",
            "location": "Boston",
            "description": "Design and implement hybrid cloud solutions and infrastructure.",
        }
        arrangement = pf._infer_work_arrangement(job_data)
        # Should not match because "hybrid cloud" is not a work arrangement pattern
        assert arrangement is None


class TestPreFilterRemoteSource:
    """Tests for is_remote_source flag (set on source config, not prefilter-policy)."""

    def test_remote_source_flag_detects_remote(self):
        """Jobs from remote-only sources should be detected as remote."""
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": False,  # Reject remote to verify detection
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        # No remote indicators in job data, but is_remote_source=True
        result = pf.filter({"title": "Engineer", "location": "USA"}, is_remote_source=True)
        assert result.passed is False
        assert "Remote" in result.reason

    def test_non_remote_source_not_defaulted(self):
        """Jobs from non-remote sources should not default to remote."""
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "location": "USA"}, is_remote_source=False)
        assert result.passed is True
        assert "workArrangement" in result.checks_skipped  # No remote indicators


class TestPreFilterTreatUnknownAsOnsite:
    """Tests for treatUnknownAsOnsite option."""

    def test_unknown_treated_as_onsite_rejects_outside_location(self):
        """Unknown work arrangement should be treated as onsite when enabled."""
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
                "treatUnknownAsOnsite": True,
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        # No remote indicators, location outside user location
        result = pf.filter({"title": "Engineer", "location": "San Francisco, CA"})
        assert result.passed is False
        assert "Portland" in result.reason

    def test_unknown_treated_as_onsite_allows_matching_location(self):
        """Unknown work arrangement in user location should pass."""
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
                "treatUnknownAsOnsite": True,
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        result = pf.filter({"title": "Engineer", "location": "Portland, OR"})
        assert result.passed is True

    def test_unknown_outside_user_city_rejected_when_not_relocating(self):
        """Unknown arrangement outside user's city should be rejected when willRelocate=False.

        This catches hybrid/onsite jobs that would otherwise slip through because
        the scraper couldn't detect the work arrangement from structured data.
        """
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
                "treatUnknownAsOnsite": False,
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        # No remote indicators, location clearly outside user's city
        result = pf.filter({"title": "Engineer", "location": "San Francisco, CA"})
        assert result.passed is False
        assert "outside Portland, OR" in result.reason
        assert "workArrangement" in result.checks_performed

    def test_unknown_with_missing_location_passes(self):
        """Unknown work arrangement with no location data should pass (missing data = pass)."""
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
                "treatUnknownAsOnsite": True,
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        # No remote indicators, no location data
        result = pf.filter({"title": "Engineer"})
        assert result.passed is True

    def test_timezone_guard_blocks_large_offset(self, mocker):
        """Remote/hybrid roles are rejected when timezone diff exceeds max (city-based)."""
        # Mock the timezone lookup to avoid network calls
        mocker.patch(
            "job_finder.filters.prefilter.get_timezone_diff_hours",
            return_value=13.5,  # Portland to Hyderabad is ~13.5 hours
        )
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
                "maxTimezoneDiffHours": 4,
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        # Job in Hyderabad, India (UTC+5:30) vs Portland (UTC-8) = 13.5h diff
        job_data = {"title": "Engineer", "city": "Hyderabad", "country": "India"}
        result = pf.filter(job_data, is_remote_source=True)
        assert result.passed is False
        assert "Timezone diff" in result.reason

    def test_timezone_guard_allows_within_limit(self, mocker):
        """Remote roles within max diff should pass (city-based)."""
        # Mock the timezone lookup to avoid network calls
        mocker.patch(
            "job_finder.filters.prefilter.get_timezone_diff_hours",
            return_value=2.0,  # Portland to Denver is ~2 hours
        )
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
                "maxTimezoneDiffHours": 4,
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }
        pf = PreFilter(config)
        # Job in Denver (UTC-7) vs Portland (UTC-8) = 1h diff
        job_data = {"title": "Engineer", "city": "Denver", "state": "CO"}
        result = pf.filter(job_data, is_remote_source=True)
        assert result.passed is True

    def test_timezone_guard_allows_missing_location(self, mocker):
        """Missing job location stays permissive (city-based)."""
        # Should not be called since job has no location
        mock_tz = mocker.patch("job_finder.filters.prefilter.get_timezone_diff_hours")
        base_cfg = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
                "maxTimezoneDiffHours": 4,
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }

        # Missing location on job - should pass without calling timezone lookup
        pf = PreFilter(base_cfg)
        result_missing = pf.filter(
            {"title": "Engineer", "location": "Remote"}, is_remote_source=True
        )
        assert result_missing.passed is True
        mock_tz.assert_not_called()

    def test_timezone_guard_allows_lookup_failure(self, mocker):
        """Timezone lookup failure stays permissive."""
        # Mock timezone lookup returning None (lookup failed)
        mocker.patch(
            "job_finder.filters.prefilter.get_timezone_diff_hours",
            return_value=None,
        )
        base_cfg = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
                "maxTimezoneDiffHours": 4,
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }

        pf = PreFilter(base_cfg)
        result = pf.filter(
            {"title": "Engineer", "city": "Unknown City", "country": "Nowhere"},
            is_remote_source=True,
        )
        assert result.passed is True


class TestPreFilterBypass:
    """Tests for filter bypass functionality."""

    def test_filter_does_not_handle_bypass(self):
        """Test that PreFilter.filter does not handle bypass logic itself.

        Bypass logic is handled at the scraper intake level, not in the
        PreFilter class. This test verifies that PreFilter.filter will
        reject jobs that violate filter rules, regardless of any bypass intent.
        """
        config = {
            "title": {"requiredKeywords": ["engineer"], "excludedKeywords": ["intern"]},
            "freshness": {"maxAgeDays": 1},
            "workArrangement": {
                "allowRemote": False,
                "allowHybrid": False,
                "allowOnsite": False,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {
                "allowFullTime": False,
                "allowPartTime": False,
                "allowContract": False,
            },
            "salary": {"minimum": 999999},
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
        }

        # PreFilter.filter() does not handle bypass - it always applies filter rules
        # Bypass is handled at the scraper intake level
        result = pf.filter(job_data)
        assert result.passed is False


class TestPreFilterCountryCheck:
    """Tests for country-based filtering."""

    @pytest.fixture
    def config_us_only(self):
        return {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "country": {"allowedCountries": ["us"]},
        }

    @pytest.fixture
    def config_no_country(self):
        """Config without country section — country check disabled."""
        return {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
        }

    def test_rejects_non_us_country_field(self, config_us_only):
        pf = PreFilter(config_us_only)
        result = pf.filter({"title": "Engineer", "country": "Germany"})
        assert result.passed is False
        assert "Location not in allowed countries" in result.reason
        assert "country" in result.checks_performed

    def test_passes_us_country_field(self, config_us_only):
        pf = PreFilter(config_us_only)
        result = pf.filter({"title": "Engineer", "country": "United States"})
        assert result.passed is True
        assert "country" in result.checks_performed

    def test_passes_us_variants(self, config_us_only):
        pf = PreFilter(config_us_only)
        for variant in ["US", "USA", "United States", "United States of America", "u.s.", "u.s.a."]:
            result = pf.filter({"title": "Engineer", "country": variant})
            assert result.passed is True, f"Expected pass for country='{variant}'"

    def test_passes_missing_country(self, config_us_only):
        pf = PreFilter(config_us_only)
        result = pf.filter({"title": "Engineer"})
        assert result.passed is True
        assert "country" in result.checks_skipped

    def test_rejects_non_us_location_string(self, config_us_only):
        pf = PreFilter(config_us_only)
        result = pf.filter({"title": "Engineer", "location": "London, UK"})
        assert result.passed is False
        assert "Location not in allowed countries" in result.reason

    def test_passes_us_location_string(self, config_us_only):
        pf = PreFilter(config_us_only)
        result = pf.filter({"title": "Engineer", "location": "Portland, US"})
        assert result.passed is True
        assert "country" in result.checks_performed

    def test_passes_when_disabled(self, config_no_country):
        pf = PreFilter(config_no_country)
        result = pf.filter({"title": "Engineer", "country": "Germany"})
        assert result.passed is True
        assert "country" not in result.checks_performed
        assert "country" not in result.checks_skipped

    def test_rejects_remote_non_us(self, config_us_only):
        pf = PreFilter(config_us_only)
        result = pf.filter({"title": "Engineer", "location": "Remote, Poland"})
        assert result.passed is False
        assert "Location not in allowed countries" in result.reason

    def test_passes_unrecognized_country_field(self, config_us_only):
        """Explicit but unrecognized country value should not cause rejection."""
        pf = PreFilter(config_us_only)
        result = pf.filter({"title": "Engineer", "country": "UnknownCountryName"})
        assert result.passed is True
        assert "country" in result.checks_skipped

    def test_rejects_single_segment_country_name(self, config_us_only):
        """Single-segment location that is a country name should be rejected."""
        pf = PreFilter(config_us_only)
        result = pf.filter({"title": "Engineer", "location": "Germany"})
        assert result.passed is False
        assert "Location not in allowed countries" in result.reason

    def test_rejects_city_name_via_city_map(self, config_us_only):
        """Well-known non-US cities should be rejected via city→country lookup."""
        pf = PreFilter(config_us_only)
        for city in ["Bogota", "Mexico City", "Santo Domingo", "Buenos Aires", "Toronto"]:
            result = pf.filter({"title": "Engineer", "location": city})
            assert result.passed is False, f"Expected rejection for city='{city}'"
            assert "Location not in allowed countries" in result.reason

    def test_rejects_country_remote_parens(self, config_us_only):
        """'Country (remote)' format should be rejected for non-US countries."""
        pf = PreFilter(config_us_only)
        for loc in ["Germany (remote)", "Canada (remote)", "Argentina (Remote)"]:
            result = pf.filter({"title": "Engineer", "location": loc})
            assert result.passed is False, f"Expected rejection for location='{loc}'"
            assert "Location not in allowed countries" in result.reason

    def test_passes_us_state_not_confused_with_country(self, config_us_only):
        """'City, CA' should be treated as California, not Canada."""
        pf = PreFilter(config_us_only)
        for loc in ["San Francisco, CA", "Denver, CO", "Portland, OR"]:
            code = pf._extract_country({"location": loc})
            assert code == "us", f"Expected 'us' for '{loc}', got '{code}'"

    def test_bare_state_abbreviation_is_ambiguous(self, config_us_only):
        """Bare 2-letter state codes like 'CA' or 'AR' are ambiguous and should pass."""
        pf = PreFilter(config_us_only)
        for loc in ["CA", "AR", "CO", "DE", "IN", "PA"]:
            result = pf.filter({"title": "Engineer", "location": loc})
            assert result.passed is True, f"Expected pass for ambiguous '{loc}'"
            assert "country" in result.checks_skipped

    def test_state_code_remote_pattern_is_ambiguous(self, config_us_only):
        """'CO (remote)' is ambiguous (Colorado vs Colombia) and should pass."""
        pf = PreFilter(config_us_only)
        for loc in ["CO (remote)", "CA (Remote)", "IN (remote)"]:
            result = pf.filter({"title": "Engineer", "location": loc})
            assert result.passed is True, f"Expected pass for ambiguous '{loc}'"
            assert "country" in result.checks_skipped

    def test_santiago_with_country_qualifier(self, config_us_only):
        """'Santiago, Dominican Republic' should reject via last-segment country lookup."""
        pf = PreFilter(config_us_only)
        result = pf.filter({"title": "Engineer", "location": "Santiago, Dominican Republic"})
        assert result.passed is False
        assert "Location not in allowed countries" in result.reason

    def test_trailing_comma_location(self, config_us_only):
        """Location with trailing comma like 'Portland,' should not extract country."""
        pf = PreFilter(config_us_only)
        result = pf.filter({"title": "Engineer", "location": "Portland,"})
        # Last segment after comma is empty → no country extracted
        assert result.passed is True
        assert "country" in result.checks_skipped

    def test_multiple_allowed_countries(self):
        """Filter should accept jobs from any of the allowed countries."""
        config = {
            "title": {"requiredKeywords": [], "excludedKeywords": []},
            "freshness": {"maxAgeDays": 0},
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": True,
                "userLocation": "Portland, OR",
            },
            "employmentType": {"allowFullTime": True, "allowPartTime": True, "allowContract": True},
            "salary": {"minimum": None},
            "country": {"allowedCountries": ["us", "ca", "gb"]},
        }
        pf = PreFilter(config)

        # US should pass
        result = pf.filter({"title": "Engineer", "country": "United States"})
        assert result.passed is True

        # Canada should pass
        result = pf.filter({"title": "Engineer", "country": "Canada"})
        assert result.passed is True

        # UK should pass
        result = pf.filter({"title": "Engineer", "country": "United Kingdom"})
        assert result.passed is True

        # Germany should be rejected
        result = pf.filter({"title": "Engineer", "country": "Germany"})
        assert result.passed is False
        assert "Location not in allowed countries" in result.reason
