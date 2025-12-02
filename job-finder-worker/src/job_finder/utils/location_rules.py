"""Unified location and timezone rule evaluation for remote vs onsite/hybrid jobs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class LocationContext:
    user_city: Optional[str]
    user_timezone: Optional[float]
    relocation_allowed: bool
    relocation_penalty: int
    location_penalty: int
    ambiguous_location_penalty: int
    max_timezone_diff_hours: int
    per_hour_penalty: int
    hard_timezone_penalty: int


@dataclass
class LocationEvaluation:
    hard_reject: bool
    strikes: int
    reason: Optional[str] = None


def normalize_city(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    normalized = name.strip().lower()
    # Accept values like "Portland, OR" by matching just the city token
    return normalized.split(",")[0].strip()


def evaluate_location_rules(
    job_city: Optional[str],
    job_timezone: Optional[float],
    remote: bool,
    hybrid: bool,
    ctx: LocationContext,
) -> LocationEvaluation:
    """
    Apply location/relocation/timezone rules.

    - Hybrid/Onsite outside user's city: hard reject unless relocation allowed -> apply relocation penalty once.
    - Remote roles: apply per-hour timezone penalty; cap with hard penalty beyond max diff.
    - Hybrid/Onsite within city: no timezone penalty (onsite assumption). Hybrid in same city skips relocation.
    """

    user_city = normalize_city(ctx.user_city)
    job_city_norm = normalize_city(job_city)

    # Onsite/Hybrid rules first
    if not remote:
        if user_city and job_city_norm and job_city_norm != user_city:
            if not ctx.relocation_allowed:
                return LocationEvaluation(True, 0, "onsite/hybrid outside user city")
            return LocationEvaluation(
                False, ctx.relocation_penalty, "relocation required"
            )
        # Same city or unknown city: no strikes
        return LocationEvaluation(False, 0, None)

    # Remote role timezone penalties
    strikes = 0
    if job_timezone is None or ctx.user_timezone is None:
        return LocationEvaluation(False, 0, None)

    diff = abs(job_timezone - ctx.user_timezone)
    if diff > ctx.max_timezone_diff_hours:
        strikes += ctx.hard_timezone_penalty
    else:
        strikes += int(diff * ctx.per_hour_penalty)

    return LocationEvaluation(False, strikes, None)
