"""Company queue item processor.

This processor handles company queue items end-to-end in a single pass:
search → extract → analyze → save (and optionally spawn source discovery).

Philosophy: Search by company name is the primary data source.
URL is a hint, not a requirement. AI extracts from search results.
"""

import json
import logging
from contextlib import contextmanager
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from job_finder.ai.agent_manager import AgentManager, NoAgentsAvailableError
from job_finder.ai.response_parser import extract_json_from_response
from job_finder.exceptions import InitializationError

from job_finder.ai.search_client import SearchResult, get_search_client
from job_finder.exceptions import DuplicateQueueItemError
from job_finder.logging_config import format_company_name
from job_finder.job_queue.models import (
    JobQueueItem,
    ProcessorContext,
    QueueItemType,
    QueueStatus,
    SourceDiscoveryConfig,
    SourceTypeHint,
)

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)


class CompanyProcessor(BaseProcessor):
    """Processor for company queue items."""

    def __init__(self, ctx: ProcessorContext):
        """
        Initialize company processor with ProcessorContext.

        Args:
            ctx: ProcessorContext containing all required dependencies
        """
        super().__init__(ctx)

        self.companies_manager = ctx.companies_manager
        self.sources_manager = ctx.sources_manager
        self.company_info_fetcher = ctx.company_info_fetcher
        # AgentManager is used for intelligent source discovery (career page selection).
        self.agent_manager = AgentManager(ctx.config_loader)

    def _refresh_runtime_config(self) -> None:
        """
        Reload config-driven components so each item uses fresh settings.

        CompanyProcessor doesn't have filters or scoring engines to rebuild.
        AgentManager reads config fresh on each call, so no explicit refresh needed.
        This method validates config is available and logs for consistency with other processors.
        """
        try:
            self.config_loader.get_worker_settings()
        except Exception as exc:
            logger.debug("Config refresh check failed (non-fatal): %s", exc)

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

        # Refresh config-driven components before processing
        self._refresh_runtime_config()

        company_id = item.company_id
        company_name = item.company_name

        # Validate worker settings (fail gracefully for test compatibility).
        try:
            worker_settings = self.config_loader.get_worker_settings()
            if not isinstance(worker_settings.get("runtime"), dict):
                raise InitializationError("worker-settings.runtime missing or invalid")
        except Exception as exc:
            # Fall back to empty runtime config instead of failing the task (test safety / robustness)
            logger.warning(
                "Missing worker-settings/runtime for company processing; continuing with defaults: %s",
                exc,
            )
            worker_settings = {"runtime": {}}

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
            # Get source context from item input (if spawned from job processor)
            # or look up from existing company sources
            source_context = self._get_source_context(item, company_id)

            # Fetch company info using search-first approach
            # URL from queue item is just a hint - fetcher will validate/ignore if it's a job board
            extracted_info = self.company_info_fetcher.fetch_company_info(
                company_name=company_name,
                url_hint=item.url,
                source_context=source_context,
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
            search_discovered = False
            if not job_board_url:
                job_board_url, search_discovered = self._find_career_page_if_needed(
                    company_id, company_name, company_display, extracted_info.get("website")
                )

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
                    try:
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
                            logger.info(
                                f"SOURCE_DISCOVERY blocked by spawn rules for {job_board_url}"
                            )
                    except DuplicateQueueItemError:
                        logger.debug(f"SOURCE_DISCOVERY already queued for {job_board_url}")
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

    def _get_source_context(
        self, item: JobQueueItem, company_id: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        """
        Get source context for company research.

        First checks the item input for source_context (passed from job processor),
        then falls back to looking up any existing source linked to the company.

        Args:
            item: The queue item being processed
            company_id: The company ID (if known)

        Returns:
            Source context dict with aggregator_domain and base_url, or None
        """
        # Check if source_context was passed in the item input
        source_context = item.input.get("source_context")
        if source_context:
            return source_context

        # Fall back to looking up from existing company sources
        if not company_id:
            return None

        try:
            # Get any source linked to this company
            sources = self.sources_manager.get_sources_for_company(company_id)
            if not sources:
                return None

            # Use the first source with useful context
            for source in sources:
                try:
                    aggregator_domain = source.get("aggregator_domain")
                    config = source.get("config_json", {})
                    if isinstance(config, str):
                        config = json.loads(config)

                    base_url = config.get("base_url", "")

                    if aggregator_domain or base_url:
                        return {
                            "aggregator_domain": aggregator_domain or "",
                            "base_url": base_url,
                            "source_name": source.get("name", ""),
                        }
                except json.JSONDecodeError:
                    logger.debug("Invalid JSON in config for source %s", source.get("id"))
                    continue

            return None
        except Exception as e:
            logger.debug("Failed to get source context for company %s: %s", company_id, e)
            return None

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
            # Skip aggregator root URLs (just domain, no meaningful path)
            # These are already known sources, not company-specific career pages
            try:
                parsed = urlparse(provided_url)
                path = parsed.path.strip("/")
                # Skip empty paths or common root/homepage patterns
                # But allow single-segment paths like /jobs, /careers
                if not path or path.lower() in ("", "index", "index.html", "home"):
                    logger.debug(
                        f"Skipping aggregator root URL for source discovery: {provided_url}"
                    )
                    return None
            except Exception as e:
                logger.debug(f"Failed to parse aggregator URL {provided_url}: {e}")
            return provided_url

        return None

    def _find_best_career_url(
        self, results: List["SearchResult"], company_name: str
    ) -> Optional[str]:
        """
        Heuristic chooser for the best career page URL from search results.

        Priorities (highest → lowest):
        - Known ATS/hosted career platforms (greenhouse/lever/workday/ashby/etc.)
        - Careers subdomains (careers.example.com)
        - /careers or /jobs paths on the company domain
        - Other URLs that include the company name in the domain
        Aggregators (indeed/linkedin/glassdoor) are discarded.
        """

        if not results:
            return None

        company_lower = (company_name or "").lower()
        ats_hosts = ("greenhouse.io", "lever.co", "ashbyhq.com", "workday", "icims.com", "jobvite")
        aggregators = ("indeed.com", "linkedin.com", "glassdoor.com")

        def score(res) -> Optional[int]:
            url = (res.url or "").strip()
            if not url:
                return None
            url_lower = url.lower()
            if any(block in url_lower for block in aggregators):
                return None

            s = 0
            if any(host in url_lower for host in ats_hosts):
                s += 100
            if "://careers." in url_lower or url_lower.startswith("careers."):
                s += 30
            if "/careers" in url_lower or "/jobs" in url_lower:
                s += 20
            if company_lower and company_lower.split()[0] in url_lower:
                s += 10
            title = (getattr(res, "title", "") or "").lower()
            if "career" in title or "job" in title:
                s += 5
            return s

        scored: List[tuple[int, str]] = []
        for res in results:
            sc = score(res)
            if sc is None:
                continue
            scored.append((sc, res.url))

        if not scored:
            return None

        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]

    def _search_for_career_page(self, company_name: str) -> Optional[str]:
        """Lightweight search (no agent) to find a career page using heuristics."""
        search_client = get_search_client()
        if not search_client:
            return None

        results: List[SearchResult] = []
        try:
            results.extend(
                search_client.search(f"{company_name} careers jobs", max_results=5) or []
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("Career search failed for %s: %s", company_name, exc)

        return self._find_best_career_url(results, company_name)

    def _agent_select_career_url(
        self, company_name: str, results: List[SearchResult], heuristic_choice: Optional[str]
    ) -> Optional[str]:
        """
        Ask the agent to pick the best URL; fall back to heuristic_choice on failure.
        """
        if not results:
            return heuristic_choice

        try:
            trimmed: List[Dict[str, str]] = []
            max_serialized_len = 4000
            for idx, r in enumerate(results):
                candidate = {
                    "rank": idx + 1,
                    "title": (r.title or "")[:120],
                    "url": r.url or "",
                    "snippet": (r.snippet or "")[:200],
                }
                prospective = trimmed + [candidate]
                if len(json.dumps(prospective)) > max_serialized_len:
                    break
                trimmed.append(candidate)
                if len(trimmed) >= 8:
                    break

            prompt = (
                "You must choose the single best career page / job board URL for a company.\n"
                f"Company: {company_name}\n"
                "Prefer company-specific boards (ATS hosts like Greenhouse/Lever/Workday/Ashby) "
                "or company-owned /careers or /jobs pages. Avoid generic aggregators (LinkedIn, Indeed, Glassdoor).\n"
                'Return JSON only as {"best_url": "<url or null>", "reason": "short reason"}.\n'
                f"Search results: {json.dumps(trimmed)}\n"
            )

            agent_result = self.agent_manager.execute(
                task_type="extraction",
                prompt=prompt,
                max_tokens=400,
                temperature=0.0,
            )
            data = json.loads(extract_json_from_response(agent_result.text))
            best_url = data.get("best_url")
            if isinstance(best_url, str) and best_url.strip():
                return best_url.strip()
        except NoAgentsAvailableError as exc:
            logger.info("Agent unavailable for career page selection: %s", exc)
        except json.JSONDecodeError as exc:
            logger.warning("Failed to decode agent JSON response: %s", exc)
            return heuristic_choice
        except Exception as exc:  # noqa: BLE001
            logger.warning("Career page agent selection failed for %s: %s", company_name, exc)

            return heuristic_choice

        return heuristic_choice

    def _find_career_page_if_needed(
        self,
        company_id: Optional[str],
        company_name: str,
        company_display: str,
        website: Optional[str] = None,
    ) -> tuple[Optional[str], bool]:
        """
        Search for a career page if the company doesn't already have a source.

        Only performs a web search if company_id is provided and no existing
        sources are linked to the company.

        Args:
            company_id: Company ID to check for existing sources
            company_name: Company name for search queries
            company_display: Formatted company name for logging

        Returns:
            Tuple of (career_page_url, was_search_discovered)
        """
        if not company_id:
            return None, False

        # Check if company already has any sources (optimized query)
        has_existing_source = self.sources_manager.has_source_for_company(company_id)

        if has_existing_source:
            logger.info(
                "Skipping career page search for %s - company already has source(s)",
                company_display,
            )
            return None, False

        # Agent-driven career page discovery
        logger.info("Searching for career page for %s (no existing sources)", company_display)
        job_board_url = self._agent_find_career_page(company_name, website)
        if job_board_url:
            return job_board_url, True

        logger.info("No career page found via search for %s", company_display)
        return None, False

    def _agent_find_career_page(
        self, company_name: str, website: Optional[str] = None
    ) -> Optional[str]:
        """Use the agent (without heuristics) to pick a career page URL from search results."""
        search_client = get_search_client()
        if not search_client:
            logger.warning(
                "No search client available for career page discovery "
                "(set TAVILY_API_KEY or BRAVE_API_KEY)"
            )
            return None

        # Build diverse queries to surface the real job board (api/ats or /careers)
        queries: List[str] = [
            f"{company_name} careers",
            f"{company_name} jobs",
            f"{company_name} job openings",
        ]

        root_domain: Optional[str] = None
        if website:
            try:
                parsed = urlparse(website if "//" in website else f"https://{website}")
                host = parsed.netloc or parsed.path
                parts = host.split(".")
                if len(parts) >= 2:
                    root_domain = ".".join(parts[-2:])
            except Exception:
                root_domain = None

        if root_domain:
            queries.extend(
                [
                    f"site:{root_domain} careers",
                    f"site:{root_domain} jobs",
                    f"{root_domain} careers",
                    f"{root_domain} jobs",
                    f"{company_name} careers {root_domain}",
                ]
            )

        # Deduplicate while preserving order
        seen_queries: set[str] = set()
        deduped: List[str] = []
        for q in queries:
            if q in seen_queries:
                continue
            seen_queries.add(q)
            deduped.append(q)
        queries = deduped

        try:
            aggregated: List[SearchResult] = []
            seen_urls = set()
            for q in queries:
                search_results = search_client.search(q, max_results=6) or []
                for r in search_results:
                    url_lower = (r.url or "").lower()
                    if not url_lower or url_lower in seen_urls:
                        continue
                    seen_urls.add(url_lower)
                    aggregated.append(r)

            if not aggregated:
                return None

            trimmed: List[Dict[str, str]] = []
            max_serialized_len = 4000
            for idx, r in enumerate(aggregated):
                candidate = {
                    "rank": idx + 1,
                    "title": (r.title or "")[:120],
                    "url": r.url or "",
                    "snippet": (r.snippet or "")[:200],
                }
                prospective = trimmed + [candidate]
                if len(json.dumps(prospective)) > max_serialized_len:
                    break
                trimmed.append(candidate)
                if len(trimmed) >= 8:
                    break

            prompt = (
                "You must choose the single best career page / job board URL for a company.\n"
                f"Company: {company_name}\n"
                "Prefer company-specific boards (ATS hosts like Greenhouse/Lever/Workday/Ashby) "
                "or company-owned /careers or /jobs pages. Avoid generic aggregators (LinkedIn, Indeed, Glassdoor).\n"
                'Return JSON only as {"best_url": '
                '"<url or null>", "reason": "short reason"}. If none are usable, use null.\n'
                f"Search results: {json.dumps(trimmed)}\n"
            )

            agent_result = self.agent_manager.execute(
                task_type="extraction",
                prompt=prompt,
                max_tokens=400,
                temperature=0.0,
            )
            data = json.loads(extract_json_from_response(agent_result.text))
            best_url = data.get("best_url")
            if isinstance(best_url, str) and best_url.strip():
                return best_url.strip()
            return None
        except NoAgentsAvailableError as exc:
            logger.info("Agent unavailable for career page selection: %s", exc)
            return None
        except Exception as exc:  # noqa: BLE001
            logger.warning("Career page agent selection failed for %s: %s", company_name, exc)
            return None

    @contextmanager
    def _handle_company_failure(self, item: JobQueueItem):
        """Handle company pipeline errors by marking item as FAILED."""
        try:
            yield
        except Exception as exc:
            logger.error("Company pipeline error (company_id=%s): %s", item.company_id, exc)
            if item.id:
                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.FAILED,
                    f"Error: {type(exc).__name__}: {str(exc)[:200]}",
                )
            raise
