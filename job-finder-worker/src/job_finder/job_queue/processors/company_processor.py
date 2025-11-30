"""Company queue item processor.

This processor handles company queue items end-to-end in a single pass:
fetch → extract → analyze → save (and optionally spawn source discovery).
"""

import logging
import os
import re
from contextlib import contextmanager
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from job_finder.ai.search_client import get_search_client
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.settings import get_text_limits
from job_finder.logging_config import format_company_name
from job_finder.job_queue.models import (
    JobQueueItem,
    QueueItemType,
    QueueStatus,
    SourceDiscoveryConfig,
    SourceTypeHint,
)
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)

# Agent prompt for company enrichment recovery tasks
COMPANY_AGENT_PROMPT = (
    "You are the primary agent for company enrichment recovery. "
    "The automated pipeline failed to extract company information. "
    "Check the context for web search results that may contain company information. "
    "Your tasks: (1) research the company using the URL, search results, and context, "
    "(2) fill all company fields (about, culture, mission, HQ, industry, size, employeeCount, "
    "founded, isRemoteFirst, aiMlFocus, timezoneOffset, products, techStack if evident), "
    "(3) validate or propose a careers/job-board URL, "
    "(4) update/confirm company_size_category and headquartersLocation, "
    "(5) note any missing info and why."
)

# Agent prompt when no website URL was provided
COMPANY_NO_URL_AGENT_PROMPT = (
    "You are the primary agent for company research. "
    "No website URL was provided for this company. "
    "Web search results have been provided in the context to assist you. "
    "Your tasks: (1) FIRST find the company's official website URL using the search results, "
    "(2) research the company thoroughly using the search results and any additional sources, "
    "(3) fill all company fields (website, about, culture, mission, HQ, industry, size, employeeCount, "
    "founded, isRemoteFirst, aiMlFocus, timezoneOffset, products, techStack if evident), "
    "(4) find and validate a careers/job-board URL, "
    "(5) update/confirm company_size_category and headquartersLocation."
)


class CompanyProcessor(BaseProcessor):
    """Processor for company queue items."""

    def __init__(
        self,
        queue_manager: QueueManager,
        config_loader: ConfigLoader,
        companies_manager: CompaniesManager,
        sources_manager: JobSourcesManager,
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
        self.sources_manager = sources_manager
        self.company_info_fetcher = company_info_fetcher

    # ============================================================
    # SINGLE-PASS PROCESSOR
    # ============================================================

    def process_company(self, item: JobQueueItem) -> None:
        """
        Run the full company pipeline in one go: fetch → extract → analyze → save.
        """
        if not item.id:
            logger.error("Cannot process item without ID")
            return

        company_name = item.company_name or "Unknown Company"
        company_website = item.url
        company_id = item.company_id

        _, company_display = format_company_name(company_name)
        logger.info(f"COMPANY: Processing {company_display}")

        with self._handle_company_failure(company_id):
            if not company_website:
                # No website URL provided - fetch search results to assist agent research
                search_results = self._get_search_results(company_name)
                context_data: Dict[str, Any] = {
                    "company_name": company_name,
                    "company_id": company_id,
                    "instruction": "Find the company's official website URL first, then gather all company information.",
                }
                if search_results:
                    context_data["search_results"] = search_results
                    logger.info(
                        f"Including {len(search_results)} search results for agent review of {company_name}"
                    )

                self._handoff_to_agent_review(
                    item,
                    COMPANY_NO_URL_AGENT_PROMPT,
                    reason="No company website URL provided",
                    context=context_data,
                    status_message="Agent review required: no website URL - needs research",
                )
                return

            pages_to_try = self._build_pages_to_try(company_website)
            html_content = self._fetch_company_pages(company_name, pages_to_try)
            if not html_content:
                # Recoverable: agent can use search results when pages can't be fetched
                search_results = self._get_search_results(company_name)
                context_data2: Dict[str, Any] = {
                    "attempted_urls": pages_to_try,
                    "company_name": company_name,
                    "company_website": company_website,
                }
                if search_results:
                    context_data2["search_results"] = search_results
                    logger.info(
                        f"Including {len(search_results)} search results for agent review of {company_name}"
                    )

                self._handoff_to_agent_review(
                    item,
                    COMPANY_AGENT_PROMPT,
                    reason="No company pages fetched",
                    context=context_data2,
                    status_message="Agent review required: could not fetch company pages",
                )
                return

            extracted_info = self._extract_company_info(company_name, html_content, company_website)
            if not extracted_info:
                # Recoverable: agent can use search results + HTML to extract info
                search_results = self._get_search_results(company_name)
                context_data3: Dict[str, Any] = {
                    "html_samples": {k: v[:5000] for k, v in html_content.items()},
                    "company_name": company_name,
                    "company_website": company_website,
                }
                if search_results:
                    context_data3["search_results"] = search_results
                    logger.info(
                        f"Including {len(search_results)} search results for agent review of {company_name}"
                    )

                self._handoff_to_agent_review(
                    item,
                    COMPANY_AGENT_PROMPT,
                    reason="Company extraction failed",
                    context=context_data3,
                    status_message="Agent review required: extraction failed",
                )
                return

            # If AI provider is configured and heuristic extraction left sparse fields, try AI enrichment
            if (
                self.company_info_fetcher.ai_provider
                and self.company_info_fetcher._needs_ai_enrichment(extracted_info)
            ):
                logger.info(f"Attempting AI enrichment for {company_display}")
                combined_content = " ".join(html_content.values())
                ai_enriched = self.company_info_fetcher._extract_with_ai(
                    combined_content, company_name
                )
                # Merge AI results into extracted_info (AI values take precedence)
                for key, value in ai_enriched.items():
                    if value:
                        extracted_info[key] = value

                # Check again after AI enrichment - recoverable if still sparse
                if self.company_info_fetcher._needs_ai_enrichment(extracted_info):
                    # Provide search results to help agent fill gaps
                    search_results = self._get_search_results(company_name)
                    context_data4: Dict[str, Any] = {
                        "extracted_info": extracted_info,
                        "html_samples": {k: v[:5000] for k, v in html_content.items()},
                    }
                    if search_results:
                        context_data4["search_results"] = search_results
                        logger.info(
                            f"Including {len(search_results)} search results for agent review of {company_name}"
                        )

                    self._handoff_to_agent_review(
                        item,
                        COMPANY_AGENT_PROMPT,
                        reason="Company fields still sparse after AI enrichment",
                        context=context_data4,
                        status_message="Agent review required: enrichment still sparse",
                    )
                    return

            tech_stack = self._detect_tech_stack(extracted_info, html_content)
            job_board_url = self._detect_job_board(company_website, html_content)

            company_record = {
                "id": company_id,
                "name": company_name,
                "website": item.url,
                **extracted_info,
                "techStack": tech_stack,
            }

            # Normalize keys for storage expectations
            if extracted_info.get("headquarters") and not extracted_info.get(
                "headquartersLocation"
            ):
                company_record["headquartersLocation"] = extracted_info.get("headquarters")
            if extracted_info.get("companySizeCategory"):
                company_record["companySizeCategory"] = extracted_info.get("companySizeCategory")

            company_id = self.companies_manager.save_company(company_record)
            logger.info(f"Company saved: {company_display} (ID: {company_id})")

            source_spawned = False
            if job_board_url:
                existing = self.sources_manager.get_source_for_url(job_board_url)
                if not existing:
                    discovery_config = SourceDiscoveryConfig(
                        url=job_board_url,
                        type_hint=SourceTypeHint.AUTO,
                        company_id=company_id,
                        company_name=company_name,
                    )

                    source_item = JobQueueItem(
                        type=QueueItemType.SOURCE_DISCOVERY,
                        url="",
                        company_name=company_name,
                        company_id=company_id,
                        source="automated_scan",
                        source_discovery_config=discovery_config,
                        tracking_id=item.tracking_id,
                        parent_item_id=item.id,
                    )

                    self.queue_manager.add_item(source_item)
                    source_spawned = True
                    logger.info(f"Spawned SOURCE_DISCOVERY for {company_display}: {job_board_url}")
                else:
                    logger.info(
                        "Source already exists for %s (source_id=%s)",
                        job_board_url,
                        existing.get("id"),
                    )

            result_parts = [f"Fetched {len(html_content)} pages"]
            result_parts.append(
                f"about={len(extracted_info.get('about', ''))} chars, culture={len(extracted_info.get('culture', ''))} chars"
            )
            result_parts.append(f"tech_stack={len(tech_stack)}")
            if job_board_url:
                result_parts.append("job_board_spawned" if source_spawned else "job_board_exists")

            self.queue_manager.update_status(item.id, QueueStatus.SUCCESS, "; ".join(result_parts))

    # ============================================================
    # HELPER METHODS
    # ============================================================

    def _get_search_results(self, company_name: str) -> Optional[list]:
        """
        Fetch web search results for a company to assist AI enrichment.

        Args:
            company_name: Company name to search for

        Returns:
            List of dicts with search results (title, url, snippet), or None if search unavailable
        """
        search_client = get_search_client()
        if not search_client:
            logger.debug("No search API configured, skipping search for %s", company_name)
            return None

        try:
            query = f"{company_name} official website"
            results = search_client.search(query, max_results=5)
            return [r.to_dict() for r in results]
        except Exception as e:
            logger.warning(f"Search API failed for '{company_name}': {e}")
            return None

    def _build_pages_to_try(self, website: str) -> list:
        """Build list of company pages to try fetching."""
        return [
            f"{website}/about",
            f"{website}/about-us",
            f"{website}/company",
            f"{website}/careers",
            website,  # Homepage as fallback
        ]

    def _fetch_company_pages(self, company_name: str, pages_to_try: list) -> Dict[str, str]:
        """
        Fetch content from company pages.

        Args:
            company_name: Company name for logging
            pages_to_try: List of URLs to attempt fetching

        Returns:
            Dict mapping page type to HTML content. Empty dict if no content fetched.
            Caller is responsible for handling failures (e.g., handing off to agent review).
        """
        html_content: Dict[str, str] = {}
        text_limits = get_text_limits()
        min_page_length = text_limits.get("minCompanyPageLength", 200)

        for page_url in pages_to_try:
            try:
                content = self.company_info_fetcher._fetch_page_content(page_url)
                if content and len(content) > min_page_length:
                    page_type = urlparse(page_url).path.strip("/").split("/")[-1] or "homepage"
                    html_content[page_type] = content
                    logger.debug("Fetched %d chars from %s", len(content), page_url)
            except Exception as exc:
                logger.debug("Failed to fetch %s: %s", page_url, exc)

        if not html_content:
            allow_stub = bool(os.environ.get("ALLOW_COMPANY_FETCH_STUB"))
            if allow_stub:
                html_content = {"about": "Stub company page for dev"}
                logger.warning(
                    "Using stub company content for %s (ALLOW_COMPANY_FETCH_STUB=1)", company_name
                )

        return html_content

    def _extract_company_info(
        self, company_name: str, html_content: Dict[str, str], company_website: str
    ) -> Dict[str, Any]:
        """
        Extract company info from HTML content.

        Returns empty dict if extraction failed. Caller is responsible
        for handling the failure (e.g., handing off to agent review).
        """
        combined_content = " ".join(html_content.values())
        extracted_info = self.company_info_fetcher._extract_company_info(
            combined_content, company_name, company_website
        )

        if not extracted_info:
            if os.environ.get("ALLOW_COMPANY_FETCH_STUB"):
                extracted_info = {
                    "about": "Stub about for dev",
                    "culture": "Stub culture",
                    "mission": "Stub mission",
                }
                logger.warning(
                    "Using stub extracted info for %s (ALLOW_COMPANY_FETCH_STUB=1)", company_name
                )

        return extracted_info or {}

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
