"""Tests for _safe_days_old normalization in extraction."""

from job_finder.ai.extraction import JobExtractionResult, _safe_days_old


class TestSafeDaysOld:
    """Test _safe_days_old clamping logic."""

    def test_valid_days_old(self):
        assert _safe_days_old(0) == 0
        assert _safe_days_old(7) == 7
        assert _safe_days_old(365) == 365

    def test_negative_days_old_rejected(self):
        assert _safe_days_old(-1) is None
        assert _safe_days_old(-100) is None

    def test_huge_days_old_rejected(self):
        assert _safe_days_old(9999) is None
        assert _safe_days_old(366) is None

    def test_none_returns_none(self):
        assert _safe_days_old(None) is None

    def test_non_numeric_returns_none(self):
        assert _safe_days_old("not a number") is None


class TestFromDictDaysOld:
    """Test that from_dict correctly normalizes daysOld via _safe_days_old."""

    def test_negative_days_old_normalized_to_none(self):
        result = JobExtractionResult.from_dict({"daysOld": -1})
        assert result.days_old is None

    def test_huge_days_old_normalized_to_none(self):
        result = JobExtractionResult.from_dict({"daysOld": 9999})
        assert result.days_old is None

    def test_valid_days_old_preserved(self):
        result = JobExtractionResult.from_dict({"daysOld": 3})
        assert result.days_old == 3
