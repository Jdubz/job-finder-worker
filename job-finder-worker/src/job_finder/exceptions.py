"""Custom exceptions for the job finder application.

This module defines domain-specific exceptions that provide clearer error
handling and better context than generic Python exceptions.
"""

from typing import Optional


class JobFinderError(Exception):
    """Base exception for all job finder errors.

    All custom exceptions in this module inherit from this base class,
    making it easy to catch all job-finder-specific errors.
    """

    pass


class ConfigurationError(JobFinderError):
    """Raised when there's an error in configuration.

    Examples:
    - Missing required configuration fields
    - Invalid configuration values
    - Missing API keys or credentials
    - Invalid source configuration
    """

    pass


class InitializationError(JobFinderError):
    """Raised when a component fails to initialize properly.

    Examples:
    - Database client not initialized
    - Manager not initialized before use
    - Profile not loaded before processing
    """

    pass


class QueueProcessingError(JobFinderError):
    """Raised when queue item processing fails.

    Examples:
    - Unknown queue item type
    - Unknown sub-task type
    - Missing required pipeline state
    - Invalid queue item structure
    """

    pass


class InvalidStateTransition(JobFinderError):
    """Raised when an entity attempts an invalid state transition."""

    pass


class AIProviderError(JobFinderError):
    """Raised when AI provider operations fail.

    Examples:
    - API key not configured
    - API request failed
    - Invalid provider type
    - Model not available
    """

    pass


class QuotaExhaustedError(AIProviderError):
    """Raised when an AI provider's quota or rate limit is exhausted.

    When this error is raised, the AgentManager will:
    1. Disable the exhausted agent
    2. Continue to the next agent in the fallback chain

    This allows graceful degradation when one provider hits limits while
    others are still available. Only if ALL agents are exhausted will
    NoAgentsAvailableError be raised.

    Examples:
    - Gemini daily quota exhausted
    - OpenAI rate limit exceeded
    - Anthropic usage limit reached

    Attributes:
        provider: The AI provider that hit the quota limit
        reset_info: Optional info about when quota resets (e.g., "midnight Pacific")
    """

    def __init__(self, message: str, provider: str = "unknown", reset_info: str = None):
        self.provider = provider
        self.reset_info = reset_info
        super().__init__(message)


class TransientError(AIProviderError):
    """Raised for transient errors that allow retries before disabling.

    Unlike permanent AIProviderError which disables the agent immediately,
    TransientError triggers retry logic (up to 2 retries = 3 total attempts).
    The agent is only disabled after all retries are exhausted.

    Examples:
    - Network timeout
    - Temporary connection failure
    - Service temporarily unavailable

    Attributes:
        provider: The AI provider that experienced the transient error
    """

    def __init__(self, message: str, provider: str = "unknown"):
        self.provider = provider
        super().__init__(message)


class NoAgentsAvailableError(AIProviderError):
    """Raised when no agents are available to handle a task.

    This is a critical error that should stop queue processing.
    The current task should be reset to pending and the queue stopped
    until agents are re-enabled or budget is reset.

    Examples:
    - All agents in fallback chain are disabled
    - All agents in fallback chain are over budget
    - No fallback chain configured for task type

    Attributes:
        task_type: The agent task type that had no available agents
        tried_agents: List of agent IDs that were checked
    """

    def __init__(self, message: str, task_type: str = "unknown", tried_agents: list = None):
        self.task_type = task_type
        self.tried_agents = tried_agents or []
        super().__init__(message)


class ExtractionError(JobFinderError):
    """Raised when AI extraction fails.

    Examples:
    - Empty title or description
    - AI returned invalid JSON
    - AI returned empty response
    - Required fields missing from extraction
    """

    pass


class StorageError(JobFinderError):
    """Raised when storage operations fail.

    Examples:
    - Database not initialized
    - Failed to save record
    - Failed to query table
    - Connection error
    """

    pass


class DuplicateQueueItemError(StorageError):
    """Raised when attempting to insert a duplicate queue item.

    This is expected behavior during concurrent scraping operations
    and should be handled gracefully (not logged as an error).

    Examples:
    - Same URL submitted by multiple scrapers simultaneously
    - Race condition between url_exists check and insert
    """

    pass


class DuplicateSourceError(StorageError):
    """Raised when attempting to insert a duplicate job source.

    A source is considered duplicate if another source with the same name
    already exists in the database.

    Attributes:
        name: The duplicate source name
        existing_id: The ID of the existing source with this name
    """

    def __init__(self, name: str, existing_id: str, message: str = None):
        self.name = name
        self.existing_id = existing_id
        super().__init__(message or f"Source '{name}' already exists (id: {existing_id})")


class ProfileError(JobFinderError):
    """Raised when profile operations fail.

    Examples:
    - Profile file not found
    - Invalid profile data
    - Missing required profile fields
    - Profile validation failed
    """

    pass


class ScraperError(JobFinderError):
    """Raised when scraping operations fail.

    Examples:
    - Missing required scraper configuration
    - Failed to fetch page
    - Selector not found
    - Invalid scraper type
    """

    pass


class ScrapeBlockedError(ScraperError):
    """Base class for scrape errors with HTTP status code tracking.

    This error hierarchy allows different handling strategies based on error type:
    - Bot protection: Non-recoverable, apply anti_bot tag
    - Auth errors: Non-recoverable, apply auth_required tag
    - Config errors: Recoverable, spawn recovery task
    - Not found: Recoverable, spawn recovery task to find new URL
    - Transient: Retry automatically before disabling

    Attributes:
        source_url: The URL that failed
        reason: Description of the error
        status_code: HTTP status code if applicable
    """

    def __init__(self, source_url: str, reason: str, status_code: int = None):
        self.source_url = source_url
        self.reason = reason
        self.status_code = status_code
        super().__init__(f"Scrape error at {source_url}: {reason}")

    @property
    def is_recoverable(self) -> bool:
        """Whether this error type is potentially recoverable."""
        return True  # Base class assumes recoverable; subclasses override

    @property
    def should_auto_recover(self) -> bool:
        """Whether to automatically spawn a recovery task."""
        return False  # Base class doesn't auto-recover; subclasses override

    @property
    def disable_tag(self) -> Optional[str]:
        """Tag to apply when disabling source, or None for no tag."""
        return None


class ScrapeBotProtectionError(ScrapeBlockedError):
    """Raised when actual bot protection is detected (Cloudflare, CAPTCHA, WAF).

    This is NON-RECOVERABLE. The source should be disabled with anti_bot tag.

    Detection markers:
    - Cloudflare challenge page ("checking your browser", "Ray ID")
    - CAPTCHA/reCAPTCHA/hCaptcha
    - WAF blocking (Sucuri, Incapsula, Akamai)
    - "Access denied" with protection markers
    """

    @property
    def is_recoverable(self) -> bool:
        return False

    @property
    def disable_tag(self) -> str:
        return "anti_bot"


class ScrapeAuthError(ScrapeBlockedError):
    """Raised when authentication is required (login wall, OAuth, 401).

    This is NON-RECOVERABLE without credentials. Apply auth_required tag.

    Detection markers:
    - HTTP 401 Unauthorized
    - Login form in response
    - OAuth redirect
    - "Sign in to continue" messages
    """

    @property
    def is_recoverable(self) -> bool:
        return False

    @property
    def disable_tag(self) -> str:
        return "auth_required"


class ScrapeConfigError(ScrapeBlockedError):
    """Raised for configuration errors (HTTP 400, invalid params, wrong format).

    This is RECOVERABLE. The URL or config parameters need to be fixed.
    Should spawn a recovery task to find the correct configuration.

    Common causes:
    - Wrong API endpoint URL
    - Missing required parameters
    - Invalid request format
    - Wrong site_id for Workday, etc.
    """

    @property
    def is_recoverable(self) -> bool:
        return True

    @property
    def should_auto_recover(self) -> bool:
        return True


class ScrapeNotFoundError(ScrapeBlockedError):
    """Raised when endpoint is not found (HTTP 404).

    This is RECOVERABLE. The careers page likely moved to a different URL.
    Should spawn a recovery task to find the new location.

    IMPORTANT: A 404 is NOT bot protection. It means:
    - Company changed their careers page URL
    - Company migrated to a different ATS
    - Board/slug was renamed
    - Job board was removed (company closed or stopped hiring)
    """

    @property
    def is_recoverable(self) -> bool:
        return True

    @property
    def should_auto_recover(self) -> bool:
        return True


class ScrapeTransientError(ScrapeBlockedError):
    """Raised for transient server errors (HTTP 502, 503, 504, timeouts).

    This should be RETRIED automatically before disabling.
    Do not apply any disable tag - these are temporary issues.

    Common causes:
    - Server overloaded
    - Deployment in progress
    - Rate limiting (without explicit block)
    - Network issues
    - Maintenance window
    """

    def __init__(
        self, source_url: str, reason: str, status_code: int = None, retry_after: int = None
    ):
        super().__init__(source_url, reason, status_code)
        self.retry_after = retry_after  # Seconds to wait before retry, if provided

    @property
    def is_recoverable(self) -> bool:
        return True

    @property
    def should_auto_recover(self) -> bool:
        return False  # Retried automatically, not via recovery task


class ScrapeProtectedApiError(ScrapeBlockedError):
    """Raised when API requires authentication (HTTP 401/403/422 on API endpoint).

    This is NON-RECOVERABLE for APIs that explicitly require auth tokens.
    Different from general auth_required as it's specific to API endpoints.
    """

    @property
    def is_recoverable(self) -> bool:
        return False

    @property
    def disable_tag(self) -> str:
        return "protected_api"
