"""Source queue item processor.

This processor handles all source-related queue items:
- Source discovery (auto-detect type and generate config)
- Source scraping (fetch jobs from configured sources)

All sources use the GenericScraper with unified SourceConfig format.
"""

import logging
import re
import traceback
import uuid
from urllib.parse import urlparse

from job_finder.exceptions import QueueProcessingError
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus
from job_finder.job_queue.scraper_intake import ScraperIntake
from job_finder.scrapers.config_expander import expand_config
from job_finder.storage.job_sources_manager import JobSourcesManager

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)


class SourceProcessor(BaseProcessor):
    """Processor for source discovery and scraping queue items."""

    def __init__(
        self,
        queue_manager: QueueManager,
        config_loader: ConfigLoader,
        sources_manager: JobSourcesManager,
    ):
        """
        Initialize source processor with its specific dependencies.

        Args:
            queue_manager: Queue manager for updating item status
            config_loader: Configuration loader for AI settings
            sources_manager: Job sources manager
        """
        super().__init__(queue_manager, config_loader)

        self.sources_manager = sources_manager

        # Initialize scraper intake without filter_engine
        # Jobs will be filtered when processed by JobProcessor
        self.scraper_intake = ScraperIntake(queue_manager=queue_manager)

    # ============================================================
    # SOURCE DISCOVERY
    # ============================================================

    def process_source_discovery(self, item: JobQueueItem) -> None:
        """
        Process SOURCE_DISCOVERY queue item.

        Flow:
        1. Fetch URL and detect source type using AI
        2. Generate SourceConfig with field mappings
        3. Validate by test scraping
        4. Create job-source document if successful

        Args:
            item: Queue item with source_discovery_config
        """
        if not item.id or not item.source_discovery_config:
            logger.error("Cannot process SOURCE_DISCOVERY without ID or config")
            return

        config = item.source_discovery_config
        url = config.url

        logger.info(f"SOURCE_DISCOVERY: Processing {url}")

        try:
            from job_finder.ai.providers import create_provider_from_config
            from job_finder.ai.source_discovery import SourceDiscovery

            # Get AI settings and create provider (tolerate missing/invalid config)
            try:
                ai_settings = self.config_loader.get_ai_settings()
                provider = create_provider_from_config(ai_settings)
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning(
                    "AI provider unavailable (%s); falling back to heuristic discovery for %s",
                    exc,
                    url,
                )
                provider = None

            # Run AI-powered discovery
            discovery = SourceDiscovery(provider)
            source_config = discovery.discover(url)

            if not source_config:
                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.FAILED,
                    "Discovery failed - could not generate valid config",
                    error_details=f"URL: {url}",
                )
                return

            # Extract company name
            company_name = config.company_name or source_config.get("company_name", "")
            if not company_name:
                company_name = self._extract_company_from_url(url)

            source_type = source_config.get("type", "unknown")

            # Determine confidence based on source type
            confidence = "high" if source_type in ("api", "rss") else "medium"

            # Create source
            source_name = f"{company_name} Jobs" if company_name else f"Source ({source_type})"

            source_id = self.sources_manager.create_from_discovery(
                name=source_name,
                source_type=source_type,
                config=source_config,
                discovered_via=item.source or "user_submission",
                discovered_by=item.submitted_by,
                discovery_confidence=confidence,
                discovery_queue_item_id=item.id,
                company_id=config.company_id,
                company_name=company_name,
            )

            # Spawn SCRAPE_SOURCE to immediately scrape the new source
            scrape_item = JobQueueItem(
                type=QueueItemType.SCRAPE_SOURCE,
                url="",
                company_name=company_name or "Unknown",
                source="automated_scan",
                scraped_data={"source_id": source_id},
                tracking_id=str(uuid.uuid4()),
            )
            scrape_item_id = self.queue_manager.add_item(scrape_item)
            logger.info(f"Spawned SCRAPE_SOURCE item {scrape_item_id} for source {source_id}")

            # Update queue item with success
            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                source_id,
                scraped_data={"source_id": source_id, "source_type": source_type},
            )
            logger.info(f"SOURCE_DISCOVERY complete: Created source {source_id}")

        except Exception as e:
            logger.error(f"Error in SOURCE_DISCOVERY: {e}")
            self.queue_manager.update_status(
                item.id,
                QueueStatus.FAILED,
                str(e),
                error_details=traceback.format_exc(),
            )

    def _extract_company_from_url(self, url: str) -> str:
        """Extract company name from URL."""
        try:
            parsed = urlparse(url)
            domain = parsed.netloc

            # Remove www. and common TLDs
            name = domain.replace("www.", "")
            name = name.split(".")[0]

            # Convert hyphens to spaces and capitalize
            parts = re.split(r"[-_]", name)
            capitalized = [part.capitalize() for part in parts if part]

            return " ".join(capitalized) if len(capitalized) > 2 else "".join(capitalized)
        except Exception:
            return ""

    # ============================================================
    # SOURCE SCRAPING
    # ============================================================

    def process_scrape_source(self, item: JobQueueItem) -> None:
        """
        Process SCRAPE_SOURCE queue item.

        Scrapes a specific job source using GenericScraper and submits found jobs.

        Flow:
        1. Fetch source configuration from job-sources collection
        2. Create GenericScraper with SourceConfig
        3. Submit found jobs via ScraperIntake
        4. Update source health tracking

        Args:
            item: Queue item with source_id or source_url
        """
        if not item.id:
            logger.error("Cannot process SCRAPE_SOURCE without ID")
            return

        source_id = item.scraped_data.get("source_id") if item.scraped_data else None
        source_url = item.url if item.url else None

        logger.info(f"SCRAPE_SOURCE: Processing source {source_id or source_url}")

        try:
            # Fetch source configuration
            if source_id:
                source = self.sources_manager.get_source_by_id(source_id)
            elif source_url:
                source = self.sources_manager.get_source_for_url(source_url)
            else:
                raise QueueProcessingError("SCRAPE_SOURCE item must have source_id or url")

            if not source:
                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.FAILED,
                    "Source not found",
                    error_details=f"source_id={source_id}, url={source_url}",
                )
                return

            source_name = source.get("name", "Unknown")
            source_type = source.get("sourceType", "api")
            config = source.get("config", {})

            logger.info(f"Scraping source: {source_name} (type={source_type})")

            # Scrape using GenericScraper
            try:
                from job_finder.scrapers.generic_scraper import GenericScraper
                from job_finder.scrapers.source_config import SourceConfig

                # Get company name for override
                company_id = source.get("companyId") or source.get("company_id")
                company_name = source.get("companyName") or source.get("company_name") or source_name

                # Expand config based on source_type (converts simple configs to full scraper configs)
                try:
                    expanded_config = expand_config(source_type, config)
                except ValueError as e:
                    self.queue_manager.update_status(
                        item.id,
                        QueueStatus.FAILED,
                        f"Invalid config: {e}",
                        error_details=f"Source {source_name} config expansion failed",
                    )
                    return

                source_config = SourceConfig.from_dict(expanded_config, company_name=company_name)
                scraper = GenericScraper(source_config)
                jobs = scraper.scrape()

                logger.info(f"Found {len(jobs)} jobs from {source_name}")

                # Submit jobs to queue
                if jobs:
                    source_label = f"{source_type}:{source_name}"
                    jobs_added = self.scraper_intake.submit_jobs(
                        jobs=jobs,
                        source=source_label,
                        company_id=company_id,
                    )
                    logger.info(f"Submitted {jobs_added} jobs to queue from {source_name}")

                    # Record success
                    self.sources_manager.record_scraping_success(
                        source_id=source.get("id"),
                    )

                    self.queue_manager.update_status(
                        item.id,
                        QueueStatus.SUCCESS,
                        f"Scraped {len(jobs)} jobs, submitted {jobs_added} to queue",
                        scraped_data={
                            "jobs_found": len(jobs),
                            "jobs_submitted": jobs_added,
                            "source_name": source_name,
                        },
                    )
                else:
                    # No jobs found - still success
                    logger.info(f"No jobs found from {source_name}")
                    self.queue_manager.update_status(
                        item.id,
                        QueueStatus.SUCCESS,
                        "No jobs found",
                        scraped_data={
                            "jobs_found": 0,
                            "source_name": source_name,
                        },
                    )

            except Exception as scrape_error:
                logger.error(f"Error scraping source {source_name}: {scrape_error}")
                self.sources_manager.record_scraping_failure(
                    source_id=source.get("id"),
                    error_message=str(scrape_error),
                )
                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.FAILED,
                    f"Scraping failed: {str(scrape_error)}",
                    error_details=traceback.format_exc(),
                )

        except Exception as e:
            logger.error(f"Error in SCRAPE_SOURCE: {e}")
            raise
