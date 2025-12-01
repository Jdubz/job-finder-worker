"""Company queue item processor.

This processor handles company queue items end-to-end in a single pass:
search → extract → analyze → save (and optionally spawn source discovery).

Philosophy: Search by company name is the primary data source.
URL is a hint, not a requirement. AI extracts from search results.
"""

import logging
from contextlib import contextmanager
from typing import List, Optional
from urllib.parse import urlparse

from job_finder.ai.search_client import get_search_client, SearchResult
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
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
            sources_manager: Job sources manager
            company_info_fetcher: Company info fetcher (search-first)
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
        Run the full company pipeline: search → extract → save.

        Philosophy: A company task succeeds if we save ANY company record.
        Data quality (complete/partial/minimal) is tracked separately via UI badges.
        Only truly unrecoverable errors (e.g., no company name) should fail.

        The CompanyInfoFetcher handles:
        - Search by company name (primary data source)
        - AI extraction from search results
        - URL validation (job board/aggregator detection)
        - Optional scraping for enrichment
        """
        if not item.id:
            logger.error("Cannot process item without ID")
            return

        company_id = item.company_id
        company_name = item.company_name

        # For re-analysis: if company_id is provided but name is missing,
        # look up the existing company to get the correct name
        if company_id and not company_name:
            existing = self.companies_manager.get_company_by_id(company_id)
            if existing:
                company_name = existing.get("name")
                logger.info("Resolved company name from ID: %s -> %s", company_id, company_name)

        # Fail if we still don't have a company name - this is a data quality issue
        if not company_name:
            error_msg = (
                "COMPANY task requires company_name in input. "
                f"company_id={company_id}, url={item.url}"
            )
            logger.error(error_msg)
            self.queue_manager.update_status(item.id, QueueStatus.FAILED, error_msg)
            return

        _, company_display = format_company_name(company_name)
        logger.info(f"COMPANY: Processing {company_display}")

        # Set PROCESSING status at the start
        self.queue_manager.update_status(
            item.id, QueueStatus.PROCESSING, f"Enriching company: {company_display}"
        )

        with self._handle_company_failure(item):
            # Fetch company info using search-first approach
            # URL from queue item is just a hint - fetcher will validate/ignore if it's a job board
            extracted_info = self.company_info_fetcher.fetch_company_info(
                company_name=company_name,
                url_hint=item.url,
            )

            # Determine data quality level for the result message
            about_len = len(extracted_info.get("about", "") or "")
            culture_len = len(extracted_info.get("culture", "") or "")

            if about_len >= 100 and culture_len >= 50:
                data_quality = "complete"
            elif about_len >= 50 or culture_len >= 25:
                data_quality = "partial"
            else:
                data_quality = "minimal"

            # Build and save the company record (only name is truly required)
            company_record = {
                "id": company_id,
                "name": company_name,
                **extracted_info,
            }

            # Normalize keys for storage expectations
            if extracted_info.get("headquarters") and not extracted_info.get(
                "headquartersLocation"
            ):
                company_record["headquartersLocation"] = extracted_info.get("headquarters")

            company_id = self.companies_manager.save_company(company_record)
            logger.info(f"Company saved: {company_display} (ID: {company_id})")

            # Self-heal FK relationships - link any orphan sources to this company
            if company_id:
                website = extracted_info.get("website") or item.url
                _, linked_source_id = self.ensure_company_source_link(
                    self.sources_manager,
                    company_id=company_id,
                    source_id=None,
                    source_url=website,
                )
                if linked_source_id:
                    logger.info(
                        "Self-healed: linked source %s to company %s via URL %s",
                        linked_source_id,
                        company_id,
                        website,
                    )

            # Check if we should spawn source discovery
            # Look for job board URLs in the extracted website or provided URL
            job_board_url = self._detect_job_board_for_discovery(
                extracted_info.get("website"), item.url
            )

            # If no job board URL from provided data, search for one
            # Only search if company doesn't already have a linked source
            search_discovered = False
            if not job_board_url and company_id:
                # Check if company already has any sources (optimized query)
                has_existing_source = self.sources_manager.has_source_for_company(company_id)

                if not has_existing_source:
                    # Search for career page via web search
                    job_board_url = self._search_for_career_page(company_name)
                    if job_board_url:
                        search_discovered = True

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

                    # Use spawn_item_safely for proper lineage tracking and dedup
                    spawned_id = self.queue_manager.spawn_item_safely(
                        current_item=item,
                        new_item_data={
                            "type": QueueItemType.SOURCE_DISCOVERY,
                            "url": job_board_url,
                            "company_name": company_name,
                            "company_id": company_id,
                            "source": "automated_scan",
                            "source_discovery_config": discovery_config,
                        },
                    )

                    if spawned_id:
                        source_spawned = True
                        logger.info(
                            f"Spawned SOURCE_DISCOVERY for {company_display}: {job_board_url}"
                        )
                    else:
                        logger.info(f"SOURCE_DISCOVERY blocked by spawn rules for {job_board_url}")
                else:
                    logger.info(
                        "Source already exists for %s (source_id=%s)",
                        job_board_url,
                        existing.get("id"),
                    )

            # Build result message with data quality indicator
            result_parts = [f"Company saved ({data_quality} data)"]
            result_parts.append(f"about={about_len} chars, culture={culture_len} chars")

            tech_stack = extracted_info.get("techStack") or []
            if tech_stack:
                result_parts.append(f"tech_stack={len(tech_stack)}")
            if job_board_url:
                if source_spawned:
                    discovery_method = "search_discovered" if search_discovered else "url_provided"
                    result_parts.append(f"job_board_spawned ({discovery_method})")
                else:
                    result_parts.append("job_board_exists")

            # Write output data for consistency with other processors
            output_data = {
                "company_id": company_id,
                "data_quality": data_quality,
                "about_chars": about_len,
                "culture_chars": culture_len,
                "website": extracted_info.get("website") or "",
                "source_discovered": job_board_url if source_spawned else None,
                "discovery_method": (
                    "search" if search_discovered else "provided" if job_board_url else None
                ),
            }
            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                "; ".join(result_parts),
                scraped_data=output_data,
            )

    # ============================================================
    # HELPER METHODS
    # ============================================================

    def _detect_job_board_for_discovery(
        self, website: Optional[str], provided_url: Optional[str]
    ) -> Optional[str]:
        """
        Check if we have a job board URL that should spawn source discovery.

        If the provided URL is a job board (ATS/aggregator), use it for discovery.
        The company website itself is NOT a job board.

        Args:
            website: The company's main website (from extraction)
            provided_url: The URL provided in the queue item

        Returns:
            Job board URL if found, None otherwise
        """
        # If provided URL is a job board, that's what we want for source discovery
        if provided_url and self.company_info_fetcher._is_job_board_url(provided_url):
            return provided_url

        return None

    def _search_for_career_page(self, company_name: str) -> Optional[str]:
        """
        Search the web for a company's career page.

        Uses web search API to find career pages/job boards for companies
        that don't have a known source yet.

        Args:
            company_name: Company name to search for

        Returns:
            Career page URL if found, None otherwise
        """
        search_client = get_search_client()
        if not search_client:
            logger.debug("No search client available for career page discovery")
            return None

        try:
            # Search for career pages - include common ATS platforms in query
            query = f"{company_name} careers jobs greenhouse lever workday"
            results = search_client.search(query, max_results=10)

            if not results:
                logger.debug("No search results for %s careers", company_name)
                return None

            # Find the best career page URL from results
            career_url = self._find_best_career_url(results, company_name)
            if career_url:
                logger.info(
                    "Found career page for %s via search: %s",
                    company_name,
                    career_url,
                )
            return career_url

        except Exception as e:
            logger.warning("Career page search failed for %s: %s", company_name, e)
            return None

    def _find_best_career_url(
        self, results: List[SearchResult], company_name: str
    ) -> Optional[str]:
        """
        Find the best career page URL from search results.

        Prioritizes:
        1. ATS platforms (greenhouse, lever, workday, etc.)
        2. URLs containing /careers or /jobs
        3. Subdomains like careers.company.com

        Args:
            results: Search results to analyze
            company_name: Company name for context

        Returns:
            Best matching career URL or None
        """
        company_lower = company_name.lower().replace(" ", "")

        # Score each URL
        scored_urls = []
        for result in results:
            url = result.url
            if not url:
                continue

            try:
                parsed = urlparse(url.lower())
                netloc = parsed.netloc
                path = parsed.path

                score = 0

                # High score for ATS platforms
                ats_domains = [
                    "greenhouse.io",
                    "lever.co",
                    "myworkdayjobs.com",
                    "workday.com",
                    "smartrecruiters.com",
                    "ashbyhq.com",
                    "breezy.hr",
                    "jobvite.com",
                    "icims.com",
                ]
                for ats in ats_domains:
                    if ats in netloc:
                        score += 100
                        break

                # Good score for career-related paths
                if "/careers" in path or "/jobs" in path:
                    score += 50

                # Good score for career subdomain
                if netloc.startswith("careers.") or netloc.startswith("jobs."):
                    score += 50

                # Bonus if company name appears in domain
                if company_lower in netloc.replace("-", "").replace(".", ""):
                    score += 25

                # Penalize aggregators (we want company-specific pages)
                aggregator_domains = [
                    "indeed.com",
                    "linkedin.com",
                    "glassdoor.com",
                    "ziprecruiter.com",
                    "monster.com",
                ]
                for agg in aggregator_domains:
                    if agg in netloc:
                        score = 0  # Skip aggregators entirely
                        break

                if score > 0:
                    scored_urls.append((score, url))

            except Exception:
                continue

        if not scored_urls:
            return None

        # Return highest-scoring URL
        scored_urls.sort(key=lambda x: x[0], reverse=True)
        return scored_urls[0][1]

    @contextmanager
    def _handle_company_failure(self, item: JobQueueItem):
        """Handle company pipeline errors by marking item as FAILED."""
        try:
            yield
        except Exception as exc:
            logger.error("Company pipeline error (company_id=%s): %s", item.company_id, exc)
            if item.id:
                self.queue_manager.update_status(
                    item.id, QueueStatus.FAILED, f"Error: {type(exc).__name__}: {str(exc)[:200]}"
                )
            raise
