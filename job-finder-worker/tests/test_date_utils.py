"""Tests for date parsing and scoring utilities."""

from datetime import datetime, timedelta, timezone

from job_finder.utils.date_utils import (
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

    def test_parse_pre_2000_date_returns_none(self):
        """Test that epoch-zero and pre-2000 dates are rejected as invalid."""
        assert parse_job_date("1970-01-01T00:00:00Z") is None
        assert parse_job_date("1999-12-31T23:59:59Z") is None

    def test_parse_year_2000_date_accepted(self):
        """Test that dates from 2000 onward are accepted."""
        result = parse_job_date("2000-01-01T00:00:00Z")
        assert result is not None
        assert result.year == 2000
