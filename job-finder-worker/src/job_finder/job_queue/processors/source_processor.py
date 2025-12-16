"""Source queue item processor.

This processor handles all source-related queue items:
- Source discovery (auto-detect type and generate config)
- Source scraping (fetch jobs from configured sources)

All sources use the GenericScraper with unified SourceConfig format.
"""

import json
import logging
import traceback
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import feedparser
import requests
from bs4 import BeautifulSoup

from job_finder.ai.agent_manager import AgentManager
from job_finder.ai.search_client import get_search_client
from job_finder.ai.source_analysis_agent import (
    DisableReason,
    SourceAnalysisAgent,
    SourceClassification,
)
from job_finder.ai.response_parser import extract_json_from_response
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
from job_finder.rendering.playwright_renderer import get_renderer, RenderRequest

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)

# Content sample size limits for source recovery
# Increased to capture job listings that appear deep in JS-rendered DOM
CONTENT_SAMPLE_FETCH_LIMIT = 15000  # Max chars to fetch from page
CONTENT_SAMPLE_PROMPT_LIMIT = 12000  # Max chars to include in agent prompt

# Probe timeout - must match normal render timeout to avoid false negatives
# JS-heavy sites (Google, Meta, etc.) often need 15-20 seconds to render
PROBE_RENDER_TIMEOUT_MS = 20_000

# Mapping from DisableReason to disabled_tags for non-recoverable issues
# Only truly unrecoverable reasons are mapped - others are discovery mistakes
DISABLE_REASON_TO_TAG = {
    DisableReason.BOT_PROTECTION: "anti_bot",
    DisableReason.AUTH_REQUIRED: "auth_required",
}


@dataclass
class ProbeResult:
    status: str  # success | empty | error
    job_count: int = 0
    status_code: Optional[int] = None
    hint: str = ""
    sample: str = ""
    config: Optional[Dict[str, Any]] = None


@dataclass
class RecoveryResult:
    """Result from agent recovery attempt."""

    config: Optional[Dict[str, Any]] = None  # Proposed config if recoverable
    can_recover: bool = True  # False if agent determines issue is non-recoverable
    disable_reason: Optional[str] = None  # bot_protection, auth_required, etc.
    diagnosis: str = ""  # Human-readable explanation


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

    def _refresh_runtime_config(self) -> None:
        """
        Reload config-driven components so each item uses fresh settings.

        Rebuilds title_filter, prefilter, and scraper_intake from latest config.
        AgentManager reads config fresh on each call, so no explicit refresh needed.
        """
        prefilter_policy = self.config_loader.get_prefilter_policy()
        title_cfg = prefilter_policy.get("title", {}) if isinstance(prefilter_policy, dict) else {}

        # Rebuild filters with latest config
        self.title_filter = TitleFilter(title_cfg) if title_cfg else None
        self.prefilter = PreFilter(prefilter_policy) if prefilter_policy else None

        # Rebuild scraper intake with updated filters
        self.scraper_intake = ScraperIntake(
            queue_manager=self.queue_manager,
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
        Agent-first source discovery for all entry points (company + UI).

        Flow:
        1) Ask agent to propose source config (given URL/company + fetch/search context)
        2) Probe once with proposed config
        3) If jobs > 0 => active; if jobs == 0 => agent validates/fixes; errors => disabled
        4) Persist source and spawn scrape/company tasks as needed

        Args:
            item: Queue item with source_discovery_config
        """
        if not item.id or not item.source_discovery_config:
            logger.error("Cannot process SOURCE_DISCOVERY without ID or config")
            return

        # Refresh config-driven components before processing
        self._refresh_runtime_config()

        config = item.source_discovery_config
        url = config.url or ""

        logger.info(f"SOURCE_DISCOVERY: Processing {url or config.company_name}")

        # Set PROCESSING status at the start
        self.queue_manager.update_status(
            item.id, QueueStatus.PROCESSING, f"Analyzing source {url or config.company_name}"
        )

        try:
            # Step 1: Gather context for agent proposal
            fetch_result = self._attempt_fetch(url) if url else {"success": False}
            search_results = self._gather_search_context(url or config.company_name or "")

            # Step 2: Agent proposal (URL + config + classification)
            analysis_agent = SourceAnalysisAgent(self.agent_manager)
            analysis = analysis_agent.analyze(
                url=url,
                company_name=config.company_name,
                company_id=config.company_id,
                fetch_result=fetch_result,
                search_results=search_results,
            )

            # Resolve company + aggregator
            aggregator_domain = analysis.aggregator_domain
            company_name = config.company_name or analysis.company_name
            company_id = config.company_id
            company_created = False

            if company_name and not company_id:
                company_record = self.companies_manager.get_or_create_company(
                    company_name=company_name,
                    company_website=None,
                )
                company_id = company_record.get("id")
                company_created = not company_record.get("about")

            # Deduplicate existing source on same aggregator + company
            if company_id and aggregator_domain:
                existing = self.sources_manager.get_source_by_company_and_aggregator(
                    company_id, aggregator_domain
                )
                if existing:
                    self._handle_existing_source(item, existing, context="duplicate")
                    return

            # Build source name
            if company_name and aggregator_domain:
                source_name = f"{company_name} Jobs ({aggregator_domain})"
            elif company_name:
                source_name = f"{company_name} Jobs"
            elif aggregator_domain:
                source_name = f"{aggregator_domain.split('.')[0].title()} Jobs"
            else:
                source_name = f"{(urlparse(url).netloc if url else company_name) or 'Unknown'} Jobs"

            source_config = analysis.source_config or {"type": "html", "url": url, "headers": {}}
            source_type = source_config.get("type", "unknown")

            disabled_notes = analysis.disable_notes or ""
            should_disable = analysis.should_disable or analysis.classification in (
                SourceClassification.SINGLE_JOB_LISTING,
                SourceClassification.ATS_PROVIDER_SITE,
                SourceClassification.INVALID,
            )

            probe_result = None
            if not should_disable:
                probe_result = self._probe_config(source_type, source_config)

                if probe_result.status == "error":
                    # One-shot AI repair for common, recoverable errors (404/403/empty body, wrong endpoint)
                    repair = self._agent_repair_error(
                        company_name=company_name,
                        config=source_config,
                        probe=probe_result,
                    )
                    if repair and repair.get("decision") == "update_config":
                        updated_config = repair.get("config")
                        if updated_config:
                            retry = self._probe_config(
                                updated_config.get("type", source_type), updated_config
                            )
                            if retry.status in ("success", "empty"):
                                source_config = updated_config
                                probe_result = retry
                            else:
                                should_disable = True
                                disabled_notes = (
                                    retry.hint or repair.get("reason") or disabled_notes
                                )
                        else:
                            should_disable = True
                            disabled_notes = repair.get("reason") or disabled_notes
                    else:
                        should_disable = True
                        repair_reason = repair.get("reason") if repair else None
                        disabled_notes = repair_reason or probe_result.hint or disabled_notes
                elif probe_result.status == "empty":
                    validation = self._agent_validate_empty(
                        company_name=company_name,
                        config=source_config,
                        probe=probe_result,
                    )
                    if validation.get("decision") == "invalid":
                        should_disable = True
                        disabled_notes = validation.get("reason") or disabled_notes
                    elif validation.get("decision") == "update_config":
                        updated_config = validation.get("config")
                        if updated_config:
                            retry = self._probe_config(
                                updated_config.get("type", source_type), updated_config
                            )
                            if retry.status == "success":
                                source_config = updated_config
                                probe_result = retry
                            elif retry.status == "empty":
                                source_config = updated_config
                                probe_result = retry
                            else:
                                should_disable = True
                                disabled_notes = (
                                    retry.hint or validation.get("reason") or disabled_notes
                                )
                    # valid_empty just passes through (active with 0 jobs)

            # Attach probe diagnostics
            if probe_result:
                source_config = dict(source_config)
                source_config["probe_status"] = probe_result.status
                source_config["probe_job_count"] = probe_result.job_count
                if probe_result.hint:
                    source_config["probe_hint"] = probe_result.hint

            if disabled_notes and not source_config.get("disabled_notes"):
                source_config["disabled_notes"] = disabled_notes

            # Set disabled_tags for non-recoverable issues
            if should_disable and analysis.disable_reason:
                tag = DISABLE_REASON_TO_TAG.get(analysis.disable_reason)
                if tag:
                    source_config["disabled_tags"] = [tag]

            initial_status = SourceStatus.DISABLED if should_disable else SourceStatus.ACTIVE

            try:
                dup = self.sources_manager.find_duplicate_candidate(
                    name=source_name,
                    company_id=company_id,
                    aggregator_domain=aggregator_domain,
                    url=url,
                )
                if dup:
                    self._handle_existing_source(item, dup, context="preflight")
                    return

                # Enforce invariant: a source is either company-specific OR an aggregator, not both
                # If company_id exists, this is a company-specific source (drop aggregator_domain)
                # and add company_filter to config so it only scrapes jobs for that company
                if company_id and aggregator_domain:
                    source_config = dict(source_config) if source_config else {}
                    if company_name and not source_config.get("company_filter"):
                        source_config["company_filter"] = company_name
                    aggregator_domain = None
                elif not company_id:
                    # Pure aggregator source - no company_id needed
                    pass

                source_id = self.sources_manager.create_from_discovery(
                    name=source_name,
                    source_type=source_type,
                    config=source_config,
                    company_id=company_id,
                    aggregator_domain=aggregator_domain,
                    status=initial_status,
                )
            except DuplicateSourceError:
                if company_id or aggregator_domain:
                    # Handle race condition - fall back to name lookup for dupe handling
                    existing = self.sources_manager.get_source_by_name(source_name)
                    if existing:
                        self._handle_existing_source(item, existing, context="race")
                        return
                raise

            self._finalize_source_creation(
                item=item,
                source_id=source_id,
                source_type=source_type,
                company_id=company_id,
                company_name=company_name,
                company_created=company_created,
                disabled_notes=disabled_notes,
                initial_status=initial_status,
                url=url,
                source_config=source_config,
            )

        except Exception as e:
            logger.error(f"Error in SOURCE_DISCOVERY: {e}")
            self.queue_manager.update_status(
                item.id,
                QueueStatus.FAILED,
                str(e),
                error_details=traceback.format_exc(),
            )

    def _attempt_fetch(self, url: str) -> Dict[str, Any]:
        """Attempt to fetch URL content and return result context."""
        if not url:
            return {"success": False, "error": "no_url"}

        headers = {
            "User-Agent": "JobFinderBot/1.0",
            "Accept": "application/json, application/rss+xml, application/xml, text/xml, text/html, */*",
        }

        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            return {
                "success": True,
                "status_code": response.status_code,
                "content_type": response.headers.get("Content-Type", ""),
                "sample": response.text[:5000],  # Truncate for context
            }

        except Exception as e:  # catch broad to surface hint even for non-requests errors/mocks
            status = getattr(getattr(e, "response", None), "status_code", None)
            error_type = "fetch_error"

            if status in (401, 403):
                error_type = "auth_or_bot_protection"
            elif status == 429:
                error_type = "rate_limited"

            message = str(e).lower()
            if "name or service not known" in message or "dns" in message:
                error_type = "dns_error"

            logger.warning(f"Fetch failed for {url}: {error_type} ({e})")

            return {
                "success": False,
                "status_code": status,
                "error": error_type,
                "error_message": str(e),
            }

    def _gather_search_context(self, url: str) -> Optional[List[Dict[str, str]]]:
        """Gather search results about the URL/domain for agent context.

        Args:
            url: URL to search for information about

        Returns:
            List of search result dicts or None
        """
        search_client = get_search_client()
        if not search_client:
            return None

        parsed = urlparse(url)
        domain = parsed.netloc or url
        queries = [
            f"{domain} jobs api",
            f"{domain} careers api",
        ]

        results = []
        for query in queries:
            try:
                search_results = search_client.search(query, max_results=3)
                for r in search_results:
                    results.append(
                        {
                            "title": r.title,
                            "url": r.url,
                            "snippet": r.snippet,
                        }
                    )
                logger.info(f"Tavily search for '{query}' returned {len(search_results)} results")
            except Exception as e:
                logger.debug(f"Search failed for '{query}': {e}")

        return results if results else None

    def _finalize_source_creation(
        self,
        item: JobQueueItem,
        source_id: str,
        source_type: str,
        company_id: Optional[str],
        company_name: Optional[str],
        company_created: bool,
        disabled_notes: str,
        initial_status: SourceStatus,
        url: str,
        source_config: Dict[str, Any],
    ) -> None:
        """Finalize source creation with follow-up tasks.

        Args:
            item: The queue item
            source_id: Created source ID
            source_type: Source type (api, rss, html)
            company_id: Company ID if resolved
            company_name: Company name
            company_created: Whether company was newly created
            disabled_notes: Disable notes if any
            initial_status: Source status
            url: Original URL
        """
        if initial_status == SourceStatus.ACTIVE:
            # Spawn SCRAPE_SOURCE to immediately scrape
            scrape_url = source_config.get("url") if source_config else url
            scrape_item_id = self.queue_manager.spawn_item_safely(
                current_item=item,
                new_item_data={
                    "type": QueueItemType.SCRAPE_SOURCE,
                    "url": scrape_url or self._extract_base_url(url),
                    "company_name": company_name or "",
                    "company_id": company_id,
                    "source": "automated_scan",
                    "source_id": source_id,
                    "scraped_data": {"source_id": source_id},
                },
            )
            if scrape_item_id:
                logger.info(f"Spawned SCRAPE_SOURCE item {scrape_item_id} for source {source_id}")
            else:
                logger.info(f"SCRAPE_SOURCE blocked by spawn rules for source {source_id}")
        else:
            logger.info(
                "Created source %s disabled (%s); skipping immediate scrape",
                source_id,
                disabled_notes,
            )

        # Spawn COMPANY task for new company stubs
        if company_created and company_id:
            company_website = self._extract_base_url(url)
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
                logger.info("COMPANY task blocked by spawn rules for %s", company_name)

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

    def _extract_base_url(self, url: str) -> str:
        """Extract base URL (scheme + domain) from a full URL."""
        try:
            parsed = urlparse(url)
            return f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            return url

    # Known job board API domains that are allowed even if different from original
    KNOWN_JOB_API_DOMAINS = {
        "api.greenhouse.io",
        "boards-api.greenhouse.io",
        "api.lever.co",
        "api.smartrecruiters.com",
        "api.ashbyhq.com",
        "api.recruitee.com",
        "api.workable.com",
    }

    def _is_valid_url_change(self, original_url: str, proposed_url: str) -> bool:
        """Check if a proposed URL change is valid.

        Valid changes:
        - Same domain (e.g., example.com/page -> example.com/api)
        - Same parent domain for Workday (e.g., company.wd5.myworkdayjobs.com)
        - Known job board API domains (Greenhouse, Lever, etc.)
        """
        try:
            original_parsed = urlparse(original_url)
            proposed_parsed = urlparse(proposed_url)

            original_domain = original_parsed.netloc.lower()
            proposed_domain = proposed_parsed.netloc.lower()

            # Same domain is always valid
            if original_domain == proposed_domain:
                return True

            # Check if proposed is a known job API domain
            if proposed_domain in self.KNOWN_JOB_API_DOMAINS:
                return True

            # Allow Workday subdomains (company.wd*.myworkdayjobs.com)
            if "myworkdayjobs.com" in original_domain and "myworkdayjobs.com" in proposed_domain:
                return True

            # Allow API subdomains of same root domain
            # e.g., example.com -> api.example.com
            # Note: This simple approach doesn't handle ccSLDs like .co.uk correctly.
            # For example, api.company.co.uk would incorrectly match other.co.uk.
            # Using tldextract would fix this but adds a dependency for an edge case.
            original_parts = original_domain.split(".")
            proposed_parts = proposed_domain.split(".")
            if len(original_parts) >= 2 and len(proposed_parts) >= 2:
                original_root = ".".join(original_parts[-2:])
                proposed_root = ".".join(proposed_parts[-2:])
                if original_root == proposed_root:
                    return True

            return False
        except Exception:
            return False

    # ============================================================
    # PROBE + VALIDATION HELPERS
    # ============================================================

    # Common bot protection patterns in HTML content
    BOT_PROTECTION_PATTERNS = [
        # Cloudflare
        "cf-browser-verification",
        "cf_clearance",
        "cloudflare",
        "ray id",
        "checking your browser",
        # Generic bot protection
        "captcha",
        "recaptcha",
        "hcaptcha",
        "please verify you are human",
        "access denied",
        "blocked",
        "bot detected",
        "unusual traffic",
        # Auth walls
        "sign in to continue",
        "login required",
        "please log in",
        "authentication required",
    ]

    def _detect_bot_protection(self, content: str) -> Optional[str]:
        """Detect bot protection patterns in content.

        Returns:
            "anti_bot" if bot protection detected
            "auth_required" if auth wall detected
            None if no protection detected
        """
        if not content:
            return None

        content_lower = content.lower()

        # Check for auth patterns first (more specific)
        auth_patterns = [
            "sign in to continue",
            "login required",
            "please log in",
            "authentication required",
        ]
        for pattern in auth_patterns:
            if pattern in content_lower:
                return "auth_required"

        # Check for bot protection patterns
        bot_patterns = [
            "cf-browser-verification",
            "cloudflare",
            "ray id",
            "checking your browser",
            "captcha",
            "recaptcha",
            "hcaptcha",
            "please verify you are human",
            "access denied",
            "bot detected",
            "unusual traffic",
        ]
        for pattern in bot_patterns:
            if pattern in content_lower:
                return "anti_bot"

        # Check for very short HTML responses (often challenge pages)
        # A real job page should have more content
        if len(content.strip()) < 500 and "<html" in content_lower:
            # Short HTML with no job-related content
            if not any(word in content_lower for word in ["job", "career", "position", "opening"]):
                return "anti_bot"

        return None

    def _is_protected_api_error(self, probe: ProbeResult, config: Dict[str, Any]) -> bool:
        """Check if probe failure indicates a protected API endpoint.

        Returns True if:
        - Config is API type AND
        - Probe returned 401 (Unauthorized), 403 (Forbidden), or 422 (Unprocessable)

        These errors typically indicate the API requires authentication, cookies,
        or has bot protection that we can't easily bypass.
        """
        if config.get("type") != "api":
            return False
        return probe.status_code in (401, 403, 422)

    def _is_protected_error(self, probe: ProbeResult, config: Dict[str, Any]) -> Optional[str]:
        """Check if probe failure indicates a protected endpoint.

        Returns:
            "protected_api" for API 401/403/422 errors
            "anti_bot" for bot protection detected in content
            "auth_required" for auth wall detected in content
            None if not a protection-related error
        """
        # Check API errors
        if config.get("type") == "api" and probe.status_code in (401, 403, 422):
            return "protected_api"

        # Check HTML 403 errors
        if probe.status_code == 403:
            return "anti_bot"

        # Check content for bot protection patterns
        if probe.sample:
            return self._detect_bot_protection(probe.sample)

        return None

    def _probe_config(self, source_type: str, config: Dict[str, Any]) -> ProbeResult:
        """Lightweight probe: one request + count jobs, with a hint/sample."""
        try:
            expanded = expand_config(source_type, config)
            sc = SourceConfig.from_dict(expanded)
            sc.validate()
        except Exception as exc:  # noqa: BLE001
            return ProbeResult(status="error", hint=f"Invalid config: {exc}")

        headers = {
            "User-Agent": "JobFinderBot/1.0",
            "Accept": "application/json, application/rss+xml, application/xml, text/xml, text/html, */*",
        }
        headers.update(sc.headers or {})

        resp = None
        try:
            if sc.type == "api":
                if sc.method.upper() == "POST":
                    headers.setdefault("Content-Type", "application/json")
                    resp = requests.post(sc.url, headers=headers, json=sc.post_body, timeout=25)
                else:
                    resp = requests.get(sc.url, headers=headers, timeout=25)
                status_code = resp.status_code
                text_sample = (resp.text or "")[:4000]
                resp.raise_for_status()
                data = resp.json()
                scraper = GenericScraper(SourceConfig.from_dict(expanded))
                items = scraper._navigate_path(data, sc.response_path)  # type: ignore[attr-defined]
                job_count = len(items or [])
                return ProbeResult(
                    status="success" if job_count > 0 else "empty",
                    job_count=job_count,
                    status_code=status_code,
                    sample=text_sample,
                )

            if sc.type == "rss":
                resp = requests.get(sc.url, headers=headers, timeout=25)
                status_code = resp.status_code
                text_sample = (resp.text or "")[:4000]
                resp.raise_for_status()
                feed = feedparser.parse(resp.text)
                job_count = len(feed.entries or [])
                return ProbeResult(
                    status="success" if job_count > 0 else "empty",
                    job_count=job_count,
                    status_code=status_code,
                    sample=text_sample,
                )

            if sc.type == "html":
                if sc.requires_js:
                    # Use Playwright for JS-rendered sources
                    # Use shorter timeout for probes to fail fast on bad selectors
                    result = get_renderer().render(
                        RenderRequest(
                            url=sc.url,
                            wait_for_selector=sc.render_wait_for or sc.job_selector,
                            wait_timeout_ms=PROBE_RENDER_TIMEOUT_MS,
                            block_resources=True,
                            headers=headers,
                        )
                    )
                    html = result.html
                    # Use status code from renderer if available, default to 200
                    status_code = getattr(result, "status_code", 200)
                else:
                    resp = requests.get(sc.url, headers=headers, timeout=25)
                    status_code = resp.status_code
                    resp.raise_for_status()
                    html = resp.text
                soup = BeautifulSoup(html, "html.parser")
                items = soup.select(getattr(sc, "job_selector", ""))
                job_count = len(items)
                return ProbeResult(
                    status="success" if job_count > 0 else "empty",
                    job_count=job_count,
                    status_code=status_code,
                    sample=html[:4000],
                )

            return ProbeResult(status="error", hint=f"Unknown source type {sc.type}")

        except Exception as exc:  # noqa: BLE001
            status_code = getattr(resp, "status_code", None) if resp is not None else None
            return ProbeResult(status="error", status_code=status_code, hint=str(exc))

    def _agent_validate_empty(
        self,
        company_name: Optional[str],
        config: Dict[str, Any],
        probe: ProbeResult,
    ) -> Dict[str, Any]:
        """Ask agent what to do when probe returns zero jobs."""
        if not self.agent_manager:
            return {"decision": "valid_empty"}

        sample = (probe.sample or "")[:2000]
        prompt = (
            "You proposed a job board config but the probe returned 0 jobs.\n"
            f"Company: {company_name or 'Unknown'}\n"
            f"URL: {config.get('url', '')}\n"
            f"Type: {config.get('type', '')}\n"
            f"Status: {probe.status_code or 'n/a'}\n"
            "Sample (truncated):\n" + sample + "\n"
            "Decide: valid_empty (board is legit but empty) | update_config (return fixed config) | invalid.\n"
            'Respond JSON: {"decision": "valid_empty|update_config|invalid", '
            '"reason": "short", "config": {..optional..}}.'
        )

        try:
            agent_result = self.agent_manager.execute(
                task_type="analysis",
                prompt=prompt,
                max_tokens=500,
                temperature=0.0,
            )
            data = json.loads(extract_json_from_response(agent_result.text))
            return data if isinstance(data, dict) else {"decision": "valid_empty"}
        except Exception:  # noqa: BLE001
            return {"decision": "valid_empty"}

    def _agent_repair_error(
        self,
        company_name: Optional[str],
        config: Dict[str, Any],
        probe: ProbeResult,
    ) -> Optional[Dict[str, Any]]:
        """Ask agent for a single-shot repair when probe errors (404/403/wrong endpoint)."""
        if not self.agent_manager:
            return None

        sample = (probe.sample or "")[:1200]
        prompt = (
            "You proposed a job board config and the probe errored.\n"
            f"Company: {company_name or 'Unknown'}\n"
            f"URL: {config.get('url', '')}\n"
            f"Type: {config.get('type', '')}\n"
            f"Status: {probe.status_code or 'n/a'}\n"
            f"Error hint: {probe.hint or ''}\n"
            "Sample/truncated response:\n" + sample + "\n"
            "Decide: update_config (return corrected config) | invalid.\n"
            'Respond JSON: {"decision": "update_config|invalid", "reason": "short", "config": {..optional..}}.'
            "If Workday/Lever/Greenhouse/Ashby is detected, return the correct endpoint/slug."
        )

        try:
            agent_result = self.agent_manager.execute(
                task_type="analysis",
                prompt=prompt,
                max_tokens=400,
                temperature=0.0,
            )
            data = json.loads(extract_json_from_response(agent_result.text))
            return data if isinstance(data, dict) else None
        except Exception:  # noqa: BLE001
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

        # Refresh config-driven components before processing
        self._refresh_runtime_config()

        # Check item.source_id first (populated from input), then fall back to scraped_data (output)
        source_id = item.source_id or (item.scraped_data and item.scraped_data.get("source_id"))
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
                logger.info("Skipping disabled source %s (%s)", source_name, source.get("id"))
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
                    # Auto-disable the source to prevent repeated failures
                    self.sources_manager.disable_source_with_note(
                        source.get("id"),
                        f"Invalid configuration: {e}. Source needs manual review.",
                    )
                    self.queue_manager.update_status(
                        item.id,
                        QueueStatus.FAILED,
                        f"Invalid config (source disabled): {e}",
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
                try:
                    self.sources_manager.record_scraping_failure(
                        source_id=source.get("id"),
                        error=str(scrape_error),
                    )
                except Exception as record_err:
                    # Don't allow bookkeeping failures to crash the worker
                    logger.error(
                        "Failed to record scrape failure for %s: %s",
                        source_name,
                        record_err,
                        exc_info=True,
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
        Use AI analysis to repair/improve a weak source config.

        Returns a new config dict or None if healing failed/disabled.
        """
        try:
            # Gather context for the agent
            fetch_result = self._attempt_fetch(url)

            # Run analysis
            analysis_agent = SourceAnalysisAgent(self.agent_manager)
            analysis = analysis_agent.analyze(
                url=url,
                company_name=company_name,
                fetch_result=fetch_result,
            )

            if analysis.source_config and not analysis.should_disable:
                logger.info(
                    "Updated source config via self-heal for %s (id=%s)",
                    company_name or source.get("name", "unknown"),
                    source.get("id"),
                )
                return analysis.source_config

            logger.info("Self-heal could not produce a better config for %s", url)
            return None

        except Exception as e:
            logger.warning("Self-heal failed for %s: %s", url, e)
            return None

    # ============================================================
    # SOURCE RECOVERY
    # ============================================================

    def process_source_recover(self, item: JobQueueItem) -> None:
        """
        Process SOURCE_RECOVER queue item.

        Agent-powered investigation and repair of disabled sources.
        Uses Playwright to render JS pages so the agent can see the actual DOM.

        Flow:
        1. Load source from DB
        2. For HTML/JS sources, render with Playwright to get actual DOM
        3. Send rendered HTML + error history to AI agent
        4. Agent proposes fixed config
        5. Test proposed config with probe
        6. If jobs found, update source and mark active

        Args:
            item: Queue item with source_id
        """
        if not item.id:
            logger.error("Cannot process SOURCE_RECOVER without ID")
            return

        source_id = item.source_id or (item.scraped_data and item.scraped_data.get("source_id"))
        if not source_id:
            self.queue_manager.update_status(
                item.id, QueueStatus.FAILED, "SOURCE_RECOVER requires source_id"
            )
            return

        self.queue_manager.update_status(
            item.id, QueueStatus.PROCESSING, f"Recovering source {source_id}"
        )

        try:
            source = self.sources_manager.get_source_by_id(source_id)
            if not source:
                self.queue_manager.update_status(
                    item.id, QueueStatus.FAILED, f"Source not found: {source_id}"
                )
                return

            source_name = source.get("name", "Unknown")
            config = source.get("config", {})
            url = config.get("url", "")
            source_type = config.get("type", "html")

            # Check for non-recoverable tags - skip recovery if present
            disabled_tags = config.get("disabled_tags", [])
            if disabled_tags:
                tag_labels = {
                    "anti_bot": "bot protection",
                    "auth_required": "authentication required",
                    "protected_api": "protected API",
                }
                tag_descriptions = [tag_labels.get(t, t) for t in disabled_tags]
                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.FAILED,
                    f"{source_name} has non-recoverable issues: {', '.join(tag_descriptions)}. "
                    f"Recovery is not possible for sources with these tags.",
                    error_details="Non-recoverable tags indicate systemic issues "
                    "(bot protection, authentication requirements, protected APIs) "
                    "that cannot be fixed through automated recovery.",
                )
                logger.info(
                    "SOURCE_RECOVER skipped for %s: non-recoverable tags %s",
                    source_id,
                    disabled_tags,
                )
                return

            if not url:
                self.queue_manager.update_status(
                    item.id, QueueStatus.FAILED, f"Source {source_name} has no URL"
                )
                return

            logger.info(f"SOURCE_RECOVER: Attempting recovery for {source_name} ({url})")

            # Get error history from config
            disabled_notes = config.get("disabled_notes", "")

            # Fetch content sample for agent diagnosis
            content_sample = self._fetch_content_sample(url, source_type, config)

            # Check content sample for obvious bot protection BEFORE calling agent
            content_protection = self._detect_bot_protection(content_sample)
            if content_protection:
                tag = content_protection  # anti_bot or auth_required
                tag_labels = {
                    "anti_bot": "Bot protection",
                    "auth_required": "Authentication required",
                }
                self.sources_manager.disable_source_with_tags(
                    source_id,
                    f"{tag_labels.get(tag, tag)} detected in content",
                    tags=[tag],
                )
                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.FAILED,
                    f"{source_name}: {tag_labels.get(tag, tag)} detected. "
                    f"Source marked as non-recoverable.",
                    error_details=f"Content sample shows protection that cannot be bypassed.\n"
                    f"Tag applied: {tag}",
                )
                logger.info(
                    "SOURCE_RECOVER: Detected %s in content for %s, marking non-recoverable",
                    tag,
                    source_name,
                )
                return

            # Ask agent to diagnose and propose fix
            recovery_result = self._agent_recover_source(
                source_name=source_name,
                url=url,
                current_config=config,
                disabled_notes=disabled_notes,
                content_sample=content_sample,
            )

            # Handle agent diagnosis of non-recoverable issues
            if not recovery_result.can_recover or recovery_result.disable_reason:
                # Map agent's disable_reason to tag
                reason_to_tag = {
                    "bot_protection": "anti_bot",
                    "auth_required": "auth_required",
                    "protected_api": "protected_api",
                }
                agent_tag = (
                    reason_to_tag.get(recovery_result.disable_reason)
                    if recovery_result.disable_reason
                    else None
                )

                if agent_tag:
                    # Apply the tag to mark as non-recoverable
                    self.sources_manager.disable_source_with_tags(
                        source_id,
                        recovery_result.diagnosis
                        or f"Agent diagnosed: {recovery_result.disable_reason}",
                        tags=[agent_tag],
                    )
                    self.queue_manager.update_status(
                        item.id,
                        QueueStatus.FAILED,
                        f"{source_name}: Non-recoverable issue detected ({recovery_result.disable_reason}). "
                        f"Source marked with tag: {agent_tag}",
                        error_details=f"Agent diagnosis: {recovery_result.diagnosis}\n"
                        f"Disable reason: {recovery_result.disable_reason}\n"
                        f"Tag applied: {agent_tag}",
                    )
                    logger.info(
                        "SOURCE_RECOVER: Agent diagnosed %s as non-recoverable (%s), applied tag %s",
                        source_name,
                        recovery_result.disable_reason,
                        agent_tag,
                    )
                else:
                    # Agent couldn't propose a fix but no specific non-recoverable reason
                    self.queue_manager.update_status(
                        item.id,
                        QueueStatus.FAILED,
                        f"Agent could not propose a fix for {source_name}",
                        error_details=f"Diagnosis: {recovery_result.diagnosis}\n"
                        f"Current config: {json.dumps(config, indent=2)}",
                    )
                return

            fixed_config = recovery_result.config
            if not fixed_config:
                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.FAILED,
                    f"Agent could not propose a fix for {source_name}",
                    error_details=f"Diagnosis: {recovery_result.diagnosis}\n"
                    f"Current config: {json.dumps(config, indent=2)}",
                )
                return

            # Test the proposed config
            probe = self._probe_config(fixed_config.get("type", source_type), fixed_config)
            if probe.status == "success" and probe.job_count > 0:
                # Update source with fixed config and mark active
                self.sources_manager.update_config(source_id, fixed_config)
                self.sources_manager.update_source_status(source_id, SourceStatus.ACTIVE)
                self.queue_manager.update_status(
                    item.id,
                    QueueStatus.SUCCESS,
                    f"Recovered {source_name}: found {probe.job_count} jobs",
                )
                logger.info(
                    f"SOURCE_RECOVER: Successfully recovered {source_name} with {probe.job_count} jobs"
                )
            else:
                # Check if probe detected protection issues
                protection_tag = self._is_protected_error(probe, fixed_config)
                if protection_tag:
                    tag_labels = {
                        "protected_api": f"API endpoint is protected (HTTP {probe.status_code})",
                        "anti_bot": "Bot protection detected",
                        "auth_required": "Authentication required",
                    }
                    self.sources_manager.disable_source_with_tags(
                        source_id,
                        tag_labels.get(protection_tag, protection_tag),
                        tags=[protection_tag],
                    )
                    self.queue_manager.update_status(
                        item.id,
                        QueueStatus.FAILED,
                        f"{source_name}: {tag_labels.get(protection_tag, protection_tag)}. "
                        f"Source marked as non-recoverable.",
                        error_details=f"Probe detected protection that cannot be bypassed.\n"
                        f"Tag applied: {protection_tag}\n"
                        f"Probe status: {probe.status}, status_code: {probe.status_code}",
                    )
                    logger.info(
                        "SOURCE_RECOVER: Probe detected %s for %s, marking non-recoverable",
                        protection_tag,
                        source_name,
                    )
                else:
                    # Keep disabled but log what we tried - no tags applied
                    self.queue_manager.update_status(
                        item.id,
                        QueueStatus.FAILED,
                        f"Proposed config for {source_name} failed: {probe.hint or 'found 0 jobs'}",
                        error_details=f"Probe status: {probe.status}\n"
                        f"Proposed config: {json.dumps(fixed_config, indent=2)}\n"
                        f"Sample: {probe.sample[:1000] if probe.sample else 'none'}",
                    )

        except Exception as e:
            logger.error(f"SOURCE_RECOVER failed for {source_id}: {e}")
            self.queue_manager.update_status(
                item.id,
                QueueStatus.FAILED,
                f"Recovery failed: {e}",
                error_details=traceback.format_exc(),
            )

    def _fetch_content_sample(self, url: str, source_type: str, config: Dict[str, Any]) -> str:
        """
        Fetch content sample for agent diagnosis.

        For HTML sources, always uses Playwright to see actual rendered DOM.
        Falls back to static fetch if Playwright fails.
        For API sources, fetches JSON response with status code.

        Args:
            url: Source URL to fetch
            source_type: "html" or "api"
            config: Source config with render settings

        Returns:
            Content sample string (HTML, JSON, or error message)
        """
        if source_type == "html":
            try:
                result = get_renderer().render(
                    RenderRequest(
                        url=url,
                        wait_for_selector=config.get("render_wait_for")
                        or config.get("job_selector")
                        or "body",
                        wait_timeout_ms=config.get("render_timeout_ms", 25000),
                        block_resources=True,
                        headers={"User-Agent": "JobFinderBot/1.0"},
                    )
                )
                return result.html[:CONTENT_SAMPLE_FETCH_LIMIT]
            except Exception as playwright_error:
                logger.warning(
                    f"Playwright render failed for {url}, falling back to static: {playwright_error}"
                )
                try:
                    resp = requests.get(url, headers={"User-Agent": "JobFinderBot/1.0"}, timeout=25)
                    return resp.text[:CONTENT_SAMPLE_FETCH_LIMIT]
                except Exception as fallback_error:
                    return f"[Fetch failed: {fallback_error}]"
        elif source_type == "api":
            try:
                resp = requests.get(
                    url,
                    headers={"User-Agent": "JobFinderBot/1.0", "Accept": "application/json"},
                    timeout=25,
                )
                # Leave room for status prefix in the sample
                api_content_limit = CONTENT_SAMPLE_FETCH_LIMIT - 1000
                return (
                    f"[API Response - Status {resp.status_code}]\n{resp.text[:api_content_limit]}"
                )
            except Exception as e:
                return f"[API fetch failed: {e}]"
        return "[Unknown source type]"

    def _agent_recover_source(
        self,
        source_name: str,
        url: str,
        current_config: Dict[str, Any],
        disabled_notes: str,
        content_sample: str,
    ) -> RecoveryResult:
        """Ask agent to diagnose and propose a fixed config for a broken source.

        Returns a RecoveryResult with:
        - config: Proposed config if recoverable
        - can_recover: False if agent determines issue is non-recoverable
        - disable_reason: The reason if non-recoverable (bot_protection, auth_required, etc.)
        - diagnosis: Human-readable explanation
        """
        if not self.agent_manager:
            return RecoveryResult(can_recover=False, diagnosis="No agent available")

        source_type = current_config.get("type", "html")

        prompt = f"""You are diagnosing a broken job source. Analyze the content sample and either:
1. Propose a working configuration if the issue is fixable, OR
2. Diagnose why it cannot be recovered if the issue is non-recoverable

## Source: {source_name}
URL: {url}
Type: {source_type}

## Current Configuration (BROKEN)
```json
{json.dumps(current_config, indent=2)}
```

## Error History
{disabled_notes or "No error history available"}

## Content Sample (rendered HTML or API response)
```
{content_sample[:CONTENT_SAMPLE_PROMPT_LIMIT]}
```

## CRITICAL: First determine if recovery is possible

Look for these NON-RECOVERABLE issues:
- **bot_protection**: Cloudflare challenge, CAPTCHA, "checking your browser", "Ray ID", WAF blocking
- **auth_required**: Login page, "sign in to continue", OAuth redirect, session cookie required
- **protected_api**: API returns 401/403/422, requires authentication token

If you detect ANY of these issues, set can_recover=false and specify the disable_reason.

## Response Format

Return JSON with this structure:
```json
{{
  "can_recover": true/false,
  "disable_reason": "bot_protection|auth_required|protected_api|null",
  "diagnosis": "Human-readable explanation of the issue",
  "config": {{ ... proposed config if can_recover is true, otherwise null ... }}
}}
```

## If recovery IS possible (can_recover: true):

Include a config object with:

### For HTML sources (type: "html"):
- type: "html"
- url: The page URL
- job_selector: CSS selector matching each job card/row
- fields.title: CSS selector for title within each job card
- fields.url: CSS selector with attribute for link (e.g., "a@href")
- requires_js: true if JavaScript rendering is needed
- render_wait_for: CSS selector to wait for when requires_js is true

### For API sources (type: "api"):
- type: "api"
- url: The API endpoint URL
- method: "GET" or "POST"
- post_body: Request body for POST requests
- response_path: JSON path to jobs array
- fields.title: JSON key for job title
- fields.url: JSON key for job URL
- base_url: Base URL for relative URLs if needed

## CRITICAL RULES
1. ONLY use type "html" or "api" - NEVER use "json"
2. All CSS selectors must be REAL selectors found in the content sample
3. NEVER invent or guess API URLs
4. If you see bot protection or auth walls, set can_recover=false

Return ONLY valid JSON (no markdown, no explanation outside the JSON).
"""

        try:
            result = self.agent_manager.execute(
                task_type="analysis",
                prompt=prompt,
                max_tokens=1200,
                temperature=0.0,
            )
            data = json.loads(extract_json_from_response(result.text))

            # Log agent's raw response for debugging
            response_json = json.dumps(data)
            logger.info(
                "SOURCE_RECOVER agent response for %s: %s%s",
                source_name,
                response_json[:1500],
                "..." if len(response_json) > 1500 else "",
            )

            if not isinstance(data, dict):
                logger.warning("Agent returned non-dict for %s: %s", source_name, type(data))
                return RecoveryResult(can_recover=False, diagnosis="Invalid agent response")

            # Check if agent determined recovery is not possible
            can_recover = data.get("can_recover", True)
            disable_reason = data.get("disable_reason")
            diagnosis = data.get("diagnosis", "")

            if not can_recover or disable_reason:
                logger.info(
                    "Agent diagnosed %s as non-recoverable: %s (%s)",
                    source_name,
                    disable_reason,
                    diagnosis,
                )
                return RecoveryResult(
                    can_recover=False,
                    disable_reason=disable_reason,
                    diagnosis=diagnosis,
                )

            # Agent says recovery is possible - validate the proposed config
            config_data = data.get("config") or data  # Handle both formats

            # Check if agent proposed a different type than current
            proposed_type = config_data.get("type", source_type)

            # Normalize type=json to type=api
            if proposed_type == "json":
                proposed_type = "api"
                config_data["type"] = "api"

            # Validate proposed URL domain
            original_url = current_config.get("url", "")
            proposed_url = config_data.get("url")
            if proposed_url and not self._is_valid_url_change(original_url, proposed_url):
                logger.warning(
                    "Agent proposed URL on different domain for %s: %s -> %s",
                    source_name,
                    original_url,
                    proposed_url,
                )
                config_data["url"] = original_url

            # Validate and merge config
            if (
                proposed_type == "html"
                and config_data.get("job_selector")
                and config_data.get("fields")
            ):
                merged = dict(config_data)
                if not config_data.get("url"):
                    merged["url"] = current_config.get("url")
                merged["type"] = "html"
                return RecoveryResult(config=merged, diagnosis=diagnosis)

            if (
                proposed_type == "api"
                and config_data.get("fields")
                and config_data.get("response_path")
            ):
                merged = dict(config_data)
                if not config_data.get("url"):
                    merged["url"] = current_config.get("url")
                merged["type"] = "api"
                if "body" in merged and "post_body" not in merged:
                    merged["post_body"] = merged.pop("body")
                return RecoveryResult(config=merged, diagnosis=diagnosis)

            # Config validation failed
            logger.warning(
                "Agent proposal for %s failed validation: type=%s, has_job_selector=%s, "
                "has_fields=%s, has_response_path=%s",
                source_name,
                proposed_type,
                bool(config_data.get("job_selector")),
                bool(config_data.get("fields")),
                bool(config_data.get("response_path")),
            )
            return RecoveryResult(
                can_recover=False,
                diagnosis=diagnosis or "Agent config failed validation",
            )

        except Exception as e:
            logger.warning(f"Agent recovery failed for {source_name}: {e}")
            return RecoveryResult(can_recover=False, diagnosis=str(e))
