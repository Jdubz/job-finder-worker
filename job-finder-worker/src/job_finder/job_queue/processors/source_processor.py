"""Source queue item processor.

This processor handles all source-related queue items:
- Source discovery (auto-detect type and generate config)
- Source scraping (fetch jobs from configured sources)

All sources use the GenericScraper with unified SourceConfig format.
"""

import logging
import re
import traceback
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from job_finder.ai.agent_manager import AgentManager
from job_finder.ai.source_discovery import SourceDiscovery
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

        # Set PROCESSING status at the start
        self.queue_manager.update_status(
            item.id, QueueStatus.PROCESSING, f"Discovering source at {url}"
        )

        try:
            # Run AI-powered discovery (AgentManager handles fallbacks internally)
            discovery = SourceDiscovery(self.agent_manager)
            discovery_result = discovery.discover(url)
            if isinstance(discovery_result, tuple) and len(discovery_result) == 2:
                source_config, validation_meta = discovery_result
            else:
                source_config, validation_meta = discovery_result, {}

            # Detect if this is an aggregator based on URL
            aggregator_domain = self._detect_aggregator_domain(url)

            # Extract company info
            company_id = config.company_id
            company_created = False

            # Try to resolve company name regardless of aggregator so we can build unique names
            company_name = config.company_name or (
                source_config.get("company_name", "") if source_config else ""
            )
            if not company_name and config.company_id:
                company_record = self.companies_manager.get_company_by_id(config.company_id)
                if company_record:
                    company_name = company_record.get("name")

            if not source_config:
                error = validation_meta.get("error", "discovery_failed")
                error_details = validation_meta.get("error_details", "")

                normalized_reason = error or "discovery_failed"
                if isinstance(error_details, str):
                    details_lower = error_details.lower()
                    if normalized_reason == "discovery_failed":
                        if "cloudflare" in details_lower or "vercel" in details_lower:
                            normalized_reason = "bot_protection"
                    elif normalized_reason == "api_probe_failed" and "resolve" in details_lower:
                        normalized_reason = "dns_error"

                placeholder_config = {
                    "type": "html",
                    "url": url,
                    "headers": {},
                    "disabled_notes": normalized_reason,
                }

                # Check for existing company+aggregator source to avoid duplicates
                existing_pair = None
                if company_id and aggregator_domain:
                    existing_pair = self.sources_manager.get_source_by_company_and_aggregator(
                        company_id, aggregator_domain
                    )
                    if isinstance(existing_pair, dict) and existing_pair:
                        self._handle_existing_source(
                            item,
                            {
                                **existing_pair,
                                "disabledNotes": existing_pair.get("disabledNotes", ""),
                            },
                            context="placeholder",
                        )
                        return

                # Build a collision-resistant placeholder name
                if company_name and aggregator_domain:
                    placeholder_name = f"{company_name} Jobs ({aggregator_domain})"
                elif company_name:
                    placeholder_name = f"{company_name} Jobs"
                else:
                    placeholder_name = f"{urlparse(url).netloc} Jobs"

                source_id = self.sources_manager.create_from_discovery(
                    name=placeholder_name,
                    source_type=placeholder_config.get("type", "unknown"),
                    config=placeholder_config,
                    company_id=company_id,
                    aggregator_domain=aggregator_domain,
                    status=SourceStatus.DISABLED,
                )

                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.SUCCESS,
                    f"Source created disabled: {normalized_reason}",
                    scraped_data={
                        "source_id": source_id,
                        "disabled_notes": normalized_reason,
                        "error_details": error_details,
                    },
                )
                return

            if not aggregator_domain:
                # This is a company-specific source, resolve company and create stub if needed
                if not company_name:
                    company_name = self._extract_company_from_url(url)

                if not company_id and company_name:
                    # Find or create company record (without setting website from source URL)
                    company_record = self.companies_manager.get_or_create_company(
                        company_name=company_name,
                        company_website=None,  # Let company enrichment find the real website
                    )
                    company_id = company_record.get("id")
                    company_created = not company_record.get("about")
                    logger.info(
                        "Resolved company for source: %s -> %s (created=%s)",
                        company_name,
                        company_id,
                        company_created,
                    )

            source_type = source_config.get("type", "unknown")

            # Create source name (keep aggregator + company to avoid collisions)
            if company_name and aggregator_domain:
                source_name = f"{company_name} Jobs ({aggregator_domain})"
            elif company_name:
                source_name = f"{company_name} Jobs"
            elif aggregator_domain:
                source_name = f"{aggregator_domain.split('.')[0].title()} Jobs"
            else:
                source_name = f"Source ({source_type})"

            needs_api_key = bool(validation_meta.get("needs_api_key"))
            disabled_notes = (
                "needs api key" if needs_api_key else source_config.get("disabled_notes", "")
            )
            initial_status = SourceStatus.DISABLED if needs_api_key else SourceStatus.ACTIVE
            if disabled_notes:
                source_config["disabled_notes"] = disabled_notes

            # Guard against duplicates on the (company, aggregator) pair before creating
            existing_pair = None
            if company_id and aggregator_domain:
                existing_pair = self.sources_manager.get_source_by_company_and_aggregator(
                    company_id, aggregator_domain
                )

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
                if not existing_pair and company_id and aggregator_domain:
                    existing_pair = self.sources_manager.get_source_by_company_and_aggregator(
                        company_id, aggregator_domain
                    )
                if existing_pair:
                    self._handle_existing_source(
                        item,
                        {**existing_pair, "disabledNotes": existing_pair.get("disabledNotes", "")},
                        context="race",
                    )
                    return
                raise

            if initial_status == SourceStatus.ACTIVE:
                # Spawn SCRAPE_SOURCE to immediately scrape the new source
                # Use spawn_item_safely for proper lineage tracking and dedup
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
                    logger.info(
                        f"Spawned SCRAPE_SOURCE item {scrape_item_id} for source {source_id}"
                    )
                else:
                    logger.info(f"SCRAPE_SOURCE blocked by spawn rules for source {source_id}")
            else:
                logger.info(
                    "Created source %s disabled (%s); skipping immediate scrape",
                    source_id,
                    disabled_notes,
                )

            # If we created a new company stub, spawn COMPANY task to enrich it
            if company_created and company_id:
                company_website = self._extract_base_url(url)
                # Use spawn_item_safely for proper lineage tracking and dedup
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
                    logger.info(
                        "COMPANY task blocked by spawn rules for %s",
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

    def _extract_base_url(self, url: str) -> str:
        """Extract base URL (scheme + domain) from a full URL."""
        try:
            parsed = urlparse(url)
            return f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            return url

    # Invalid names that should not be extracted as company names
    _INVALID_COMPANY_NAMES = frozenset(
        {
            "www",
            "api",
            "app",
            "dev",
            "staging",
            "jobs",
            "careers",
            "greenhouse",
            "lever",
            "smartrecruiters",
        }
    )

    # API path patterns: (domain_substring, path_regex)
    _API_PATH_PATTERNS = [
        ("greenhouse.io", r"/boards/([^/]+)"),
        ("lever.co", r"/postings/([^/?]+)"),
        ("smartrecruiters.com", r"/companies/([^/]+)"),
    ]

    # Host/subdomain patterns: (domain_substring, host_regex)
    _HOST_PATTERNS = [
        ("myworkdayjobs.com", r"([^.]+)\.wd\d*\."),
    ]

    def _extract_company_from_url(self, url: str) -> str:
        """Extract company name from URL.

        Handles various URL patterns:
        - Aggregator APIs: boards-api.greenhouse.io/v1/boards/COMPANY/jobs
        - Lever API: api.lever.co/v0/postings/COMPANY
        - SmartRecruiters: api.smartrecruiters.com/v1/companies/COMPANY/postings
        - Subdomain patterns: jobs.COMPANY.com, careers.COMPANY.com
        - Direct company sites: www.COMPANY.com/careers
        """
        try:
            parsed = urlparse(url.lower())
            host = parsed.netloc
            path = parsed.path

            # Check API path patterns (Greenhouse, Lever, SmartRecruiters)
            for domain_part, path_regex in self._API_PATH_PATTERNS:
                if domain_part in host:
                    match = re.search(path_regex, path)
                    if match:
                        return self._format_company_name(match.group(1))

            # Check host/subdomain patterns (Workday)
            for domain_part, host_regex in self._HOST_PATTERNS:
                if domain_part in host:
                    match = re.match(host_regex, host)
                    if match:
                        return self._format_company_name(match.group(1))

            # Pattern: jobs.X.com or careers.X.com subdomain pattern
            # e.g., jobs.dropbox.com -> Dropbox
            subdomain_match = re.match(r"(jobs?|careers?)\.([^.]+)\.", host)
            if subdomain_match:
                company_part = subdomain_match.group(2)
                if company_part not in self._INVALID_COMPANY_NAMES:
                    return self._format_company_name(company_part)

            # Fallback: Direct company site - extract from domain
            # e.g., www.toggl.com/jobs -> Toggl
            # Remove www. and common subdomains
            host = re.sub(r"^(www|api|app|jobs|careers)\.", "", host)
            # Get base domain (before TLD)
            domain_parts = host.split(".")
            if len(domain_parts) >= 2:
                # Handle .co.uk, .com.au etc.
                if domain_parts[-2] in {"co", "com", "org", "net"} and len(domain_parts) >= 3:
                    name = domain_parts[-3]
                else:
                    name = domain_parts[-2]

                if name and name not in self._INVALID_COMPANY_NAMES:
                    return self._format_company_name(name)

            return ""
        except Exception:
            return ""

    def _format_company_name(self, slug: str) -> str:
        """Format a URL slug into a proper company name.

        Args:
            slug: URL slug like 'anthropic', 'ge-vernova', 'acme_corp'

        Returns:
            Formatted name like 'Anthropic', 'GE Vernova', 'Acme Corp'
        """
        if not slug:
            return ""

        # Split on hyphens and underscores
        parts = re.split(r"[-_]", slug)
        capitalized = [part.capitalize() for part in parts if part]

        return " ".join(capitalized)

    def _detect_aggregator_domain(self, url: str) -> Optional[str]:
        """Detect if URL belongs to a known job aggregator.

        Delegates to JobSourcesManager.get_aggregator_domain_for_url() which uses
        database-driven aggregator domains from the job_sources table.

        Args:
            url: The source URL to check

        Returns:
            The aggregator domain if detected, None if company-specific
        """
        domain = self.sources_manager.get_aggregator_domain_for_url(url)
        if domain:
            return domain

        # Fallback: lightweight built-ins to avoid hard failures before DB seed
        fallback_domains = {"builtin.com"}
        try:
            host = urlparse(url.lower()).netloc
            for d in fallback_domains:
                if host == d or host.endswith("." + d):
                    return d
        except Exception as exc:
            logger.warning("Fallback aggregator detection failed for %s: %s", url, exc)

        return None

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
                logger.info("Skipping disabled source %s (%s)", source_name, source_id)
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
        Use AI discovery to repair/improve a weak source config.

        Returns a new config dict or None if healing failed/disabled.
        """
        discovery = SourceDiscovery(self.agent_manager)
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
