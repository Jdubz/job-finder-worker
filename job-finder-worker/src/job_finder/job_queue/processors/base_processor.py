"""Base processor with shared dependencies and utilities.

This base class provides common functionality for all specialized processors:
- Dependency injection for shared managers
- Queue item status updates
- Stop list checking
- Logging utilities
- Error handling patterns
- FK relationship repair helpers

Note: Heavy dependencies like filter_engine, scrape_runner, and scraper_intake
are initialized only by processors that need them (JobProcessor).
"""

import logging
from typing import Any, Dict, Optional, Tuple, TYPE_CHECKING

from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueStatus
from job_finder.utils.company_info import should_skip_by_stop_list
from job_finder.logging_config import get_structured_logger

if TYPE_CHECKING:
    from job_finder.storage.job_sources_manager import JobSourcesManager
    from job_finder.storage.companies_manager import CompaniesManager

logger = logging.getLogger(__name__)


class BaseProcessor:
    """Base class for queue item processors with shared dependencies."""

    def __init__(
        self,
        queue_manager: QueueManager,
        config_loader: ConfigLoader,
    ):
        """
        Initialize base processor with core shared dependencies.

        Subclasses should accept additional dependencies specific to their needs.

        Args:
            queue_manager: Queue manager for updating item status
            config_loader: Configuration loader for stop lists and filters
        """
        self.queue_manager = queue_manager
        self.config_loader = config_loader

        # Structured logger for traceable, queryable log fields
        self.slogger = get_structured_logger(
            f"{self.__class__.__module__}.{self.__class__.__name__}"
        )

    # ============================================================
    # SHARED UTILITY METHODS
    # ============================================================

    def _should_skip_by_stop_list(self, item: JobQueueItem) -> bool:
        """Check if item should be skipped based on stop list."""
        stop_list = self.config_loader.get_stop_list()
        return should_skip_by_stop_list(item.url, item.company_name or "", stop_list)

    def _update_item_status(
        self,
        item_id: str,
        status: QueueStatus,
        message: str = "",
        **kwargs: Any,
    ) -> None:
        """
        Update queue item status with logging.

        Args:
            item_id: Queue item ID
            status: New status
            message: Status message
            **kwargs: Additional fields to update
        """
        logger.info(f"Updating queue item {item_id} status to {status.value}: {message}")
        self.queue_manager.update_status(item_id, status, message, **kwargs)

    def _get_pipeline_state(self, item: JobQueueItem) -> Dict[str, Any]:
        """
        Get pipeline state from queue item.

        Args:
            item: Queue item

        Returns:
            Pipeline state dictionary (empty dict if not present)
        """
        return item.pipeline_state or {}

    # ============================================================
    # FK RELATIONSHIP REPAIR HELPERS
    # ============================================================

    @staticmethod
    def ensure_company_source_link(
        sources_manager: "JobSourcesManager",
        company_id: Optional[str],
        source_id: Optional[str],
        source_url: Optional[str] = None,
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Ensure company and source are properly linked (self-healing).

        This helper implements FK relationship repair:
        - If we have source_id but no company_id, look up company from source
        - If we have company_id and source_id but source isn't linked, link them
        - If we have company_id and source_url but no source_id, look up and link

        Args:
            sources_manager: Job sources manager for lookups/updates
            company_id: Known company ID (may be None)
            source_id: Known source ID (may be None)
            source_url: Optional source URL for lookup

        Returns:
            Tuple of (company_id, source_id) - potentially updated values
        """
        # If we have source_id but no company_id, look up company from source
        if source_id and not company_id:
            source = sources_manager.get_source_by_id(source_id)
            if source and source.get("companyId"):
                company_id = source["companyId"]
                logger.debug(
                    "Resolved company_id=%s from source_id=%s",
                    company_id,
                    source_id,
                )

        # If we have company but source isn't linked, try to link
        if company_id and source_id:
            source = sources_manager.get_source_by_id(source_id)
            if source and not source.get("companyId"):
                sources_manager.update_company_link(source_id, company_id)
                logger.info(
                    "Self-healed: linked source %s to company %s",
                    source_id,
                    company_id,
                )

        # If we have company and source_url but no source_id, look up source
        if company_id and source_url and not source_id:
            source = sources_manager.get_source_for_url(source_url)
            if source:
                source_id = source["id"]
                if not source.get("companyId"):
                    sources_manager.update_company_link(source_id, company_id)
                    logger.info(
                        "Self-healed: linked source %s (url=%s) to company %s",
                        source_id,
                        source_url,
                        company_id,
                    )

        return company_id, source_id
