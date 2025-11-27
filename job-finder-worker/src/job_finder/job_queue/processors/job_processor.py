"""Job queue item processor (state-driven only).

Advances a JOB item based on its pipeline_state:
- scrape → filter → analyze → save
Legacy sub_task routing has been removed to keep a single pipeline.
"""

import logging
import time
from typing import Any, Dict, Optional

from job_finder.ai.matcher import AIJobMatcher
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.exceptions import DuplicateQueueItemError
from job_finder.filters.strike_filter_engine import StrikeFilterEngine
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.scraper_intake import ScraperIntake
from job_finder.scrape_runner import ScrapeRunner
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_storage import JobStorage
from job_finder.storage.job_sources_manager import JobSourcesManager
from job_finder.utils.company_info import build_company_info_string
from job_finder.utils.company_name_utils import clean_company_name
from job_finder.job_queue.models import (
    CompanySubTask,
    JobQueueItem,
    QueueItemType,
    QueueStatus,
)

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)


class JobProcessor(BaseProcessor):
    """Processor for job queue items."""

    def __init__(
        self,
        queue_manager: QueueManager,
        config_loader: ConfigLoader,
        job_storage: JobStorage,
        companies_manager: CompaniesManager,
        sources_manager: JobSourcesManager,
        company_info_fetcher: CompanyInfoFetcher,
        ai_matcher: AIJobMatcher,
    ):
        """
        Initialize job processor with its specific dependencies.

        Args:
            queue_manager: Queue manager for updating item status
            config_loader: Configuration loader for stop lists and filters
            job_storage: Job storage implementation
            companies_manager: Company data manager
            sources_manager: Job sources manager
            company_info_fetcher: Company info fetcher (for ScrapeRunner)
            ai_matcher: AI job matcher
        """
        super().__init__(queue_manager, config_loader)

        self.job_storage = job_storage
        self.companies_manager = companies_manager
        self.sources_manager = sources_manager
        self.ai_matcher = ai_matcher

        # Initialize strike-based filter engine
        filter_config = config_loader.get_job_filters()
        tech_ranks = config_loader.get_technology_ranks()
        self.filter_engine = StrikeFilterEngine(filter_config, tech_ranks)

        # Initialize scrape runner with shared filter engine for pre-filtering
        self.scrape_runner = ScrapeRunner(
            queue_manager=queue_manager,
            job_storage=job_storage,
            companies_manager=companies_manager,
            sources_manager=sources_manager,
            company_info_fetcher=company_info_fetcher,
            filter_engine=self.filter_engine,
        )

        # Initialize scraper intake with filter engine for pre-filtering
        self.scraper_intake = ScraperIntake(
            queue_manager=queue_manager,
            job_storage=job_storage,
            companies_manager=companies_manager,
            filter_engine=self.filter_engine,
        )

    # ============================================================
    # MAIN ROUTING
    # ============================================================

    def process_job(self, item: JobQueueItem) -> None:
        """
        Process job item using decision tree routing.

        Examines pipeline_state to determine next action:
        - No job_data → SCRAPE
        - Has job_data, no filter_result → FILTER
        - Has filter_result (passed), no match_result → ANALYZE
        - Has match_result → SAVE

        Args:
            item: Job queue item
        """
        if not item.id:
            logger.error("Cannot process item without ID")
            return

        # Get current pipeline state
        state = item.pipeline_state or {}

        # If no pipeline_state but scraped_data is present, bootstrap pipeline_state
        # so we skip re-scraping known data and proceed to filtering/analysis.
        if not state and item.scraped_data:
            state = {"job_data": item.scraped_data}
            item.pipeline_state = state

        self.slogger.queue_item_processing(
            item.id,
            "job",
            "processing",
            {"url": item.url, "pipeline_stage": state.get("pipeline_stage", "unknown")},
        )

        # Decision tree: determine what action to take based on state
        has_job_data = "job_data" in state
        has_filter_result = "filter_result" in state
        has_match_result = "match_result" in state

        if not has_job_data:
            # Need to scrape job data
            logger.info(f"[DECISION TREE] {item.url[:50]} → SCRAPE (no job_data)")
            self._do_job_scrape(item)
        elif not has_filter_result:
            # Need to filter
            logger.info(f"[DECISION TREE] {item.url[:50]} → FILTER (has job_data)")
            self._do_job_filter(item)
        elif not has_match_result:
            # Need to analyze
            logger.info(f"[DECISION TREE] {item.url[:50]} → ANALYZE (passed filter)")
            self._do_job_analyze(item)
        else:
            # Need to save
            logger.info(f"[DECISION TREE] {item.url[:50]} → SAVE (has match_result)")
            self._do_job_save(item)

    # ============================================================
    # DECISION TREE ACTION METHODS
    # ============================================================

    def _do_job_scrape(self, item: JobQueueItem) -> None:
        """
        Scrape job data and update state.

        Sets pipeline_stage='scrape' and re-spawns same URL with job_data in state.
        """
        if not item.id:
            logger.error("Cannot process item without ID")
            return

        self.slogger.pipeline_stage(item.id, "scrape", "started", {"url": item.url})
        start = time.monotonic()

        logger.info(f"JOB_SCRAPE: Extracting job data from {item.url[:50]}...")

        try:
            # Get source configuration for this URL
            source = self.sources_manager.get_source_for_url(item.url)

            if source:
                # Use source-specific scraping method
                job_data = self._scrape_with_source_config(item.url, source)
            else:
                # Fall back to generic scraping (or use AI extraction)
                job_data = self._scrape_job(item)

            if not job_data:
                error_msg = "Could not scrape job details from URL"
                error_details = f"Failed to extract data from: {item.url}"
                self.queue_manager.update_status(
                    item.id, QueueStatus.FAILED, error_msg, error_details=error_details
                )
                return

            # Update pipeline state with scraped data
            updated_state = {
                **(item.pipeline_state or {}),
                "job_data": job_data,
                "scrape_method": source.get("name") if source else "generic",
            }

            # Mark this step complete
            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                "Job data scraped successfully",
            )

            # Re-spawn same URL with updated state
            self._respawn_job_with_state(item, updated_state, next_stage="filter")

            logger.info(
                f"JOB_SCRAPE complete: {job_data.get('title')} at {job_data.get('company')}"
            )

            self.slogger.pipeline_stage(
                item.id,
                "scrape",
                "completed",
                {
                    "url": item.url,
                    "source": source.get("name") if source else "generic",
                    "duration_ms": round((time.monotonic() - start) * 1000),
                },
            )

        except Exception as e:
            logger.error(f"Error in JOB_SCRAPE: {e}")
            self.slogger.pipeline_stage(
                item.id,
                "scrape",
                "failed",
                {"url": item.url, "error": str(e)},
            )
            raise

    def _do_job_filter(self, item: JobQueueItem) -> None:
        """
        Filter job and update state.

        Sets pipeline_stage='filter'. Re-spawns if passed, marks FILTERED if rejected.
        """
        if not item.id or not item.pipeline_state:
            logger.error("Cannot process FILTER without ID or pipeline_state")
            return

        job_data = item.pipeline_state.get("job_data")
        if not job_data:
            logger.error("No job_data in pipeline_state")
            return

        self.slogger.pipeline_stage(
            item.id, "filter", "started", {"job_title": job_data.get("title")}
        )
        start = time.monotonic()

        logger.info(f"JOB_FILTER: Evaluating {job_data.get('title')} at {job_data.get('company')}")

        try:
            # Run strike-based filter
            filter_result = self.filter_engine.evaluate_job(job_data)

            if not filter_result.passed:
                # Job rejected by filters - TERMINAL STATE
                rejection_summary = filter_result.get_rejection_summary()
                rejection_data = filter_result.to_dict()

                logger.info(f"JOB_FILTER: Rejected - {rejection_summary}")

                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.FILTERED,
                    f"Rejected by filters: {rejection_summary}",
                    scraped_data={"job_data": job_data, "filter_result": rejection_data},
                )
                return

            # Filter passed - update state and continue
            updated_state = {
                **item.pipeline_state,
                "filter_result": filter_result.to_dict(),
            }

            # Mark this step complete
            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                "Passed filtering",
            )

            # Re-spawn same URL with filter result
            self._respawn_job_with_state(item, updated_state, next_stage="analyze")

            logger.info(f"JOB_FILTER complete: Passed with {filter_result.total_strikes} strikes")

            self.slogger.pipeline_stage(
                item.id,
                "filter",
                "completed",
                {
                    "job_title": job_data.get("title"),
                    "strikes": filter_result.total_strikes,
                    "duration_ms": round((time.monotonic() - start) * 1000),
                },
            )

        except Exception as e:
            logger.error(f"Error in JOB_FILTER: {e}")
            self.slogger.pipeline_stage(
                item.id,
                "filter",
                "failed",
                {"job_title": job_data.get("title"), "error": str(e)},
            )
            raise

    def _do_job_analyze(self, item: JobQueueItem) -> None:
        """
        Analyze job with AI and update state.

        Sets pipeline_stage='analyze'. Re-spawns if matched, marks SKIPPED if low score.
        """
        if not item.id or not item.pipeline_state:
            logger.error("Cannot process ANALYZE without ID or pipeline_state")
            return

        job_data = item.pipeline_state.get("job_data")
        if not job_data:
            logger.error("No job_data in pipeline_state")
            return

        self.slogger.pipeline_stage(
            item.id,
            "analyze",
            "started",
            {
                "job_title": job_data.get("title"),
                "company": job_data.get("company"),
            },
        )
        start = time.monotonic()

        logger.info(f"JOB_ANALYZE: Analyzing {job_data.get('title')} at {job_data.get('company')}")

        try:
            # Ensure company exists (spawn dependency if needed)
            company_ready = self._ensure_company_dependency(item, job_data)
            if not company_ready:
                return

            # Run AI matching (uses configured model - Sonnet by default)
            result = self.ai_matcher.analyze_job(job_data)

            if not result:
                # Below match threshold - TERMINAL STATE
                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.SKIPPED,
                    f"Job score below threshold (< {self.ai_matcher.min_match_score})",
                )
                return

            # Match passed - update state and continue
            updated_state = {
                **item.pipeline_state,
                "match_result": result.to_dict(),
            }

            # Mark this step complete
            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                f"AI analysis complete (score: {result.match_score})",
            )

            # Re-spawn same URL with match result
            self._respawn_job_with_state(item, updated_state, next_stage="save")

            logger.info(
                f"JOB_ANALYZE complete: Score {result.match_score}, "
                f"Priority {result.application_priority}"
            )

            self.slogger.pipeline_stage(
                item.id,
                "analyze",
                "completed",
                {
                    "job_title": job_data.get("title"),
                    "company": job_data.get("company"),
                    "match_score": result.match_score,
                    "priority": result.application_priority,
                    "duration_ms": round((time.monotonic() - start) * 1000),
                },
            )

        except Exception as e:
            logger.error(f"Error in JOB_ANALYZE: {e}")
            self.slogger.pipeline_stage(
                item.id,
                "analyze",
                "failed",
                {
                    "job_title": job_data.get("title"),
                    "company": job_data.get("company"),
                    "error": str(e),
                },
            )
            raise

    def _ensure_company_dependency(self, item: JobQueueItem, job_data: Dict[str, Any]) -> bool:
        """
        Ensure company data is available before job analysis.

        Checks if the company record has sufficient data (about, culture, etc.) for
        document generation and job ranking. If not, spawns an analysis task.

        Returns True when company data is ready for analysis.
        """
        company_name_raw = job_data.get("company", item.company_name)
        company_website = job_data.get("company_website") or self._extract_company_domain(item.url)

        company_name_base = company_name_raw if isinstance(company_name_raw, str) else ""
        company_name_clean = clean_company_name(company_name_base) or company_name_base.strip()
        job_data["company"] = company_name_clean

        if not company_name_clean:
            # No company context; allow analysis to proceed without company info
            return True

        pipeline_state = item.pipeline_state or {}

        def _requeue_wait(company_id: str) -> None:
            """Requeue this job to wait for company data to be populated."""
            updated_state = {
                **pipeline_state,
                "job_data": job_data,
                "waiting_for_company_id": company_id,
            }
            self.queue_manager.requeue_with_state(item.id, updated_state)
            logger.info(
                "JOB_ANALYZE: Waiting for company data %s (id=%s)",
                company_name_clean,
                company_id,
            )

        # Get or create company record
        company = self.companies_manager.get_company(company_name_clean)

        if not company:
            # Create stub for new company
            stub = self.companies_manager.create_company_stub(company_name_clean, company_website)
            company = stub

        company_id = company.get("id")

        # Check if company has sufficient data for job analysis
        if self.companies_manager.has_good_company_data(company):
            job_data["company_id"] = company_id
            job_data["companyId"] = company_id
            job_data["company_info"] = build_company_info_string(company)
            return True

        # Company data is incomplete - spawn analysis task (fire and forget), then wait
        # Task may fail to spawn (duplicate, blocked) - that's fine, we just wait
        self._try_spawn_company_task(item, company_id, company_name_clean, company_website)
        _requeue_wait(company_id)
        return False

    def _try_spawn_company_task(
        self,
        item: JobQueueItem,
        company_id: str,
        company_name: str,
        company_website: str,
    ) -> None:
        """
        Try to spawn a COMPANY task (fire and forget).

        This is best-effort - if spawning fails for any reason (duplicate URL,
        spawn depth exceeded, etc.), we silently ignore it. The caller will
        wait for the company to become ACTIVE regardless.
        """
        company_url = company_website or item.url

        try:
            task_id = self.queue_manager.spawn_item_safely(
                current_item=item,
                new_item_data={
                    "type": QueueItemType.COMPANY,
                    "url": company_url,
                    "company_name": company_name,
                    "company_id": company_id,
                    "source": item.source,
                    "company_sub_task": CompanySubTask.FETCH,
                    "pipeline_state": {
                        "company_name": company_name,
                        "company_website": company_url,
                        "company_id": company_id,
                    },
                },
            )
            if task_id:
                logger.debug("Spawned company task %s for %s", task_id, company_name)
        except DuplicateQueueItemError:
            logger.debug("Company task for %s already in queue, skipping spawn", company_name)
        except Exception as e:
            logger.debug("Could not spawn company task for %s: %s", company_name, e)

    def _do_job_save(self, item: JobQueueItem) -> None:
        """
        Save job match to SQLite.

        Final step - marks item as SUCCESS, no re-spawning.
        """
        if not item.id or not item.pipeline_state:
            logger.error("Cannot process SAVE without ID or pipeline_state")
            return

        job_data = item.pipeline_state.get("job_data")
        match_result_dict = item.pipeline_state.get("match_result")

        if not job_data or not match_result_dict:
            logger.error("Missing job_data or match_result in pipeline_state")
            return

        self.slogger.pipeline_stage(
            item.id,
            "save",
            "started",
            {
                "job_title": job_data.get("title"),
                "company": job_data.get("company"),
            },
        )
        start = time.monotonic()

        logger.info(f"JOB_SAVE: Saving {job_data.get('title')} at {job_data.get('company')}")

        try:
            # Reconstruct JobMatchResult from dict
            from job_finder.ai.matcher import JobMatchResult

            result = JobMatchResult(**match_result_dict)

            # Save to job-matches
            doc_id = self.job_storage.save_job_match(job_data, result)

            logger.info(
                f"Job matched and saved: {job_data.get('title')} at {job_data.get('company')} "
                f"(Score: {result.match_score}, ID: {doc_id})"
            )

            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                f"Job saved successfully (ID: {doc_id}, Score: {result.match_score})",
            )

            self.slogger.pipeline_stage(
                item.id,
                "save",
                "completed",
                {
                    "job_title": job_data.get("title"),
                    "company": job_data.get("company"),
                    "doc_id": doc_id,
                    "duration_ms": round((time.monotonic() - start) * 1000),
                },
            )

        except Exception as e:
            logger.error(f"Error in JOB_SAVE: {e}")
            self.slogger.pipeline_stage(
                item.id,
                "save",
                "failed",
                {
                    "job_title": job_data.get("title"),
                    "company": job_data.get("company"),
                    "error": str(e),
                },
            )
            raise

    def _respawn_job_with_state(
        self,
        current_item: JobQueueItem,
        updated_state: dict,
        next_stage: str,
    ) -> None:
        """
        Requeue the same job item with updated state for next stage.

        Updates the current item's state and sets it back to PENDING so it gets
        processed again. This allows the SAME queue item to progress through all
        stages, making it easier for E2E tests to monitor.

        Args:
            current_item: Current queue item
            updated_state: Updated pipeline state
            next_stage: Next pipeline stage name (for logging)
        """
        if not current_item.id:
            logger.error("Cannot requeue item without ID")
            return

        # Update the same item with new state and mark as pending for re-processing
        try:
            self.queue_manager.requeue_with_state(current_item.id, updated_state)
            logger.info(
                f"Requeued item {current_item.id} for {next_stage}: {current_item.url[:50]}"
            )
            self.slogger.queue_item_processing(
                current_item.id,
                "job",
                "requeued",
                {"next_stage": next_stage, "url": current_item.url},
            )
        except Exception as e:
            logger.error(f"Failed to requeue item {current_item.id}: {e}")
            self.slogger.queue_item_processing(
                current_item.id,
                "job",
                "requeue_failed",
                {"next_stage": next_stage, "url": current_item.url, "error": str(e)},
            )
            raise

    # ============================================================
    # LEGACY SUBTASK-BASED METHODS
    # ============================================================

    # ============================================================
    # JOB SCRAPING METHODS
    # ============================================================

    def _scrape_job(self, item: JobQueueItem) -> Optional[Dict[str, Any]]:
        """
        Scrape job details from URL.

        Detects job board type from URL and uses appropriate scraper.

        Args:
            item: Job queue item

        Returns:
            Job data dictionary or None if scraping failed
        """
        # If we have scraped_data from a previous scraper run, use it
        if item.scraped_data:
            logger.debug(
                f"Using cached scraped data: {item.scraped_data.get('title')} "
                f"at {item.scraped_data.get('company')}"
            )
            return item.scraped_data

        # Detect job board type and scrape
        url = item.url
        job_data = None

        try:
            # Greenhouse (MongoDB, Spotify, etc.)
            if "greenhouse" in url or "gh_jid=" in url:
                job_data = self._scrape_greenhouse_url(url)

            # WeWorkRemotely
            elif "weworkremotely.com" in url:
                job_data = self._scrape_weworkremotely_url(url)

            # Remotive
            elif "remotive.com" in url or "remotive.io" in url:
                job_data = self._scrape_remotive_url(url)

            # Generic fallback - try basic scraping
            else:
                logger.warning(f"Unknown job board URL: {url}, using generic scraper")
                job_data = self._scrape_generic_url(url)

        except Exception as e:
            logger.error(f"Error scraping job from {url}: {e}")
            return None

        if job_data:
            # Ensure URL is set
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

            # Extract company from URL (boards.greenhouse.io/{company}/jobs/...)
            company_match = re.search(r"boards\.greenhouse\.io/([^/]+)", url)
            company_name = (
                company_match.group(1).replace("-", " ").title() if company_match else "Unknown"
            )

            # Extract job details using updated selectors (Greenhouse HTML structure changed)
            title_elem = soup.find("h1", class_="section-header")
            location_elem = soup.find("div", class_="job__location")
            description_elem = soup.find("div", class_="job__description")

            return {
                "title": title_elem.text.strip() if title_elem else "Unknown",
                "company": company_name,
                "location": location_elem.text.strip() if location_elem else "Unknown",
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

            # Extract job details
            title_elem = soup.find("h1")
            company_elem = soup.find("h2")
            description_elem = soup.find("div", class_="listing-container")

            return {
                "title": title_elem.text.strip() if title_elem else "Unknown",
                "company": company_elem.text.strip() if company_elem else "Unknown",
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

            # Extract job details (adjust selectors based on actual Remotive HTML)
            title_elem = soup.find("h1")
            company_elem = soup.find("a", class_="company-name")
            description_elem = soup.find("div", class_="job-description")

            return {
                "title": title_elem.text.strip() if title_elem else "Unknown",
                "company": company_elem.text.strip() if company_elem else "Unknown",
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

            # Try to extract basic info
            title = soup.find("h1")
            description = soup.find("body")

            return {
                "title": title.text.strip() if title else "Unknown",
                "company": "Unknown",
                "location": "Unknown",
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
        """
        Scrape job using source-specific configuration.

        Args:
            url: Job URL
            source: Source configuration with selectors

        Returns:
            Job data dict or None if scraping failed
        """
        try:
            import requests
            from bs4 import BeautifulSoup

            config = source.get("config", {})
            selectors = config.get("selectors", {})

            if not selectors:
                # No selectors, fall back to generic
                logger.debug(f"No selectors for source {source.get('name')}, using generic scrape")
                return None

            # Fetch HTML
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            # Extract data using selectors
            job_data = {
                "url": url,
                "title": self._extract_with_selector(soup, selectors.get("title")),
                "company": self._extract_with_selector(soup, selectors.get("company")),
                "location": self._extract_with_selector(soup, selectors.get("location")),
                "description": self._extract_with_selector(soup, selectors.get("description")),
                "salary": self._extract_with_selector(soup, selectors.get("salary")),
                "posted_date": self._extract_with_selector(soup, selectors.get("posted_date")),
            }

            # Remove None values
            job_data = {k: v for k, v in job_data.items() if v is not None}

            if not job_data.get("title") or not job_data.get("description"):
                logger.warning("Missing required fields (title/description) from selector scrape")
                return None

            return job_data

        except Exception as e:
            logger.error(f"Error scraping with source config: {e}")
            return None

    def _extract_with_selector(self, soup: Any, selector: Optional[str]) -> Optional[str]:
        """
        Extract text using CSS selector.

        Args:
            soup: BeautifulSoup object
            selector: CSS selector string

        Returns:
            Extracted text or None
        """
        if not selector:
            return None

        try:
            element = soup.select_one(selector)
            if element:
                return element.get_text(strip=True)
        except Exception as e:
            logger.debug(f"Failed to extract with selector '{selector}': {e}")

        return None

    # ============================================================
    # HELPER METHODS
    # ============================================================

    def _extract_company_domain(self, url: str) -> str:
        """Extract company domain from job URL."""
        from urllib.parse import urlparse

        parsed = urlparse(url)
        # Remove www. prefix
        domain = parsed.netloc.replace("www.", "")
        # For job boards, try to find actual company domain in the content
        # For now, just return the job board domain
        return f"https://{domain}"

    # ============================================================
    # SCRAPE REQUESTS (enqueue-only)
    # ============================================================

    def process_scrape(self, item: JobQueueItem) -> None:
        """
        Process a scrape queue item.

        Runs a scraping operation with custom configuration.

        Args:
            item: Scrape queue item
        """
        if not item.id:
            logger.error("Cannot process scrape item without ID")
            return

        # Get scrape configuration
        scrape_config = item.scrape_config
        if not scrape_config:
            # Use defaults
            from job_finder.job_queue.models import ScrapeConfig

            scrape_config = ScrapeConfig()

        logger.info(f"Starting scrape with config: {scrape_config.model_dump()}")

        try:
            # Run scrape (pass None values through, don't use defaults here)
            stats = self.scrape_runner.run_scrape(
                target_matches=scrape_config.target_matches,
                max_sources=scrape_config.max_sources,
                source_ids=scrape_config.source_ids,
            )

            # Update queue item with success
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
