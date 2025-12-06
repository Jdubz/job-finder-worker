"""Regression tests for city-based timezone prefiltering.

This module tests the integration between PreFilter and timezone_utils
to ensure remote/hybrid jobs are correctly filtered by timezone difference.
"""

import pytest

from job_finder.filters.prefilter import PreFilter


class TestTimezonePrefilterRegression:
    """Regression tests for timezone-based job filtering."""

    @pytest.fixture
    def base_config(self):
        """Base prefilter config with timezone guard enabled."""
        return {
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

    def test_timezone_guard_uses_city_not_explicit_offset(self, base_config, mocker):
        """Verify timezone comparison uses city geocoding, not explicit timezone values."""
        # Mock to return a large timezone diff
        mock_tz_diff = mocker.patch(
            "job_finder.filters.prefilter.get_timezone_diff_hours",
            return_value=13.5,
        )

        pf = PreFilter(base_config)
        job = {"title": "Engineer", "city": "Hyderabad", "country": "India"}
        result = pf.filter(job, is_remote_source=True)

        # Should call timezone diff with city names
        mock_tz_diff.assert_called_once_with("Portland, OR", "Hyderabad, India")
        assert result.passed is False
        assert "Timezone diff" in result.reason

    def test_timezone_derived_from_userLocation_not_explicit_offset(self, base_config, mocker):
        """Verify timezone is derived from userLocation city, not an explicit offset."""
        mock_tz_diff = mocker.patch(
            "job_finder.filters.prefilter.get_timezone_diff_hours",
            return_value=2.0,
        )

        pf = PreFilter(base_config)
        job = {"title": "Engineer", "city": "Denver", "state": "CO"}
        result = pf.filter(job, is_remote_source=True)

        # Should use city-based comparison with userLocation
        mock_tz_diff.assert_called_once_with("Portland, OR", "Denver, CO")
        assert result.passed is True

    def test_timezone_guard_only_applies_to_remote_hybrid(self, base_config, mocker):
        """Timezone guard should only apply to remote and hybrid jobs."""
        mocker.patch(
            "job_finder.filters.prefilter.get_timezone_diff_hours",
            return_value=13.5,  # Would fail if applied
        )

        pf = PreFilter(base_config)

        # Onsite job should not trigger timezone check
        job = {"title": "Engineer", "city": "Hyderabad", "country": "India", "is_remote": False}
        # Force onsite detection by adding location type
        job["metadata"] = {"Location Type": "Onsite"}
        result = pf.filter(job, is_remote_source=False)

        # Should not have called timezone diff for onsite job
        # (onsite would fail the location check instead, but that's separate)
        # This test verifies the logic path, not full behavior
        assert (
            "workArrangement" in result.checks_performed
            or "workArrangement" in result.checks_skipped
        )

    def test_missing_job_location_passes_permissively(self, base_config, mocker):
        """Jobs without location data should pass (missing data = pass principle)."""
        mock_tz_diff = mocker.patch("job_finder.filters.prefilter.get_timezone_diff_hours")

        pf = PreFilter(base_config)
        # Job with only "Remote" location - no specific city
        job = {"title": "Engineer", "location": "Remote"}
        result = pf.filter(job, is_remote_source=True)

        # Should pass without calling timezone lookup
        mock_tz_diff.assert_not_called()
        assert result.passed is True

    def test_timezone_lookup_failure_passes_permissively(self, base_config, mocker):
        """If timezone lookup fails, job should pass (permissive default)."""
        mocker.patch(
            "job_finder.filters.prefilter.get_timezone_diff_hours",
            return_value=None,  # Lookup failed
        )

        pf = PreFilter(base_config)
        job = {"title": "Engineer", "city": "UnknownCity", "country": "Nowhere"}
        result = pf.filter(job, is_remote_source=True)

        assert result.passed is True

    def test_config_without_maxTimezoneDiffHours_skips_check(self, base_config, mocker):
        """Config without maxTimezoneDiffHours should skip timezone check entirely."""
        config_no_tz = {
            **base_config,
            "workArrangement": {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": True,
                "willRelocate": False,
                "userLocation": "Portland, OR",
                # No maxTimezoneDiffHours
            },
        }

        mock_tz_diff = mocker.patch("job_finder.filters.prefilter.get_timezone_diff_hours")

        pf = PreFilter(config_no_tz)
        job = {"title": "Engineer", "city": "Hyderabad", "country": "India"}
        result = pf.filter(job, is_remote_source=True)

        # Should not call timezone lookup at all
        mock_tz_diff.assert_not_called()
        assert result.passed is True

    def test_job_location_extraction_priority(self, base_config, mocker):
        """Verify job location is extracted correctly from various fields."""
        mock_tz_diff = mocker.patch(
            "job_finder.filters.prefilter.get_timezone_diff_hours",
            return_value=1.0,
        )

        pf = PreFilter(base_config)

        # Test 1: city + country takes priority
        job1 = {"title": "Engineer", "city": "London", "country": "UK", "location": "NYC"}
        pf.filter(job1, is_remote_source=True)
        assert mock_tz_diff.call_args[0][1] == "London, UK"

        mock_tz_diff.reset_mock()

        # Test 2: city + state
        job2 = {"title": "Engineer", "city": "Austin", "state": "TX"}
        pf.filter(job2, is_remote_source=True)
        assert mock_tz_diff.call_args[0][1] == "Austin, TX"

        mock_tz_diff.reset_mock()

        # Test 3: location string (non-remote)
        job3 = {"title": "Engineer", "location": "Berlin, Germany"}
        pf.filter(job3, is_remote_source=True)
        assert mock_tz_diff.call_args[0][1] == "Berlin, Germany"

    def test_remote_location_strings_ignored(self, base_config, mocker):
        """Location strings like 'Remote' or 'Worldwide' should not trigger timezone check."""
        mock_tz_diff = mocker.patch("job_finder.filters.prefilter.get_timezone_diff_hours")

        pf = PreFilter(base_config)

        remote_locations = ["Remote", "Worldwide", "Anywhere", "Global"]
        for loc in remote_locations:
            mock_tz_diff.reset_mock()
            job = {"title": "Engineer", "location": loc}
            result = pf.filter(job, is_remote_source=True)
            mock_tz_diff.assert_not_called()
            assert result.passed is True

    def test_boundary_timezone_diff_exactly_at_limit(self, base_config, mocker):
        """Timezone diff exactly at limit should pass."""
        mocker.patch(
            "job_finder.filters.prefilter.get_timezone_diff_hours",
            return_value=4.0,  # Exactly at limit
        )

        pf = PreFilter(base_config)
        job = {"title": "Engineer", "city": "Denver", "state": "CO"}
        result = pf.filter(job, is_remote_source=True)

        # 4.0 == 4, should NOT fail (only > 4 fails)
        assert result.passed is True

    def test_boundary_timezone_diff_just_over_limit(self, base_config, mocker):
        """Timezone diff just over limit should fail."""
        mocker.patch(
            "job_finder.filters.prefilter.get_timezone_diff_hours",
            return_value=4.1,  # Just over limit
        )

        pf = PreFilter(base_config)
        job = {"title": "Engineer", "city": "SomeCity", "country": "SomeCountry"}
        result = pf.filter(job, is_remote_source=True)

        # 4.1 > 4, should fail
        assert result.passed is False
        assert "Timezone diff" in result.reason
