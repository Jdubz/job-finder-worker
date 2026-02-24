"""Job queue item processor (single-task pipeline).

Processes a JOB item through the complete pipeline in a single task:
SCRAPE -> CREATE_LISTING -> COMPANY_LOOKUP -> [WAIT_COMPANY] -> AI_EXTRACTION -> SCORING -> ANALYSIS -> SAVE_MATCH

Filtering (title filter and prefilter) happens at scraper intake, NOT here.
Jobs that reach this processor have already passed all filters.

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
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, List
from urllib.parse import urlparse, quote_plus

from job_finder.ai.agent_manager import AgentManager
from job_finder.ai.response_parser import extract_json_from_response
from job_finder.ai.extraction import JobExtractor, JobExtractionResult
from job_finder.ai.page_data_extractor import PageDataExtractor
from job_finder.ai.matcher import AIJobMatcher, JobMatchResult
from job_finder.exceptions import (
    AIProviderError,
    DuplicateQueueItemError,
    ExtractionError,
    NoAgentsAvailableError,
)
from job_finder.filters.title_filter import TitleFilter
from job_finder.filters.prefilter import PreFilter
from job_finder.job_queue.models import (
    JobQueueItem,
    ProcessorContext,
    QueueItemType,
    QueueStatus,
)
from job_finder.job_queue.scraper_intake import ScraperIntake
from job_finder.scoring.engine import ScoringEngine, ScoreBreakdown
from job_finder.scoring.taxonomy import SkillTaxonomyRepository
from job_finder.profile.reducer import load_scoring_profile
from job_finder.scrape_runner import ScrapeRunner
from job_finder.utils.company_info import build_company_info_string
from job_finder.utils.company_name_utils import clean_company_name, is_source_name
from job_finder.utils.url_utils import normalize_url

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)

# Maximum number of times a job can wait for company data before proceeding anyway
MAX_COMPANY_WAIT_RETRIES = 3

# Regex for parsing salary strings like "USD 165000-220000", "$150,000 - $170,000"
_SALARY_PATTERN = re.compile(r"[\$]?\s*([\d,]+(?:\.\d+)?)\s*[-–—to]+\s*[\$]?\s*([\d,]+(?:\.\d+)?)")


def _parse_salary_range(salary_str: str) -> Optional[tuple[int, int]]:
    """Parse a salary range string into (min, max) integers.

    Handles formats like:
      - "USD 165000-220000"
      - "$150,000 - $170,000"
      - "150000-200000"

    Returns None if parsing fails.
    """
    # Strip currency prefix (e.g. "USD ", "CAD ")
    cleaned = re.sub(r"^[A-Z]{3}\s*", "", salary_str.strip())
    match = _SALARY_PATTERN.search(cleaned)
    if not match:
        return None
    try:
        low = int(float(match.group(1).replace(",", "")))
        high = int(float(match.group(2).replace(",", "")))
        if low > 0 and high > 0:
            return (min(low, high), max(low, high))
    except (ValueError, OverflowError):
        pass
    return None


@dataclass
class PipelineContext:
    """In-memory context passed through all pipeline stages."""

    item: JobQueueItem
    job_data: Optional[Dict[str, Any]] = None
    listing_id: Optional[str] = None
    company_data: Optional[Dict[str, Any]] = None
    extraction: Optional[JobExtractionResult] = None
    score_result: Optional[ScoreBreakdown] = None
    match_result: Optional[JobMatchResult] = None
    error: Optional[str] = None
    stage: str = "init"


class JobProcessor(BaseProcessor):
    """Processor for job queue items using single-task pipeline."""

    def __init__(self, ctx: ProcessorContext):
        """
        Initialize job processor with ProcessorContext.

        Args:
            ctx: ProcessorContext containing all required dependencies
        """
        super().__init__(ctx)

        self.job_storage = ctx.job_storage
        self.job_listing_storage = ctx.job_listing_storage
        self.companies_manager = ctx.companies_manager
        self.sources_manager = ctx.sources_manager
        self.ai_matcher = ctx.ai_matcher
        self.company_info_fetcher = ctx.company_info_fetcher
        self.notifier = ctx.notifier

        # Initialize new hybrid pipeline components
        prefilter_policy = ctx.config_loader.get_prefilter_policy()
        title_filter_config = (
            prefilter_policy.get("title", {}) if isinstance(prefilter_policy, dict) else {}
        )
        self.title_filter = TitleFilter(title_filter_config)

        # Initialize prefilter - fails loud if not configured
        self.prefilter = PreFilter(prefilter_policy)

        match_policy = ctx.config_loader.get_match_policy()
        self.match_policy = match_policy

        self.scoring_engine = self._build_scoring_engine(match_policy)

        # Initialize AgentManager for AI operations
        self.agent_manager = AgentManager(ctx.config_loader)
        self.extractor = JobExtractor(self.agent_manager)
        self.page_data_extractor = PageDataExtractor(self.agent_manager)

        # Initialize scrape runner with config_loader so it creates both title_filter and prefilter
        self.scrape_runner = ScrapeRunner(
            queue_manager=ctx.queue_manager,
            job_listing_storage=ctx.job_listing_storage,
            companies_manager=ctx.companies_manager,
            sources_manager=ctx.sources_manager,
            config_loader=ctx.config_loader,
        )

        # Initialize scraper intake with filters for deduplication
        self.scraper_intake = ScraperIntake(
            queue_manager=ctx.queue_manager,
            job_listing_storage=ctx.job_listing_storage,
            companies_manager=ctx.companies_manager,
            title_filter=self.title_filter,
            prefilter=self.prefilter,
        )

    def _refresh_runtime_config(self) -> None:
        """Reload config-driven components so the next item uses fresh settings."""
        prefilter_policy = self.config_loader.get_prefilter_policy()
        title_filter_config = (
            prefilter_policy.get("title", {}) if isinstance(prefilter_policy, dict) else {}
        )
        match_policy = self.config_loader.get_match_policy()

        # Rebuild title filter with latest config
        self.title_filter = TitleFilter(title_filter_config)

        # Rebuild prefilter with latest config
        self.prefilter = PreFilter(prefilter_policy)

        # Rebuild scoring engine with latest config and derived profile
        self.match_policy = match_policy
        self.scoring_engine = self._build_scoring_engine(match_policy)

        # Propagate new title filter into downstream helpers
        if hasattr(self.scrape_runner, "title_filter"):
            self.scrape_runner.title_filter = self.title_filter
        if hasattr(self.scraper_intake, "title_filter"):
            self.scraper_intake.title_filter = self.title_filter

        # AgentManager reads config fresh on each call, so extractor is always current
        # Just recreate the extractor with the same agent_manager
        self.extractor = JobExtractor(self.agent_manager)

        # Update AI matcher min score from match policy (required, no default)
        self.ai_matcher.min_match_score = match_policy["minScore"]

    def _build_scoring_engine(self, match_policy: Dict[str, Any]) -> ScoringEngine:
        """Create ScoringEngine with derived profile and personal info.

        Skill relationships (synonyms, implies, parallels) are now managed entirely
        by the taxonomy system - no more analogGroups in config.
        """
        db_path = (
            self.config_loader.db_path if isinstance(self.config_loader.db_path, str) else None
        )
        # Use the same SQLite file for taxonomy so tests/CI with temp DBs don't try to touch
        # the default repo path. This also keeps scoring + taxonomy data co-located.
        taxonomy_repo = SkillTaxonomyRepository(db_path)
        # Extract relevantExperienceStart from experience config (if set)
        relevant_exp_start = match_policy.get("experience", {}).get("relevantExperienceStart")
        profile = load_scoring_profile(db_path, relevant_experience_start=relevant_exp_start)

        # Merge personal-info into location config for scoring
        # Personal info values override static config values (userTimezone, userCity)
        personal_info = self.config_loader.get_personal_info()
        if personal_info:
            location_config = match_policy.get("location", {})
            # timezone from personal-info overrides userTimezone in location config
            if personal_info.get("timezone") is not None:
                location_config["userTimezone"] = personal_info["timezone"]
            # city from personal-info overrides userCity in location config
            if personal_info.get("city"):
                location_config["userCity"] = personal_info["city"]
            # relocationAllowed is new - pass through to scoring
            if "relocationAllowed" in personal_info:
                location_config["relocationAllowed"] = personal_info["relocationAllowed"]

        return ScoringEngine(
            match_policy,
            skill_years=profile.skill_years,
            user_experience_years=profile.total_experience_years,
            taxonomy_repo=taxonomy_repo,
        )

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
    ) -> None:
        """Update job listing status if listing_id is available.

        Note: Analysis data (scoringResult, detailedAnalysis) is stored in
        job_matches, not job_listings. Only filter/extraction data goes here.
        """
        if not listing_id:
            return
        self.job_listing_storage.update_status(listing_id, status, filter_result)
        logger.debug("Updated job listing %s status to %s", listing_id, status)

    # ============================================================
    # SINGLE-TASK PIPELINE
    # ============================================================

    def process_job(self, item: JobQueueItem) -> None:
        """
        Process job item through complete pipeline in a single task.

        Pipeline stages (all in-memory, no respawning):
        1. SCRAPE - Extract job data from URL (or use manual submission data)
        2. COMPANY_LOOKUP - Get/create company data
        2.5. WAIT_COMPANY - Requeue if company needs enrichment (up to 3 retries)
        3. AI_EXTRACTION - Extract semantic data (seniority, tech, etc.)
        4. SCORING - Deterministic scoring from config
        5. ANALYSIS - AI match analysis with reasoning
        6. SAVE_MATCH - Save to job_matches if above threshold

        Note: Title/pre-filtering happens at scraper intake, not here.
        Jobs that reach this processor have already passed all filters.

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
        metadata = item.metadata or {}

        # Get listing_id from metadata (job data will be queried from job_listings)
        ctx.listing_id = metadata.get("job_listing_id") or state.get("job_listing_id")

        # Legacy support: check if job_data was already loaded in a previous run
        # (for jobs that were partially processed before this refactor)
        if "job_data" in state and state["job_data"].get("title"):
            ctx.job_data = state["job_data"]

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

            # Get/create job listing (filtering happens at scraper intake, not here)
            ctx.listing_id = self._get_or_create_job_listing(item, ctx.job_data)

            # STAGE 2: COMPANY LOOKUP
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

            # STAGE 2.5: COMPANY DEPENDENCY CHECK
            # Before AI extraction, ensure company has good data (not just a stub)
            company_ready = self._check_company_dependency(ctx, state)
            if not company_ready:
                # Job was requeued to wait for company enrichment
                return

            # STAGE 3: AI EXTRACTION
            ctx.stage = "extraction"
            logger.info(f"[PIPELINE] {url_preview} -> AI_EXTRACTION")
            self._update_status(item, "Extracting job data", ctx.stage)
            try:
                ctx.extraction = self._execute_ai_extraction(ctx)
            except NoAgentsAvailableError:
                # Critical error - let it propagate to worker loop to stop queue
                raise
            except (ExtractionError, AIProviderError) as e:
                self._finalize_failed(ctx, f"AI extraction failed: {e}")
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
                    "extraction": ctx.extraction.to_dict() if ctx.extraction else {},
                },
            )

            # STAGE 4: DETERMINISTIC SCORING
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
                # Check for bypassFilter flag in metadata (from user submissions)
                if not metadata.get("bypassFilter", False):
                    self._finalize_skipped(
                        ctx, f"Scoring rejected: {ctx.score_result.rejection_reason}"
                    )
                    return
                else:
                    logger.info(
                        f"[PIPELINE] {url_preview} -> Bypassing score threshold via bypassFilter flag"
                    )

            # STAGE 5: AI MATCH ANALYSIS
            ctx.stage = "analysis"
            logger.info(f"[PIPELINE] {url_preview} -> AI_ANALYSIS")
            self._update_status(item, "Generating match analysis", ctx.stage)
            ctx.match_result = self._execute_match_analysis(ctx)
            if not ctx.match_result:
                self._finalize_failed(ctx, "AI analysis returned no result")
                return

            # Emit analysis event
            self._emit_event(
                "job:analysis",
                item.id,
                {
                    "matchScore": ctx.match_result.match_score,
                },
            )

            # Check score threshold using deterministic score (not AI score)
            min_score = getattr(self.ai_matcher, "min_match_score", 0)
            if ctx.score_result.final_score < min_score:
                # Check for bypassFilter flag in metadata (from user submissions)
                if not metadata.get("bypassFilter", False):
                    self._finalize_skipped(
                        ctx, f"Score {ctx.score_result.final_score} below threshold {min_score}"
                    )
                    return
                else:
                    logger.info(
                        f"[PIPELINE] {url_preview} -> Bypassing min_score threshold via bypassFilter flag"
                    )

            # STAGE 6: SAVE MATCH
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

        except NoAgentsAvailableError:
            # Critical error - let it propagate to worker loop to stop queue
            raise
        except Exception as e:
            logger.error(f"[PIPELINE] ERROR in stage {ctx.stage}: {e}", exc_info=True)
            ctx.error = str(e)
            self._finalize_failed(ctx, f"Pipeline error in {ctx.stage}: {e}")

    # ============================================================
    # PIPELINE STAGE IMPLEMENTATIONS
    # ============================================================

    def _execute_scrape(self, ctx: PipelineContext) -> Dict[str, Any]:
        """Execute scrape stage - get job data from job_listings (source of truth).

        Data sources in priority order:
        1. Manual submission data (user-submitted jobs)
        2. Job listing record (queried by listing_id from metadata)
        3. Legacy scraped_data (for backwards compatibility during transition)
        4. Playwright page render + AI extraction (URL-only submissions)
        """
        item = ctx.item
        metadata = item.metadata or {}

        # Manual job data (user-submitted) - return immediately only if BOTH provided.
        # If only one is present, fall through to other sources so page extraction
        # can fill the missing field (manual data merged later).
        manual_title = metadata.get("manualTitle")
        manual_desc = metadata.get("manualDescription")
        if manual_title and manual_desc:
            return {
                "title": manual_title,
                "description": manual_desc,
                "company": metadata.get("manualCompanyName") or item.company_name or "",
                "location": metadata.get("manualLocation") or "",
                "url": item.url,
            }

        # Primary source: Query job_listings by listing_id (single source of truth)
        listing_id = ctx.listing_id or metadata.get("job_listing_id")
        if listing_id and self.job_listing_storage:
            listing = self.job_listing_storage.get_by_id(listing_id)
            if listing:
                return {
                    "title": listing.get("title", ""),
                    "description": listing.get("description", ""),
                    "company": listing.get("company_name", ""),
                    "location": listing.get("location", ""),
                    "url": listing.get("url") or item.url,
                    "salary": listing.get("salary_range"),
                    "posted_date": listing.get("posted_date"),
                }

        # Legacy fallback: scraped_data (for backwards compatibility)
        if item.scraped_data and item.scraped_data.get("title"):
            return item.scraped_data

        # URL-only fallback: render page with Playwright and extract via JSON-LD / AI
        # Note: NoAgentsAvailableError is NOT propagated here — page extraction is
        # an opportunistic fallback. Failing one URL-only item should not stop the
        # queue. The critical NoAgentsAvailableError propagation happens in stage 3
        # (AI_EXTRACTION) where it applies to ALL items.
        if item.url:
            try:
                self._update_status(item, "Rendering page and extracting job data", "scrape")
                extracted = self.page_data_extractor.extract(item.url)
                if extracted:
                    # Merge partial manual data (manual takes priority over extracted)
                    if manual_title:
                        extracted["title"] = manual_title
                    if manual_desc:
                        extracted["description"] = manual_desc
                    if metadata.get("manualCompanyName"):
                        extracted["company"] = metadata["manualCompanyName"]
                    if metadata.get("manualLocation"):
                        extracted["location"] = metadata["manualLocation"]

                    if extracted.get("title") and extracted.get("description"):
                        logger.info(
                            "[PIPELINE] Extracted job data via page rendering: %s",
                            extracted.get("title", "")[:60],
                        )
                        return extracted
            except Exception as e:
                logger.warning("Page data extraction failed for %s: %s", item.url, e)

        raise ValueError(
            f"No job data found for {item.url} - no manual data, no job_listing_id, "
            f"no scraped_data, and page extraction failed. "
            f"URL-only submissions require working AI agents for extraction. "
            f"listing_id={listing_id}"
        )

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

        If company data is sparse (just a stub), spawn enrichment and requeue so the
        pipeline waits for richer company data instead of racing ahead with a stub.
        """
        company = ctx.company_data
        item = ctx.item
        job_data = ctx.job_data

        # No company data - nothing to enrich yet; continue
        if not company:
            return True

        company_id = company.get("id")
        company_name = job_data.get("company", "")

        # If company is good, proceed immediately
        if self.companies_manager.has_good_company_data(company):
            logger.debug("Company %s has good data, proceeding to extraction", company_name)
            return True

        # Otherwise spawn enrichment and wait (up to MAX_COMPANY_WAIT_RETRIES)
        self._spawn_company_enrichment(ctx)

        wait_count = state.get("company_wait_count", 0)

        if wait_count >= MAX_COMPANY_WAIT_RETRIES:
            logger.warning(
                "Company %s still sparse after %d waits, proceeding with extraction",
                company_name,
                wait_count,
            )
            return True

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

        # Resolve existing company by name when id is missing
        if not company_id and company_name:
            existing = self.companies_manager.get_company(company_name)
            if existing:
                ctx.company_data = existing
                company = existing
                company_id = existing.get("id")

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

        # Build source context for better company research
        source_context = self._build_source_context(ctx.item.source_id)

        try:
            self.queue_manager.spawn_item_safely(
                current_item=ctx.item,
                new_item_data={
                    "type": QueueItemType.COMPANY,
                    "url": company_url,
                    "company_name": company_name,
                    "company_id": company_id,
                    "source": ctx.item.source,
                    "source_context": source_context,
                },
            )
            logger.debug("Spawned company enrichment task for %s", company_name)
        except DuplicateQueueItemError:
            pass  # Already in queue
        except Exception as e:
            logger.warning("Failed to spawn company enrichment for %s: %s", company_name, e)

    def _execute_ai_extraction(self, ctx: PipelineContext) -> JobExtractionResult:
        """Execute AI extraction stage.

        Raises:
            ExtractionError: If extraction fails for any reason
        """
        job_data = ctx.job_data or {}
        title = job_data.get("title", "")
        description = job_data.get("description", "")
        location = job_data.get("location", "")
        posted_date = job_data.get("posted_date")
        salary_range = job_data.get("salary") or job_data.get("salary_range")
        url = job_data.get("url", "")

        extraction = self.extractor.extract(
            title,
            description,
            location,
            posted_date,
            salary_range=salary_range,
            url=url,
        )

        # Overlay pre-extracted structured data the AI may have missed
        if salary_range and extraction.salary_min is None:
            parsed = _parse_salary_range(salary_range)
            if parsed:
                extraction.salary_min = parsed[0]
                extraction.salary_max = parsed[1]

        logger.info(
            f"Extraction complete: seniority={extraction.seniority}, "
            f"arrangement={extraction.work_arrangement}, techs={len(extraction.technologies)}"
        )
        return extraction

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

        # Taxonomy enrichment: map unknown tech terms via analysis agent before scoring
        extraction = ctx.extraction
        taxonomy_repo = None
        lookup = {}
        try:
            taxonomy_repo = SkillTaxonomyRepository(
                getattr(self.job_listing_storage, "db_path", None)
            )
            lookup = taxonomy_repo.load_lookup()
        except Exception as e:
            logger.warning("taxonomy load skipped: %s", e)
        unknown_terms: List[str] = []
        for term in extraction.technologies:
            if term.lower().strip() not in lookup:
                unknown_terms.append(term)

        if taxonomy_repo and unknown_terms:
            try:
                result = self.agent_manager.execute(
                    task_type="analysis",
                    prompt=json.dumps(
                        {
                            "action": "taxonomy_enrich",
                            "unknown_terms": unknown_terms,
                            "job_title": title,
                            "job_description": description,
                        }
                    ),
                    max_tokens=1000,
                    temperature=0.3,
                )
                parsed = json.loads(extract_json_from_response(result.text))
                payload = parsed.get("result", parsed) if isinstance(parsed, dict) else parsed
                if isinstance(payload, list):
                    for item in payload:
                        term = str(item.get("term", "")).strip().lower()
                        canonical = str(item.get("canonical", term)).strip().lower()
                        category = item.get("category")
                        if not term or not canonical:
                            continue
                        existing = lookup.get(canonical)
                        synonyms = existing.synonyms if existing else []
                        synonyms = list(set(synonyms + [canonical, term]))
                        taxonomy_repo.upsert(
                            canonical=canonical,
                            category=category,
                            synonyms_csv=",".join(sorted(synonyms)),
                        )
                    lookup = taxonomy_repo.load_lookup()
            except Exception as e:
                logger.warning("taxonomy enrichment failed: %s", e)

        # Remap technologies to canonicals (fallback to original term)
        if lookup:
            remapped: List[str] = []
            for term in extraction.technologies:
                taxon = lookup.get(term.lower().strip())
                remapped.append(taxon.canonical if taxon else term)
            extraction.technologies = remapped

        # Pass company_data to scoring engine for company signals
        score_result = self.scoring_engine.score(
            extraction=extraction,
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
            # Re-raise to let pipeline handle as failure, not skip
            logger.error(f"AI match analysis failed: {e}")
            raise

    def _execute_save_match(self, ctx: PipelineContext) -> str:
        """Execute save match stage."""
        # Update listing to matched status (analysis data goes ONLY to job_matches)
        # Scoring breakdown is stored in filter_result.scoring
        self._update_listing_status(
            ctx.listing_id,
            "matched",
            filter_result={
                "extraction": ctx.extraction.to_dict() if ctx.extraction else {},
                "scoring": ctx.score_result.to_dict() if ctx.score_result else None,
            },
        )

        # Update match_score on listing for quick filtering/sorting
        if ctx.listing_id and ctx.score_result:
            self.job_listing_storage.update_match_score(
                ctx.listing_id,
                ctx.score_result.final_score,
            )

        # Save to job_matches table (single source of truth for analysis)
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

    def _finalize_skipped(self, ctx: PipelineContext, reason: str) -> None:
        """Finalize pipeline with SKIPPED status."""
        job_data = ctx.job_data or {}
        logger.info(f"[PIPELINE] SKIPPED: '{job_data.get('title')}' - {reason}")

        # Update listing with extraction and scoring data for UI visibility
        # Scoring breakdown shows users WHY the job was skipped
        self._update_listing_status(
            ctx.listing_id,
            "skipped",
            filter_result={
                "extraction": ctx.extraction.to_dict() if ctx.extraction else {},
                "scoring": ctx.score_result.to_dict() if ctx.score_result else None,
                "skip_reason": reason,
            },
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

        # Build filter data with error info and any available extraction/scoring
        filter_data: Dict[str, Any] = {"error": error}
        if ctx.extraction:
            filter_data["extraction"] = ctx.extraction.to_dict()
        if ctx.score_result:
            filter_data["scoring"] = ctx.score_result.to_dict()

        # Update listing if we have one
        if ctx.listing_id:
            self._update_listing_status(
                ctx.listing_id,
                "skipped",
                filter_result=filter_data,
            )

        self.queue_manager.update_status(
            ctx.item.id,
            QueueStatus.FAILED,
            error,
            scraped_data=self._build_final_scraped_data(ctx),
        )

    def _build_final_scraped_data(self, ctx: PipelineContext) -> Dict[str, Any]:
        """Build final scraped_data dict for queue item.

        Note: Full job data lives in job_listings (source of truth).
        Analysis data lives in job_matches. This method returns minimal
        summary data for queue status display and debugging.
        """
        data: Dict[str, Any] = {}

        # Include job summary (not full description) for display purposes
        if ctx.job_data:
            data["job_data"] = {
                "title": ctx.job_data.get("title", ""),
                "company": ctx.job_data.get("company", ""),
                "location": ctx.job_data.get("location", ""),
            }

        # Include extraction summary for filtering visibility
        if ctx.extraction:
            data["extraction"] = {
                "seniority": ctx.extraction.seniority,
                "work_arrangement": ctx.extraction.work_arrangement,
            }

        # Include score summary (full analysis is in job_matches)
        # Use AI match score if available, otherwise use deterministic score
        if ctx.match_result:
            data["score"] = ctx.match_result.match_score
        elif ctx.score_result:
            data["score"] = ctx.score_result.final_score

        return data

    def _extract_company_domain(self, url: str) -> str:
        """Extract company domain from job URL."""
        parsed = urlparse(url)
        domain = parsed.netloc.replace("www.", "")
        return f"https://{domain}"

    def _is_job_board_url(self, url: str) -> bool:
        """Check if URL is a known job board or aggregator.

        Delegates to JobSourcesManager.is_job_board_url() which uses
        database-driven aggregator domains from the job_sources table.
        """
        return self.sources_manager.is_job_board_url(url)

    def _build_source_context(self, source_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """
        Build source context for company research from source_id.

        The source context helps the company info fetcher understand where
        the job came from, which improves search queries and disambiguation.

        Args:
            source_id: The source ID to look up

        Returns:
            Dict with aggregator_domain and base_url, or None if source not found
        """
        if not source_id:
            return None

        try:
            source = self.sources_manager.get_source_by_id(source_id)
            if not source:
                return None

            config = source.get("config_json", {})
            if isinstance(config, str):
                config = json.loads(config)

            return {
                "aggregator_domain": source.get("aggregator_domain", ""),
                "base_url": config.get("base_url", ""),
                "source_name": source.get("name", ""),
            }
        except Exception as e:
            logger.debug("Failed to build source context for %s: %s", source_id, e)
            return None

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

        try:
            logger.info(f"Starting scrape with config: {scrape_config.model_dump()}")

            # Only mark as processing once we're committed to run (after config ready)
            self.queue_manager.update_status(
                item.id,
                QueueStatus.PROCESSING,
                "Scrape started",
                pipeline_state={"pipeline_stage": "scrape_start"},
            )

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
