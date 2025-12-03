"""Job queue item processor (single-task pipeline).

Processes a JOB item through the complete pipeline in a single task:
SCRAPE -> TITLE_FILTER -> PREFILTER -> [CREATE_LISTING] -> COMPANY_LOOKUP -> [WAIT_COMPANY] -> AI_EXTRACTION -> SCORING -> ANALYSIS -> SAVE_MATCH

Title filter and prefilter run BEFORE listing creation to avoid storing jobs that don't pass.
Jobs that fail the title filter or prefilter are ignored entirely - no storage, only queue status update.

PreFilter uses structured data from scraping (salary, work arrangement, employment type, etc.)
to reject obvious non-matches before wasting an AI extraction call. Missing data always PASSES.

All stages execute in-memory within a single task (no respawning).
This reduces database queries and maintains in-memory data throughout.

Company Dependency:
- Before AI extraction, checks if company has good data (has_good_company_data)
- If company data is sparse, spawns COMPANY task and requeues job to wait
- Job resumes when company data becomes available (or after max retries)

Job Listings Integration:
- Jobs are stored in job_listings table when they pass pre-filter (in scraper_intake)
- This processor updates job_listing status as jobs progress through pipeline
- Job matches reference job_listings via foreign key (job_listing_id)
"""

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, cast
from urllib.parse import urlparse, quote_plus

from job_finder.ai.extraction import JobExtractor, JobExtractionResult
from job_finder.ai.matcher import AIJobMatcher, JobMatchResult
from job_finder.ai.providers import create_provider_from_config
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.exceptions import DuplicateQueueItemError
from job_finder.filters.title_filter import TitleFilter, TitleFilterResult
from job_finder.filters.prefilter import PreFilter, PreFilterResult
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import (
    JobQueueItem,
    QueueItemType,
    QueueStatus,
)
from job_finder.job_queue.notifier import QueueEventNotifier
from job_finder.job_queue.scraper_intake import ScraperIntake
from job_finder.scoring.engine import ScoringEngine, ScoreBreakdown
from job_finder.scrape_runner import ScrapeRunner
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_listing_storage import JobListingStorage
from job_finder.storage.job_storage import JobStorage
from job_finder.storage.job_sources_manager import JobSourcesManager
from job_finder.utils.company_info import build_company_info_string
from job_finder.utils.company_name_utils import clean_company_name, is_source_name
from job_finder.utils.url_utils import normalize_url

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)

# Maximum number of times a job can wait for company data before proceeding anyway
MAX_COMPANY_WAIT_RETRIES = 3


@dataclass
class PipelineContext:
    """In-memory context passed through all pipeline stages."""

    item: JobQueueItem
    job_data: Optional[Dict[str, Any]] = None
    listing_id: Optional[str] = None
    title_filter_result: Optional[TitleFilterResult] = None
    prefilter_result: Optional[PreFilterResult] = None
    company_data: Optional[Dict[str, Any]] = None
    extraction: Optional[JobExtractionResult] = None
    score_result: Optional[ScoreBreakdown] = None
    match_result: Optional[JobMatchResult] = None
    error: Optional[str] = None
    stage: str = "init"


class JobProcessor(BaseProcessor):
    """Processor for job queue items using single-task pipeline."""

    # Known job board and aggregator domains (for URL detection)
    _JOB_BOARD_DOMAINS = frozenset(
        [
            # ATS providers
            "greenhouse.io",
            "lever.co",
            "myworkdayjobs.com",
            "workday.com",
            "smartrecruiters.com",
            "ashbyhq.com",
            "breezy.hr",
            "applytojob.com",
            "jobvite.com",
            "icims.com",
            "ultipro.com",
            "taleo.net",
            # Job aggregators
            "weworkremotely.com",
            "remotive.com",
            "remotive.io",
            "remote.co",
            "remoteok.com",
            "remoteok.io",
            "jbicy.io",
            "flexjobs.com",
            "wellfound.com",
            "angel.co",
            "ycombinator.com",
            "workatastartup.com",
        ]
    )

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
        notifier: Optional[QueueEventNotifier] = None,
    ):
        """
        Initialize job processor with its specific dependencies.

        Args:
            queue_manager: Queue manager for updating item status
            config_loader: Configuration loader for stop lists and filters
            job_storage: Job storage for saving matches (references job_listings)
            job_listing_storage: Job listing storage for tracking all discovered jobs
            companies_manager: Company data manager
            sources_manager: Job sources manager
            company_info_fetcher: Company info fetcher (for ScrapeRunner)
            ai_matcher: AI job matcher
            notifier: Optional event notifier for WebSocket progress updates
        """
        super().__init__(queue_manager, config_loader)

        self.job_storage = job_storage
        self.job_listing_storage = job_listing_storage
        self.companies_manager = companies_manager
        self.sources_manager = sources_manager
        self.ai_matcher = ai_matcher
        self.company_info_fetcher = company_info_fetcher
        self.notifier = notifier

        # Initialize new hybrid pipeline components
        prefilter_policy = config_loader.get_prefilter_policy()
        title_filter_config = (
            prefilter_policy.get("title", {}) if isinstance(prefilter_policy, dict) else {}
        )
        self.title_filter = TitleFilter(title_filter_config)

        # Initialize prefilter - fails loud if not configured
        self.prefilter = PreFilter(prefilter_policy)

        match_policy = config_loader.get_match_policy()
        self.match_policy = match_policy
        self.scoring_engine = ScoringEngine(match_policy)

        # Initialize AI provider for extraction
        ai_settings = config_loader.get_ai_settings()
        extraction_provider = create_provider_from_config(ai_settings, task="jobMatch")
        self.extractor = JobExtractor(extraction_provider)

        # Initialize scrape runner with title filter for pre-filtering
        self.scrape_runner = ScrapeRunner(
            queue_manager=queue_manager,
            job_listing_storage=job_listing_storage,
            companies_manager=companies_manager,
            sources_manager=sources_manager,
            company_info_fetcher=company_info_fetcher,
            title_filter=self.title_filter,
        )

        # Initialize scraper intake with title filter for deduplication
        self.scraper_intake = ScraperIntake(
            queue_manager=queue_manager,
            job_listing_storage=job_listing_storage,
            companies_manager=companies_manager,
            title_filter=self.title_filter,
        )

    def _refresh_runtime_config(self) -> None:
        """Reload config-driven components so the next item uses fresh settings."""
        ai_settings = self.config_loader.get_ai_settings()
        prefilter_policy = self.config_loader.get_prefilter_policy()
        title_filter_config = (
            prefilter_policy.get("title", {}) if isinstance(prefilter_policy, dict) else {}
        )
        match_policy = self.config_loader.get_match_policy()

        # Rebuild title filter with latest config
        self.title_filter = TitleFilter(title_filter_config)

        # Rebuild prefilter with latest config
        self.prefilter = PreFilter(prefilter_policy)

        # Rebuild scoring engine with latest config
        self.match_policy = match_policy
        self.scoring_engine = ScoringEngine(match_policy)

        # Propagate new title filter into downstream helpers
        if hasattr(self.scrape_runner, "title_filter"):
            self.scrape_runner.title_filter = self.title_filter
        if hasattr(self.scraper_intake, "title_filter"):
            self.scraper_intake.title_filter = self.title_filter

        # Refresh AI providers per task
        extraction_provider = create_provider_from_config(ai_settings, task="jobMatch")
        self.extractor = JobExtractor(extraction_provider)
        self.ai_matcher.provider = create_provider_from_config(ai_settings, task="jobMatch")

        company_provider = create_provider_from_config(ai_settings, task="companyDiscovery")
        if hasattr(self.company_info_fetcher, "ai_provider"):
            self.company_info_fetcher.ai_provider = company_provider

        # Update AI matcher min score from match policy (required, no default)
        self.ai_matcher.min_match_score = match_policy["minScore"]

    def _emit_event(self, event: str, item_id: str, data: Dict[str, Any]) -> None:
        """Emit a pipeline progress event via WebSocket (if notifier is available)."""
        if self.notifier:
            try:
                self.notifier.send_event(event, {"itemId": item_id, **data})
            except Exception as e:
                logger.debug(f"Failed to emit event {event}: {e}")

    # ============================================================
    # JOB LISTING HELPERS
    # ============================================================

    def _get_or_create_job_listing(
        self, item: JobQueueItem, job_data: Dict[str, Any]
    ) -> Optional[str]:
        """
        Get existing job_listing_id from metadata or create a new listing.

        Returns job_listing_id or None if storage unavailable.
        """
        # Check if we already have a listing_id in metadata
        metadata = item.metadata or {}
        existing_id = metadata.get("job_listing_id")
        if existing_id:
            return existing_id

        # Check pipeline_state for listing_id
        state = item.pipeline_state or {}
        existing_id = state.get("job_listing_id")
        if existing_id:
            return existing_id

        # Try to get or create listing from URL
        normalized_url = normalize_url(item.url) if item.url else ""
        if not normalized_url:
            return None

        try:
            listing_id, created = self.job_listing_storage.get_or_create_listing(
                url=normalized_url,
                title=job_data.get("title", ""),
                company_name=job_data.get("company", ""),
                description=job_data.get("description", ""),
                source_id=item.source_id,
                company_id=item.company_id or job_data.get("company_id"),
                location=job_data.get("location"),
                salary_range=job_data.get("salary") or job_data.get("salary_range"),
                posted_date=job_data.get("posted_date"),
                status="pending",
            )
            if created:
                logger.debug("Created job listing %s for %s", listing_id, item.url)
            return listing_id
        except Exception as e:
            logger.warning("Failed to get/create job listing for %s: %s", item.url, e)
            return None

    def _update_listing_status(
        self,
        listing_id: Optional[str],
        status: str,
        filter_result: Optional[Dict[str, Any]] = None,
        analysis_result: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Update job listing status if listing_id is available."""
        if not listing_id:
            return
        try:
            self.job_listing_storage.update_status(
                listing_id, status, filter_result, analysis_result
            )
            logger.debug("Updated job listing %s status to %s", listing_id, status)
        except Exception as e:
            logger.warning("Failed to update listing %s status: %s", listing_id, e)

    # ============================================================
    # SINGLE-TASK PIPELINE
    # ============================================================

    def process_job(self, item: JobQueueItem) -> None:
        """
        Process job item through complete pipeline in a single task.

        Pipeline stages (all in-memory, no respawning):
        1. SCRAPE - Extract job data from URL
        2. TITLE_FILTER - Quick keyword-based filtering
        3. COMPANY_LOOKUP - Get/create company data
        4. AI_EXTRACTION - Extract semantic data (seniority, tech, etc.)
        5. SCORING - Deterministic scoring from config
        6. ANALYSIS - AI match analysis with reasoning
        7. SAVE_MATCH - Save to job_matches if above threshold

        Args:
            item: Job queue item
        """
        if not item.id:
            logger.error("Cannot process item without ID")
            return

        # Refresh config-driven components
        self._refresh_runtime_config()

        # Initialize pipeline context
        ctx = PipelineContext(item=item)

        # Bootstrap from existing state if available
        state = item.pipeline_state or {}
        if item.scraped_data:
            ctx.job_data = item.scraped_data
        elif "job_data" in state:
            ctx.job_data = state["job_data"]

        # Attach listing_id early so filtered/prefiltered exits can update
        # the existing job_listings row created during intake.
        metadata = item.metadata or {}
        ctx.listing_id = metadata.get("job_listing_id") or state.get("job_listing_id")

        self.slogger.queue_item_processing(
            item.id,
            "job",
            "processing",
            {"url": item.url, "pipeline": "single-task"},
        )

        start_time = time.monotonic()
        url_preview = (item.url or "")[:50]

        try:
            # STAGE 1: SCRAPE
            if not ctx.job_data:
                ctx.stage = "scrape"
                logger.info(f"[PIPELINE] {url_preview} -> SCRAPE")
                self._update_status(item, "Scraping job data", ctx.stage)
                ctx.job_data = self._execute_scrape(ctx)
                if not ctx.job_data:
                    self._finalize_failed(ctx, "Could not scrape job details from URL")
                    return

            # Emit scrape complete event
            self._emit_event(
                "job:scraped",
                item.id,
                {
                    "title": ctx.job_data.get("title", ""),
                    "company": ctx.job_data.get("company", ""),
                },
            )

            # STAGE 2: TITLE FILTER (run BEFORE creating listing to avoid wasting storage)
            ctx.stage = "filter"
            logger.info(f"[PIPELINE] {url_preview} -> TITLE_FILTER")
            self._update_status(item, "Filtering by title", ctx.stage)
            ctx.title_filter_result = self._execute_title_filter(ctx)
            if not ctx.title_filter_result.passed:
                self._emit_event(
                    "job:filtered",
                    item.id,
                    {
                        "passed": False,
                        "reason": ctx.title_filter_result.reason,
                    },
                )
                # Filtered jobs are NOT stored - just update queue status
                self._finalize_filtered(ctx)
                return

            # Emit filter passed event
            self._emit_event("job:filtered", item.id, {"passed": True})

            # STAGE 2.5: PREFILTER (structured data pre-filter before AI extraction)
            ctx.stage = "prefilter"
            logger.info(f"[PIPELINE] {url_preview} -> PREFILTER")
            self._update_status(item, "Pre-filtering structured data", ctx.stage)
            ctx.prefilter_result = self._execute_prefilter(ctx)
            if not ctx.prefilter_result.passed:
                self._emit_event(
                    "job:prefiltered",
                    item.id,
                    {
                        "passed": False,
                        "reason": ctx.prefilter_result.reason,
                        "checksPerformed": ctx.prefilter_result.checks_performed,
                        "checksSkipped": ctx.prefilter_result.checks_skipped,
                    },
                )
                # Prefiltered jobs are NOT stored - just update queue status
                self._finalize_prefiltered(ctx)
                return

            # Emit prefilter passed event
            self._emit_event(
                "job:prefiltered",
                item.id,
                {
                    "passed": True,
                    "checksPerformed": ctx.prefilter_result.checks_performed,
                    "checksSkipped": ctx.prefilter_result.checks_skipped,
                },
            )

            # Get/create job listing (only for jobs that passed title filter AND prefilter)
            ctx.listing_id = self._get_or_create_job_listing(item, ctx.job_data)

            # STAGE 3: COMPANY LOOKUP
            ctx.stage = "company"
            logger.info(f"[PIPELINE] {url_preview} -> COMPANY_LOOKUP")
            self._update_status(item, "Looking up company", ctx.stage)
            ctx.company_data = self._execute_company_lookup(ctx)

            # Emit company lookup event
            self._emit_event(
                "job:company_lookup",
                item.id,
                {
                    "company": ctx.job_data.get("company", ""),
                    "hasData": ctx.company_data is not None,
                },
            )

            # STAGE 3.5: COMPANY DEPENDENCY CHECK
            # Before AI extraction, ensure company has good data (not just a stub)
            company_ready = self._check_company_dependency(ctx, state)
            if not company_ready:
                # Job was requeued to wait for company enrichment
                return

            # STAGE 4: AI EXTRACTION
            ctx.stage = "extraction"
            logger.info(f"[PIPELINE] {url_preview} -> AI_EXTRACTION")
            self._update_status(item, "Extracting job data", ctx.stage)
            ctx.extraction = self._execute_ai_extraction(ctx)
            if not ctx.extraction:
                self._finalize_failed(ctx, "AI extraction returned no result")
                return

            # Emit extraction event
            self._emit_event(
                "job:extraction",
                item.id,
                {
                    "seniority": ctx.extraction.seniority,
                    "workArrangement": ctx.extraction.work_arrangement,
                    "technologies": (
                        ctx.extraction.technologies[:5] if ctx.extraction.technologies else []
                    ),
                },
            )

            # Update listing with extraction data
            self._update_listing_status(
                ctx.listing_id,
                "analyzing",
                filter_result={
                    "titleFilter": ctx.title_filter_result.to_dict(),
                    "extraction": ctx.extraction.to_dict(),
                },
            )

            # STAGE 5: DETERMINISTIC SCORING
            ctx.stage = "scoring"
            logger.info(f"[PIPELINE] {url_preview} -> SCORING")
            self._update_status(item, "Scoring job match", ctx.stage)
            ctx.score_result = self._execute_scoring(ctx)

            # Emit scoring event
            self._emit_event(
                "job:scoring",
                item.id,
                {
                    "score": ctx.score_result.final_score,
                    "passed": ctx.score_result.passed,
                    "adjustmentCount": len(ctx.score_result.adjustments),
                },
            )

            if not ctx.score_result.passed:
                self._finalize_skipped(
                    ctx, f"Scoring rejected: {ctx.score_result.rejection_reason}"
                )
                return

            # STAGE 6: AI MATCH ANALYSIS
            ctx.stage = "analysis"
            logger.info(f"[PIPELINE] {url_preview} -> AI_ANALYSIS")
            self._update_status(item, "Generating match analysis", ctx.stage)
            ctx.match_result = self._execute_match_analysis(ctx)
            if not ctx.match_result:
                self._finalize_skipped(ctx, "AI analysis returned no result")
                return

            # Emit analysis event
            self._emit_event(
                "job:analysis",
                item.id,
                {
                    "matchScore": ctx.match_result.match_score,
                    "priority": ctx.match_result.application_priority,
                },
            )

            # Check score threshold using deterministic score (not AI score)
            min_score = getattr(self.ai_matcher, "min_match_score", 0)
            if ctx.score_result.final_score < min_score:
                self._finalize_skipped(
                    ctx, f"Score {ctx.score_result.final_score} below threshold {min_score}"
                )
                return

            # STAGE 7: SAVE MATCH
            ctx.stage = "save"
            logger.info(f"[PIPELINE] {url_preview} -> SAVE_MATCH")
            self._update_status(item, "Saving job match", ctx.stage)
            doc_id = self._execute_save_match(ctx)

            # Emit saved event
            self._emit_event(
                "job:saved",
                item.id,
                {
                    "docId": doc_id,
                    "listingId": ctx.listing_id,
                    "matchScore": ctx.match_result.match_score,
                },
            )

            # SUCCESS!
            duration_ms = round((time.monotonic() - start_time) * 1000)
            logger.info(
                f"[PIPELINE] SUCCESS: {ctx.job_data.get('title')} at {ctx.job_data.get('company')} "
                f"(Score: {ctx.match_result.match_score}, ID: {doc_id}, Duration: {duration_ms}ms)"
            )

            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                f"Job matched and saved (ID: {doc_id}, Score: {ctx.match_result.match_score})",
                scraped_data=self._build_final_scraped_data(ctx),
            )

            self.slogger.queue_item_processing(
                item.id,
                "job",
                "completed",
                {
                    "url": item.url,
                    "match_score": ctx.match_result.match_score,
                    "doc_id": doc_id,
                    "duration_ms": duration_ms,
                },
            )

        except Exception as e:
            logger.error(f"[PIPELINE] ERROR in stage {ctx.stage}: {e}", exc_info=True)
            ctx.error = str(e)
            self._finalize_failed(ctx, f"Pipeline error in {ctx.stage}: {e}")

    # ============================================================
    # PIPELINE STAGE IMPLEMENTATIONS
    # ============================================================

    def _execute_scrape(self, ctx: PipelineContext) -> Optional[Dict[str, Any]]:
        """Execute scrape stage - extract job data from URL."""
        item = ctx.item

        # Check for manual job data in metadata
        manual_title = (item.metadata or {}).get("manualTitle")
        manual_desc = (item.metadata or {}).get("manualDescription")
        if manual_title or manual_desc:
            return {
                "title": manual_title or "",
                "description": manual_desc or "",
                "company": (item.metadata or {}).get("manualCompanyName")
                or item.company_name
                or "Unknown",
                "location": (item.metadata or {}).get("manualLocation") or "",
                "tech_stack": (item.metadata or {}).get("manualTechStack"),
                "url": item.url,
            }

        # Get source configuration
        source = self.sources_manager.get_source_for_url(item.url)

        if source:
            job_data = self._scrape_with_source_config(item.url, source)
            if job_data:
                return job_data

        # Fallback to generic scraping
        return self._scrape_job(item)

    def _execute_title_filter(self, ctx: PipelineContext) -> TitleFilterResult:
        """Execute title filter stage."""
        # Check for bypass
        if (ctx.item.metadata or {}).get("bypassFilter"):
            return TitleFilterResult(passed=True)

        title = (ctx.job_data or {}).get("title", "")
        return self.title_filter.filter(title)

    def _execute_prefilter(self, ctx: PipelineContext) -> PreFilterResult:
        """
        Execute structured data pre-filter stage.

        Uses available structured data from scraping to filter before AI extraction.
        Missing data always PASSES - we only reject when we have explicit data
        that violates the filter configuration.
        """
        # Check for bypass
        if (ctx.item.metadata or {}).get("bypassFilter"):
            return PreFilterResult(passed=True, checks_performed=[], checks_skipped=["all"])

        job_data = ctx.job_data or {}
        return self.prefilter.filter(job_data)

    def _execute_company_lookup(self, ctx: PipelineContext) -> Optional[Dict[str, Any]]:
        """
        Execute company lookup stage.

        Returns whatever company data is available - does NOT block for enrichment.
        """
        job_data = ctx.job_data
        item = ctx.item

        if job_data is None:
            return None

        company_name_raw = job_data.get("company", item.company_name)
        company_website = job_data.get("company_website") or self._extract_company_domain(item.url)

        company_name_base = company_name_raw if isinstance(company_name_raw, str) else ""
        company_name_clean = clean_company_name(company_name_base) or company_name_base.strip()

        if not company_name_clean:
            job_data["company"] = ""
            return None

        # Try to resolve via source linkage first
        source_resolution = self.sources_manager.resolve_company_from_source(
            source_id=item.source_id,
            company_name_raw=company_name_clean,
        )

        if source_resolution:
            if source_resolution["is_aggregator"]:
                # Job aggregator - mark it but continue to company lookup/creation
                # The source is an aggregator (e.g., Remotive, RemoteOK), but we still
                # want to discover the actual company from the job listing
                job_data["is_aggregator_source"] = True
                # Fall through to company lookup/creation below

            elif source_resolution["company_id"]:
                # Source has linked company
                actual_company_id = source_resolution["company_id"]
                company = self.companies_manager.get_company_by_id(actual_company_id)
                if company:
                    actual_company_name = company.get("name") or company_name_clean
                    job_data["company"] = actual_company_name
                    job_data["company_id"] = actual_company_id
                    return company

        # Check if company name is actually a source name (scraper bug)
        if is_source_name(company_name_clean):
            logger.warning(
                "Company name '%s' detected as source name - skipping company enrichment",
                company_name_clean,
            )
            job_data["company"] = company_name_clean
            job_data["company_id"] = None
            return None

        # Direct company lookup/creation
        job_data["company"] = company_name_clean
        company = self.companies_manager.get_company(company_name_clean)

        if not company:
            company = self.companies_manager.create_company_stub(
                company_name_clean, company_website
            )

        if company:
            company_id = company.get("id")
            job_data["company_id"] = company_id
            job_data["company_info"] = build_company_info_string(company)

            # Update listing with company_id
            if ctx.listing_id and company_id:
                self.job_listing_storage.update_company_id(ctx.listing_id, company_id)

        return company

    def _check_company_dependency(self, ctx: PipelineContext, state: Dict[str, Any]) -> bool:
        """
        Check if company data is ready before proceeding to AI extraction.

        If company data is sparse (just a stub), spawns a COMPANY task and requeues
        this job to wait. Returns True when company is ready, False if requeued.

        This prevents wasting AI extraction calls on jobs where we don't have
        good company context (remote-first, AI/ML focus, size, etc.).
        """
        company = ctx.company_data
        item = ctx.item
        job_data = ctx.job_data

        # No company data - proceed anyway (can't wait for nothing)
        if not company:
            return True

        company_id = company.get("id")
        company_name = job_data.get("company", "")

        # Company has good data - ready to proceed
        if self.companies_manager.has_good_company_data(company):
            logger.debug("Company %s has good data, proceeding to extraction", company_name)
            return True

        # Check wait retry count
        wait_count = state.get("company_wait_count", 0)

        if wait_count >= MAX_COMPANY_WAIT_RETRIES:
            # Exceeded max retries - proceed anyway with sparse data
            logger.warning(
                "Company %s still sparse after %d waits, proceeding with extraction",
                company_name,
                wait_count,
            )
            return True

        # Spawn company enrichment task (fire-and-forget)
        self._spawn_company_enrichment(ctx)

        # Requeue this job to wait for company data
        updated_state = {
            **state,
            "job_data": job_data,
            "waiting_for_company_id": company_id,
            "company_wait_count": wait_count + 1,
            "job_listing_id": ctx.listing_id,
        }

        self.queue_manager.requeue_with_state(item.id, updated_state)
        logger.info(
            "[PIPELINE] %s -> WAIT_COMPANY (attempt %d/%d for %s)",
            (item.url or "")[:50],
            wait_count + 1,
            MAX_COMPANY_WAIT_RETRIES,
            company_name,
        )

        # Emit wait event
        self._emit_event(
            "job:waiting_company",
            item.id,
            {
                "company": company_name,
                "companyId": company_id,
                "waitCount": wait_count + 1,
            },
        )

        return False

    def _spawn_company_enrichment(self, ctx: PipelineContext) -> None:
        """Spawn company enrichment task (fire-and-forget, non-blocking)."""
        company = ctx.company_data
        if not company:
            return

        company_id = company.get("id")
        company_name = ctx.job_data.get("company", "")

        # If the company already exists in our database, don't spawn enrichment here.
        # Automatic enrichment for known companies should be triggered explicitly (e.g. re-analysis UI),
        # not opportunistically from job processing. This prevents stampeding duplicate tasks.
        if company_id:
            logger.debug(
                "Skip company enrichment spawn for %s (%s): company already exists",
                company_name,
                company_id,
            )
            return

        if not company_name:
            return

        # Only spawn if company data is sparse
        if self.companies_manager.has_good_company_data(company):
            return

        # Prevent duplicate discovery tasks across different jobs
        if self.queue_manager.has_company_task(company_id, company_name=company_name):
            logger.debug(
                "Company enrichment already queued for %s (%s); skipping spawn",
                company_name,
                company_id,
            )
            return

        # Get company website, but reject aggregator URLs
        company_website = ctx.job_data.get("company_website", "")
        if company_website and self._is_job_board_url(company_website):
            company_website = ""

        # Don't fall back to extracting domain from job URL - that would give us
        # the aggregator domain for aggregator jobs

        # Use company-specific placeholder URL for uniqueness in the queue
        # This allows multiple companies to be queued even without knowing their website
        if company_website:
            company_url = company_website
        else:
            # Use a search query URL that's unique per company name
            company_url = f"https://www.google.com/search?q={quote_plus(company_name)}+company"

        try:
            self.queue_manager.spawn_item_safely(
                current_item=ctx.item,
                new_item_data={
                    "type": QueueItemType.COMPANY,
                    "url": company_url,
                    "company_name": company_name,
                    "company_id": company_id,
                    "source": ctx.item.source,
                },
            )
            logger.debug("Spawned company enrichment task for %s", company_name)
        except DuplicateQueueItemError:
            pass  # Already in queue
        except Exception as e:
            logger.warning("Failed to spawn company enrichment for %s: %s", company_name, e)

    def _execute_ai_extraction(self, ctx: PipelineContext) -> Optional[JobExtractionResult]:
        """Execute AI extraction stage."""
        job_data = ctx.job_data or {}
        title = job_data.get("title", "")
        description = job_data.get("description", "")
        location = job_data.get("location", "")
        posted_date = job_data.get("posted_date")

        try:
            extraction = self.extractor.extract(title, description, location, posted_date)
            logger.info(
                f"Extraction complete: seniority={extraction.seniority}, "
                f"arrangement={extraction.work_arrangement}, techs={len(extraction.technologies)}"
            )
            return extraction
        except Exception as e:
            logger.error(f"AI extraction failed: {e}")
            return None

    def _execute_scoring(self, ctx: PipelineContext) -> ScoreBreakdown:
        """Execute deterministic scoring stage."""
        if not ctx.extraction:
            return ScoreBreakdown(
                base_score=0,
                final_score=0,
                passed=False,
                rejection_reason="No extraction data available",
            )

        job_data = ctx.job_data or {}
        title = job_data.get("title", "")
        description = job_data.get("description", "")

        # Pass company_data to scoring engine for company signals
        score_result = self.scoring_engine.score(
            extraction=ctx.extraction,
            job_title=title,
            job_description=description,
            company_data=ctx.company_data,
        )

        logger.info(
            f"Scoring complete: score={score_result.final_score}, passed={score_result.passed}"
        )
        return score_result

    def _execute_match_analysis(self, ctx: PipelineContext) -> Optional[JobMatchResult]:
        """Execute AI match analysis stage."""
        job_data = ctx.job_data

        if job_data is None:
            return None

        # Enrich job_data with extraction and scoring info
        job_data_enriched = {
            **job_data,
            "extraction": ctx.extraction.to_dict() if ctx.extraction else {},
            "deterministic_score": ctx.score_result.final_score if ctx.score_result else 0,
        }

        try:
            result = self.ai_matcher.analyze_job(job_data_enriched, return_below_threshold=True)
            if result:
                logger.info(f"Match analysis complete: score={result.match_score}")
            return result
        except Exception as e:
            logger.error(f"AI match analysis failed: {e}")
            return None

    def _execute_save_match(self, ctx: PipelineContext) -> str:
        """Execute save match stage."""
        # Build merged analysis result
        merged_analysis = {
            "scoringResult": ctx.score_result.to_dict() if ctx.score_result else {},
            "detailedAnalysis": ctx.match_result.to_dict() if ctx.match_result else {},
        }

        # Update listing to matched status
        self._update_listing_status(
            ctx.listing_id,
            "matched",
            filter_result={
                "titleFilter": ctx.title_filter_result.to_dict() if ctx.title_filter_result else {},
                "extraction": ctx.extraction.to_dict() if ctx.extraction else {},
            },
            analysis_result=merged_analysis,
        )

        # Save to job_matches table
        doc_id = self.job_storage.save_job_match(
            job_listing_id=ctx.listing_id,
            match_result=ctx.match_result,
            user_id=None,
            queue_item_id=ctx.item.id,
        )

        logger.info(f"Job match saved: ID={doc_id}")
        return doc_id

    # ============================================================
    # PIPELINE FINALIZATION HELPERS
    # ============================================================

    def _update_status(self, item: JobQueueItem, message: str, stage: str) -> None:
        """Update queue item status with current stage."""
        self.queue_manager.update_status(
            item.id,
            QueueStatus.PROCESSING,
            message,
            pipeline_state={"pipeline_stage": stage},
        )

    def _finalize_early_rejection(
        self, ctx: PipelineContext, filter_type: str, rejection_reason: str
    ) -> None:
        """
        Finalize pipeline with FILTERED status due to early filter rejection.

        Used for both title filter and prefilter rejections. Filtered jobs are NOT
        stored in job_listings - they are rejected before the listing is created.
        Only the queue item status is updated.

        Args:
            ctx: Pipeline context
            filter_type: "title" or "prefilter" - determines log format and status message
            rejection_reason: The reason for rejection
        """
        job_data = ctx.job_data or {}
        title = job_data.get("title", "")

        # Log with filter-specific format
        if filter_type == "prefilter":
            checks = ctx.prefilter_result.checks_performed if ctx.prefilter_result else []
            logger.info(
                f"[PIPELINE] PREFILTERED: '{title}' - {rejection_reason} (checks: {checks})"
            )
            status_message = f"Prefilter rejected: {rejection_reason}"
        else:
            logger.info(f"[PIPELINE] FILTERED: '{title}' - {rejection_reason}")
            status_message = f"Rejected: {rejection_reason}"

        # Note: No listing created for filtered jobs - filters run before listing creation
        # If listing_id exists (legacy item), update its status
        if ctx.listing_id:
            filter_result: Dict[str, Any] = {
                "titleFilter": (
                    ctx.title_filter_result.to_dict() if ctx.title_filter_result else {}
                )
            }
            if ctx.prefilter_result:
                filter_result["prefilter"] = ctx.prefilter_result.to_dict()

            self._update_listing_status(ctx.listing_id, "filtered", filter_result=filter_result)

        # Spawn company/source tasks even for filtered jobs
        self._spawn_company_and_source(ctx.item, job_data)

        self.queue_manager.update_status(
            ctx.item.id,
            QueueStatus.FILTERED,
            status_message,
            scraped_data=self._build_final_scraped_data(ctx),
        )

    def _finalize_filtered(self, ctx: PipelineContext) -> None:
        """Finalize pipeline with FILTERED status due to title filter rejection."""
        rejection_reason = (
            ctx.title_filter_result.reason if ctx.title_filter_result else "Title filter rejected"
        )
        self._finalize_early_rejection(ctx, "title", rejection_reason)

    def _finalize_prefiltered(self, ctx: PipelineContext) -> None:
        """Finalize pipeline with FILTERED status due to prefilter rejection (prefiltered jobs are NOT stored in job_listings)."""
        rejection_reason = (
            ctx.prefilter_result.reason if ctx.prefilter_result else "Prefilter rejected"
        )
        self._finalize_early_rejection(ctx, "prefilter", rejection_reason)

    def _finalize_skipped(self, ctx: PipelineContext, reason: str) -> None:
        """Finalize pipeline with SKIPPED status."""
        job_data = ctx.job_data or {}
        logger.info(f"[PIPELINE] SKIPPED: '{job_data.get('title')}' - {reason}")

        # Build analysis result
        analysis_result: Dict[str, Any] = {}
        if ctx.score_result:
            analysis_result["scoringResult"] = ctx.score_result.to_dict()
        if ctx.match_result:
            analysis_result["detailedAnalysis"] = ctx.match_result.to_dict()

        # Update listing
        self._update_listing_status(
            ctx.listing_id,
            "skipped",
            filter_result={
                "titleFilter": ctx.title_filter_result.to_dict() if ctx.title_filter_result else {},
                "extraction": ctx.extraction.to_dict() if ctx.extraction else {},
            },
            analysis_result=analysis_result,
        )

        self.queue_manager.update_status(
            ctx.item.id,
            QueueStatus.SKIPPED,
            reason,
            scraped_data=self._build_final_scraped_data(ctx),
        )

    def _finalize_failed(self, ctx: PipelineContext, error: str) -> None:
        """Finalize pipeline with FAILED status."""
        job_data = ctx.job_data or {}
        logger.error(f"[PIPELINE] FAILED: '{job_data.get('title', ctx.item.url)}' - {error}")

        # Build whatever data we have
        filter_data: Dict[str, Any] = {}
        if ctx.title_filter_result:
            filter_data["titleFilter"] = ctx.title_filter_result.to_dict()
        if ctx.extraction:
            filter_data["extraction"] = ctx.extraction.to_dict()

        analysis_data: Dict[str, Any] = {"error": error}
        if ctx.score_result:
            analysis_data["scoringResult"] = ctx.score_result.to_dict()

        # Update listing if we have one
        if ctx.listing_id:
            self._update_listing_status(
                ctx.listing_id,
                "skipped",
                filter_result=filter_data if filter_data else None,
                analysis_result=analysis_data,
            )

        self.queue_manager.update_status(
            ctx.item.id,
            QueueStatus.FAILED,
            error,
            scraped_data=self._build_final_scraped_data(ctx),
        )

    def _build_final_scraped_data(self, ctx: PipelineContext) -> Dict[str, Any]:
        """Build final scraped_data dict for queue item."""
        data: Dict[str, Any] = {}
        if ctx.job_data:
            data["job_data"] = ctx.job_data
        if ctx.title_filter_result or ctx.prefilter_result:
            data["filter_result"] = {}
            if ctx.title_filter_result:
                data["filter_result"]["titleFilter"] = ctx.title_filter_result.to_dict()
            if ctx.prefilter_result:
                data["filter_result"]["prefilter"] = ctx.prefilter_result.to_dict()
            if ctx.extraction:
                data["filter_result"]["extraction"] = ctx.extraction.to_dict()
        if ctx.score_result:
            data["analysis_result"] = {"scoringResult": ctx.score_result.to_dict()}
            if ctx.match_result:
                data["analysis_result"]["detailedAnalysis"] = ctx.match_result.to_dict()
        return data

    def _spawn_company_and_source(self, item: JobQueueItem, job_data: Dict[str, Any]) -> None:
        """Ensure company stub exists and spawn COMPANY and SOURCE_DISCOVERY tasks."""
        company_name = job_data.get("company") or item.company_name or "Unknown"

        # Get company website, but reject aggregator URLs
        company_website = job_data.get("company_website", "")
        if company_website and self._is_job_board_url(company_website):
            company_website = ""

        company = self.companies_manager.get_company(
            company_name
        ) or self.companies_manager.create_company_stub(company_name, company_website or "")

        company_id = company.get("id") if company else None

        # Spawn company enrichment task
        if company_id:
            try:
                # Use company website if available, otherwise use a search query unique per company
                company_url = (
                    company_website
                    or f"https://www.google.com/search?q={quote_plus(company_name)}+company"
                )
                self.queue_manager.spawn_item_safely(
                    item,
                    {
                        "type": QueueItemType.COMPANY,
                        "url": company_url,
                        "company_name": company_name,
                        "company_id": company_id,
                        "source": item.source,
                    },
                )
            except Exception as e:
                logger.warning("Failed to spawn company task for %s: %s", company_name, e)

        # Spawn source discovery task - only if we have a non-aggregator company website
        if company_website:
            try:
                self.queue_manager.spawn_item_safely(
                    item,
                    {
                        "type": QueueItemType.SOURCE_DISCOVERY,
                        "url": company_website,
                        "company_name": company_name,
                        "company_id": company_id,
                        "source": item.source,
                    },
                )
            except Exception as e:
                logger.warning("Failed to spawn source discovery for %s: %s", company_name, e)

    # ============================================================
    # JOB SCRAPING METHODS
    # ============================================================

    def _scrape_job(self, item: JobQueueItem) -> Optional[Dict[str, Any]]:
        """
        Scrape job details from URL.

        Detects job board type from URL and uses appropriate scraper.
        """
        if item.scraped_data:
            logger.debug(
                f"Using cached scraped data: {item.scraped_data.get('title')} "
                f"at {item.scraped_data.get('company')}"
            )
            return item.scraped_data

        url = item.url
        job_data = None

        try:
            if "greenhouse" in url or "gh_jid=" in url:
                job_data = self._scrape_greenhouse_url(url)
            elif "weworkremotely.com" in url:
                job_data = self._scrape_weworkremotely_url(url)
            elif "remotive.com" in url or "remotive.io" in url:
                job_data = self._scrape_remotive_url(url)
            else:
                logger.warning(f"Unknown job board URL: {url}, using generic scraper")
                job_data = self._scrape_generic_url(url)

        except Exception as e:
            logger.error(f"Error scraping job from {url}: {e}")
            return None

        if job_data:
            job_data["url"] = url
            logger.debug(f"Job scraped: {job_data.get('title')} at {job_data.get('company')}")
            return job_data

        return None

    def _scrape_greenhouse_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Scrape job details from Greenhouse URL."""
        import re
        import requests
        from bs4 import BeautifulSoup

        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, "html.parser")

            company_match = re.search(r"boards\.greenhouse\.io/([^/]+)", url)
            company_name = company_match.group(1).replace("-", " ").title() if company_match else ""

            title_elem = soup.find("h1", class_="section-header")
            location_elem = soup.find("div", class_="job__location")
            description_elem = soup.find("div", class_="job__description")

            return {
                "title": title_elem.text.strip() if title_elem else "",
                "company": company_name,
                "location": location_elem.text.strip() if location_elem else "",
                "description": (
                    description_elem.get_text(separator="\n", strip=True)
                    if description_elem
                    else ""
                ),
                "company_website": self._extract_company_domain(url),
                "url": url,
            }
        except Exception as e:
            logger.error(f"Failed to scrape Greenhouse URL {url}: {e}")
            return None

    def _scrape_weworkremotely_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Scrape job details from WeWorkRemotely URL."""
        import requests
        from bs4 import BeautifulSoup

        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, "html.parser")

            title_elem = soup.find("h1")
            company_elem = soup.find("h2")
            description_elem = soup.find("div", class_="listing-container")

            return {
                "title": title_elem.text.strip() if title_elem else "",
                "company": company_elem.text.strip() if company_elem else "",
                "location": "Remote",
                "description": (
                    description_elem.get_text(separator="\n", strip=True)
                    if description_elem
                    else ""
                ),
                "company_website": self._extract_company_domain(url),
                "url": url,
            }
        except Exception as e:
            logger.error(f"Failed to scrape WeWorkRemotely URL {url}: {e}")
            return None

    def _scrape_remotive_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Scrape job details from Remotive URL."""
        import requests
        from bs4 import BeautifulSoup

        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, "html.parser")

            title_elem = soup.find("h1")
            company_elem = soup.find("a", class_="company-name")
            description_elem = soup.find("div", class_="job-description")

            return {
                "title": title_elem.text.strip() if title_elem else "",
                "company": company_elem.text.strip() if company_elem else "",
                "location": "Remote",
                "description": (
                    description_elem.get_text(separator="\n", strip=True)
                    if description_elem
                    else ""
                ),
                "company_website": self._extract_company_domain(url),
                "url": url,
            }
        except Exception as e:
            logger.error(f"Failed to scrape Remotive URL {url}: {e}")
            return None

    def _scrape_generic_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Generic fallback scraper for unknown job boards."""
        import requests
        from bs4 import BeautifulSoup

        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, "html.parser")

            title = soup.find("h1")
            description = soup.find("body")

            company_name = ""

            # Try meta tags
            og_site = soup.find("meta", property="og:site_name")
            if og_site and og_site.get("content"):
                company_name = og_site["content"].strip()

            # Try schema.org
            if not company_name:
                schema = soup.find("script", type="application/ld+json")
                if schema:
                    try:
                        schema_text = schema.get_text()
                        if schema_text:
                            data = json.loads(schema_text)
                            if isinstance(data, dict):
                                company_name = data.get("hiringOrganization", {}).get("name", "")
                                if not company_name:
                                    company_name = data.get("name", "")
                    except (json.JSONDecodeError, AttributeError, TypeError):
                        # Schema.org JSON-LD may be missing or malformed; fall back to other methods
                        pass

            # Try domain name
            if not company_name:
                parsed = urlparse(url)
                domain = parsed.netloc.replace("www.", "")
                domain_parts = domain.split(".")
                base_domain = ".".join(domain_parts[-2:]) if len(domain_parts) >= 2 else domain
                aggregator_domains = self.sources_manager.get_aggregator_domains()
                is_job_board = base_domain in aggregator_domains

                if not is_job_board:
                    parts = domain.split(".")
                    if len(parts) >= 2:
                        company_name = parts[0].replace("-", " ").title()

            return {
                "title": title.text.strip() if title else "",
                "company": company_name,
                "location": "",
                "description": (
                    description.get_text(separator="\n", strip=True) if description else ""
                ),
                "company_website": self._extract_company_domain(url),
                "url": url,
            }
        except Exception as e:
            logger.error(f"Failed to scrape generic URL {url}: {e}")
            return None

    def _scrape_with_source_config(
        self, url: str, source: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Scrape job using source-specific configuration."""
        try:
            import requests
            from bs4 import BeautifulSoup

            config = source.get("config", {})
            selectors = config.get("selectors", {})

            if not selectors:
                logger.debug(f"No selectors for source {source.get('name')}, using generic scrape")
                return None

            response = requests.get(url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            job_data = {
                "url": url,
                "title": self._extract_with_selector(soup, selectors.get("title")),
                "company": self._extract_with_selector(soup, selectors.get("company")),
                "location": self._extract_with_selector(soup, selectors.get("location")),
                "description": self._extract_with_selector(soup, selectors.get("description")),
                "salary": self._extract_with_selector(soup, selectors.get("salary")),
                "posted_date": self._extract_with_selector(soup, selectors.get("posted_date")),
            }

            job_data = {k: v for k, v in job_data.items() if v is not None}

            if not job_data.get("title") or not job_data.get("description"):
                logger.warning("Missing required fields from selector scrape")
                return None

            return job_data

        except Exception as e:
            logger.error(f"Error scraping with source config: {e}")
            return None

    def _extract_with_selector(self, soup: Any, selector: Optional[str]) -> Optional[str]:
        """Extract text using CSS selector."""
        if not selector:
            return None

        try:
            element = soup.select_one(selector)
            if element:
                return element.get_text(strip=True)
        except Exception as e:
            logger.debug(f"Failed to extract with selector '{selector}': {e}")

        return None

    def _extract_company_domain(self, url: str) -> str:
        """Extract company domain from job URL."""
        parsed = urlparse(url)
        domain = parsed.netloc.replace("www.", "")
        return f"https://{domain}"

    @staticmethod
    def _is_job_board_url(url: str) -> bool:
        """Check if URL is a known job board or aggregator."""
        if not url:
            return False

        try:
            netloc = urlparse(url.lower()).netloc
            return any(
                netloc == domain or netloc.endswith("." + domain)
                for domain in JobProcessor._JOB_BOARD_DOMAINS
            )
        except Exception as e:
            logger.warning("URL parsing failed in _is_job_board_url for '%s': %s", url, e)
            return False

    # ============================================================
    # SCRAPE REQUESTS (enqueue-only)
    # ============================================================

    def process_scrape(self, item: JobQueueItem) -> None:
        """Process a scrape queue item - runs scraping operation with config."""
        if not item.id:
            logger.error("Cannot process scrape item without ID")
            return

        self._refresh_runtime_config()

        scrape_config = item.scrape_config
        if not scrape_config:
            from job_finder.job_queue.models import ScrapeConfig

            scrape_config = ScrapeConfig()

        logger.info(f"Starting scrape with config: {scrape_config.model_dump()}")

        try:
            stats = self.scrape_runner.run_scrape(
                target_matches=scrape_config.target_matches,
                max_sources=scrape_config.max_sources,
                source_ids=scrape_config.source_ids,
            )

            result_message = (
                f"Scrape completed: {stats['jobs_submitted']} jobs enqueued, "
                f"{stats['sources_scraped']} sources scraped"
            )

            self.queue_manager.update_status(
                item.id, QueueStatus.SUCCESS, result_message, scraped_data=stats
            )

            logger.info(f"Scrape completed successfully: {result_message}")

        except Exception as e:
            logger.error(f"Error processing scrape request: {e}")
            raise
