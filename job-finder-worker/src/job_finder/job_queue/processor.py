"""Process queue items (jobs, companies, and scrape requests).

Coordinator for queue item processing.

Routes queue items to specialized processors (job/company/source) and enforces
the state-driven pipeline as the single source of truth.
"""

import logging
import traceback
from typing import Optional

from job_finder.exceptions import QueueProcessingError
from job_finder.job_queue.models import JobQueueItem, ProcessorContext, QueueItemType, QueueStatus
from job_finder.job_queue.processors import (
    CompanyProcessor,
    JobProcessor,
    SourceProcessor,
)

logger = logging.getLogger(__name__)


class QueueItemProcessor:
    """
    Processes individual queue items (jobs, companies, and scrape requests).

    Handles scraping, AI analysis, and storage based on item type.
    """

    def __init__(self, ctx: ProcessorContext):
        """
        Initialize processor with specialized processors for each domain.

        Args:
            ctx: ProcessorContext containing all required dependencies
        """
        self.ctx = ctx
        self.queue_manager = ctx.queue_manager

        # Initialize specialized processors with context
        self.job_processor = JobProcessor(ctx)
        self.company_processor = CompanyProcessor(ctx)
        self.source_processor = SourceProcessor(ctx)

    # ============================================================
    # MAIN DISPATCHER
    # ============================================================

    def process_item(self, item: JobQueueItem) -> None:
        """
        Dispatch queue item to appropriate specialized processor.

        Args:
            item: Queue item to process
        """
        if not item.id:
            logger.error("Cannot process item without ID")
            return

        # Log differently for scrape requests
        if item.type == QueueItemType.SCRAPE:
            logger.info(f"Processing queue item {item.id}: SCRAPE request")
        else:
            logger.info(
                f"Processing queue item {item.id}: {item.type} - {(item.url or '')[:50]}..."
            )

        try:
            # Note: Status will be updated to PROCESSING by each stage method after
            # dependency checks pass. This prevents premature "processing" events
            # when items are re-queued due to unmet dependencies.

            # Delegate to specialized processors
            # Note: Job deduplication is handled in scraper_intake (for scraped jobs) and
            # get_or_create_listing (for direct submissions). No duplicate check needed here.
            if item.type == QueueItemType.COMPANY:
                self.company_processor.process_company(item)
            elif item.type == QueueItemType.JOB:
                # Use decision tree routing based on pipeline_state
                self.job_processor.process_job(item)
            elif item.type == QueueItemType.SCRAPE:
                self.job_processor.process_scrape(item)
            elif item.type == QueueItemType.SOURCE_DISCOVERY:
                self.source_processor.process_source_discovery(item)
            elif item.type == QueueItemType.SCRAPE_SOURCE:
                self.source_processor.process_scrape_source(item)
            elif item.type == QueueItemType.SOURCE_RECOVER:
                self.source_processor.process_source_recover(item)
            else:
                raise QueueProcessingError(f"Unknown item type: {item.type}")

        except Exception as e:
            error_msg = str(e)
            error_details = traceback.format_exc()
            logger.error(
                f"Error processing item {item.id}: {error_msg}\n{error_details}",
                exc_info=True,
            )
            self._handle_failure(item, e, error_msg, error_details)

    def _handle_failure(
        self,
        item: JobQueueItem,
        error: Exception,
        error_message: str,
        error_details: Optional[str] = None,
    ) -> None:
        """
        Handle item processing failure with intelligent retry logic.

        Uses error categorization to determine the appropriate action:
        - TRANSIENT errors: Auto-retry up to max_retries
        - RESOURCE errors: Set to BLOCKED status for manual unblock
        - PERMANENT/UNKNOWN errors: Immediate FAILED status

        Args:
            item: Failed queue item
            error: The exception that occurred
            error_message: Brief error description (shown in UI)
            error_details: Detailed error information including stack trace (for debugging)
        """
        if not item.id:
            logger.error("Cannot handle failure for item without ID")
            return

        # Use intelligent failure handling from QueueManager
        final_status = self.queue_manager.handle_item_failure(item.id, error, error_message)

        # Log based on the outcome
        if final_status == QueueStatus.PENDING:
            logger.info(
                f"Item {item.id} will retry (attempt {item.retry_count + 1}/{item.max_retries})"
            )
        elif final_status == QueueStatus.BLOCKED:
            logger.warning(f"Item {item.id} blocked: {error_message}")
        else:
            # FAILED - provide detailed error context
            error_context = (
                f"Queue Item: {item.id}\n"
                f"Type: {item.type}\n"
                f"URL: {item.url}\n"
                f"Company: {item.company_name}\n\n"
            )
            full_details = (
                f"{error_context}"
                f"Error: {error_message}\n\n"
                f"Troubleshooting:\n"
                f"1. Check if the URL is still valid\n"
                f"2. Review error details below for specific issues\n"
                f"3. Verify network connectivity and API credentials\n"
                f"4. Check if the source website has changed structure\n\n"
                f"{'Stack Trace:\n' + error_details if error_details else ''}"
            )
            # Update with full error details (handle_item_failure only set brief message)
            self.queue_manager.update_status(
                item.id,
                QueueStatus.FAILED,
                error_details=full_details,
            )
            logger.error(f"Item {item.id} failed: {error_message}")
