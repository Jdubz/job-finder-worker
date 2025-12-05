"""Custom exceptions for the job finder application.

This module defines domain-specific exceptions that provide clearer error
handling and better context than generic Python exceptions.
"""


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
    """Raised when a scrape is blocked by anti-bot protection.

    This error indicates that the source returned a non-job response,
    typically an HTML captcha page, access denied page, or rate limit response
    instead of the expected data (RSS feed, JSON API, etc.).

    When caught, the source should be disabled with appropriate notes
    to prevent repeated failed scrape attempts.

    Attributes:
        source_url: The URL that was blocked
        reason: Description of why the response appears to be blocked
    """

    def __init__(self, source_url: str, reason: str):
        self.source_url = source_url
        self.reason = reason
        super().__init__(f"Scrape blocked at {source_url}: {reason}")
