"""Base processor with shared dependencies and utilities.

This base class provides common functionality for all specialized processors:
- Dependency injection for shared managers
- Queue item status updates
- Stop list checking
- Logging utilities
- Error handling patterns

Note: Heavy dependencies like filter_engine, scrape_runner, and scraper_intake
are initialized only by processors that need them (JobProcessor).
"""

import logging
from typing import Any, Dict, Optional

from job_finder.exceptions import DuplicateQueueItemError, StorageError
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus
from job_finder.utils.company_info import should_skip_by_stop_list
from job_finder.logging_config import get_structured_logger

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
    # AGENT REVIEW HANDOFF HELPERS
    # ============================================================

    def _create_agent_review_item(
        self,
        item: JobQueueItem,
        prompt: str,
        reason: str,
        context: Dict[str, Any],
    ) -> JobQueueItem:
        """
        Build a standardized AGENT_REVIEW queue item with shared metadata.

        Agent review items are created when a task fails in a recoverable way
        that requires agent intervention to resolve.

        Args:
            item: Parent queue item that needs review
            prompt: Instructions for the agent on what to do
            reason: Brief explanation of why review is needed
            context: Additional context data for the agent

        Returns:
            New JobQueueItem of type AGENT_REVIEW
        """
        return JobQueueItem(
            type=QueueItemType.AGENT_REVIEW,
            url=item.url,
            company_name=item.company_name,
            company_id=item.company_id,
            source=item.source,
            status=QueueStatus.PENDING,
            result_message=reason,
            scraped_data={**context, "agent_prompt": prompt},
            parent_item_id=item.id,
            tracking_id=item.tracking_id,
        )

    def _spawn_agent_review(
        self,
        item: JobQueueItem,
        prompt: str,
        reason: str,
        context: Dict[str, Any],
    ) -> Optional[str]:
        """
        Insert an AGENT_REVIEW item and log the result.

        Args:
            item: Parent queue item that needs review
            prompt: Instructions for the agent
            reason: Brief explanation of why review is needed
            context: Additional context data for the agent

        Returns:
            ID of the created agent review item, or None if creation failed
        """
        review_item = self._create_agent_review_item(item, prompt, reason, context)
        try:
            review_id = self.queue_manager.add_item(review_item)
            logger.info(
                "Spawned AGENT_REVIEW %s for %s (%s)",
                review_id,
                item.url or item.id,
                reason,
            )
            return review_id
        except DuplicateQueueItemError as exc:
            logger.warning(
                "Agent review already exists for %s: %s", item.url or item.id, exc
            )
        except StorageError as exc:
            logger.error("Failed to store agent review for %s: %s", item.id, exc)
        return None

    def _handoff_to_agent_review(
        self,
        item: JobQueueItem,
        prompt: str,
        reason: str,
        context: Dict[str, Any],
        status_message: str,
    ) -> Optional[str]:
        """
        Spawn an agent review and mark the parent as NEEDS_REVIEW in one step.

        This is the primary method for handling recoverable failures that need
        agent intervention. It:
        1. Creates an AGENT_REVIEW queue item with instructions
        2. Marks the parent item as NEEDS_REVIEW

        Args:
            item: Parent queue item that failed and needs review
            prompt: Instructions for the agent on what to do
            reason: Brief explanation of why review is needed
            context: Additional context data for the agent
            status_message: Message to set on the parent item

        Returns:
            ID of the created agent review item, or None if creation failed
        """
        review_id = self._spawn_agent_review(item, prompt, reason, context)
        self._update_item_status(item.id, QueueStatus.NEEDS_REVIEW, status_message)
        return review_id
