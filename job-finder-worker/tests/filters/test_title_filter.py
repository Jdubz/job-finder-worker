"""Tests for the simple title-based keyword filter."""

import pytest

from job_finder.filters.title_filter import TitleFilter


@pytest.fixture
def default_config():
    """Return a default title filter configuration."""
    return {
        "requiredKeywords": ["engineer", "developer", "software"],
        "excludedKeywords": ["intern", "sales", "marketing"],
    }


class TestTitleFilter:
    """Tests for TitleFilter class."""

    def test_passes_with_required_keyword(self, default_config):
        """Title with required keyword passes."""
        filter = TitleFilter(default_config)
        result = filter.filter("Senior Software Engineer")
        assert result.passed is True
        assert result.reason is None

    def test_fails_without_required_keyword(self, default_config):
        """Title without any required keyword fails."""
        filter = TitleFilter(default_config)
        result = filter.filter("Product Manager")
        assert result.passed is False
        assert "missing required keywords" in result.reason.lower()

    def test_fails_with_excluded_keyword(self, default_config):
        """Title with excluded keyword fails."""
        filter = TitleFilter(default_config)
        result = filter.filter("Software Engineer Intern")
        assert result.passed is False
        assert "excluded keyword" in result.reason.lower()
        assert "intern" in result.reason.lower()

    def test_excluded_takes_precedence(self, default_config):
        """Excluded keywords reject even if required is present."""
        filter = TitleFilter(default_config)
        result = filter.filter("Sales Engineer")
        assert result.passed is False
        assert "sales" in result.reason.lower()

    def test_case_insensitive_matching(self, default_config):
        """Matching is case-insensitive."""
        filter = TitleFilter(default_config)

        # Required keyword works case-insensitively
        result = filter.filter("SOFTWARE ENGINEER")
        assert result.passed is True

        # Excluded keyword works case-insensitively
        result = filter.filter("SALES Representative")
        assert result.passed is False

    def test_empty_title_fails(self, default_config):
        """Empty title fails."""
        filter = TitleFilter(default_config)
        result = filter.filter("")
        assert result.passed is False
        assert "empty" in result.reason.lower()

    def test_no_required_keywords(self):
        """Without required keywords, any title passes (if not excluded)."""
        config = {
            "requiredKeywords": [],
            "excludedKeywords": ["intern"],
        }
        filter = TitleFilter(config)

        result = filter.filter("Product Manager")
        assert result.passed is True

        result = filter.filter("Software Intern")
        assert result.passed is False

    def test_no_excluded_keywords(self):
        """Without excluded keywords, only required check applies."""
        config = {
            "requiredKeywords": ["engineer"],
            "excludedKeywords": [],
        }
        filter = TitleFilter(config)

        result = filter.filter("Senior Engineer")
        assert result.passed is True

        result = filter.filter("Product Manager")
        assert result.passed is False

    def test_filter_batch(self, default_config):
        """Batch filtering works correctly."""
        filter = TitleFilter(default_config)
        titles = [
            "Software Engineer",
            "Product Manager",
            "Sales Engineer",
        ]
        results = filter.filter_batch(titles)

        assert len(results) == 3
        assert results[0].passed is True  # Has required
        assert results[1].passed is False  # Missing required
        assert results[2].passed is False  # Has excluded

    def test_to_dict(self, default_config):
        """TitleFilterResult.to_dict() returns serializable dict."""
        filter = TitleFilter(default_config)
        result = filter.filter("Software Engineer")

        d = result.to_dict()
        assert isinstance(d, dict)
        assert d["passed"] is True
        assert d["reason"] is None
