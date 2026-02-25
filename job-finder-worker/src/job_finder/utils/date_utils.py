"""Date parsing and scoring utilities for job postings."""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import dateutil.parser

logger = logging.getLogger(__name__)

# Earliest plausible job posting date (2000-01-01 UTC).
# Online job boards didn't meaningfully exist before this.
# Dates before this threshold are treated as missing/invalid.
_MIN_VALID_DATE = datetime(2000, 1, 1, tzinfo=timezone.utc)


def parse_job_date(date_string: Optional[str]) -> Optional[datetime]:
    """
    Parse a job posting date from various formats.

    Handles:
    - ISO 8601 dates (e.g., "2024-01-15T10:30:00Z")
    - RFC 2822 dates (e.g., "Mon, 15 Jan 2024 10:30:00 GMT")
    - Relative dates (e.g., "2 days ago")
    - Human-readable dates (e.g., "January 15, 2024")

    Rejects dates before 2000-01-01 as invalid (epoch-zero placeholders, etc.).

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

        # Reject dates before 2000-01-01 — these are epoch-zero placeholders
        # or other invalid values (e.g. "1970-01-01T00:00:00" from APIs that
        # return 0 for missing dates).
        if parsed_date < _MIN_VALID_DATE:
            logger.debug("Rejecting pre-2000 date as invalid: '%s' -> %s", date_string, parsed_date)
            return None

        return parsed_date

    except (ValueError, TypeError) as e:
        logger.debug(f"Failed to parse date '{date_string}': {str(e)}")
        return None


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
