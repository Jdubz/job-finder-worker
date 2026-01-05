"""Tests for HTTP error classification in generic_scraper.py."""

from job_finder.exceptions import (
    ScrapeBlockedError,
    ScrapeAuthError,
    ScrapeBotProtectionError,
    ScrapeConfigError,
    ScrapeNotFoundError,
    ScrapeProtectedApiError,
    ScrapeTransientError,
)
from job_finder.scrapers.generic_scraper import (
    classify_http_error,
    _detect_bot_protection,
    _detect_auth_wall,
)


class TestBotProtectionDetection:
    """Test _detect_bot_protection() function."""

    def test_detects_cloudflare(self):
        content = '<div class="cf-browser-verification">Checking your browser...</div>'
        assert _detect_bot_protection(content) is True

    def test_detects_ray_id(self):
        content = "Access denied. Ray ID: 1234567890abcdef"
        assert _detect_bot_protection(content) is True

    def test_detects_captcha(self):
        content = '<div class="g-recaptcha">Please complete the CAPTCHA</div>'
        assert _detect_bot_protection(content) is True

    def test_detects_sucuri(self):
        content = "Blocked by Sucuri Website Firewall"
        assert _detect_bot_protection(content) is True

    def test_ignores_normal_content(self):
        content = "<html><body><h1>Welcome to our careers page</h1></body></html>"
        assert _detect_bot_protection(content) is False

    def test_handles_empty_content(self):
        assert _detect_bot_protection("") is False
        assert _detect_bot_protection(None) is False


class TestAuthWallDetection:
    """Test _detect_auth_wall() function."""

    def test_detects_login_form(self):
        content = '<form><input type="password" name="password"></form>'
        assert _detect_auth_wall(content) is True

    def test_detects_sign_in_message(self):
        content = "<div>Please sign in to continue</div>"
        assert _detect_auth_wall(content) is True

    def test_detects_oauth_redirect(self):
        content = "<script>window.location = '/auth?redirect_uri=https://example.com&response_type=code'</script>"
        assert _detect_auth_wall(content) is True

    def test_ignores_normal_content(self):
        content = "<html><body><h1>Job Listings</h1></body></html>"
        assert _detect_auth_wall(content) is False

    def test_handles_empty_content(self):
        assert _detect_auth_wall("") is False
        assert _detect_auth_wall(None) is False


class TestClassifyHttpError:
    """Test classify_http_error() function."""

    def test_400_returns_config_error(self):
        """HTTP 400 should be classified as config error, not bot protection."""
        error = classify_http_error(
            url="https://example.com/api",
            status_code=400,
            reason="Bad Request",
            content="",
        )
        assert isinstance(error, ScrapeConfigError)
        assert error.status_code == 400
        assert error.is_recoverable is True
        assert error.should_auto_recover is True
        assert error.disable_tag is None

    def test_404_returns_not_found_error(self):
        """HTTP 404 should be classified as not found, not bot protection."""
        error = classify_http_error(
            url="https://example.com/jobs",
            status_code=404,
            reason="Not Found",
            content="<html>Page not found</html>",
        )
        assert isinstance(error, ScrapeNotFoundError)
        assert error.status_code == 404
        assert error.is_recoverable is True
        assert error.should_auto_recover is True
        assert error.disable_tag is None

    def test_401_returns_auth_error(self):
        """HTTP 401 should be classified as auth error."""
        error = classify_http_error(
            url="https://example.com/api",
            status_code=401,
            reason="Unauthorized",
            content="",
        )
        assert isinstance(error, ScrapeAuthError)
        assert error.status_code == 401
        assert error.is_recoverable is False
        assert error.disable_tag == "auth_required"

    def test_401_on_api_returns_protected_api_error(self):
        """HTTP 401 on API endpoint should return protected API error."""
        error = classify_http_error(
            url="https://example.com/api",
            status_code=401,
            reason="Unauthorized",
            content="",
            is_api=True,
        )
        assert isinstance(error, ScrapeProtectedApiError)
        assert error.disable_tag == "protected_api"

    def test_403_without_bot_protection_returns_transient(self):
        """HTTP 403 without bot protection markers should be transient."""
        error = classify_http_error(
            url="https://example.com/jobs",
            status_code=403,
            reason="Forbidden",
            content="<html>Access denied</html>",
        )
        assert isinstance(error, ScrapeTransientError)
        assert error.status_code == 403
        # Should not have anti_bot tag
        assert error.disable_tag is None

    def test_403_with_cloudflare_returns_bot_protection(self):
        """HTTP 403 with Cloudflare markers should be bot protection."""
        error = classify_http_error(
            url="https://example.com/jobs",
            status_code=403,
            reason="Forbidden",
            content="<html>Checking your browser before accessing. Ray ID: 123abc</html>",
        )
        assert isinstance(error, ScrapeBotProtectionError)
        assert error.is_recoverable is False
        assert error.disable_tag == "anti_bot"

    def test_403_with_auth_wall_returns_auth_error(self):
        """HTTP 403 with login form should be auth error."""
        error = classify_http_error(
            url="https://example.com/jobs",
            status_code=403,
            reason="Forbidden",
            content='<html><form><input type="password"></form></html>',
        )
        assert isinstance(error, ScrapeAuthError)
        assert error.disable_tag == "auth_required"

    def test_429_returns_transient_error(self):
        """HTTP 429 should be classified as transient (rate limit)."""
        error = classify_http_error(
            url="https://example.com/api",
            status_code=429,
            reason="Too Many Requests",
            content="",
        )
        assert isinstance(error, ScrapeTransientError)
        assert error.status_code == 429
        assert error.is_recoverable is True
        assert error.disable_tag is None

    def test_502_returns_transient_error(self):
        """HTTP 502 should be classified as transient."""
        error = classify_http_error(
            url="https://example.com/api",
            status_code=502,
            reason="Bad Gateway",
            content="",
        )
        assert isinstance(error, ScrapeTransientError)
        assert error.status_code == 502
        assert error.is_recoverable is True

    def test_503_returns_transient_error(self):
        """HTTP 503 should be classified as transient."""
        error = classify_http_error(
            url="https://example.com/api",
            status_code=503,
            reason="Service Unavailable",
            content="",
        )
        assert isinstance(error, ScrapeTransientError)
        assert error.status_code == 503

    def test_504_returns_transient_error(self):
        """HTTP 504 should be classified as transient."""
        error = classify_http_error(
            url="https://example.com/api",
            status_code=504,
            reason="Gateway Timeout",
            content="",
        )
        assert isinstance(error, ScrapeTransientError)
        assert error.status_code == 504

    def test_500_returns_transient_error(self):
        """HTTP 500 should be classified as transient."""
        error = classify_http_error(
            url="https://example.com/api",
            status_code=500,
            reason="Internal Server Error",
            content="",
        )
        assert isinstance(error, ScrapeTransientError)
        assert error.status_code == 500

    def test_410_returns_not_found_error(self):
        """HTTP 410 Gone should be classified as not found."""
        error = classify_http_error(
            url="https://example.com/jobs",
            status_code=410,
            reason="Gone",
            content="",
        )
        assert isinstance(error, ScrapeNotFoundError)
        assert error.status_code == 410

    def test_422_on_api_returns_protected_api_error(self):
        """HTTP 422 on API should return protected API error."""
        error = classify_http_error(
            url="https://example.com/api",
            status_code=422,
            reason="Unprocessable Entity",
            content="",
            is_api=True,
        )
        assert isinstance(error, ScrapeProtectedApiError)

    def test_422_non_api_returns_config_error(self):
        """HTTP 422 on non-API should return config error."""
        error = classify_http_error(
            url="https://example.com/jobs",
            status_code=422,
            reason="Unprocessable Entity",
            content="",
            is_api=False,
        )
        assert isinstance(error, ScrapeConfigError)
        assert error.status_code == 422

    def test_403_on_api_returns_protected_api_error(self):
        """HTTP 403 on API endpoint should return protected API error."""
        error = classify_http_error(
            url="https://example.com/api",
            status_code=403,
            reason="Forbidden",
            content="",
            is_api=True,
        )
        assert isinstance(error, ScrapeProtectedApiError)
        assert error.disable_tag == "protected_api"

    def test_403_empty_content_returns_blocked_error(self):
        """HTTP 403 with empty content should return generic blocked error."""
        error = classify_http_error(
            url="https://example.com/jobs",
            status_code=403,
            reason="Forbidden",
            content="",
        )
        assert isinstance(error, ScrapeBlockedError)
        # Should NOT be ScrapeBotProtectionError or ScrapeTransientError
        assert not isinstance(error, ScrapeBotProtectionError)
        assert not isinstance(error, ScrapeTransientError)
        assert error.status_code == 403

    def test_unknown_status_returns_generic_error(self):
        """Unknown status codes should return generic ScrapeBlockedError."""
        error = classify_http_error(
            url="https://example.com/jobs",
            status_code=418,  # I'm a teapot
            reason="I'm a teapot",
            content="",
        )
        assert isinstance(error, ScrapeBlockedError)
        assert error.status_code == 418


class TestErrorProperties:
    """Test error class properties."""

    def test_bot_protection_error_properties(self):
        error = ScrapeBotProtectionError("https://example.com", "test", 403)
        assert error.is_recoverable is False
        assert error.should_auto_recover is False
        assert error.disable_tag == "anti_bot"

    def test_auth_error_properties(self):
        error = ScrapeAuthError("https://example.com", "test", 401)
        assert error.is_recoverable is False
        assert error.should_auto_recover is False
        assert error.disable_tag == "auth_required"

    def test_config_error_properties(self):
        error = ScrapeConfigError("https://example.com", "test", 400)
        assert error.is_recoverable is True
        assert error.should_auto_recover is True
        assert error.disable_tag is None

    def test_not_found_error_properties(self):
        error = ScrapeNotFoundError("https://example.com", "test", 404)
        assert error.is_recoverable is True
        assert error.should_auto_recover is True
        assert error.disable_tag is None

    def test_transient_error_properties(self):
        error = ScrapeTransientError("https://example.com", "test", 503)
        assert error.is_recoverable is True
        assert error.should_auto_recover is False  # Retried automatically
        assert error.disable_tag is None

    def test_protected_api_error_properties(self):
        error = ScrapeProtectedApiError("https://example.com", "test", 401)
        assert error.is_recoverable is False
        assert error.should_auto_recover is False
        assert error.disable_tag == "protected_api"
