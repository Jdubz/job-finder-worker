"""Timezone utilities for converting city names to UTC offsets.

Uses geopy for geocoding (city -> lat/lng) and timezonefinder for timezone lookup.
Results are cached to minimize API calls to the geocoding service.

IMPORTANT NOTES:

Rate Limiting:
    Uses OpenStreetMap's Nominatim service which has a usage policy of max 1 request/second.
    The LRU cache (maxsize=500) helps reduce requests, but under high load with many unique
    cities, rate limits may be hit. Consider adding explicit rate limiting if processing
    large batches of jobs with diverse locations.

DST Cache Behavior:
    The LRU cache does not have a TTL, so cached timezone offsets may become stale across
    DST transitions (e.g., a city cached in summer with PDT offset -7 will still return -7
    in winter when PST offset -8 is active). The impact is minimal (max 1 hour difference)
    and only affects cached entries during transition periods. Call clear_cache() if exact
    offsets are required after DST changes.

Ambiguous City Names:
    Single city names without state/country (e.g., "Portland") may geocode to unexpected
    locations. Portland exists in Oregon, Maine, and other places worldwide. For accurate
    results, provide disambiguating information (e.g., "Portland, OR" or "Portland, Oregon").
"""

import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError
from timezonefinder import TimezoneFinder

logger = logging.getLogger(__name__)

# Singleton instances (created lazily with thread-safe initialization)
_geolocator: Optional[Nominatim] = None
_timezone_finder: Optional[TimezoneFinder] = None
_geolocator_lock = threading.Lock()
_timezone_finder_lock = threading.Lock()


def _get_geolocator() -> Nominatim:
    """Get or create the geocoder instance in a thread-safe way."""
    global _geolocator
    if _geolocator is None:
        with _geolocator_lock:
            if _geolocator is None:  # Double-checked locking
                _geolocator = Nominatim(user_agent="job-finder-worker", timeout=5)
    return _geolocator


def _get_timezone_finder() -> TimezoneFinder:
    """Get or create the timezone finder instance in a thread-safe way."""
    global _timezone_finder
    if _timezone_finder is None:
        with _timezone_finder_lock:
            if _timezone_finder is None:  # Double-checked locking
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
        try:
            tz = ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            logger.warning(f"Timezone '{tz_name}' not found in system database for city: {city}")
            return TimezoneResult(
                city=city,
                timezone_name=tz_name,
                utc_offset_hours=None,
                error=f"Timezone {tz_name} not found in system database",
            )

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
