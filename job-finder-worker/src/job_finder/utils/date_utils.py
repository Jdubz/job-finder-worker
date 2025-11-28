"""Date parsing and scoring utilities for job postings."""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import dateutil.parser

logger = logging.getLogger(__name__)


def parse_job_date(date_string: Optional[str]) -> Optional[datetime]:
    """
    Parse a job posting date from various formats.

    Handles:
    - ISO 8601 dates (e.g., "2024-01-15T10:30:00Z")
    - RFC 2822 dates (e.g., "Mon, 15 Jan 2024 10:30:00 GMT")
    - Relative dates (e.g., "2 days ago")
    - Human-readable dates (e.g., "January 15, 2024")

    Args:
        date_string: Date string in various formats

    Returns:
        Parsed datetime object (timezone-aware) or None if parsing fails
    """
    if not date_string:
        return None

    # Handle common relative strings up-front
    lowered = date_string.strip().lower()
    now = datetime.now(timezone.utc)

    if lowered in {"today", "just posted", "posted today"}:
        return now
    if lowered == "yesterday":
        return now - timedelta(days=1)

    # Patterns like "2 days ago", "3 hrs ago", "5d ago", "30+ days ago"
    rel_match = re.search(
        r"(?P<num>\d+)\+?\s*(?P<unit>day|days|d|week|weeks|w|hour|hours|hr|hrs|minute|minutes|min|mins|month|months|mo)\s*(ago)?",
        lowered,
    )
    if rel_match:
        num = int(rel_match.group("num"))
        unit = rel_match.group("unit")

        if unit.startswith(("day", "d")):
            delta = timedelta(days=num)
        elif unit.startswith(("week", "w")):
            delta = timedelta(weeks=num)
        elif unit.startswith("hour") or unit.startswith("hr"):
            delta = timedelta(hours=num)
        elif unit.startswith("min"):
            delta = timedelta(minutes=num)
        elif unit.startswith("month") or unit == "mo":
            delta = timedelta(days=num * 30)  # rough approximation
        else:
            delta = timedelta(0)

        return now - delta

    try:
        # Use dateutil.parser for flexible parsing
        parsed_date = dateutil.parser.parse(date_string)

        # Make timezone-aware if needed (assume UTC)
        if parsed_date.tzinfo is None:
            parsed_date = parsed_date.replace(tzinfo=timezone.utc)

        return parsed_date

    except (ValueError, TypeError) as e:
        logger.debug(f"Failed to parse date '{date_string}': {str(e)}")
        return None


def calculate_freshness_adjustment(posted_date: Optional[datetime]) -> int:
    """
    Calculate a score adjustment based on how fresh the job posting is.

    Fresher jobs get bonus points, older jobs get penalties.

    Score adjustment schedule:
    - 0-24 hours:    +15 points (very fresh - boost visibility)
    - 1-2 days:      +5 points (fresh)
    - 2-3 days:      0 points (neutral)
    - 3-7 days:      -35 points (significant penalty - user wants ~50% after 3 days)
    - 7-14 days:     -40 points (likely closing soon)
    - 14-30 days:    -45 points (probably stale)
    - 30+ days:      -50 points (maximum penalty - likely closed)
    - Unknown date:  -10 points (penalty for lack of date info)

    Args:
        posted_date: When the job was posted (timezone-aware datetime)

    Returns:
        Score adjustment between -50 and +15
    """
    if not posted_date:
        # Penalty for jobs with no date information
        logger.debug("No posted date - applying -10 point penalty")
        return -10

    # Get current time in UTC
    now = datetime.now(timezone.utc)

    # Ensure posted_date is timezone-aware
    if posted_date.tzinfo is None:
        posted_date = posted_date.replace(tzinfo=timezone.utc)

    # Calculate age in days
    age = now - posted_date
    age_days = age.total_seconds() / 86400  # Convert to days

    # Handle future dates (bad data or timezone issues)
    if age_days < 0:
        logger.warning(f"Job posted date is in the future: {posted_date}")
        return 0

    # Apply softened decay schedule
    if age_days <= 2:
        adjustment = 10
        freshness_label = "Fresh (0-2 days)"
    elif age_days <= 7:
        adjustment = 0
        freshness_label = "Recent (2-7 days)"
    elif age_days <= 14:
        adjustment = -10
        freshness_label = "Two Weeks Old (7-14 days)"
    elif age_days <= 30:
        adjustment = -20
        freshness_label = "Month Old (14-30 days)"
    else:
        adjustment = -30
        freshness_label = f"Stale ({int(age_days)} days old)"

    logger.debug(
        f"Job age: {age_days:.1f} days | Freshness: {freshness_label} | "
        f"Adjustment: {adjustment:+d} points"
    )

    return adjustment


def format_job_age(posted_date: Optional[datetime]) -> str:
    """
    Format job age in a human-readable way.

    Args:
        posted_date: When the job was posted

    Returns:
        Human-readable age string (e.g., "2 days ago", "3 weeks ago")
    """
    if not posted_date:
        return "Unknown"

    now = datetime.now(timezone.utc)

    if posted_date.tzinfo is None:
        posted_date = posted_date.replace(tzinfo=timezone.utc)

    age = now - posted_date
    age_days = age.total_seconds() / 86400

    if age_days < 0:
        return "Just posted"
    elif age_days < 1:
        hours = int(age.total_seconds() / 3600)
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    elif age_days < 7:
        days = int(age_days)
        return f"{days} day{'s' if days != 1 else ''} ago"
    elif age_days < 30:
        weeks = int(age_days / 7)
        return f"{weeks} week{'s' if weeks != 1 else ''} ago"
    elif age_days < 365:
        months = int(age_days / 30)
        return f"{months} month{'s' if months != 1 else ''} ago"
    else:
        years = int(age_days / 365)
        return f"{years} year{'s' if years != 1 else ''} ago"
