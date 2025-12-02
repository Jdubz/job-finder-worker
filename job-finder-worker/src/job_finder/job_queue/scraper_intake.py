"""Helper for scrapers to submit jobs to the queue.

Pre-filtering behavior:
  Jobs are pre-filtered using TitleFilter BEFORE being added to the queue.
  This uses simple keyword-based title matching to filter out irrelevant jobs
  (sales roles, wrong job types) from consuming queue resources.

  Only jobs that pass the title filter are queued for AI analysis.

Job Listings Integration:
  Jobs that pass pre-filter are stored in the job_listings table for deduplication.
  This table tracks ALL discovered jobs, not just those that pass AI analysis.
  The job_matches table only stores jobs that pass AI analysis, referencing
  job_listings via foreign key.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional, get_args

from job_finder.exceptions import DuplicateQueueItemError
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueSource
from job_finder.utils.company_name_utils import clean_company_name
from job_finder.utils.url_utils import normalize_url

logger = logging.getLogger(__name__)


class ScraperIntake:
    """
    Helper class for scrapers to submit jobs to the intake queue.

    This provides a simple interface for scrapers to add jobs without
    worrying about queue implementation details.

    Pre-filtering:
      When a title_filter is provided, jobs are pre-filtered before queueing.
      Only jobs that pass the title keyword filter are added to the queue.
      This significantly reduces queue size and AI analysis costs.

    Job Listings:
      Jobs that pass pre-filter are stored in job_listings table for deduplication.
      This ensures we don't re-process the same job URL multiple times.
    """

    def __init__(
        self,
        queue_manager: QueueManager,
        job_listing_storage=None,
        companies_manager=None,
        sources_manager=None,
        title_filter=None,
        # Legacy parameter - still accepted but job_listing_storage takes precedence
        job_storage=None,
    ):
        """
        Initialize scraper intake.

        Args:
            queue_manager: Queue manager for adding items
            job_listing_storage: JobListingStorage for checking/storing job listings
            companies_manager: CompaniesManager for checking company existence (optional)
            title_filter: TitleFilter for pre-filtering jobs by title keywords (optional)
            job_storage: DEPRECATED - use job_listing_storage instead
        """
        self.queue_manager = queue_manager
        self.job_listing_storage = job_listing_storage
        self.companies_manager = companies_manager
        self.sources_manager = sources_manager
        self.title_filter = title_filter
        # Legacy fallback - will be removed in future version
        self._legacy_job_storage = job_storage

    def _is_aggregator_domain(self, url: str) -> bool:
        if not self.sources_manager:
            return False
        try:
            from urllib.parse import urlparse

            host = urlparse(url).hostname or ""
            if not host:
                return False
            agg_domains = self.sources_manager.get_aggregator_domains()
            return any(host.endswith(agg) for agg in agg_domains)
        except Exception:
            return False

    def _is_likely_board_path(self, url: str) -> bool:
        # Lightweight path heuristic to catch board/collection pages
        lower = url.lower()
        board_tokens = [
            "/careers",
            "/jobs",
            "/job-board",
            "boards.greenhouse.io",
            "ashbyhq.com",
            "workdayjobs",
        ]
        return any(token in lower for token in board_tokens)

    def _check_job_exists(self, normalized_url: str) -> bool:
        """Check if job URL already exists in job_listings (or legacy job_matches)."""
        if self.job_listing_storage:
            return self.job_listing_storage.listing_exists(normalized_url)
        # Legacy fallback
        if self._legacy_job_storage:
            return self._legacy_job_storage.job_exists(normalized_url)
        return False

    def _store_job_listing(
        self,
        job: Dict[str, Any],
        normalized_url: str,
        source_id: Optional[str],
        company_id: Optional[str],
        filter_result: Optional[Dict[str, Any]] = None,
        status: str = "pending",
    ) -> Optional[str]:
        """Store job in job_listings table. Returns listing_id or None."""
        if not self.job_listing_storage:
            return None

        try:
            listing_id, created = self.job_listing_storage.get_or_create_listing(
                url=normalized_url,
                title=job.get("title", ""),
                company_name=job.get("company", ""),
                description=job.get("description", ""),
                source_id=source_id,
                company_id=company_id,
                location=job.get("location"),
                salary_range=job.get("salary") or job.get("salary_range"),
                posted_date=job.get("posted_date"),
                status=status,
                filter_result=filter_result,
            )
            if created:
                logger.debug("Created job listing %s for %s", listing_id, normalized_url)
            return listing_id
        except Exception as e:
            logger.warning("Failed to store job listing for %s: %s", normalized_url, e)
            return None

    def submit_jobs(
        self,
        jobs: List[Dict[str, Any]],
        source: QueueSource = "scraper",
        source_id: Optional[str] = None,
        source_label: Optional[str] = None,
        source_type: Optional[str] = None,
        company_id: Optional[str] = None,
        max_to_add: Optional[int] = None,
    ) -> int:
        """
        Submit multiple jobs to the queue with pre-filtering.

        Pre-filtering:
            When filter_engine is set, jobs are pre-filtered BEFORE being added
            to the queue. This prevents irrelevant jobs from consuming queue
            resources and AI analysis costs.

            Pre-filtering checks:
            - Excluded job types (sales, HR, etc.)
            - Excluded seniority (too junior)
            - Excluded companies
            - Excluded keywords
            - Job age (>7 days)
            - Remote policy violations

        Job Listings:
            Jobs that pass pre-filter are stored in job_listings table with
            status='pending'. Jobs rejected by pre-filter are stored with
            status='filtered' and the filter result.

        Args:
            jobs: List of job dictionaries from scraper
            source: Source identifier (e.g., "greenhouse_scraper", "rss_feed")
            source_id: Optional source ID for tracking
            source_label: Optional human-readable source label
            source_type: Optional source type (greenhouse, rss, etc.)
            company_id: Optional company ID if known
            max_to_add: Optional limit on jobs to add

        Returns:
            Number of jobs successfully added to queue
        """
        allowed_sources = set(get_args(QueueSource))

        # Defensive: some scrapers may pass a descriptive label instead of a
        # QueueSource literal (e.g., "api:Anthropic Jobs"). Normalize to
        # "scraper" to satisfy validation and keep the original label in
        # metadata.
        if source not in allowed_sources:
            logger.warning(
                "Invalid source '%s' provided to submit_jobs; defaulting to 'scraper'",
                source,
            )
            if not source_label:
                source_label = str(source)
            source = "scraper"

        added_count = 0
        skipped_count = 0
        prefiltered_count = 0
        prefilter_reasons: Dict[str, int] = {}

        for job in jobs:
            if max_to_add is not None and added_count >= max_to_add:
                logger.info(
                    "Reached target_matches cap (%s); skipping remaining jobs from this source",
                    max_to_add,
                )
                break
            try:
                # Validate URL exists and is non-empty
                url = job.get("url", "").strip()
                if not url:
                    skipped_count += 1
                    logger.debug("Skipping job with missing or empty URL")
                    continue

                # Normalize URL for consistent comparison
                normalized_url = normalize_url(url)

                # If URL appears to be a board/aggregator, keep it in input but require a detail URL
                is_aggregator = self._is_aggregator_domain(normalized_url)
                is_board_path = self._is_likely_board_path(normalized_url)
                canonical_url = normalized_url

                detail_url = job.get("detail_url") or job.get("job_url")
                if (is_aggregator or is_board_path) and detail_url:
                    canonical_url = normalize_url(detail_url)
                elif is_aggregator or is_board_path:
                    # If we have full text, allow this specific posting; otherwise defer.
                    if job.get("description"):
                        canonical_url = normalized_url
                    else:
                        skipped_count += 1
                        logger.info(
                            "Board URL without detail; skipping job and deferring to source scrape: %s",
                            normalized_url,
                        )
                        continue

                # Check if URL already in queue
                if self.queue_manager.url_exists_in_queue(canonical_url):
                    skipped_count += 1
                    logger.debug(f"Job already in queue: {canonical_url}")
                    continue

                # Check if job already exists in job_listings (or legacy job_matches)
                if self._check_job_exists(canonical_url):
                    skipped_count += 1
                    logger.debug(f"Job already exists in job_listings: {canonical_url}")
                    continue

                # Clean company label scraped from the listing (avoid storing "Acme Careers")
                company_name_raw = job.get("company", "")
                company_name_base = company_name_raw if isinstance(company_name_raw, str) else ""
                company_name = clean_company_name(company_name_base) or company_name_base.strip()

                # Update job dict with cleaned company name
                job_payload = dict(job)
                job_payload["company"] = company_name

                # Pre-filter job by title before adding to queue
                if self.title_filter:
                    title = job_payload.get("title", "")
                    filter_result = self.title_filter.filter(title)
                    if not filter_result.passed:
                        prefiltered_count += 1
                        # Track rejection reasons for logging
                        reason = filter_result.reason or "unknown"
                        reason_key = reason.split(":")[0].strip() if ":" in reason else reason
                        prefilter_reasons[reason_key] = prefilter_reasons.get(reason_key, 0) + 1
                        logger.debug(f"Pre-filtered job: {title} - {reason}")

                        # Store filtered job in job_listings with status='filtered'
                        self._store_job_listing(
                            job=job_payload,
                            normalized_url=normalized_url,
                            source_id=source_id,
                            company_id=company_id,
                            filter_result=filter_result.to_dict(),
                            status="filtered",
                        )
                        continue

                # Job passed pre-filter - store in job_listings with status='pending'
                listing_id = self._store_job_listing(
                    job=job_payload,
                    normalized_url=normalized_url,
                    source_id=source_id,
                    company_id=company_id,
                    status="pending",
                )

                # Create queue item with normalized URL
                # Generate tracking_id for this root job (all spawned items will inherit it)
                tracking_id = str(uuid.uuid4())

                # Note: State-driven processor will determine next step based on pipeline_state
                # If scraped_data provided, it will skip scraping and go to filtering
                queue_item = JobQueueItem(
                    type=QueueItemType.JOB,
                    url=canonical_url,
                    company_name=company_name,
                    company_id=company_id,
                    source=source,
                    source_id=source_id,
                    source_type=source_type,
                    scraped_data=(
                        job_payload if len(job_payload) > 2 else None
                    ),  # Include full job data if available
                    tracking_id=tracking_id,  # Root tracking ID
                    ancestry_chain=[],  # Root has no ancestors
                    spawn_depth=0,  # Root starts at depth 0
                    metadata=(
                        {
                            "source_label": source_label,
                            "job_listing_id": listing_id,
                        }
                        if source_label or listing_id
                        else ({"job_listing_id": listing_id} if listing_id else None)
                    ),
                    input={
                        "source_url": (
                            normalized_url if (is_aggregator or is_board_path) else None
                        ),
                    },
                )

                # Add to queue
                doc_id = self.queue_manager.add_item(queue_item)
                added_count += 1

                if max_to_add is not None and added_count >= max_to_add:
                    logger.debug(
                        "Hit max_to_add cap (%s) while processing jobs; stopping intake for source",
                        max_to_add,
                    )
                    break

            except DuplicateQueueItemError:
                # Race condition - another process added this URL between our check and insert
                # This is expected behavior during concurrent scraping, not an error
                skipped_count += 1
                logger.debug(f"Job already in queue (race condition): {normalized_url}")
                continue

            except Exception as e:
                logger.error(f"Error adding job to queue: {e}")
                continue

        # Log detailed stats
        log_parts = [f"Submitted {added_count} jobs to queue from {source}"]
        if skipped_count > 0:
            log_parts.append(f"{skipped_count} duplicates")
        if prefiltered_count > 0:
            log_parts.append(f"{prefiltered_count} pre-filtered")

        logger.info(" | ".join(log_parts))

        # Log pre-filter breakdown if any were filtered
        if prefilter_reasons:
            reasons_str = ", ".join(f"{k}: {v}" for k, v in sorted(prefilter_reasons.items()))
            logger.info(f"  Pre-filter breakdown: {reasons_str}")

        return added_count

    def submit_company(
        self,
        company_name: str,
        company_website: str,
        source: QueueSource = "scraper",
    ) -> Optional[str]:
        """
        Submit a company for granular pipeline analysis to the queue.

        Uses the new 4-step granular pipeline (FETCH -> EXTRACT -> ANALYZE -> SAVE).

        Args:
            company_name: Company name
            company_website: Company website URL
            source: Source identifier

        Returns:
            Document ID if added successfully, None otherwise
        """
        try:
            base_name = company_name if isinstance(company_name, str) else ""
            cleaned_name = clean_company_name(base_name) or base_name.strip()

            # Validate URL exists and is non-empty
            url = company_website.strip()
            if not url:
                logger.debug(f"Skipping company {cleaned_name} with missing or empty URL")
                return None

            # Normalize URL for consistent comparison
            normalized_url = normalize_url(url)

            # If this looks like an aggregator/job board, avoid using it as the canonical queue URL
            # to prevent confusing agents; keep it in input for context.
            is_aggregator = self._is_aggregator_domain(normalized_url)
            queue_url = None if is_aggregator else normalized_url

            # Check if URL already in queue
            if queue_url and self.queue_manager.url_exists_in_queue(queue_url):
                logger.debug(f"Company already in queue: {queue_url}")
                return None

            # Check if company already exists in companies collection
            if self.companies_manager:
                existing_company = self.companies_manager.get_company(cleaned_name)
                if existing_company:
                    logger.debug(
                        f"Company already exists: {cleaned_name} (ID: {existing_company.get('id')})"
                    )
                    return None

            company_id = None
            if self.companies_manager:
                stub = self.companies_manager.create_company_stub(cleaned_name, normalized_url)
                company_id = stub.get("id")

            # Generate tracking_id for this root company (all spawned items will inherit it)
            tracking_id = str(uuid.uuid4())

            # Create single-pass company item
            queue_item = JobQueueItem(
                type=QueueItemType.COMPANY,
                url=queue_url,
                company_name=cleaned_name,
                company_id=company_id,
                source=source,
                tracking_id=tracking_id,  # Root tracking ID
                input={
                    "company_website": normalized_url,
                    "board_url": normalized_url if is_aggregator else None,
                    "source": source,
                },
            )

            # Add to queue
            doc_id = self.queue_manager.add_item(queue_item)
            logger.info(
                f"Submitted company to single-pass pipeline: {cleaned_name} (ID: {doc_id}, tracking_id: {tracking_id})"
            )
            return doc_id

        except DuplicateQueueItemError:
            # Race condition - another process added this URL between our check and insert
            logger.debug(f"Company already in queue (race condition): {normalized_url}")
            return None

        except Exception as e:
            logger.error(f"Error adding company to granular pipeline: {e}")
            return None
