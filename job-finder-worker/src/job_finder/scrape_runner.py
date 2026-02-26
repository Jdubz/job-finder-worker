"""
Scrape runner - selects sources and submits jobs to the queue.

Pre-filtering is applied at the intake stage in two phases:
1) chooses which sources to scrape (rotation/filters)
2) scrapes raw jobs from each source
3) pre-filters jobs using TitleFilter (keyword-based title filtering)
4) pre-filters jobs using PreFilter (freshness, work arrangement, salary, etc.)
5) enqueues only relevant jobs via ScraperIntake

Jobs that fail EITHER filter are ignored entirely - no job_listing is created.
This significantly reduces queue size and AI analysis costs by filtering
out obviously unsuitable jobs BEFORE they enter the queue.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from typing import Any, Dict, List, Optional

from job_finder.exceptions import (
    ConfigurationError,
    ScrapeAuthError,
    ScrapeBlockedError,
    ScrapeBotProtectionError,
    ScrapeConfigError,
    ScrapeNotFoundError,
    ScrapeProtectedApiError,
    ScrapeTransientError,
)
from job_finder.filters.prefilter import PreFilter
from job_finder.filters.title_filter import TitleFilter
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import (
    JobQueueItem,
    QueueItemType,
    SourceDiscoveryConfig,
    SourceTypeHint,
)
from job_finder.job_queue.scraper_intake import ScraperIntake
from job_finder.scrapers.config_expander import expand_config
from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.platform_patterns import is_single_company_platform
from job_finder.scrapers.source_config import SourceConfig
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_listing_storage import JobListingStorage
from job_finder.storage.job_sources_manager import JobSourcesManager
from job_finder.storage.scrape_report_storage import ScrapeReportStorage

logger = logging.getLogger(__name__)
SOURCE_SCRAPE_TIMEOUT_SEC = 90  # watchdog per source to avoid hangs (JS render, huge APIs)
TRANSIENT_FAILURE_THRESHOLD = 3  # disable source after N consecutive recoverable failures
ZERO_JOBS_RECOVERY_THRESHOLD = (
    2  # spawn recovery after N consecutive zero-job runs (all source types)
)


class ScrapeRunner:
    """
    Runs scraping operations with custom configuration and enqueues jobs.

    Pre-filtering:
        Uses TitleFilter to pre-filter jobs BEFORE adding to queue.
        This prevents irrelevant jobs (sales roles, wrong job types)
        from consuming queue resources and AI analysis costs.
    """

    def __init__(
        self,
        queue_manager: QueueManager,
        job_listing_storage: JobListingStorage,
        companies_manager: CompaniesManager,
        sources_manager: JobSourcesManager,
        title_filter: Optional[TitleFilter] = None,
        config_loader: Optional[ConfigLoader] = None,
        scrape_report_storage: Optional[ScrapeReportStorage] = None,
    ):
        self.queue_manager = queue_manager
        self.job_listing_storage = job_listing_storage
        self.companies_manager = companies_manager
        self.sources_manager = sources_manager
        self.scrape_report_storage = scrape_report_storage

        # Use provided title filter or create filters from prefilter-policy
        self.title_filter: Optional[TitleFilter] = None
        self.prefilter: Optional[PreFilter] = None

        if title_filter:
            self.title_filter = title_filter
        elif config_loader:
            self.title_filter, self.prefilter = self._create_filters(config_loader)
        else:
            # Try to create config loader from job_listing_storage db_path
            try:
                loader = ConfigLoader(job_listing_storage.db_path)
                self.title_filter, self.prefilter = self._create_filters(loader)
            except Exception as e:
                logger.warning(f"Could not create filters: {e}. Pre-filtering disabled.")

        self.scraper_intake = ScraperIntake(
            queue_manager=queue_manager,
            job_listing_storage=job_listing_storage,
            companies_manager=companies_manager,
            title_filter=self.title_filter,
            prefilter=self.prefilter,
        )

    def _create_filters(
        self, config_loader: ConfigLoader
    ) -> tuple[Optional[TitleFilter], Optional[PreFilter]]:
        """Create TitleFilter and PreFilter for pre-filtering scraped jobs."""
        prefilter_policy = config_loader.get_prefilter_policy()
        if not isinstance(prefilter_policy, dict):
            return None, None

        title_cfg = prefilter_policy.get("title", {})
        title_filter = TitleFilter(title_cfg) if title_cfg else None

        # Create PreFilter with the full policy
        prefilter = PreFilter(prefilter_policy) if prefilter_policy else None

        return title_filter, prefilter

    def run_scrape(
        self,
        target_matches: Optional[int] = None,
        max_sources: Optional[int] = None,
        source_ids: Optional[List[str]] = None,
        trigger: str = "scheduled",
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

        # Create persistent scrape report
        report_id = None
        if self.scrape_report_storage:
            try:
                report_id = self.scrape_report_storage.create_report(trigger=trigger)
            except Exception as e:
                logger.warning("Failed to create scrape report: %s", e)

        stats = {
            "sources_scraped": 0,
            "total_jobs_found": 0,
            "jobs_submitted": 0,
            "total_duplicates": 0,
            "total_prefiltered": 0,
            "errors": [],
        }
        source_details: List[Dict[str, Any]] = []
        aggregate_filter_reasons: Dict[str, int] = {}
        scrape_failed = False

        potential_matches = 0

        try:
            for source in sources:
                if target_matches is not None and potential_matches >= target_matches:
                    logger.info(f"\nReached target: {potential_matches} enqueued jobs, stopping")
                    break

                source_detail: Dict[str, Any] = {
                    "source_id": source.get("id"),
                    "source_name": source.get("name"),
                    "source_type": source.get("sourceType", "api"),
                    "jobs_found": 0,
                    "jobs_submitted": 0,
                    "duplicates": 0,
                    "prefiltered": 0,
                    "filter_reasons": {},
                    "error": None,
                }

                try:
                    # Reset per-call stats so a zero-job source doesn't inherit
                    # the previous source's filter breakdown.
                    self.scraper_intake.last_submit_stats = None

                    remaining_needed = (
                        None
                        if target_matches is None
                        else max(target_matches - potential_matches, 0)
                    )
                    if remaining_needed == 0:
                        logger.info("Reached target before scraping next source; stopping early")
                        break

                    source_stats = self._scrape_source(source, remaining_needed)

                    # Update source bookkeeping
                    self.sources_manager.update_scrape_status(
                        source["id"],
                        status="success",
                    )
                    self._reset_consecutive_failures(source["id"])

                    # Capture per-source stats from intake
                    submit_stats = self.scraper_intake.last_submit_stats or {}
                    source_detail["jobs_found"] = source_stats["jobs_found"]
                    source_detail["jobs_submitted"] = source_stats["jobs_submitted"]
                    source_detail["duplicates"] = submit_stats.get("duplicates", 0)
                    source_detail["prefiltered"] = submit_stats.get("prefiltered", 0)
                    source_detail["filter_reasons"] = submit_stats.get("filter_reasons", {})

                    stats["sources_scraped"] += 1
                    stats["total_jobs_found"] += source_stats["jobs_found"]
                    stats["jobs_submitted"] += source_stats["jobs_submitted"]
                    stats["total_duplicates"] += source_detail["duplicates"]
                    stats["total_prefiltered"] += source_detail["prefiltered"]
                    potential_matches += source_stats["jobs_submitted"]

                    # Aggregate filter reasons
                    for reason, count in source_detail["filter_reasons"].items():
                        aggregate_filter_reasons[reason] = (
                            aggregate_filter_reasons.get(reason, 0) + count
                        )

                except (
                    ScrapeBotProtectionError,
                    ScrapeAuthError,
                    ScrapeProtectedApiError,
                ) as e:
                    # Permanent errors — disable immediately with tag
                    if isinstance(e, ScrapeBotProtectionError):
                        error_type_str = "Bot protection"
                        disable_reason_prefix = "Bot protection detected"
                        disable_tag = "anti_bot"
                    elif isinstance(e, ScrapeAuthError):
                        error_type_str = "Auth required"
                        disable_reason_prefix = "Authentication required"
                        disable_tag = "auth_required"
                    else:  # ScrapeProtectedApiError
                        error_type_str = "Protected API"
                        disable_reason_prefix = "Protected API"
                        disable_tag = "protected_api"

                    error_msg = f"{error_type_str}: {source.get('name')} - {e.reason}"
                    logger.warning(error_msg)
                    stats["errors"].append(error_msg)
                    source_detail["error"] = error_msg
                    self.sources_manager.disable_source_with_tags(
                        source["id"],
                        f"{disable_reason_prefix}: {e.reason}",
                        tags=[disable_tag],
                    )

                except (
                    ScrapeConfigError,
                    ScrapeNotFoundError,
                    ScrapeTransientError,
                ) as e:
                    # 429 with Retry-After: source is healthy, just rate-limited
                    if (
                        isinstance(e, ScrapeTransientError)
                        and e.retry_after is not None
                        and e.status_code == 429
                    ):
                        logger.warning(
                            "rate_limited: source=%s retry_after=%ss, skipping strike",
                            source.get("name"),
                            e.retry_after,
                        )
                        error_msg = str(e)
                        stats["errors"].append(error_msg)
                        source_detail["error"] = error_msg
                        source_details.append(source_detail)
                        continue

                    # Recoverable errors — strike system, disable after threshold
                    count = self._increment_consecutive_failures(source["id"])

                    if isinstance(e, ScrapeConfigError):
                        error_type_str = "Config error"
                        disable_reason_prefix = f"Config error ({count} consecutive)"
                    elif isinstance(e, ScrapeNotFoundError):
                        error_type_str = "Not found"
                        disable_reason_prefix = f"Endpoint not found ({count} consecutive)"
                    else:  # ScrapeTransientError
                        error_type_str = "Transient error"
                        disable_reason_prefix = f"Disabled after {count} transient errors"

                    error_msg = f"{error_type_str}: {source.get('name')} - {e.reason} (strike {count}/{TRANSIENT_FAILURE_THRESHOLD})"
                    logger.warning(error_msg)
                    stats["errors"].append(error_msg)
                    source_detail["error"] = error_msg

                    if count >= TRANSIENT_FAILURE_THRESHOLD:
                        self.sources_manager.disable_source_with_note(
                            source["id"],
                            f"{disable_reason_prefix}: {e.reason}",
                        )

                except ScrapeBlockedError as e:
                    # Base fallback for any other ScrapeBlockedError subclass
                    error_msg = f"Source blocked: {source.get('name')} - {e.reason}"
                    logger.warning(error_msg)
                    stats["errors"].append(error_msg)
                    source_detail["error"] = error_msg
                    if e.disable_tag:
                        self.sources_manager.disable_source_with_tags(
                            source["id"],
                            f"Blocked: {e.reason}",
                            tags=[e.disable_tag],
                        )
                    else:
                        self.sources_manager.disable_source_with_note(
                            source["id"],
                            f"Blocked: {e.reason}",
                        )

                except ConfigurationError as e:
                    # Invalid config - auto-disable to prevent repeated failures
                    error_msg = f"Config error for {source.get('name')}: {str(e)}"
                    logger.warning(error_msg)
                    stats["errors"].append(error_msg)
                    source_detail["error"] = error_msg
                    self.sources_manager.disable_source_with_note(
                        source["id"],
                        f"Invalid configuration: {str(e)}. Source needs manual review.",
                    )

                except Exception as e:
                    error_msg = f"Error processing {source.get('name')}: {str(e)}"
                    logger.error(error_msg, exc_info=True)
                    stats["errors"].append(error_msg)
                    source_detail["error"] = error_msg
                    self.sources_manager.update_scrape_status(
                        source["id"], status="error", error=str(e)
                    )

                source_details.append(source_detail)

        except Exception as e:
            # Unexpected error outside per-source handling — mark report as failed
            scrape_failed = True
            error_msg = f"Scrape run failed: {str(e)}"
            logger.error(error_msg, exc_info=True)
            stats["errors"].append(error_msg)

        logger.info("\n" + "=" * 70)
        logger.info("SCRAPE COMPLETE")
        logger.info("=" * 70)
        logger.info(f"  Sources scraped: {stats['sources_scraped']}")
        logger.info(f"  Total jobs found: {stats['total_jobs_found']}")
        logger.info(f"  Jobs submitted to queue: {stats['jobs_submitted']}")
        logger.info(f"  Duplicates skipped: {stats['total_duplicates']}")
        logger.info(f"  Pre-filtered: {stats['total_prefiltered']}")

        if aggregate_filter_reasons:
            reasons_str = ", ".join(
                f"{k}: {v}" for k, v in sorted(aggregate_filter_reasons.items())
            )
            logger.info(f"  Filter breakdown: {reasons_str}")

        if stats["errors"]:
            logger.warning(f"\n  Errors: {len(stats['errors'])}")
            for error in stats["errors"]:
                logger.warning(f"  - {error}")

        # Persist scrape report
        if self.scrape_report_storage and report_id:
            try:
                if scrape_failed:
                    self.scrape_report_storage.fail_report(report_id, stats["errors"])
                else:
                    self.scrape_report_storage.complete_report(
                        report_id=report_id,
                        sources_scraped=stats["sources_scraped"],
                        total_jobs_found=stats["total_jobs_found"],
                        total_jobs_submitted=stats["jobs_submitted"],
                        total_duplicates=stats["total_duplicates"],
                        total_prefiltered=stats["total_prefiltered"],
                        source_details=source_details,
                        filter_breakdown=aggregate_filter_reasons,
                        errors=stats["errors"],
                    )
                logger.info(f"  Scrape report saved: {report_id}")
            except Exception as e:
                logger.warning("Failed to save scrape report: %s", e)

        # Periodically re-test disabled sources for recovery
        # Only on full scheduled runs (no explicit source_ids)
        if trigger == "scheduled" and not source_ids:
            self._retry_disabled_sources()

        stats["report_id"] = report_id
        stats["source_details"] = source_details
        stats["filter_breakdown"] = aggregate_filter_reasons
        return stats

    def _increment_consecutive_failures(self, source_id: str) -> int:
        """
        Increment and return the consecutive failure count for a source.

        The count is stored in config.consecutive_failures and reset to 0
        on successful scrape. Used for recoverable errors (transient, config,
        not-found) to allow retries before disabling.
        """
        try:
            source = self.sources_manager.get_source_by_id(source_id)
            if not source:
                return 1

            config = source.get("config", {})
            current_count = config.get("consecutive_failures", 0)
            new_count = current_count + 1

            config["consecutive_failures"] = new_count
            self.sources_manager.update_config(source_id, config)

            return new_count

        except Exception as e:
            logger.warning("Failed to track consecutive failures for %s: %s", source_id, e)
            return 1

    def _reset_consecutive_failures(self, source_id: str) -> None:
        """Reset the consecutive failure count for a source after successful scrape."""
        try:
            source = self.sources_manager.get_source_by_id(source_id)
            if not source:
                return

            config = source.get("config", {})
            if config.get("consecutive_failures", 0) > 0:
                config["consecutive_failures"] = 0
                self.sources_manager.update_config(source_id, config)

        except Exception as e:
            logger.warning("Failed to reset consecutive failures for %s: %s", source_id, e)

    def _increment_zero_jobs(self, source: dict) -> None:
        """Track consecutive zero-job results for all source types; spawn recovery at threshold."""
        try:
            config = dict(source.get("config", {}))
            count = config.get("consecutive_zero_jobs", 0) + 1
            config["consecutive_zero_jobs"] = count
            self.sources_manager.update_config(source["id"], config)

            if count == ZERO_JOBS_RECOVERY_THRESHOLD:
                logger.warning(
                    "zero_jobs_recovery: source=%s has %d consecutive zero-job runs, "
                    "spawning recovery",
                    source.get("name", source["id"]),
                    count,
                )
                self._spawn_zero_jobs_recovery(source)
        except Exception as e:
            logger.warning("Failed to track zero-job count for %s: %s", source["id"], e)

    def _reset_zero_jobs(self, source: dict) -> None:
        """Reset zero-job counter after successful scrape."""
        config = dict(source.get("config", {}))
        if config.get("consecutive_zero_jobs", 0) > 0:
            config["consecutive_zero_jobs"] = 0
            self.sources_manager.update_config(source["id"], config)

    def _spawn_zero_jobs_recovery(self, source: dict) -> None:
        """Spawn SOURCE_RECOVER task for a source with persistent zero jobs."""
        try:
            item = JobQueueItem(
                type=QueueItemType.SOURCE_RECOVER,
                url=source.get("config", {}).get("url", ""),
                source_id=source["id"],
                input={
                    "error_reason": "zero_jobs",
                    "source_type": source.get("sourceType", "unknown"),
                    "triggered_by": "zero_jobs_threshold",
                },
            )
            self.queue_manager.add_item(item)
        except Exception as e:
            logger.error("Failed to spawn zero-jobs recovery for %s: %s", source["id"], e)

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
                return sources[:max_sources]
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

    def _scrape_source(
        self, source: Dict[str, Any], remaining_matches: Optional[int]
    ) -> Dict[str, Any]:
        """
        Scrape a single source using GenericScraper.

        Args:
            source: Source configuration from job_sources table

        Returns:
            Stats dict with jobs_found and jobs_submitted counts
        """
        source_name = source.get("name") or ""
        source_type = source.get("sourceType", "api")
        config = source.get("config", {})

        # Determine if this is an aggregator or company-specific source
        is_aggregator = bool(source.get("aggregator_domain") or source.get("aggregatorDomain"))
        company_id = source.get("company_id") or source.get("companyId")

        # Get company name ONLY from linked company - never fall back to source name
        company_name = None
        company_filter = None
        source_url = config.get("url", "")
        if company_id:
            company = self.companies_manager.get_company_by_id(company_id)
            if company:
                linked_company_name = company.get("name")
                if is_aggregator and not is_single_company_platform(source_url):
                    # For multi-company aggregators (Remotive, WeWorkRemotely, etc.)
                    # with a company_id, filter jobs by company name
                    company_filter = linked_company_name
                else:
                    # For non-aggregator sources OR single-company platforms
                    # (Lever, Ashby, Greenhouse, Breezy, etc.), override company name.
                    # Single-company platforms don't include a per-job company field,
                    # so filtering would incorrectly reject every job.
                    company_name = linked_company_name

        logger.info(f"\nScraping source: {source_name} (type={source_type})")

        stats = {
            "jobs_found": 0,
            "jobs_submitted": 0,
        }

        # Expand config based on source_type (converts simple configs to full scraper configs)
        try:
            expanded_config = expand_config(source_type, config)
        except ValueError as e:
            raise ConfigurationError(f"Invalid config for source {source_name}: {e}")

        # Validate expanded config has required fields
        if "url" not in expanded_config:
            raise ConfigurationError(f"Source {source_name} missing 'url' in config")
        if "fields" not in expanded_config:
            raise ConfigurationError(f"Source {source_name} missing 'fields' in config")

        if expanded_config.get("requires_js") and not expanded_config.get("render_wait_for"):
            logger.warning(
                "JS-rendered source %s missing render_wait_for selector; rendering may hang or miss jobs",
                source_name,
            )

        # Apply company filter for aggregator sources with a company_id
        if company_filter:
            expanded_config["company_filter"] = company_filter

        # Create SourceConfig with company name override
        try:
            source_config = SourceConfig.from_dict(expanded_config, company_name=company_name)
        except Exception as e:
            raise ConfigurationError(f"Invalid config for source {source_name}: {e}")

        # Scrape using GenericScraper with a per-source watchdog to avoid hangs
        if source_config.requires_js:
            logger.info(
                "  Rendering with JS enabled (wait for: %s)",
                getattr(source_config, "render_wait_for", None),
            )

        scraper = GenericScraper(source_config)

        def _run_scrape() -> List[Any]:
            return scraper.scrape()

        start = time.monotonic()
        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                jobs = pool.submit(_run_scrape).result(timeout=SOURCE_SCRAPE_TIMEOUT_SEC)
        except TimeoutError:
            elapsed = int(time.monotonic() - start)
            raise ConfigurationError(
                f"Source {source_name} timed out after {elapsed}s (possible render hang or slow API)"
            )

        stats["jobs_found"] = len(jobs)

        if not jobs:
            logger.warning(
                "zero_jobs: source=%s type=%s url=%s elapsed=%ss",
                source_name,
                source_config.type,
                source_config.url,
                int(time.monotonic() - start),
            )
            self._increment_zero_jobs(source)
            return stats

        logger.info("  Found %s jobs (elapsed=%ss)", len(jobs), int(time.monotonic() - start))

        # Reset zero-job counter on success
        self._reset_zero_jobs(source)

        # Submit jobs to queue - use source_type from database as the authoritative type
        source_label = f"{source_type}:{source_name}"
        jobs_submitted = self.scraper_intake.submit_jobs(
            jobs=jobs,
            source="scraper",
            source_id=source.get("id"),
            source_label=source_label,
            source_type=source_type,
            company_id=company_id,
            max_to_add=remaining_matches,
            is_remote_source=source_config.is_remote_source,
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

    # ------------------------------------------------------------
    # Disabled-source retry
    # ------------------------------------------------------------

    NON_RECOVERABLE_TAGS = ("anti_bot", "auth_required", "protected_api")

    def _retry_disabled_sources(self) -> int:
        """Spawn SOURCE_RECOVER tasks for a small batch of disabled sources.

        Selects up to 3 sources that have been disabled for at least 72 hours
        and do not carry non-recoverable tags.  This gives sites that
        previously caused failures a chance to be re-tested after fixes
        or transient issues resolve.

        Returns:
            Number of recovery tasks spawned.
        """
        try:
            sources = self.sources_manager.get_disabled_sources(
                exclude_tags=list(self.NON_RECOVERABLE_TAGS),
                min_disabled_hours=72,
                limit=3,
            )
        except Exception as e:
            logger.warning("Failed to fetch disabled sources for retry: %s", e)
            return 0

        spawned = 0
        for source in sources:
            try:
                item = JobQueueItem(
                    type=QueueItemType.SOURCE_RECOVER,
                    url=source.get("config", {}).get("url", ""),
                    source_id=source["id"],
                    input={
                        "error_reason": "periodic_retry",
                        "source_type": source.get("sourceType", "unknown"),
                        "triggered_by": "disabled_source_retry",
                    },
                )
                self.queue_manager.add_item(item)
                spawned += 1
                logger.info(
                    "Spawned disabled-source retry for %s (%s)",
                    source.get("name", source["id"]),
                    source["id"],
                )
            except Exception as e:
                logger.warning(
                    "Failed to spawn retry for disabled source %s: %s",
                    source["id"],
                    e,
                )
        if spawned:
            logger.info("Spawned %d disabled-source retry tasks", spawned)
        return spawned
