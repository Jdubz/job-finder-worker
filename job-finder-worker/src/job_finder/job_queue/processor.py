"""Process queue items (jobs, companies, and scrape requests).

Coordinator for queue item processing.

Routes queue items to specialized processors (job/company/source) and enforces
the state-driven pipeline as the single source of truth.
"""

import logging
import traceback
from typing import Any, Dict, Optional

from job_finder.ai import AIJobMatcher
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.exceptions import QueueProcessingError
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus
from job_finder.job_queue.processors import (
    CompanyProcessor,
    JobProcessor,
    SourceProcessor,
)
from job_finder.storage import JobStorage, JobListingStorage
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager

logger = logging.getLogger(__name__)


class QueueItemProcessor:
    """
    Processes individual queue items (jobs, companies, and scrape requests).

    Handles scraping, AI analysis, and storage based on item type.
    """

    def __init__(
        self,
        queue_manager: QueueManager,
        config_loader: ConfigLoader,
        job_storage: JobStorage,
        job_listing_storage: JobListingStorage,
        companies_manager: CompaniesManager,
        sources_manager: JobSourcesManager,
        company_info_fetcher: CompanyInfoFetcher,
        ai_matcher: AIJobMatcher,
    ):
        """
        Initialize processor with specialized processors for each domain.

        Each specialized processor receives only the dependencies it needs.

        Args:
            queue_manager: Queue manager for updating item status
            config_loader: Configuration loader for stop lists and filters
            job_storage: SQLite job storage for saving matches
            job_listing_storage: SQLite storage for all discovered job listings
            companies_manager: Company data manager
            sources_manager: Job sources manager
            company_info_fetcher: Company info scraper
            ai_matcher: AI job matcher
        """
        self.queue_manager = queue_manager
        self.config_loader = config_loader
        self.job_storage = job_storage
        self.job_listing_storage = job_listing_storage
        self.companies_manager = companies_manager
        self.sources_manager = sources_manager
        self.company_info_fetcher = company_info_fetcher
        self.ai_matcher = ai_matcher

        # Initialize specialized processors with only their needed dependencies
        self.job_processor = JobProcessor(
            queue_manager=queue_manager,
            config_loader=config_loader,
            job_storage=job_storage,
            job_listing_storage=job_listing_storage,
            companies_manager=companies_manager,
            sources_manager=sources_manager,
            company_info_fetcher=company_info_fetcher,
            ai_matcher=ai_matcher,
        )

        self.company_processor = CompanyProcessor(
            queue_manager=queue_manager,
            config_loader=config_loader,
            companies_manager=companies_manager,
            sources_manager=sources_manager,
            company_info_fetcher=company_info_fetcher,
        )

        self.source_processor = SourceProcessor(
            queue_manager=queue_manager,
            config_loader=config_loader,
            sources_manager=sources_manager,
            companies_manager=companies_manager,
        )

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
            logger.info(f"Processing queue item {item.id}: {item.type} - {item.url[:50]}...")

        try:
            # Update status to processing
            self.queue_manager.update_status(item.id, QueueStatus.PROCESSING)

            # Check stop list (skip for SCRAPE requests)
            if item.type != QueueItemType.SCRAPE and self.job_processor._should_skip_by_stop_list(
                item
            ):
                self.queue_manager.update_status(
                    item.id, QueueStatus.SKIPPED, "Excluded by stop list"
                )
                return

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
            elif item.type == QueueItemType.AGENT_REVIEW:
                # Agent-only tasks are left for humans/agents to handle.
                # Mark as needs_review and stop processing to prevent loop churn.
                self.queue_manager.update_status(
                    item.id, QueueStatus.NEEDS_REVIEW, "Agent review queued"
                )
                logger.info("Agent review item %s handed off to human agent", item.id)
                return
            else:
                raise QueueProcessingError(f"Unknown item type: {item.type}")

        except Exception as e:
            error_msg = str(e)
            error_details = traceback.format_exc()
            logger.error(
                f"Error processing item {item.id}: {error_msg}\n{error_details}",
                exc_info=True,
            )
            self._handle_failure(item, error_msg, error_details)

    def _handle_failure(
        self, item: JobQueueItem, error_message: str, error_details: Optional[str] = None
    ) -> None:
        """
        Handle item processing failure with retry logic.

        Args:
            item: Failed queue item
            error_message: Brief error description (shown in UI)
            error_details: Detailed error information including stack trace (for debugging)
        """
        if not item.id:
            logger.error("Cannot handle failure for item without ID")
            return

        error_context = (
            f"Queue Item: {item.id}\n"
            f"Type: {item.type}\n"
            f"URL: {item.url}\n"
            f"Company: {item.company_name}\n\n"
        )

        failed_msg = f"Processing failed: {error_message}"
        failed_details = (
            f"{error_context}"
            f"Error: {error_message}\n\n"
            f"Retries are disabled; investigate and resubmit if appropriate.\n\n"
            f"Troubleshooting:\n"
            f"1. Check if the URL is still valid\n"
            f"2. Review error details below for specific issues\n"
            f"3. Verify network connectivity and API credentials\n"
            f"4. Check if the source website has changed structure\n\n"
            f"{'Stack Trace:\n' + error_details if error_details else ''}"
        )

        self.queue_manager.update_status(
            item.id, QueueStatus.FAILED, failed_msg, error_details=failed_details
        )
        logger.error(f"Item {item.id} failed: {error_message}")

    # ============================================================
    # BACKWARD COMPATIBILITY DELEGATION METHODS
    # These methods delegate to specialized processors for test compatibility
    # ============================================================

    # Job processor delegations
    def _process_scrape(self, item: JobQueueItem) -> None:
        """Delegate to job processor."""
        return self.job_processor.process_scrape(item)

    # Legacy job delegation removed; state-driven pipeline is the only path.

    # Company processor helper delegations (for testing)
    def _detect_tech_stack(
        self, extracted_info: Dict[str, Any], html_content: Optional[str] = None
    ) -> list:
        """Delegate to company processor."""
        return self.company_processor._detect_tech_stack(extracted_info, html_content)

    def _detect_job_board(
        self, company_website: str, html_content: Optional[str] = None
    ) -> Optional[str]:
        """Delegate to company processor."""
        return self.company_processor._detect_job_board(company_website, html_content)
