"""Source queue item processor.

This processor handles all source-related queue items:
- Source discovery (auto-detect type and generate config)
- Source scraping (fetch jobs from configured sources)

All sources use the GenericScraper with unified SourceConfig format.
"""

import logging
import traceback
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

from job_finder.ai.agent_manager import AgentManager
from job_finder.ai.search_client import get_search_client
from job_finder.ai.source_analysis_agent import (
    DisableReason,
    SourceAnalysisAgent,
    SourceAnalysisResult,
    SourceClassification,
)
from job_finder.exceptions import DuplicateSourceError, QueueProcessingError, ScrapeBlockedError
from job_finder.filters.prefilter import PreFilter
from job_finder.filters.title_filter import TitleFilter
from job_finder.job_queue.models import (
    JobQueueItem,
    ProcessorContext,
    QueueItemType,
    QueueStatus,
    SourceStatus,
)
from job_finder.job_queue.scraper_intake import ScraperIntake
from job_finder.scrapers.config_expander import expand_config
from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)


class SourceProcessor(BaseProcessor):
    """Processor for source discovery and scraping queue items."""

    def __init__(self, ctx: ProcessorContext):
        """
        Initialize source processor with ProcessorContext.

        Args:
            ctx: ProcessorContext containing all required dependencies
        """
        super().__init__(ctx)

        self.sources_manager = ctx.sources_manager
        self.companies_manager = ctx.companies_manager
        self.agent_manager = AgentManager(ctx.config_loader)

        # Create filters from prefilter-policy for early rejection
        prefilter_policy = ctx.config_loader.get_prefilter_policy()
        title_cfg = prefilter_policy.get("title", {}) if isinstance(prefilter_policy, dict) else {}
        self.title_filter = TitleFilter(title_cfg) if title_cfg else None
        self.prefilter = PreFilter(prefilter_policy) if prefilter_policy else None

        # Initialize scraper intake with filters to pre-filter jobs at intake
        self.scraper_intake = ScraperIntake(
            queue_manager=ctx.queue_manager,
            title_filter=self.title_filter,
            prefilter=self.prefilter,
        )

    def _handle_existing_source(
        self, item: JobQueueItem, existing_source: Dict[str, Any], context: str
    ) -> None:
        """Log and mark queue item success when an existing source is reused."""

        source_id = existing_source.get("id")
        logger.info("Discovery reuse (%s): source already exists (%s)", context, source_id)
        self.queue_manager.update_status(
            item.id,
            QueueStatus.SUCCESS,
            f"Source already exists: {existing_source.get('name')}",
            scraped_data={
                "source_id": source_id,
                "source_type": existing_source.get("sourceType"),
                "disabled_notes": existing_source.get("disabledNotes", ""),
            },
        )

    # ============================================================
    # SOURCE DISCOVERY
    # ============================================================

    def process_source_discovery(self, item: JobQueueItem) -> None:
        """
        Process SOURCE_DISCOVERY queue item using intelligent agent-based analysis.

        This method uses the SourceAnalysisAgent to intelligently classify and
        analyze sources, replacing fragile pattern matching with AI reasoning.

        Flow:
        1. Gather context (fetch attempt, search results)
        2. Run AI analysis to classify the source
        3. Use classification to properly set company_id / aggregator_domain
        4. Create source with meaningful disable notes if needed
        5. Spawn follow-up tasks if source is active

        Args:
            item: Queue item with source_discovery_config
        """
        if not item.id or not item.source_discovery_config:
            logger.error("Cannot process SOURCE_DISCOVERY without ID or config")
            return

        config = item.source_discovery_config
        url = config.url

        logger.info(f"SOURCE_DISCOVERY: Processing {url}")

        # Set PROCESSING status at the start
        self.queue_manager.update_status(
            item.id, QueueStatus.PROCESSING, f"Analyzing source at {url}"
        )

        try:
            # Step 1: Gather context for the agent
            fetch_result = self._attempt_fetch(url)
            search_results = (
                self._gather_search_context(url) if not fetch_result.get("success") else None
            )

            # Step 2: Run intelligent agent analysis
            analysis_agent = SourceAnalysisAgent(self.agent_manager)
            analysis = analysis_agent.analyze(
                url=url,
                company_name=config.company_name,
                company_id=config.company_id,
                fetch_result=fetch_result,
                search_results=search_results,
            )

            logger.info(
                f"Source analysis: classification={analysis.classification.value}, "
                f"aggregator={analysis.aggregator_domain}, company={analysis.company_name}, "
                f"disable={analysis.should_disable}, confidence={analysis.confidence:.2f}"
            )

            # Step 3: Handle the analysis result
            result = self._handle_analysis_result(item, config, url, analysis, fetch_result)

            if result.get("handled"):
                return  # Already handled (e.g., existing source found)

            # Step 4: Create the source based on analysis
            source_id = result.get("source_id")
            if source_id:
                self._finalize_source_creation(
                    item=item,
                    source_id=source_id,
                    source_type=result.get("source_type", "unknown"),
                    company_id=result.get("company_id"),
                    company_name=result.get("company_name"),
                    company_created=result.get("company_created", False),
                    disabled_notes=result.get("disabled_notes", ""),
                    initial_status=result.get("initial_status", SourceStatus.ACTIVE),
                    url=url,
                )

        except Exception as e:
            logger.error(f"Error in SOURCE_DISCOVERY: {e}")
            self.queue_manager.update_status(
                item.id,
                QueueStatus.FAILED,
                str(e),
                error_details=traceback.format_exc(),
            )

    def _attempt_fetch(self, url: str) -> Dict[str, Any]:
        """Attempt to fetch URL content and return result context.

        Args:
            url: URL to fetch

        Returns:
            Dict with fetch result details for agent context
        """
        headers = {
            "User-Agent": "JobFinderBot/1.0",
            "Accept": "application/json, application/rss+xml, application/xml, text/xml, text/html, */*",
        }

        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            return {
                "success": True,
                "status_code": response.status_code,
                "content_type": response.headers.get("Content-Type", ""),
                "sample": response.text[:5000],  # Truncate for context
            }

        except requests.RequestException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            error_type = "fetch_error"

            if status in (401, 403):
                error_type = "auth_or_bot_protection"
            elif status == 429:
                error_type = "rate_limited"

            message = str(e).lower()
            if "name or service not known" in message or "dns" in message:
                error_type = "dns_error"

            logger.warning(f"Fetch failed for {url}: {error_type} ({e})")

            return {
                "success": False,
                "status_code": status,
                "error": error_type,
                "error_message": str(e),
            }

    def _gather_search_context(self, url: str) -> Optional[List[Dict[str, str]]]:
        """Gather search results about the URL/domain for agent context.

        Args:
            url: URL to search for information about

        Returns:
            List of search result dicts or None
        """
        search_client = get_search_client()
        if not search_client:
            return None

        domain = urlparse(url).netloc
        queries = [
            f"{domain} jobs api",
            f"{domain} careers api documentation",
        ]

        results = []
        for query in queries:
            try:
                search_results = search_client.search(query, max_results=3)
                for r in search_results:
                    results.append(
                        {
                            "title": r.title,
                            "url": r.url,
                            "snippet": r.snippet,
                        }
                    )
                    logger.info(
                        f"Tavily search for '{query}' returned {len(search_results)} results"
                    )
            except Exception as e:
                logger.debug(f"Search failed for '{query}': {e}")

        return results if results else None

    def _handle_analysis_result(
        self,
        item: JobQueueItem,
        config: Any,
        url: str,
        analysis: SourceAnalysisResult,
        fetch_result: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Handle the source analysis result and prepare for source creation.

        The agent is the single source of truth for classification, company_name,
        and aggregator_domain. We trust its output completely.

        Args:
            item: The queue item being processed
            config: Source discovery config
            url: The source URL
            analysis: The analysis result from the agent
            fetch_result: The fetch attempt result

        Returns:
            Dict with handling result and source creation params
        """
        result: Dict[str, Any] = {"handled": False}

        # Trust the agent's analysis - it's the primary source of truth
        aggregator_domain = analysis.aggregator_domain
        company_name = config.company_name or analysis.company_name
        company_id = config.company_id
        company_created = False

        # If agent identified a company, resolve to company_id
        if company_name and not company_id:
            company_record = self.companies_manager.get_or_create_company(
                company_name=company_name,
                company_website=None,
            )
            company_id = company_record.get("id")
            company_created = not company_record.get("about")
            logger.info(
                "Resolved company for source: %s -> %s (created=%s)",
                company_name,
                company_id,
                company_created,
            )

        # Check for existing source to avoid duplicates
        if company_id and aggregator_domain:
            existing = self.sources_manager.get_source_by_company_and_aggregator(
                company_id, aggregator_domain
            )
            if existing:
                self._handle_existing_source(item, existing, context="duplicate")
                result["handled"] = True
                return result

        # Build source name
        if company_name and aggregator_domain:
            source_name = f"{company_name} Jobs ({aggregator_domain})"
        elif company_name:
            source_name = f"{company_name} Jobs"
        elif aggregator_domain:
            source_name = f"{aggregator_domain.split('.')[0].title()} Jobs"
        else:
            source_name = f"{urlparse(url).netloc} Jobs"

        # Determine if source should be disabled
        should_disable = analysis.should_disable
        disabled_notes = analysis.disable_notes

        # Handle invalid classifications
        if analysis.classification in (
            SourceClassification.SINGLE_JOB_LISTING,
            SourceClassification.ATS_PROVIDER_SITE,
            SourceClassification.INVALID,
        ):
            should_disable = True
            if not disabled_notes:
                disabled_notes = f"Invalid source type: {analysis.classification.value}"

        # Determine source config and type
        source_config = analysis.source_config or {
            "type": "html",
            "url": url,
            "headers": {},
        }
        source_type = source_config.get("type", "unknown")

        if should_disable:
            source_config["disabled_notes"] = disabled_notes

        # Create the source
        initial_status = SourceStatus.DISABLED if should_disable else SourceStatus.ACTIVE

        try:
            source_id = self.sources_manager.create_from_discovery(
                name=source_name,
                source_type=source_type,
                config=source_config,
                company_id=company_id,
                aggregator_domain=aggregator_domain,
                status=initial_status,
            )
        except DuplicateSourceError:
            # Race condition - check again
            if company_id and aggregator_domain:
                existing = self.sources_manager.get_source_by_company_and_aggregator(
                    company_id, aggregator_domain
                )
                if existing:
                    self._handle_existing_source(item, existing, context="race")
                    result["handled"] = True
                    return result
            raise

        result.update(
            {
                "source_id": source_id,
                "source_type": source_type,
                "company_id": company_id,
                "company_name": company_name,
                "company_created": company_created,
                "aggregator_domain": aggregator_domain,
                "disabled_notes": disabled_notes,
                "initial_status": initial_status,
            }
        )

        return result

    def _finalize_source_creation(
        self,
        item: JobQueueItem,
        source_id: str,
        source_type: str,
        company_id: Optional[str],
        company_name: Optional[str],
        company_created: bool,
        disabled_notes: str,
        initial_status: SourceStatus,
        url: str,
    ) -> None:
        """Finalize source creation with follow-up tasks.

        Args:
            item: The queue item
            source_id: Created source ID
            source_type: Source type (api, rss, html)
            company_id: Company ID if resolved
            company_name: Company name
            company_created: Whether company was newly created
            disabled_notes: Disable notes if any
            initial_status: Source status
            url: Original URL
        """
        if initial_status == SourceStatus.ACTIVE:
            # Spawn SCRAPE_SOURCE to immediately scrape
            scrape_item_id = self.queue_manager.spawn_item_safely(
                current_item=item,
                new_item_data={
                    "type": QueueItemType.SCRAPE_SOURCE,
                    "url": "",
                    "company_name": company_name or "",
                    "company_id": company_id,
                    "source": "automated_scan",
                    "source_id": source_id,
                    "scraped_data": {"source_id": source_id},
                },
            )
            if scrape_item_id:
                logger.info(f"Spawned SCRAPE_SOURCE item {scrape_item_id} for source {source_id}")
            else:
                logger.info(f"SCRAPE_SOURCE blocked by spawn rules for source {source_id}")
        else:
            logger.info(
                "Created source %s disabled (%s); skipping immediate scrape",
                source_id,
                disabled_notes,
            )

        # Spawn COMPANY task for new company stubs
        if company_created and company_id:
            company_website = self._extract_base_url(url)
            company_item_id = self.queue_manager.spawn_item_safely(
                current_item=item,
                new_item_data={
                    "type": QueueItemType.COMPANY,
                    "url": company_website,
                    "company_name": company_name,
                    "company_id": company_id,
                    "source": "automated_scan",
                },
            )
            if company_item_id:
                logger.info(
                    "Spawned COMPANY item %s to enrich stub for %s",
                    company_item_id,
                    company_name,
                )
            else:
                logger.info("COMPANY task blocked by spawn rules for %s", company_name)

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

    def _extract_base_url(self, url: str) -> str:
        """Extract base URL (scheme + domain) from a full URL."""
        try:
            parsed = urlparse(url)
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

        # Set PROCESSING status at the start
        self.queue_manager.update_status(
            item.id,
            QueueStatus.PROCESSING,
            f"Scraping source {source_id or source_url}",
        )

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

            source_name = source.get("name") or ""
            source_type = source.get("sourceType", "api")
            source_status = source.get("status") or source.get("statusValue")
            config = source.get("config", {})

            if source_status and str(source_status).lower() == SourceStatus.DISABLED.value:
                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.FAILED,
                    f"Source is disabled: {source_name}. Enable before scraping.",
                )
                logger.info("Skipping disabled source %s (%s)", source_name, source.get("id"))
                return

            # Self-heal FK relationships (company <-> source linkage)
            company_id_from_source = source.get("companyId") or source.get("company_id")
            company_id_from_item = item.company_id
            source_id = source.get("id")

            # Repair links if we have company_id from item but source isn't linked
            healed_company_id, _ = self.ensure_company_source_link(
                self.sources_manager,
                company_id=company_id_from_item or company_id_from_source,
                source_id=source_id,
            )

            logger.info(f"Scraping source: {source_name} (type={source_type})")

            # Scrape using GenericScraper
            try:
                # Determine if this is an aggregator or company-specific source
                is_aggregator = bool(
                    source.get("aggregator_domain") or source.get("aggregatorDomain")
                )
                # Use healed company_id (may have been repaired via FK self-healing)
                company_id = healed_company_id

                # Get company name ONLY from linked company - never fall back to source name
                company_name = None
                if not is_aggregator and company_id:
                    company_record = self.companies_manager.get_company_by_id(company_id)
                    if company_record:
                        company_name = company_record.get("name")

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

                # Submit jobs to queue (if any found)
                jobs_added = 0
                if jobs and not self._is_sparse_jobs(jobs):
                    source_label = f"{source_type}:{source_name}"
                    jobs_added = self.scraper_intake.submit_jobs(
                        jobs=jobs,
                        source=source_label,
                        company_id=company_id,
                    )
                    logger.info(f"Submitted {jobs_added} jobs to queue from {source_name}")

                # Record success - the scrape completed (even if 0 jobs found)
                # Having no jobs is a valid state (company may have no openings)
                self.sources_manager.record_scraping_success(
                    source_id=source.get("id"),
                )

                jobs_found = len(jobs) if jobs else 0
                if jobs_found > 0:
                    result_msg = f"Scraped {jobs_found} jobs, submitted {jobs_added} to queue"
                else:
                    result_msg = f"Scrape completed, no jobs currently listed for {source_name}"
                    logger.info(result_msg)

                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.SUCCESS,
                    result_msg,
                    scraped_data={
                        "jobs_found": jobs_found,
                        "jobs_submitted": jobs_added,
                        "source_name": source_name,
                    },
                )

            except ScrapeBlockedError as blocked:
                # Anti-bot/HTTP block detected: disable source and mark item failed with note
                logger.warning("Source blocked: %s - %s", source_name, blocked.reason)
                self.sources_manager.disable_source_with_note(
                    source.get("id"), f"Blocked during scrape: {blocked.reason}"
                )
                self._update_item_status(
                    item.id,
                    QueueStatus.FAILED,
                    f"Source blocked: {blocked.reason}",
                    error_details=traceback.format_exc(),
                )

            except Exception as scrape_error:
                # Scrape failed - record failure and mark as failed
                logger.error(f"Error scraping source {source_name}: {scrape_error}")
                self.sources_manager.record_scraping_failure(
                    source_id=source.get("id"),
                    error_message=str(scrape_error),
                )
                self._update_item_status(
                    item.id,
                    QueueStatus.FAILED,
                    f"Scraping failed: {str(scrape_error)}",
                    error_details=traceback.format_exc(),
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
        Use AI analysis to repair/improve a weak source config.

        Returns a new config dict or None if healing failed/disabled.
        """
        try:
            # Gather context for the agent
            fetch_result = self._attempt_fetch(url)

            # Run analysis
            analysis_agent = SourceAnalysisAgent(self.agent_manager)
            analysis = analysis_agent.analyze(
                url=url,
                company_name=company_name,
                fetch_result=fetch_result,
            )

            if analysis.source_config and not analysis.should_disable:
                logger.info(
                    "Updated source config via self-heal for %s (id=%s)",
                    company_name or source.get("name", "unknown"),
                    source.get("id"),
                )
                return analysis.source_config

            logger.info("Self-heal could not produce a better config for %s", url)
            return None

        except Exception as e:
            logger.warning("Self-heal failed for %s: %s", url, e)
            return None
