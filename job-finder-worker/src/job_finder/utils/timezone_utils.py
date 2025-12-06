"""Timezone utilities for converting city names to UTC offsets.

Uses geopy for geocoding (city -> lat/lng) and timezonefinder for timezone lookup.
Results are cached to minimize API calls to the geocoding service.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from typing import Optional
from zoneinfo import ZoneInfo

from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from timezonefinder import TimezoneFinder

logger = logging.getLogger(__name__)

# Singleton instances (created lazily)
_geolocator: Optional[Nominatim] = None
_timezone_finder: Optional[TimezoneFinder] = None


def _get_geolocator() -> Nominatim:
    """Get or create the geocoder instance."""
    global _geolocator
    if _geolocator is None:
        _geolocator = Nominatim(user_agent="job-finder-worker", timeout=5)
    return _geolocator


def _get_timezone_finder() -> TimezoneFinder:
    """Get or create the timezone finder instance."""
    global _timezone_finder
    if _timezone_finder is None:
        _timezone_finder = TimezoneFinder()
    return _timezone_finder


@dataclass
class TimezoneResult:
    """Result of timezone lookup for a city."""

    city: str
    timezone_name: Optional[str]  # e.g., "America/Los_Angeles"
    utc_offset_hours: Optional[float]  # e.g., -8.0 for PST
    error: Optional[str] = None


@lru_cache(maxsize=500)
def get_timezone_for_city(city: str) -> TimezoneResult:
    """
    Get timezone information for a city name.

    Uses OpenStreetMap's Nominatim for geocoding (free, no API key required).
    Results are cached to minimize API calls.

    Args:
        city: City name, optionally with state/country (e.g., "Portland, OR" or "Hyderabad, India")

    Returns:
        TimezoneResult with timezone name and UTC offset, or error if lookup failed
    """
    if not city or not city.strip():
        return TimezoneResult(
            city=city, timezone_name=None, utc_offset_hours=None, error="Empty city"
        )

    city = city.strip()

    try:
        geolocator = _get_geolocator()
        location = geolocator.geocode(city)

        if location is None:
            logger.debug(f"Could not geocode city: {city}")
            return TimezoneResult(
                city=city, timezone_name=None, utc_offset_hours=None, error="City not found"
            )

        tf = _get_timezone_finder()
        tz_name = tf.timezone_at(lng=location.longitude, lat=location.latitude)

        if tz_name is None:
            logger.debug(
                f"Could not find timezone for coordinates: {location.latitude}, {location.longitude}"
            )
            return TimezoneResult(
                city=city,
                timezone_name=None,
                utc_offset_hours=None,
                error="Timezone not found for coordinates",
            )

        # Get current UTC offset for this timezone
        tz = ZoneInfo(tz_name)
        now = datetime.now(timezone.utc)
        offset = now.astimezone(tz).utcoffset()

        if offset is None:
            return TimezoneResult(
                city=city,
                timezone_name=tz_name,
                utc_offset_hours=None,
                error="Could not determine UTC offset",
            )

        offset_hours = offset.total_seconds() / 3600

        logger.debug(f"Timezone for '{city}': {tz_name} (UTC{offset_hours:+.1f})")
        return TimezoneResult(city=city, timezone_name=tz_name, utc_offset_hours=offset_hours)

    except GeocoderTimedOut:
        logger.warning(f"Geocoding timeout for city: {city}")
        return TimezoneResult(
            city=city, timezone_name=None, utc_offset_hours=None, error="Geocoding timeout"
        )
    except GeocoderServiceError as e:
        logger.warning(f"Geocoding service error for city '{city}': {e}")
        return TimezoneResult(
            city=city, timezone_name=None, utc_offset_hours=None, error=f"Geocoding error: {e}"
        )
    except Exception as e:
        logger.warning(f"Unexpected error getting timezone for city '{city}': {e}")
        return TimezoneResult(city=city, timezone_name=None, utc_offset_hours=None, error=str(e))


def get_timezone_diff_hours(city1: str, city2: str) -> Optional[float]:
    """
    Calculate the timezone difference in hours between two cities.

    Args:
        city1: First city name (e.g., "Portland, OR")
        city2: Second city name (e.g., "Hyderabad, India")

    Returns:
        Absolute difference in hours, or None if either city's timezone couldn't be determined
    """
    result1 = get_timezone_for_city(city1)
    result2 = get_timezone_for_city(city2)

    if result1.utc_offset_hours is None or result2.utc_offset_hours is None:
        return None

    return abs(result1.utc_offset_hours - result2.utc_offset_hours)


def clear_cache() -> None:
    """Clear the timezone lookup cache. Useful for testing."""
    get_timezone_for_city.cache_clear()
