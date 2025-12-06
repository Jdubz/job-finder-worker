"""Tests for timezone utility functions."""

from unittest.mock import MagicMock, patch

from job_finder.utils.timezone_utils import (
    TimezoneResult,
    get_timezone_for_city,
    get_timezone_diff_hours,
    clear_cache,
)


class TestGetTimezoneForCity:
    """Tests for get_timezone_for_city function."""

    def setup_method(self):
        """Clear cache before each test."""
        clear_cache()

    def test_empty_city_returns_error(self):
        """Empty or whitespace city returns error."""
        result = get_timezone_for_city("")
        assert result.timezone_name is None
        assert result.utc_offset_hours is None
        assert result.error == "Empty city"

        result2 = get_timezone_for_city("   ")
        assert result2.error == "Empty city"

    @patch("job_finder.utils.timezone_utils._get_geolocator")
    def test_city_not_found(self, mock_get_geolocator):
        """Unknown city returns appropriate error."""
        mock_geolocator = MagicMock()
        mock_geolocator.geocode.return_value = None
        mock_get_geolocator.return_value = mock_geolocator

        result = get_timezone_for_city("Nonexistent City, Nowhere")
        assert result.timezone_name is None
        assert result.utc_offset_hours is None
        assert result.error == "City not found"

    @patch("job_finder.utils.timezone_utils._get_timezone_finder")
    @patch("job_finder.utils.timezone_utils._get_geolocator")
    def test_successful_lookup(self, mock_get_geolocator, mock_get_tf):
        """Successful lookup returns timezone info."""
        # Mock geolocator
        mock_location = MagicMock()
        mock_location.latitude = 45.5152
        mock_location.longitude = -122.6784
        mock_geolocator = MagicMock()
        mock_geolocator.geocode.return_value = mock_location
        mock_get_geolocator.return_value = mock_geolocator

        # Mock timezone finder
        mock_tf = MagicMock()
        mock_tf.timezone_at.return_value = "America/Los_Angeles"
        mock_get_tf.return_value = mock_tf

        result = get_timezone_for_city("Portland, OR")
        assert result.city == "Portland, OR"
        assert result.timezone_name == "America/Los_Angeles"
        assert result.utc_offset_hours is not None  # Will be -8 or -7 depending on DST
        assert result.error is None

    @patch("job_finder.utils.timezone_utils._get_geolocator")
    def test_geocoder_timeout(self, mock_get_geolocator):
        """Geocoder timeout returns appropriate error."""
        from geopy.exc import GeocoderTimedOut

        mock_geolocator = MagicMock()
        mock_geolocator.geocode.side_effect = GeocoderTimedOut("Timeout")
        mock_get_geolocator.return_value = mock_geolocator

        result = get_timezone_for_city("Some City")
        assert result.timezone_name is None
        assert result.error == "Geocoding timeout"

    @patch("job_finder.utils.timezone_utils._get_geolocator")
    def test_geocoder_service_error(self, mock_get_geolocator):
        """Geocoder service error returns appropriate error."""
        from geopy.exc import GeocoderServiceError

        mock_geolocator = MagicMock()
        mock_geolocator.geocode.side_effect = GeocoderServiceError("Service unavailable")
        mock_get_geolocator.return_value = mock_geolocator

        result = get_timezone_for_city("Some City")
        assert result.timezone_name is None
        assert "Geocoding error" in result.error

    @patch("job_finder.utils.timezone_utils._get_timezone_finder")
    @patch("job_finder.utils.timezone_utils._get_geolocator")
    def test_result_is_cached(self, mock_get_geolocator, mock_get_tf):
        """Results are cached to avoid repeated API calls."""
        mock_location = MagicMock()
        mock_location.latitude = 45.5152
        mock_location.longitude = -122.6784
        mock_geolocator = MagicMock()
        mock_geolocator.geocode.return_value = mock_location
        mock_get_geolocator.return_value = mock_geolocator

        mock_tf = MagicMock()
        mock_tf.timezone_at.return_value = "America/Los_Angeles"
        mock_get_tf.return_value = mock_tf

        # First call
        result1 = get_timezone_for_city("Portland, OR")
        # Second call (should be cached)
        result2 = get_timezone_for_city("Portland, OR")

        assert result1 == result2
        # Geocoder should only be called once due to caching
        assert mock_geolocator.geocode.call_count == 1


class TestGetTimezoneDiffHours:
    """Tests for get_timezone_diff_hours function."""

    def setup_method(self):
        """Clear cache before each test."""
        clear_cache()

    @patch("job_finder.utils.timezone_utils.get_timezone_for_city")
    def test_both_cities_found(self, mock_get_tz):
        """Returns difference when both cities have timezone info."""
        mock_get_tz.side_effect = [
            TimezoneResult(
                city="Portland, OR", timezone_name="America/Los_Angeles", utc_offset_hours=-8.0
            ),
            TimezoneResult(
                city="New York, NY", timezone_name="America/New_York", utc_offset_hours=-5.0
            ),
        ]

        diff = get_timezone_diff_hours("Portland, OR", "New York, NY")
        assert diff == 3.0

    @patch("job_finder.utils.timezone_utils.get_timezone_for_city")
    def test_large_timezone_diff(self, mock_get_tz):
        """Correctly calculates large timezone differences."""
        mock_get_tz.side_effect = [
            TimezoneResult(
                city="Portland, OR", timezone_name="America/Los_Angeles", utc_offset_hours=-8.0
            ),
            TimezoneResult(
                city="Hyderabad, India", timezone_name="Asia/Kolkata", utc_offset_hours=5.5
            ),
        ]

        diff = get_timezone_diff_hours("Portland, OR", "Hyderabad, India")
        assert diff == 13.5

    @patch("job_finder.utils.timezone_utils.get_timezone_for_city")
    def test_first_city_not_found(self, mock_get_tz):
        """Returns None when first city lookup fails."""
        mock_get_tz.side_effect = [
            TimezoneResult(
                city="Unknown", timezone_name=None, utc_offset_hours=None, error="City not found"
            ),
            TimezoneResult(
                city="New York, NY", timezone_name="America/New_York", utc_offset_hours=-5.0
            ),
        ]

        diff = get_timezone_diff_hours("Unknown", "New York, NY")
        assert diff is None

    @patch("job_finder.utils.timezone_utils.get_timezone_for_city")
    def test_second_city_not_found(self, mock_get_tz):
        """Returns None when second city lookup fails."""
        mock_get_tz.side_effect = [
            TimezoneResult(
                city="Portland, OR", timezone_name="America/Los_Angeles", utc_offset_hours=-8.0
            ),
            TimezoneResult(
                city="Unknown", timezone_name=None, utc_offset_hours=None, error="City not found"
            ),
        ]

        diff = get_timezone_diff_hours("Portland, OR", "Unknown")
        assert diff is None

    @patch("job_finder.utils.timezone_utils.get_timezone_for_city")
    def test_same_timezone(self, mock_get_tz):
        """Returns 0 for cities in same timezone."""
        mock_get_tz.side_effect = [
            TimezoneResult(
                city="Portland, OR", timezone_name="America/Los_Angeles", utc_offset_hours=-8.0
            ),
            TimezoneResult(
                city="Seattle, WA", timezone_name="America/Los_Angeles", utc_offset_hours=-8.0
            ),
        ]

        diff = get_timezone_diff_hours("Portland, OR", "Seattle, WA")
        assert diff == 0.0


class TestClearCache:
    """Tests for cache clearing."""

    @patch("job_finder.utils.timezone_utils._get_timezone_finder")
    @patch("job_finder.utils.timezone_utils._get_geolocator")
    def test_clear_cache_works(self, mock_get_geolocator, mock_get_tf):
        """clear_cache() resets the LRU cache."""
        mock_location = MagicMock()
        mock_location.latitude = 45.5152
        mock_location.longitude = -122.6784
        mock_geolocator = MagicMock()
        mock_geolocator.geocode.return_value = mock_location
        mock_get_geolocator.return_value = mock_geolocator

        mock_tf = MagicMock()
        mock_tf.timezone_at.return_value = "America/Los_Angeles"
        mock_get_tf.return_value = mock_tf

        # First call
        get_timezone_for_city("Portland, OR")
        assert mock_geolocator.geocode.call_count == 1

        # Clear cache
        clear_cache()

        # Call again - should hit geocoder again
        get_timezone_for_city("Portland, OR")
        assert mock_geolocator.geocode.call_count == 2
