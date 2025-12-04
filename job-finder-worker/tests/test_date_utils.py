"""Tests for date parsing and scoring utilities."""

from datetime import datetime, timedelta, timezone

from job_finder.utils.date_utils import (
    format_job_age,
    parse_job_date,
)


class TestParseJobDate:
    """Test job date parsing."""

    def test_parse_iso8601_with_timezone(self):
        """Test parsing ISO 8601 date with timezone."""
        date_str = "2024-01-15T10:30:00Z"
        result = parse_job_date(date_str)

        assert result is not None
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15
        assert result.tzinfo is not None

    def test_parse_iso8601_without_timezone(self):
        """Test parsing ISO 8601 date without timezone assumes UTC."""
        date_str = "2024-01-15T10:30:00"
        result = parse_job_date(date_str)

        assert result is not None
        assert result.tzinfo == timezone.utc

    def test_parse_rfc2822_date(self):
        """Test parsing RFC 2822 date format."""
        date_str = "Mon, 15 Jan 2024 10:30:00 GMT"
        result = parse_job_date(date_str)

        assert result is not None
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15

    def test_parse_human_readable_date(self):
        """Test parsing human-readable date."""
        date_str = "January 15, 2024"
        result = parse_job_date(date_str)

        assert result is not None
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15

    def test_parse_none_returns_none(self):
        """Test parsing None returns None."""
        result = parse_job_date(None)
        assert result is None

    def test_parse_empty_string_returns_none(self):
        """Test parsing empty string returns None."""
        result = parse_job_date("")
        assert result is None

    def test_parse_invalid_date_returns_none(self):
        """Test parsing invalid date string returns None."""
        result = parse_job_date("not a valid date")
        assert result is None


class TestFormatJobAge:
    """Test human-readable job age formatting."""

    def test_none_date_returns_unknown(self):
        """Test None date returns 'Unknown'."""
        result = format_job_age(None)
        assert result == "Unknown"

    def test_under_1_hour(self):
        """Test job under 1 hour shows hours."""
        posted_date = datetime.now(timezone.utc) - timedelta(minutes=30)
        result = format_job_age(posted_date)
        assert "0 hours ago" in result

    def test_several_hours_ago(self):
        """Test job several hours ago."""
        posted_date = datetime.now(timezone.utc) - timedelta(hours=5)
        result = format_job_age(posted_date)
        assert "5 hours ago" in result

    def test_1_hour_singular(self):
        """Test 1 hour uses singular form."""
        posted_date = datetime.now(timezone.utc) - timedelta(hours=1)
        result = format_job_age(posted_date)
        assert "1 hour ago" in result

    def test_1_day_singular(self):
        """Test 1 day uses singular form."""
        posted_date = datetime.now(timezone.utc) - timedelta(days=1)
        result = format_job_age(posted_date)
        assert "1 day ago" in result

    def test_several_days_ago(self):
        """Test job several days ago."""
        posted_date = datetime.now(timezone.utc) - timedelta(days=3)
        result = format_job_age(posted_date)
        assert "3 days ago" in result

    def test_1_week_singular(self):
        """Test 1 week uses singular form."""
        posted_date = datetime.now(timezone.utc) - timedelta(days=7)
        result = format_job_age(posted_date)
        assert "1 week ago" in result

    def test_several_weeks_ago(self):
        """Test job several weeks ago."""
        posted_date = datetime.now(timezone.utc) - timedelta(days=14)
        result = format_job_age(posted_date)
        assert "2 weeks ago" in result

    def test_1_month_singular(self):
        """Test 1 month uses singular form."""
        posted_date = datetime.now(timezone.utc) - timedelta(days=30)
        result = format_job_age(posted_date)
        assert "1 month ago" in result

    def test_several_months_ago(self):
        """Test job several months ago."""
        posted_date = datetime.now(timezone.utc) - timedelta(days=90)
        result = format_job_age(posted_date)
        assert "3 months ago" in result

    def test_1_year_singular(self):
        """Test 1 year uses singular form."""
        posted_date = datetime.now(timezone.utc) - timedelta(days=365)
        result = format_job_age(posted_date)
        assert "1 year ago" in result

    def test_several_years_ago(self):
        """Test job several years ago."""
        posted_date = datetime.now(timezone.utc) - timedelta(days=730)
        result = format_job_age(posted_date)
        assert "2 years ago" in result

    def test_future_date_returns_just_posted(self):
        """Test future date returns 'Just posted'."""
        posted_date = datetime.now(timezone.utc) + timedelta(hours=1)
        result = format_job_age(posted_date)
        assert result == "Just posted"

    def test_naive_datetime_handled(self):
        """Test naive datetime is handled correctly."""
        posted_date = datetime.now() - timedelta(hours=5)
        result = format_job_age(posted_date)
        assert "hours ago" in result
