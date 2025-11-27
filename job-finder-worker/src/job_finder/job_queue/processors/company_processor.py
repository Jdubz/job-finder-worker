"""Company queue item processor.

This processor handles all company-related queue items and pipeline stages:
- Company data fetching (scraping website HTML)
- Company information extraction (AI-powered)
- Company analysis (tech stack, job board detection, priority scoring)
- Company persistence (save to SQLite, spawn source discovery)

It implements the granular 4-step company pipeline:
COMPANY_FETCH → COMPANY_EXTRACT → COMPANY_ANALYZE → COMPANY_SAVE
"""

import logging
import os
import re
import uuid
from contextlib import contextmanager
from typing import Any, Dict, Optional

from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.exceptions import QueueProcessingError
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.settings import get_text_limits
from job_finder.logging_config import format_company_name
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.job_queue.models import (
    CompanySubTask,
    JobQueueItem,
    QueueItemType,
    QueueStatus,
    SourceDiscoveryConfig,
    SourceTypeHint,
)

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)


class CompanyProcessor(BaseProcessor):
    """Processor for company queue items."""

    def __init__(
        self,
        queue_manager: QueueManager,
        config_loader: ConfigLoader,
        companies_manager: CompaniesManager,
        company_info_fetcher: CompanyInfoFetcher,
    ):
        """
        Initialize company processor with its specific dependencies.

        Args:
            queue_manager: Queue manager for updating item status
            config_loader: Configuration loader for stop lists and filters
            companies_manager: Company data manager
            company_info_fetcher: Company info scraper
        """
        super().__init__(queue_manager, config_loader)

        self.companies_manager = companies_manager
        self.company_info_fetcher = company_info_fetcher

    # ============================================================
    # MAIN ROUTING
    # ============================================================

    def process_granular_company(self, item: JobQueueItem) -> None:
        """
        Route granular pipeline company to appropriate processor.

        Args:
            item: Company queue item with company_sub_task specified
        """
        if not item.company_sub_task:
            raise QueueProcessingError("company_sub_task required for granular processing")

        if item.company_sub_task == CompanySubTask.FETCH:
            self.process_company_fetch(item)
        elif item.company_sub_task == CompanySubTask.EXTRACT:
            self.process_company_extract(item)
        elif item.company_sub_task == CompanySubTask.ANALYZE:
            self.process_company_analyze(item)
        elif item.company_sub_task == CompanySubTask.SAVE:
            self.process_company_save(item)
        else:
            raise QueueProcessingError(f"Unknown company_sub_task: {item.company_sub_task}")

    # ============================================================
    # PIPELINE STEPS
    # ============================================================

    def process_company_fetch(self, item: JobQueueItem) -> None:
        """
        COMPANY_FETCH: Fetch website HTML content.

        Uses cheap AI (Haiku) for dynamic content if needed.
        Spawns COMPANY_EXTRACT as next step.

        Args:
            item: Company queue item with company_sub_task=FETCH
        """
        if not item.id:
            logger.error("Cannot process item without ID")
            return

        company_name = item.company_name or "Unknown Company"
        _, company_display = format_company_name(company_name)
        logger.info(f"COMPANY_FETCH: Fetching website content for {company_display}")

        company_id = item.company_id or (item.pipeline_state or {}).get("company_id")

        with self._handle_company_failure(company_id):
            if not item.url:
                error_msg = "No company website URL provided"
                self.queue_manager.update_status(item.id, QueueStatus.FAILED, error_msg)
                return

            # Fetch HTML content from company pages
            pages_to_try = [
                f"{item.url}/about",
                f"{item.url}/about-us",
                f"{item.url}/company",
                f"{item.url}/careers",
                item.url,  # Homepage as fallback
            ]

            html_content = {}
            text_limits = get_text_limits()
            min_page_length = text_limits.get("minCompanyPageLength", 200)
            for page_url in pages_to_try:
                try:
                    content = self.company_info_fetcher._fetch_page_content(page_url)
                    if content and len(content) > min_page_length:
                        # Extract page type from URL
                        page_type = page_url.split("/")[-1] if "/" in page_url else "homepage"
                        html_content[page_type] = content
                        logger.debug(f"Fetched {len(content)} chars from {page_url}")
                except Exception as e:
                    logger.debug(f"Failed to fetch {page_url}: {e}")
                    continue

            if not html_content:
                allow_stub = bool(os.environ.get("ALLOW_COMPANY_FETCH_STUB"))
                if allow_stub:
                    html_content = {"about": "Stub company page for dev"}
                    logger.warning(
                        "Using stub company content for %s (ALLOW_COMPANY_FETCH_STUB=1)",
                        company_name,
                    )
                else:
                    error_msg = "Could not fetch any content from company website"
                    error_details = f"Tried pages: {', '.join(pages_to_try)}"
                    self.queue_manager.update_status(
                        item.id, QueueStatus.FAILED, error_msg, error_details=error_details
                    )
                    return

            # Prepare pipeline state for next step
            pipeline_state = {
                "company_name": company_name,
                "company_website": item.url,
                "company_id": company_id,
                "html_content": html_content,
            }

            # Mark this step complete
            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                f"Fetched {len(html_content)} pages from company website",
            )

            # Spawn next pipeline step (EXTRACT)
            self.queue_manager.spawn_next_pipeline_step(
                current_item=item,
                next_sub_task=CompanySubTask.EXTRACT,
                pipeline_state=pipeline_state,
                is_company=True,
            )

            _, company_display = format_company_name(company_name)
            logger.info(
                f"COMPANY_FETCH complete: Fetched {len(html_content)} pages for {company_display}"
            )

    def process_company_extract(self, item: JobQueueItem) -> None:
        """
        COMPANY_EXTRACT: Extract company info using AI.

        Uses expensive AI (Sonnet) for accurate extraction.
        Spawns COMPANY_ANALYZE as next step.

        Args:
            item: Company queue item with company_sub_task=EXTRACT
        """
        if not item.id or not item.pipeline_state:
            logger.error("Cannot process EXTRACT without ID or pipeline_state")
            return

        company_name = item.pipeline_state.get("company_name", "Unknown Company")
        html_content = item.pipeline_state.get("html_content", {})
        company_id = item.pipeline_state.get("company_id") or item.company_id

        _, company_display = format_company_name(company_name)
        logger.info(f"COMPANY_EXTRACT: Extracting company info for {company_display}")

        with self._handle_company_failure(company_id):
            # Combine all HTML content
            combined_content = " ".join(html_content.values())

            # Extract company information using AI
            extracted_info = self.company_info_fetcher._extract_company_info(
                combined_content, company_name
            )

            if not extracted_info:
                if os.environ.get("ALLOW_COMPANY_FETCH_STUB"):
                    extracted_info = {
                        "about": "Stub about for dev",
                        "culture": "Stub culture",
                        "mission": "Stub mission",
                    }
                    logger.warning(
                        "Using stub extracted info for %s (ALLOW_COMPANY_FETCH_STUB=1)",
                        company_name,
                    )
                else:
                    error_msg = "AI extraction failed to produce company information"
                    self.queue_manager.update_status(item.id, QueueStatus.FAILED, error_msg)
                    return

            # Prepare pipeline state with extracted info
            pipeline_state = {
                **item.pipeline_state,
                "extracted_info": extracted_info,
            }

            # Mark this step complete
            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                "Company information extracted successfully",
            )

            # Spawn next pipeline step (ANALYZE)
            self.queue_manager.spawn_next_pipeline_step(
                current_item=item,
                next_sub_task=CompanySubTask.ANALYZE,
                pipeline_state=pipeline_state,
                is_company=True,
            )

            _, company_display = format_company_name(company_name)
            logger.info(
                f"COMPANY_EXTRACT complete: Extracted {len(extracted_info.get('about', ''))} chars "
                f"about, {len(extracted_info.get('culture', ''))} chars culture for {company_display}"
            )

    def process_company_analyze(self, item: JobQueueItem) -> None:
        """
        COMPANY_ANALYZE: Analyze tech stack, job board, and priority scoring.

        Rule-based analysis (no AI cost).
        Spawns COMPANY_SAVE as next step.
        May also spawn SOURCE_DISCOVERY if job board found.

        Args:
            item: Company queue item with company_sub_task=ANALYZE

        TODO: Consider parallelizing company parameter fetches for optimization:
            Could spawn multiple queue items:
              - COMPANY_SIZE (web search for employee count)
              - COMPANY_LOCATION (web search for offices)
              - COMPANY_CULTURE (scrape about page)
              - COMPANY_JOB_BOARD (scrape careers page)
            Benefits: Parallel processing, fine-grained retry
            Trade-offs: Complex coordination, partial success handling
            Decision: Start with serial, optimize if it becomes a bottleneck
            See: dev-monitor/docs/decision-tree.md#performance-optimization
        """
        if not item.id or not item.pipeline_state:
            logger.error("Cannot process ANALYZE without ID or pipeline_state")
            return

        company_name = item.pipeline_state.get("company_name", "Unknown Company")
        company_website = item.pipeline_state.get("company_website", "")
        extracted_info = item.pipeline_state.get("extracted_info", {})
        html_content = item.pipeline_state.get("html_content", {})
        company_id = item.pipeline_state.get("company_id") or item.company_id

        _, company_display = format_company_name(company_name)
        logger.info(f"COMPANY_ANALYZE: Analyzing {company_display}")

        with self._handle_company_failure(company_id):
            # Detect tech stack from company info
            tech_stack = self._detect_tech_stack(extracted_info, html_content)

            # Detect job board URLs
            job_board_url = self._detect_job_board(company_website, html_content)

            # Prepare analysis results
            analysis_result = {
                "tech_stack": tech_stack,
                "job_board_url": job_board_url,
            }

            # Prepare pipeline state with analysis
            pipeline_state = {
                **item.pipeline_state,
                "analysis_result": analysis_result,
            }

            # Mark this step complete
            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                f"Company analyzed, Tech Stack: {len(tech_stack)} items",
            )

            # If job board found, spawn SOURCE_DISCOVERY
            if job_board_url:
                _, company_display = format_company_name(company_name)
                logger.info(f"Found job board for {company_display}: {job_board_url}")
                # Will be handled in COMPANY_SAVE step

            # Spawn next pipeline step (SAVE)
            self.queue_manager.spawn_next_pipeline_step(
                current_item=item,
                next_sub_task=CompanySubTask.SAVE,
                pipeline_state=pipeline_state,
                is_company=True,
            )

            logger.info(
                f"COMPANY_ANALYZE complete: {company_name}, Tech Stack: {len(tech_stack)} items"
            )

    def process_company_save(self, item: JobQueueItem) -> None:
        """
        COMPANY_SAVE: Save company to SQLite and spawn source discovery if needed.

        Final step - may spawn SOURCE_DISCOVERY if job board found.

        Args:
            item: Company queue item with company_sub_task=SAVE
        """
        if not item.id or not item.pipeline_state:
            logger.error("Cannot process SAVE without ID or pipeline_state")
            return

        company_name = item.pipeline_state.get("company_name", "Unknown Company")
        company_website = item.pipeline_state.get("company_website", "")
        extracted_info = item.pipeline_state.get("extracted_info", {})
        analysis_result = item.pipeline_state.get("analysis_result", {})
        company_id = item.pipeline_state.get("company_id") or item.company_id

        _, company_display = format_company_name(company_name)
        logger.info(f"COMPANY_SAVE: Saving {company_display}")

        with self._handle_company_failure(company_id):
            # Build complete company record
            company_info = {
                "name": company_name,
                "website": company_website,
                **extracted_info,
                "techStack": analysis_result.get("tech_stack", []),
            }

            if company_id:
                company_info["id"] = company_id

            # Save to companies collection
            company_id = self.companies_manager.save_company(company_info)

            _, company_display = format_company_name(company_name)
            logger.info(f"Company saved: {company_display} (ID: {company_id})")

            # If job board found, spawn SOURCE_DISCOVERY
            job_board_url = analysis_result.get("job_board_url")
            if job_board_url:
                # Create source discovery queue item
                discovery_config = SourceDiscoveryConfig(
                    url=job_board_url,
                    type_hint=SourceTypeHint.AUTO,
                    company_id=company_id,
                    company_name=company_name,
                )

                source_item = JobQueueItem(
                    type=QueueItemType.SOURCE_DISCOVERY,
                    url="",  # Not used for source_discovery
                    company_name=company_name,
                    company_id=company_id,
                    source="automated_scan",
                    source_discovery_config=discovery_config,
                    tracking_id=str(uuid.uuid4()),  # Required for loop prevention
                )

                self.queue_manager.add_item(source_item)
                _, company_display = format_company_name(company_name)
                logger.info(f"Spawned SOURCE_DISCOVERY for {company_display}: {job_board_url}")

            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                f"Company saved successfully (ID: {company_id})",
            )

    # ============================================================
    # HELPER METHODS
    # ============================================================

    @contextmanager
    def _handle_company_failure(self, company_id: Optional[str]):
        """Log and re-raise company pipeline errors."""
        try:
            yield
        except Exception as exc:
            logger.error("Company pipeline error (company_id=%s): %s", company_id, exc)
            raise

    def _detect_tech_stack(
        self, extracted_info: Dict[str, Any], html_content: Dict[str, str]
    ) -> list:
        """
        Detect tech stack from company info.

        Args:
            extracted_info: Extracted company information
            html_content: Raw HTML content from company pages

        Returns:
            List of detected technologies
        """
        tech_stack = []

        # Combine all text for searching
        all_text = " ".join(
            [
                extracted_info.get("about", ""),
                extracted_info.get("culture", ""),
                extracted_info.get("mission", ""),
                *html_content.values(),
            ]
        ).lower()

        # Common tech keywords to detect
        tech_keywords = {
            # Languages
            "python": ["python", "django", "flask", "fastapi"],
            "javascript": ["javascript", "js", "typescript", "ts", "node.js", "nodejs"],
            "java": ["java ", " java", "spring", "springboot"],
            "go": ["golang", " go ", "go,"],
            "rust": ["rust"],
            "ruby": ["ruby", "rails"],
            "php": ["php", "laravel"],
            "c#": ["c#", ".net", "dotnet"],
            # Frontend
            "react": ["react", "reactjs"],
            "vue": ["vue", "vuejs"],
            "angular": ["angular"],
            "svelte": ["svelte"],
            # Backend/Infra
            "docker": ["docker", "container"],
            "kubernetes": ["kubernetes", "k8s"],
            "aws": ["aws", "amazon web services"],
            "gcp": ["gcp", "google cloud"],
            "azure": ["azure", "microsoft cloud"],
            # Databases
            "postgresql": ["postgresql", "postgres"],
            "mysql": ["mysql"],
            "mongodb": ["mongodb", "mongo"],
            "redis": ["redis"],
            # ML/AI
            "machine learning": ["machine learning", "ml", "ai", "artificial intelligence"],
            "tensorflow": ["tensorflow"],
            "pytorch": ["pytorch"],
        }

        for tech, keywords in tech_keywords.items():
            for keyword in keywords:
                if keyword in all_text:
                    if tech not in tech_stack:
                        tech_stack.append(tech)
                    break

        return tech_stack

    def _detect_job_board(
        self, company_website: str, html_content: Dict[str, str]
    ) -> Optional[str]:
        """
        Detect job board URL from company website.

        Args:
            company_website: Company website URL
            html_content: HTML content from company pages

        Returns:
            Job board URL if found, None otherwise
        """
        # Check if we have careers page content
        careers_content = html_content.get("careers", "")

        # Common job board patterns
        job_board_patterns = [
            "greenhouse.io",
            "lever.co",
            "workday",
            "myworkdayjobs.com",
            "jobvite.com",
            "smartrecruiters.com",
            "breezy.hr",
            "applytojob.com",
        ]

        # Search in careers page content
        for pattern in job_board_patterns:
            if pattern in careers_content.lower():
                # Try to construct job board URL
                if "greenhouse" in pattern:
                    # Try to extract Greenhouse board token
                    match = re.search(r"boards\.greenhouse\.io/([a-zA-Z0-9_-]+)", careers_content)
                    if match:
                        return f"https://boards.greenhouse.io/{match.group(1)}"
                elif "workday" in pattern:
                    match = re.search(r"([a-zA-Z0-9_-]+)\.myworkdayjobs\.com", careers_content)
                    if match:
                        return f"https://{match.group(1)}.myworkdayjobs.com"
                # Add more patterns as needed

        # Try common careers page URLs
        common_careers_urls = [
            f"{company_website}/careers",
            f"{company_website}/jobs",
            f"{company_website}/join",
            f"{company_website}/opportunities",
        ]

        # Check if any of these exist in the fetched content
        for page_type, content in html_content.items():
            if page_type in ["careers", "jobs", "join", "opportunities"]:
                # Found a careers page - return its URL
                return f"{company_website}/{page_type}"

        return None
