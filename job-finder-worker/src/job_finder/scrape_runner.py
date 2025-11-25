"""
Scrape runner - selects sources and submits jobs to the queue.

All filtering, AI analysis, and persistence now happen in the state-driven queue
pipeline (JOB items). This runner only:
1) chooses which sources to scrape (rotation/filters)
2) scrapes raw jobs from each source
3) enqueues those jobs via ScraperIntake
"""

import logging
from typing import Any, Dict, List, Optional

from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.exceptions import ConfigurationError
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.scraper_intake import ScraperIntake
from job_finder.scrapers.greenhouse_scraper import GreenhouseScraper
from job_finder.storage import JobStorage
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager

logger = logging.getLogger(__name__)


class ScrapeRunner:
    """
    Runs scraping operations with custom configuration and enqueues jobs.
    """

    def __init__(
        self,
        queue_manager: QueueManager,
        job_storage: JobStorage,
        companies_manager: CompaniesManager,
        sources_manager: JobSourcesManager,
        company_info_fetcher: CompanyInfoFetcher,
    ):
        self.queue_manager = queue_manager
        self.job_storage = job_storage
        self.companies_manager = companies_manager
        self.sources_manager = sources_manager
        self.company_info_fetcher = company_info_fetcher
        self.scraper_intake = ScraperIntake(
            queue_manager=queue_manager,
            job_storage=job_storage,
            companies_manager=companies_manager,
        )

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
        logger.info(f"✓ Found {len(sources)} sources to scrape")

        stats = {
            "sources_scraped": 0,
            "total_jobs_found": 0,
            "jobs_submitted": 0,
            "errors": [],
        }

        potential_matches = 0

        for source in sources:
            if target_matches is not None and potential_matches >= target_matches:
                logger.info(f"\n✅ Reached target: {potential_matches} enqueued jobs, stopping")
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
        logger.info("✅ SCRAPE COMPLETE")
        logger.info("=" * 70)
        logger.info(f"  Sources scraped: {stats['sources_scraped']}")
        logger.info(f"  Total jobs found: {stats['total_jobs_found']}")
        logger.info(f"  Jobs submitted to queue: {stats['jobs_submitted']}")

        if stats["errors"]:
            logger.warning(f"\n⚠️  Errors: {len(stats['errors'])}")
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
            return sources
        return self._get_next_sources_by_rotation(max_sources)

    def _get_next_sources_by_rotation(self, limit: Optional[int]) -> List[Dict[str, Any]]:
        from datetime import datetime, timezone
        from job_finder.utils.source_health import CompanyScrapeTracker

        sources = self.sources_manager.get_active_sources()
        scored_sources = []

        for source in sources:
            health = source.get("health", {})
            health_score = health.get("healthScore", 1.0)
            confidence = source.get("discoveryConfidence") or "medium"
            if confidence == "high":
                health_score = min(1.0, health_score + 0.05)
            elif confidence == "low":
                health_score = max(0.1, health_score - 0.1)
            tier = source.get("tier", "D")
            tier_priority = {"S": 0, "A": 1, "B": 2, "C": 3, "D": 4}.get(tier, 4)
            last_scraped = source.get("lastScrapedAt") or source.get("scraped_at")
            if last_scraped is None:
                last_scraped = datetime(1970, 1, 1, tzinfo=timezone.utc)

            company_id = source.get("company_id") or source.get("companyId", "")
            try:
                tracker = CompanyScrapeTracker(self.job_storage.db_path)
                company_scrape_freq = tracker.get_scrape_frequency(company_id)
            except Exception as e:
                logger.warning(f"Error getting company scrape frequency: {e}")
                company_scrape_freq = 0.0

            scored_sources.append(
                {
                    "source": source,
                    "health_score": health_score,
                    "tier_priority": tier_priority,
                    "last_scraped": last_scraped,
                    "company_scrape_freq": company_scrape_freq,
                }
            )

        scored_sources.sort(
            key=lambda x: (
                -x["health_score"],
                x["tier_priority"],
                x["last_scraped"],
                x["company_scrape_freq"],
            )
        )

        if limit is None:
            return [s["source"] for s in scored_sources]
        return [s["source"] for s in scored_sources[:limit]]

    def _scrape_source(self, source: Dict[str, Any]) -> Dict[str, Any]:
        source_type = source.get("sourceType")
        source_name = source.get("name", "Unknown")
        config = source.get("config", {})

        logger.info(f"\n📡 Scraping source: {source_name} ({source_type})")

        stats = {
            "jobs_found": 0,
            "jobs_submitted": 0,
        }

        jobs: List[Dict[str, Any]] = []
        if source_type == "greenhouse":
            board_token = config.get("board_token")
            if not board_token:
                raise ConfigurationError(f"Source {source_name} missing board_token in config")
            scraper = GreenhouseScraper(config)
            jobs = scraper.scrape()
        elif source_type == "rss":
            rss_url = config.get("url")
            if not rss_url:
                raise ConfigurationError(f"Source {source_name} missing url in config")
            from job_finder.scrapers.rss_scraper import RSSJobScraper

            scraper_rss = RSSJobScraper(rss_url, listing_config={})
            jobs = scraper_rss.scrape()
        else:
            logger.warning(f"Unsupported source type: {source_type}")
            return stats

        stats["jobs_found"] = len(jobs)
        logger.info(f"  Found {len(jobs)} jobs")

        if not jobs:
            return stats

        company_id = source.get("company_id") or source.get("companyId")
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
