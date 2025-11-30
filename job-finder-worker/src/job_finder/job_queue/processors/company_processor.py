"""Company queue item processor.

This processor handles company queue items end-to-end in a single pass:
search → extract → analyze → save (and optionally spawn source discovery).

Philosophy: Search by company name is the primary data source.
URL is a hint, not a requirement. AI extracts from search results.
"""

import logging
from contextlib import contextmanager
from typing import Optional

from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.logging_config import format_company_name
from job_finder.job_queue.models import (
    JobQueueItem,
    QueueItemType,
    QueueStatus,
    SourceDiscoveryConfig,
    SourceTypeHint,
)
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)


class CompanyProcessor(BaseProcessor):
    """Processor for company queue items."""

    def __init__(
        self,
        queue_manager: QueueManager,
        config_loader: ConfigLoader,
        companies_manager: CompaniesManager,
        sources_manager: JobSourcesManager,
        company_info_fetcher: CompanyInfoFetcher,
    ):
        """
        Initialize company processor with its specific dependencies.

        Args:
            queue_manager: Queue manager for updating item status
            config_loader: Configuration loader for stop lists and filters
            companies_manager: Company data manager
            sources_manager: Job sources manager
            company_info_fetcher: Company info fetcher (search-first)
        """
        super().__init__(queue_manager, config_loader)

        self.companies_manager = companies_manager
        self.sources_manager = sources_manager
        self.company_info_fetcher = company_info_fetcher

    # ============================================================
    # SINGLE-PASS PROCESSOR
    # ============================================================

    def process_company(self, item: JobQueueItem) -> None:
        """
        Run the full company pipeline: search → extract → save.

        Philosophy: A company task succeeds if we save ANY company record.
        Data quality (complete/partial/minimal) is tracked separately via UI badges.
        Only truly unrecoverable errors (e.g., no company name) should fail.

        The CompanyInfoFetcher handles:
        - Search by company name (primary data source)
        - AI extraction from search results
        - URL validation (job board/aggregator detection)
        - Optional scraping for enrichment
        """
        if not item.id:
            logger.error("Cannot process item without ID")
            return

        company_name = item.company_name or "Unknown Company"
        company_id = item.company_id

        _, company_display = format_company_name(company_name)
        logger.info(f"COMPANY: Processing {company_display}")

        # Set PROCESSING status at the start
        self.queue_manager.update_status(
            item.id, QueueStatus.PROCESSING, f"Enriching company: {company_display}"
        )

        with self._handle_company_failure(item):
            # Fetch company info using search-first approach
            # URL from queue item is just a hint - fetcher will validate/ignore if it's a job board
            extracted_info = self.company_info_fetcher.fetch_company_info(
                company_name=company_name,
                url_hint=item.url,
            )

            # Determine data quality level for the result message
            about_len = len(extracted_info.get("about", "") or "")
            culture_len = len(extracted_info.get("culture", "") or "")

            if about_len >= 100 and culture_len >= 50:
                data_quality = "complete"
            elif about_len >= 50 or culture_len >= 25:
                data_quality = "partial"
            else:
                data_quality = "minimal"

            # Build and save the company record (only name is truly required)
            company_record = {
                "id": company_id,
                "name": company_name,
                **extracted_info,
            }

            # Normalize keys for storage expectations
            if extracted_info.get("headquarters") and not extracted_info.get(
                "headquartersLocation"
            ):
                company_record["headquartersLocation"] = extracted_info.get("headquarters")

            company_id = self.companies_manager.save_company(company_record)
            logger.info(f"Company saved: {company_display} (ID: {company_id})")

            # Check if we should spawn source discovery
            # Look for job board URLs in the extracted website or provided URL
            job_board_url = self._detect_job_board_for_discovery(
                extracted_info.get("website"), item.url
            )

            source_spawned = False
            if job_board_url:
                existing = self.sources_manager.get_source_for_url(job_board_url)
                if not existing:
                    discovery_config = SourceDiscoveryConfig(
                        url=job_board_url,
                        type_hint=SourceTypeHint.AUTO,
                        company_id=company_id,
                        company_name=company_name,
                    )

                    source_item = JobQueueItem(
                        type=QueueItemType.SOURCE_DISCOVERY,
                        url="",
                        company_name=company_name,
                        company_id=company_id,
                        source="automated_scan",
                        source_discovery_config=discovery_config,
                        tracking_id=item.tracking_id,
                        parent_item_id=item.id,
                    )

                    self.queue_manager.add_item(source_item)
                    source_spawned = True
                    logger.info(f"Spawned SOURCE_DISCOVERY for {company_display}: {job_board_url}")
                else:
                    logger.info(
                        "Source already exists for %s (source_id=%s)",
                        job_board_url,
                        existing.get("id"),
                    )

            # Build result message with data quality indicator
            result_parts = [f"Company saved ({data_quality} data)"]
            result_parts.append(f"about={about_len} chars, culture={culture_len} chars")

            tech_stack = extracted_info.get("techStack") or []
            if tech_stack:
                result_parts.append(f"tech_stack={len(tech_stack)}")
            if job_board_url:
                result_parts.append("job_board_spawned" if source_spawned else "job_board_exists")

            self.queue_manager.update_status(item.id, QueueStatus.SUCCESS, "; ".join(result_parts))

    # ============================================================
    # HELPER METHODS
    # ============================================================

    def _detect_job_board_for_discovery(
        self, website: Optional[str], provided_url: Optional[str]
    ) -> Optional[str]:
        """
        Check if we have a job board URL that should spawn source discovery.

        If the provided URL is a job board (ATS/aggregator), use it for discovery.
        The company website itself is NOT a job board.

        Args:
            website: The company's main website (from extraction)
            provided_url: The URL provided in the queue item

        Returns:
            Job board URL if found, None otherwise
        """
        # If provided URL is a job board, that's what we want for source discovery
        if provided_url and self.company_info_fetcher._is_job_board_url(provided_url):
            return provided_url

        return None

    @contextmanager
    def _handle_company_failure(self, item: JobQueueItem):
        """Handle company pipeline errors by marking item as FAILED."""
        try:
            yield
        except Exception as exc:
            logger.error("Company pipeline error (company_id=%s): %s", item.company_id, exc)
            if item.id:
                self.queue_manager.update_status(
                    item.id, QueueStatus.FAILED, f"Error: {type(exc).__name__}: {str(exc)[:200]}"
                )
            raise
