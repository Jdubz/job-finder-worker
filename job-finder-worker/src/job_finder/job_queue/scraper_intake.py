"""Helper for scrapers to submit jobs to the queue.

Pre-filtering behavior:
  Jobs are pre-filtered using StrikeFilterEngine BEFORE being added to the queue.
  This prevents irrelevant jobs (sales roles, too junior, excluded companies,
  old jobs, wrong locations) from consuming queue resources.

  Only jobs that pass hard rejection filters are queued for AI analysis.
  See docs/worker/architecture/pre-filtering.md for details.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional

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
      When a filter_engine is provided, jobs are pre-filtered before queueing.
      Only jobs that pass hard rejection filters are added to the queue.
      This significantly reduces queue size and AI analysis costs.
    """

    def __init__(
        self,
        queue_manager: QueueManager,
        job_storage=None,
        companies_manager=None,
        filter_engine=None,
    ):
        """
        Initialize scraper intake.

        Args:
            queue_manager: Queue manager for adding items
            job_storage: JobStorage for checking job existence (optional)
            companies_manager: CompaniesManager for checking company existence (optional)
            filter_engine: StrikeFilterEngine for pre-filtering jobs (optional)
        """
        self.queue_manager = queue_manager
        self.job_storage = job_storage
        self.companies_manager = companies_manager
        self.filter_engine = filter_engine

    def submit_jobs(
        self,
        jobs: List[Dict[str, Any]],
        source: QueueSource = "scraper",
        source_id: Optional[str] = None,
        source_label: Optional[str] = None,
        source_type: Optional[str] = None,
        company_id: Optional[str] = None,
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

        Args:
            jobs: List of job dictionaries from scraper
            source: Source identifier (e.g., "greenhouse_scraper", "rss_feed")
            source_id: Optional source ID for tracking
            source_label: Optional human-readable source label
            source_type: Optional source type (greenhouse, rss, etc.)
            company_id: Optional company ID if known

        Returns:
            Number of jobs successfully added to queue
        """
        added_count = 0
        skipped_count = 0
        prefiltered_count = 0
        prefilter_reasons: Dict[str, int] = {}

        for job in jobs:
            try:
                # Validate URL exists and is non-empty
                url = job.get("url", "").strip()
                if not url:
                    skipped_count += 1
                    logger.debug("Skipping job with missing or empty URL")
                    continue

                # Normalize URL for consistent comparison
                normalized_url = normalize_url(url)

                # Check if URL already in queue
                if self.queue_manager.url_exists_in_queue(normalized_url):
                    skipped_count += 1
                    logger.debug(f"Job already in queue: {normalized_url}")
                    continue

                # Check if job already exists in job-matches
                if self.job_storage and self.job_storage.job_exists(normalized_url):
                    skipped_count += 1
                    logger.debug(f"Job already exists in job-matches: {normalized_url}")
                    continue

                # Pre-filter job before adding to queue
                if self.filter_engine:
                    filter_result = self.filter_engine.evaluate_job(job)
                    if not filter_result.passed:
                        prefiltered_count += 1
                        # Track rejection reasons for logging
                        reason = filter_result.get_rejection_summary() or "unknown"
                        # Simplify reason for counting
                        reason_key = reason.split(":")[0].strip() if ":" in reason else reason
                        prefilter_reasons[reason_key] = prefilter_reasons.get(reason_key, 0) + 1
                        logger.debug(f"Pre-filtered job: {job.get('title', 'Unknown')} - {reason}")
                        continue

                # Clean company label scraped from the listing (avoid storing "Acme Careers")
                company_name_raw = job.get("company", "")
                company_name_base = company_name_raw if isinstance(company_name_raw, str) else ""
                company_name = clean_company_name(company_name_base) or company_name_base.strip()

                # Create queue item with normalized URL
                # Generate tracking_id for this root job (all spawned items will inherit it)
                tracking_id = str(uuid.uuid4())

                # Preserve other scraped fields but replace company name with cleaned label
                job_payload = dict(job)
                job_payload["company"] = company_name

                # Note: State-driven processor will determine next step based on pipeline_state
                # If scraped_data provided, it will skip scraping and go to filtering
                queue_item = JobQueueItem(
                    type=QueueItemType.JOB,
                    url=normalized_url,
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
                    metadata={"source_label": source_label} if source_label else None,
                )

                # Add to queue
                doc_id = self.queue_manager.add_item(queue_item)
                added_count += 1

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

        Uses the new 4-step granular pipeline (FETCH → EXTRACT → ANALYZE → SAVE).

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

            # Check if URL already in queue
            if self.queue_manager.url_exists_in_queue(normalized_url):
                logger.debug(f"Company already in queue: {normalized_url}")
                return None

            # Check if company already exists in companies collection
            if self.companies_manager:
                existing_company = self.companies_manager.get_company(cleaned_name)
                if existing_company:
                    logger.debug(
                        f"Company already exists: {cleaned_name} (ID: {existing_company.get('id')})"
                    )
                    return None

            # Import CompanySubTask
            from job_finder.job_queue.models import CompanySubTask

            company_id = None
            if self.companies_manager:
                stub = self.companies_manager.create_company_stub(cleaned_name, normalized_url)
                company_id = stub.get("id")

            # Generate tracking_id for this root company (all spawned items will inherit it)
            tracking_id = str(uuid.uuid4())

            # Create granular pipeline item starting with FETCH
            queue_item = JobQueueItem(
                type=QueueItemType.COMPANY,
                url=normalized_url,
                company_name=cleaned_name,
                company_id=company_id,
                source=source,
                company_sub_task=CompanySubTask.FETCH,
                tracking_id=tracking_id,  # Root tracking ID
                ancestry_chain=[],  # Root has no ancestors
                spawn_depth=0,  # Root starts at depth 0
            )

            # Add to queue
            doc_id = self.queue_manager.add_item(queue_item)
            logger.info(
                f"Submitted company to granular pipeline: {cleaned_name} (ID: {doc_id}, tracking_id: {tracking_id})"
            )
            return doc_id

        except DuplicateQueueItemError:
            # Race condition - another process added this URL between our check and insert
            logger.debug(f"Company already in queue (race condition): {normalized_url}")
            return None

        except Exception as e:
            logger.error(f"Error adding company to granular pipeline: {e}")
            return None
