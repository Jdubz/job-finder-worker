"""Tests for error categorization and retry logic in queue processing."""

from job_finder.exceptions import (
    ErrorCategory,
    ExtractionError,
    NoAgentsAvailableError,
    QuotaExhaustedError,
    ScrapeAuthError,
    ScrapeBotProtectionError,
    ScrapeProtectedApiError,
    ScrapeTransientError,
    TransientError,
    categorize_error,
)


class TestErrorCategory:
    """Test ErrorCategory enum values."""

    def test_category_values(self):
        """Verify all expected error categories exist."""
        assert ErrorCategory.TRANSIENT == "transient"
        assert ErrorCategory.PERMANENT == "permanent"
        assert ErrorCategory.RESOURCE == "resource"
        assert ErrorCategory.UNKNOWN == "unknown"


class TestCategorizeError:
    """Test categorize_error() helper function."""

    # TRANSIENT errors
    def test_transient_error_returns_transient(self):
        """TransientError should be categorized as TRANSIENT."""
        error = TransientError("Network timeout")
        assert categorize_error(error) == ErrorCategory.TRANSIENT

    def test_scrape_transient_error_returns_transient(self):
        """ScrapeTransientError should be categorized as TRANSIENT."""
        error = ScrapeTransientError(
            source_url="https://example.com",
            reason="Service unavailable",
            status_code=503,
        )
        assert categorize_error(error) == ErrorCategory.TRANSIENT

    def test_timeout_error_returns_transient(self):
        """TimeoutError should be categorized as TRANSIENT."""
        error = TimeoutError("Request timed out")
        assert categorize_error(error) == ErrorCategory.TRANSIENT

    def test_connection_error_returns_transient(self):
        """ConnectionError should be categorized as TRANSIENT."""
        error = ConnectionError("Connection refused")
        assert categorize_error(error) == ErrorCategory.TRANSIENT

    def test_connection_reset_error_returns_transient(self):
        """ConnectionResetError should be categorized as TRANSIENT."""
        error = ConnectionResetError("Connection reset by peer")
        assert categorize_error(error) == ErrorCategory.TRANSIENT

    # RESOURCE errors
    def test_quota_exhausted_returns_resource(self):
        """QuotaExhaustedError should be categorized as RESOURCE."""
        error = QuotaExhaustedError("API quota exceeded")
        assert categorize_error(error) == ErrorCategory.RESOURCE

    def test_no_agents_available_returns_resource(self):
        """NoAgentsAvailableError should be categorized as RESOURCE."""
        error = NoAgentsAvailableError("No AI agents available")
        assert categorize_error(error) == ErrorCategory.RESOURCE

    # PERMANENT errors
    def test_extraction_error_returns_permanent(self):
        """ExtractionError should be categorized as PERMANENT."""
        error = ExtractionError("Failed to extract job data")
        assert categorize_error(error) == ErrorCategory.PERMANENT

    def test_scrape_bot_protection_returns_permanent(self):
        """ScrapeBotProtectionError should be categorized as PERMANENT."""
        error = ScrapeBotProtectionError(
            source_url="https://example.com",
            reason="Bot protection detected",
            status_code=403,
        )
        assert categorize_error(error) == ErrorCategory.PERMANENT

    def test_scrape_auth_error_returns_permanent(self):
        """ScrapeAuthError should be categorized as PERMANENT."""
        error = ScrapeAuthError(
            source_url="https://example.com",
            reason="Authentication required",
            status_code=401,
        )
        assert categorize_error(error) == ErrorCategory.PERMANENT

    def test_scrape_protected_api_returns_permanent(self):
        """ScrapeProtectedApiError should be categorized as PERMANENT."""
        error = ScrapeProtectedApiError(
            source_url="https://example.com/api",
            reason="API endpoint protected",
            status_code=451,
        )
        assert categorize_error(error) == ErrorCategory.PERMANENT

    # UNKNOWN errors
    def test_generic_exception_returns_unknown(self):
        """Generic Exception should be categorized as UNKNOWN."""
        error = Exception("Something went wrong")
        assert categorize_error(error) == ErrorCategory.UNKNOWN

    def test_value_error_returns_unknown(self):
        """ValueError should be categorized as UNKNOWN."""
        error = ValueError("Invalid value")
        assert categorize_error(error) == ErrorCategory.UNKNOWN

    def test_runtime_error_returns_unknown(self):
        """RuntimeError should be categorized as UNKNOWN."""
        error = RuntimeError("Unexpected error")
        assert categorize_error(error) == ErrorCategory.UNKNOWN


class TestExceptionErrorCategoryProperty:
    """Test that exceptions have correct error_category property."""

    def test_transient_error_has_property(self):
        """TransientError should have error_category property set."""
        error = TransientError("Test")
        assert hasattr(error, "error_category")
        assert error.error_category == ErrorCategory.TRANSIENT

    def test_quota_exhausted_has_property(self):
        """QuotaExhaustedError should have error_category property set."""
        error = QuotaExhaustedError("Test")
        assert hasattr(error, "error_category")
        assert error.error_category == ErrorCategory.RESOURCE

    def test_no_agents_available_has_property(self):
        """NoAgentsAvailableError should have error_category property set."""
        error = NoAgentsAvailableError("Test")
        assert hasattr(error, "error_category")
        assert error.error_category == ErrorCategory.RESOURCE

    def test_extraction_error_has_property(self):
        """ExtractionError should have error_category property set."""
        error = ExtractionError("Test")
        assert hasattr(error, "error_category")
        assert error.error_category == ErrorCategory.PERMANENT
