"""
Scrape runner - selects sources and submits jobs to the queue.

Pre-filtering is applied at the intake stage:
1) chooses which sources to scrape (rotation/filters)
2) scrapes raw jobs from each source
3) pre-filters jobs using StrikeFilterEngine (excludes sales, old jobs, etc.)
4) enqueues only relevant jobs via ScraperIntake

This significantly reduces queue size and AI analysis costs by filtering
out obviously irrelevant jobs BEFORE they enter the queue.
"""

import logging
from typing import Any, Dict, List, Optional

from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.exceptions import ConfigurationError
from job_finder.filters.strike_filter_engine import StrikeFilterEngine
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import (
    JobQueueItem,
    QueueItemType,
    SourceDiscoveryConfig,
    SourceTypeHint,
)
from job_finder.job_queue.scraper_intake import ScraperIntake
from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig
from job_finder.storage import JobStorage
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager

logger = logging.getLogger(__name__)


class ScrapeRunner:
    """
    Runs scraping operations with custom configuration and enqueues jobs.

    Pre-filtering:
        Uses StrikeFilterEngine to pre-filter jobs BEFORE adding to queue.
        This prevents irrelevant jobs (sales roles, old jobs, wrong locations)
        from consuming queue resources and AI analysis costs.
    """

    def __init__(
        self,
        queue_manager: QueueManager,
        job_storage: JobStorage,
        companies_manager: CompaniesManager,
        sources_manager: JobSourcesManager,
        company_info_fetcher: CompanyInfoFetcher,
        filter_engine: Optional[StrikeFilterEngine] = None,
        config_loader: Optional[ConfigLoader] = None,
    ):
        self.queue_manager = queue_manager
        self.job_storage = job_storage
        self.companies_manager = companies_manager
        self.sources_manager = sources_manager
        self.company_info_fetcher = company_info_fetcher

        # Use provided filter engine or create one from config
        self.filter_engine: Optional[StrikeFilterEngine] = None
        if filter_engine:
            self.filter_engine = filter_engine
        elif config_loader:
            self.filter_engine = self._create_filter_engine(config_loader)
        else:
            # Try to create config loader from job_storage db_path
            try:
                loader = ConfigLoader(job_storage.db_path)
                self.filter_engine = self._create_filter_engine(loader)
            except Exception as e:
                logger.warning(f"Could not create filter engine: {e}. Pre-filtering disabled.")
                self.filter_engine = None

        self.scraper_intake = ScraperIntake(
            queue_manager=queue_manager,
            job_storage=job_storage,
            companies_manager=companies_manager,
            filter_engine=self.filter_engine,
        )

    def _create_filter_engine(self, config_loader: ConfigLoader) -> StrikeFilterEngine:
        """Create StrikeFilterEngine for pre-filtering scraped jobs."""
        job_filters = config_loader.get_job_filters()
        tech_ranks = config_loader.get_technology_ranks()
        return StrikeFilterEngine(job_filters, tech_ranks)

    def run_scrape(
        self,
        target_matches: Optional[int] = 5,
        max_sources: Optional[int] = 20,
        source_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Select sources and enqueue scraped jobs. Stats reflect enqueue counts,
        not matches (matching is deferred to the queue pipeline).
        """
        logger.info("=" * 70)
        logger.info("STARTING SCRAPE")
        logger.info("=" * 70)

        if target_matches is None:
            logger.info("Target matches: UNLIMITED (will scrape all allowed sources)")
        else:
            logger.info(f"Target matches: {target_matches}")

        if max_sources is None:
            logger.info("Max sources: UNLIMITED")
        else:
            logger.info(f"Max sources: {max_sources}")

        if source_ids:
            logger.info(f"Specific sources: {source_ids}")
        else:
            logger.info("Using all sources with rotation (oldest first)")

        sources = self._get_sources(max_sources, source_ids)
        logger.info(f"Found {len(sources)} sources to scrape")

        stats = {
            "sources_scraped": 0,
            "total_jobs_found": 0,
            "jobs_submitted": 0,
            "errors": [],
        }

        potential_matches = 0

        for source in sources:
            if target_matches is not None and potential_matches >= target_matches:
                logger.info(f"\nReached target: {potential_matches} enqueued jobs, stopping")
                break

            try:
                source_stats = self._scrape_source(source)

                # Update source bookkeeping
                self.sources_manager.update_scrape_status(
                    source["id"],
                    status="success",
                    jobs_found=source_stats["jobs_found"],
                    jobs_matched=0,
                )

                stats["sources_scraped"] += 1
                stats["total_jobs_found"] += source_stats["jobs_found"]
                stats["jobs_submitted"] += source_stats["jobs_submitted"]
                potential_matches += source_stats["jobs_submitted"]

            except Exception as e:
                error_msg = f"Error processing {source.get('name')}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                stats["errors"].append(error_msg)
                self.sources_manager.update_scrape_status(
                    source["id"], status="error", error=str(e)
                )

        logger.info("\n" + "=" * 70)
        logger.info("SCRAPE COMPLETE")
        logger.info("=" * 70)
        logger.info(f"  Sources scraped: {stats['sources_scraped']}")
        logger.info(f"  Total jobs found: {stats['total_jobs_found']}")
        logger.info(f"  Jobs submitted to queue: {stats['jobs_submitted']}")

        if stats["errors"]:
            logger.warning(f"\n  Errors: {len(stats['errors'])}")
            for error in stats["errors"]:
                logger.warning(f"  - {error}")

        return stats

    def _get_sources(
        self, max_sources: Optional[int], source_ids: Optional[List[str]]
    ) -> List[Dict[str, Any]]:
        if source_ids:
            sources = []
            for source_id in source_ids:
                source = self.sources_manager.get_source_by_id(source_id)
                if source:
                    sources.append(source)
                else:
                    logger.warning(f"Source not found: {source_id}")
            if max_sources is not None:
                return sources[: max_sources]
            return sources
        return self._get_next_sources_by_rotation(max_sources)

    def _get_next_sources_by_rotation(self, limit: Optional[int]) -> List[Dict[str, Any]]:
        """
        Get sources sorted by chronological rotation (oldest scraped first).

        Simple fair rotation - each source gets scraped in turn based on
        when it was last scraped. Never-scraped sources come first.
        """
        from datetime import datetime, timezone

        sources = self.sources_manager.get_active_sources()
        min_datetime = datetime(1970, 1, 1, tzinfo=timezone.utc)

        def get_last_scraped(source: Dict[str, Any]) -> datetime:
            last_scraped_str = source.get("lastScrapedAt") or source.get("scraped_at")
            if last_scraped_str:
                try:
                    return datetime.fromisoformat(last_scraped_str.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    return min_datetime
            return min_datetime

        # Sort by last_scraped ascending (oldest first, never-scraped first)
        sources.sort(key=get_last_scraped)

        if limit is None:
            return sources
        return sources[:limit]

    def _scrape_source(self, source: Dict[str, Any]) -> Dict[str, Any]:
        """
        Scrape a single source using GenericScraper.

        Args:
            source: Source configuration from job_sources table

        Returns:
            Stats dict with jobs_found and jobs_submitted counts
        """
        source_name = source.get("name", "Unknown")
        config = source.get("config", {})

        # Get company metadata
        company_id = source.get("company_id") or source.get("companyId")
        company_name = source.get("company_name") or source_name
        if company_id:
            company = self.companies_manager.get_company_by_id(company_id)
            if company:
                company_name = company.get("name") or company_name

        logger.info(f"\nScraping source: {source_name}")

        stats = {
            "jobs_found": 0,
            "jobs_submitted": 0,
        }

        # Check if config has new format (type field)
        if "type" not in config:
            # Config needs migration - spawn discovery
            logger.warning(f"Source '{source_name}' has legacy config format. Spawning discovery.")
            self._spawn_source_discovery(
                url=source.get("url") or config.get("url") or config.get("base_url", ""),
                company_id=company_id,
                company_name=company_name,
                discovered_via=source.get("discovered_via") or "config_migration",
            )
            return stats

        # Validate config has required fields
        if "url" not in config:
            raise ConfigurationError(f"Source {source_name} missing 'url' in config")
        if "fields" not in config:
            raise ConfigurationError(f"Source {source_name} missing 'fields' in config")

        # Create SourceConfig with company name override
        try:
            source_config = SourceConfig.from_dict(config, company_name=company_name)
        except Exception as e:
            raise ConfigurationError(f"Invalid config for source {source_name}: {e}")

        # Scrape using GenericScraper
        scraper = GenericScraper(source_config)
        jobs = scraper.scrape()

        stats["jobs_found"] = len(jobs)
        logger.info(f"  Found {len(jobs)} jobs")

        if not jobs:
            return stats

        # Submit jobs to queue
        source_type = config.get("type", "unknown")
        source_label = f"{source_type}:{source_name}"
        jobs_submitted = self.scraper_intake.submit_jobs(
            jobs=jobs,
            source="scraper",
            source_id=source.get("id"),
            source_label=source_label,
            source_type=source_type,
            company_id=company_id,
        )
        stats["jobs_submitted"] = jobs_submitted
        logger.info(f"  Submitted {jobs_submitted} jobs to queue from {source_name}")

        return stats

    # ------------------------------------------------------------
    # Discovery spawn helper
    # ------------------------------------------------------------

    def _spawn_source_discovery(
        self,
        url: str,
        company_id: Optional[str],
        company_name: Optional[str],
        discovered_via: str,
    ) -> None:
        """Spawn a SOURCE_DISCOVERY queue item for a URL."""
        if not url:
            logger.warning("Cannot spawn discovery without URL")
            return

        discovery_config = SourceDiscoveryConfig(
            url=url,
            company_id=company_id,
            company_name=company_name,
            type_hint=SourceTypeHint.AUTO,
            validation_required=True,
        )

        discovery_item = JobQueueItem(
            type=QueueItemType.SOURCE_DISCOVERY,
            url=url,
            company_name=company_name or "",
            source=discovered_via,
            source_discovery_config=discovery_config,
        )

        discovery_id = self.queue_manager.add_item(discovery_item)
        logger.info(
            "Spawned SOURCE_DISCOVERY %s for url=%s company=%s",
            discovery_id,
            url,
            company_name,
        )
