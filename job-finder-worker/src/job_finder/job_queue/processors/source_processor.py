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
from typing import Optional
from urllib.parse import urlparse

from job_finder.ai.providers import create_provider_from_config
from job_finder.ai.source_discovery import SourceDiscovery
from job_finder.exceptions import QueueProcessingError
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus, SourceStatus
from job_finder.job_queue.scraper_intake import ScraperIntake
from job_finder.scrapers.config_expander import expand_config
from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)

# Agent prompt for source discovery/scraping recovery tasks
SOURCE_AGENT_PROMPT = (
    "You are the primary agent for job source configuration recovery. "
    "The automated pipeline failed to discover or scrape this source. "
    "Your tasks: (1) analyze the source URL and determine the correct type "
    "(greenhouse, ashby, workday, lever, rss, api, or html), "
    "(2) generate a valid SourceConfig with correct selectors/endpoints, "
    "(3) test scrape to verify the config works, "
    "(4) if scraping failed, identify why and fix the config, "
    "(5) create or update the job-sources record with a working configuration."
)


class SourceProcessor(BaseProcessor):
    """Processor for source discovery and scraping queue items."""

    def __init__(
        self,
        queue_manager: QueueManager,
        config_loader: ConfigLoader,
        sources_manager: JobSourcesManager,
        companies_manager: CompaniesManager,
    ):
        """
        Initialize source processor with its specific dependencies.

        Args:
            queue_manager: Queue manager for updating item status
            config_loader: Configuration loader for AI settings
            sources_manager: Job sources manager
            companies_manager: Companies manager for company lookup/creation
        """
        super().__init__(queue_manager, config_loader)

        self.sources_manager = sources_manager
        self.companies_manager = companies_manager

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
            discovery_result = discovery.discover(url)
            if isinstance(discovery_result, tuple) and len(discovery_result) == 2:
                source_config, validation_meta = discovery_result
            else:
                source_config, validation_meta = discovery_result, {}

            if not source_config:
                # Recoverable: agent can manually configure the source
                self._handoff_to_agent_review(
                    item,
                    SOURCE_AGENT_PROMPT,
                    reason="Source discovery produced no config",
                    context={
                        "url": url,
                        "type_hint": config.type_hint,
                        "company_name": config.company_name,
                    },
                    status_message="Agent review required: discovery produced no config",
                )
                return

            # Extract company name
            company_name = config.company_name or source_config.get("company_name", "")
            if not company_name:
                company_name = self._extract_company_from_url(url)

            # Resolve company_id: look up existing company or create stub
            company_id = config.company_id
            company_created = False
            if not company_id and company_name:
                # Try to find or create company record
                company_website = self._extract_base_url(url)
                company_record = self.companies_manager.get_or_create_company(
                    company_name=company_name,
                    company_website=company_website,
                )
                company_id = company_record.get("id")
                # Check if this is a newly created stub (minimal data)
                company_created = not company_record.get("about")
                logger.info(
                    "Resolved company for source: %s -> %s (created=%s)",
                    company_name,
                    company_id,
                    company_created,
                )

            source_type = source_config.get("type", "unknown")

            # Determine confidence based on source type
            confidence = "high" if source_type in ("api", "rss") else "medium"

            # Create source
            source_name = f"{company_name} Jobs" if company_name else f"Source ({source_type})"

            needs_api_key = bool(validation_meta.get("needs_api_key"))
            disabled_notes = (
                "needs api key" if needs_api_key else source_config.get("disabled_notes", "")
            )
            initial_status = SourceStatus.DISABLED if needs_api_key else SourceStatus.ACTIVE
            if disabled_notes:
                source_config["disabled_notes"] = disabled_notes

            source_id = self.sources_manager.create_from_discovery(
                name=source_name,
                source_type=source_type,
                config=source_config,
                discovered_via=item.source or "user_submission",
                discovered_by=item.submitted_by,
                discovery_confidence=confidence,
                discovery_queue_item_id=item.id,
                company_id=company_id,
                company_name=company_name,
                status=initial_status,
            )

            if initial_status == SourceStatus.ACTIVE:
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
            else:
                logger.info(
                    "Created source %s disabled (%s); skipping immediate scrape",
                    source_id,
                    disabled_notes,
                )

            # If we created a new company stub, spawn COMPANY task to enrich it
            if company_created and company_id:
                company_website = self._extract_base_url(url)
                company_item = JobQueueItem(
                    type=QueueItemType.COMPANY,
                    url=company_website,
                    company_name=company_name,
                    company_id=company_id,
                    source="automated_scan",
                    tracking_id=item.tracking_id,
                    parent_item_id=item.id,
                )
                company_item_id = self.queue_manager.add_item(company_item)
                logger.info(
                    "Spawned COMPANY item %s to enrich stub for %s",
                    company_item_id,
                    company_name,
                )

            # Update queue item with success
            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                source_id,
                scraped_data={
                    "source_id": source_id,
                    "source_type": source_type,
                    "disabled_notes": disabled_notes or "",
                },
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

    def _extract_base_url(self, url: str) -> str:
        """Extract base URL (scheme + netloc) from a full URL."""
        try:
            parsed = urlparse(url)
            # For job board URLs like boards.greenhouse.io/company, try to get company website
            # For most cases, just return scheme + netloc
            if "greenhouse.io" in parsed.netloc or "lever.co" in parsed.netloc:
                # These are job board URLs, not company websites
                # Try to construct a likely company website
                path_parts = parsed.path.strip("/").split("/")
                if path_parts and path_parts[0]:
                    return f"https://{path_parts[0]}.com"
            if "ashbyhq.com" in parsed.netloc:
                path_parts = parsed.path.strip("/").split("/")
                if len(path_parts) >= 2:
                    return f"https://{path_parts[1]}.com"
            if "myworkdayjobs.com" in parsed.netloc:
                # Workday URLs are like company.wd5.myworkdayjobs.com
                tenant = parsed.netloc.split(".")[0]
                return f"https://{tenant}.com"
            return f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            return url

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
                # Get company name for override
                company_id = source.get("companyId") or source.get("company_id")
                company_name = (
                    source.get("companyName") or source.get("company_name") or source_name
                )

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

                # If scrape is sparse/empty, try AI self-heal to improve config, then retry once
                if self._is_sparse_jobs(jobs):
                    healed_config = self._self_heal_source_config(
                        source,
                        source_url or config.get("url") or item.url,
                        company_name,
                    )
                    if healed_config:
                        expanded_config = expand_config(source_type, healed_config)
                        source_config = SourceConfig.from_dict(
                            expanded_config, company_name=company_name
                        )
                        scraper = GenericScraper(source_config)
                        healed_jobs = scraper.scrape()

                        # Persist healed config only if it produces usable jobs
                        if healed_jobs and not self._is_sparse_jobs(healed_jobs):
                            self.sources_manager.update_config(source.get("id"), healed_config)
                            jobs = healed_jobs

                logger.info(f"Found {len(jobs)} jobs from {source_name}")

                # Submit jobs to queue
                if jobs and not self._is_sparse_jobs(jobs):
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
                    # Recoverable: agent can review and fix the source config
                    logger.info(f"Scrape yielded no usable jobs for {source_name}")
                    self._handoff_to_agent_review(
                        item,
                        SOURCE_AGENT_PROMPT,
                        reason="Scrape produced no usable jobs",
                        context={
                            "source_id": source.get("id"),
                            "source_name": source_name,
                            "source_type": source_type,
                            "config": config,
                            "jobs_found": len(jobs) if jobs else 0,
                        },
                        status_message="Agent review required: scrape produced no usable jobs",
                    )

            except Exception as scrape_error:
                # Recoverable: agent can investigate and fix the issue
                logger.error(f"Error scraping source {source_name}: {scrape_error}")
                self.sources_manager.record_scraping_failure(
                    source_id=source.get("id"),
                    error_message=str(scrape_error),
                )
                self._handoff_to_agent_review(
                    item,
                    SOURCE_AGENT_PROMPT,
                    reason="Source scrape failed",
                    context={
                        "source_id": source.get("id"),
                        "source_name": source_name,
                        "error": str(scrape_error),
                        "traceback": traceback.format_exc(),
                    },
                    status_message=f"Agent review required: scraping failed: {str(scrape_error)}",
                )

        except Exception as e:
            logger.error(f"Error in SCRAPE_SOURCE: {e}")
            raise

    # ============================================================
    # HELPERS
    # ============================================================

    def _is_sparse_jobs(self, jobs: list) -> bool:
        """Detect whether scrape results are empty or missing key fields."""
        if not jobs:
            return True
        sample = jobs[0] or {}
        required_fields = ["title", "url", "description"]
        missing = [f for f in required_fields if not sample.get(f)]
        return bool(missing)

    def _self_heal_source_config(self, source: dict, url: str, company_name: str) -> Optional[dict]:
        """
        Use AI discovery to repair/improve a weak source config.

        Returns a new config dict or None if healing failed/disabled.
        """
        try:
            ai_settings = self.config_loader.get_ai_settings()
            provider = create_provider_from_config(ai_settings)
        except Exception as exc:  # pragma: no cover - defensive path
            logger.warning("AI provider unavailable for self-heal: %s", exc)
            return None

        discovery = SourceDiscovery(provider)
        discovery_result = discovery.discover(url)
        if isinstance(discovery_result, tuple):
            healed_config, validation_meta = discovery_result
        else:
            healed_config, validation_meta = discovery_result, {}

        if healed_config and validation_meta.get("success", True):
            logger.info(
                "Updated source config via self-heal for %s (id=%s)",
                company_name or source.get("name", "unknown"),
                source.get("id"),
            )
            return healed_config

        logger.info("Self-heal could not produce a better config for %s", url)
        return None
