"""Company information fetcher using search APIs and AI extraction.

Philosophy: Search by company name first, then AI extracts structured data.
Scraping is supplementary, not primary. URL is a hint, not a requirement.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional, TYPE_CHECKING
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from job_finder.ai.response_parser import extract_json_from_response
from job_finder.ai.search_client import get_search_client, SearchResult
from job_finder.ai.wikipedia_client import get_wikipedia_client
from job_finder.logging_config import format_company_name
from job_finder.settings import get_text_limits

if TYPE_CHECKING:
    from job_finder.ai.agent_manager import AgentManager

logger = logging.getLogger(__name__)

HEADCOUNT_INSTRUCTIONS = (
    '- For headcount: convert ranges like "51-200 employees", "1,001–5,000", or '
    '"200+ employees" into a number (use the upper bound or stated number). Do NOT invent '
    "numbers if none are stated.\n"
    "- Always set both: employeeCount (integer or null) AND companySizeCategory using bands: "
    "small (<100), medium (100-999), large (1000+). If no numeric clue, leave both blank/null "
    'unless text explicitly states size (e.g., "Fortune 500" => large, "startup of ~50" => small).\n'
    "- Ignore headcounts that clearly refer to a parent/portfolio company rather than this specific company."
)

# Domains that often appear but rarely represent the company homepage; we down-rank
# them instead of hard-blocking to avoid brittleness.
DISCOURAGED_DOMAINS = {
    "lsvp.com",  # Lightspeed (VC) – was picked for Grafana previously
    "crunchbase.com",
    "pitchbook.com",
    "linkedin.com",
    "angel.co",
    "imdb.com",
    "rottentomatoes.com",
}

# Tokens that indicate non-company entities we should avoid (movies, songs, etc.)
NON_COMPANY_TOKENS = {"film", "movie", "episode", "song", "album", "soundtrack"}

# Known Workday subdomain to company name mappings (stock tickers, abbreviations)
WORKDAY_COMPANY_MAP = {
    "mdlz": "Mondelez International",
    "nvidia": "NVIDIA",
    "msft": "Microsoft",
    "goog": "Google",
    "amzn": "Amazon",
    "meta": "Meta",
    "aapl": "Apple",
    "ibm": "IBM",
    "intc": "Intel",
    "csco": "Cisco",
    "orcl": "Oracle",
    "sap": "SAP",
    "crm": "Salesforce",
    "adbe": "Adobe",
    "vmw": "VMware",
    "dell": "Dell",
    "hpe": "Hewlett Packard Enterprise",
    "jnj": "Johnson & Johnson",
    "pfe": "Pfizer",
    "mrk": "Merck",
    "unh": "UnitedHealth",
    "wmt": "Walmart",
    "tgt": "Target",
    "cost": "Costco",
    "hd": "Home Depot",
    "low": "Lowe's",
}


class CompanyInfoFetcher:
    """Fetches and extracts company information using search + AI."""

    def __init__(
        self,
        agent_manager: Optional["AgentManager"] = None,
        db_path: Optional[str] = None,
        sources_manager=None,
    ):
        """
        Initialize company info fetcher.

        Args:
            agent_manager: AgentManager for AI-powered extraction
            db_path: Database path (deprecated, use sources_manager instead)
            sources_manager: JobSourcesManager for aggregator domain lookup
        """
        self.agent_manager = agent_manager
        self.db_path = db_path
        self.sources_manager = sources_manager
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )
        self.search_client = get_search_client()
        self.wikipedia_client = get_wikipedia_client()
        # Cache structured facts (e.g., Wikipedia) per company name to reuse across passes
        self._wiki_cache: Dict[str, Any] = {}

    # ============================================================
    # MAIN ENTRY POINT
    # ============================================================

    def fetch_company_info(
        self,
        company_name: str,
        url_hint: Optional[str] = None,
        source_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Fetch comprehensive company information using two passes:
        1) FAST: light search + wikipedia
        2) FOCUSED (only if needed): stronger instructions + broader queries/scrape

        The first acceptable result is returned; otherwise the better of the two.
        """
        fast = self._run_enrichment_pass(company_name, url_hint, source_context, mode="fast")
        if self._is_acceptable(fast):
            return fast

        focused = self._run_enrichment_pass(company_name, url_hint, source_context, mode="focused")
        if self._is_acceptable(focused):
            return focused

        # Fall back to whichever is more informative
        return (
            focused if self._score_completeness(focused) >= self._score_completeness(fast) else fast
        )

    # ============================================================
    # Pass runner
    # ============================================================
    def _run_enrichment_pass(
        self,
        company_name: str,
        url_hint: Optional[str],
        source_context: Optional[Dict[str, Any]],
        mode: str = "fast",
    ) -> Dict[str, Any]:
        _, company_display = format_company_name(company_name)
        logger.info("Enriching %s (%s pass)", company_display, mode.upper())
        _, company_display = format_company_name(company_name)
        logger.info(f"Fetching company info for {company_display}")

        # Check if we can extract better company name from Workday URL
        if source_context:
            better_name = self._extract_company_from_workday_url(source_context.get("base_url", ""))
            if better_name and better_name.lower() != company_name.lower():
                logger.info(
                    "Workday URL suggests company is '%s' not '%s'",
                    better_name,
                    company_name,
                )
                # Use the better name for search, but keep original for record
                search_name = better_name
            else:
                search_name = company_name
        else:
            search_name = company_name

        result: Dict[str, Any] = {
            "name": company_name,
            "website": "",
            "about": "",
            "culture": "",
            "mission": "",
            "size": "",
            "industry": "",
            "founded": "",
            "headquarters": "",
            "employeeCount": None,
            "companySizeCategory": "",
            "isRemoteFirst": False,
            "aiMlFocus": False,
            "timezoneOffset": None,
            "products": [],
            "techStack": [],
        }

        try:
            # STEP 0: Try Wikipedia first (cached per company name, both passes)
            wiki_info = self._wiki_cache.get(search_name.lower())
            if wiki_info is None:
                wiki_info = self._try_wikipedia(search_name)
                if wiki_info:
                    self._wiki_cache[search_name.lower()] = wiki_info

            wiki_website = wiki_info.get("website") if wiki_info else None
            if wiki_info:
                result = self._merge_company_info(
                    result, wiki_info, company_name=company_name, preferred_website=wiki_website
                )
                logger.info(
                    "Wikipedia found data for %s: about=%d chars",
                    company_display,
                    len(result.get("about", "")),
                )

            # STEP 1: Search for company info (fills gaps Wikipedia doesn't cover)
            search_info = self._search_and_extract(
                search_name,
                source_context,
                wiki_website=wiki_website,
                wiki_info=wiki_info,
                mode=mode,
            )
            if search_info:
                result = self._merge_company_info(
                    result, search_info, company_name=company_name, preferred_website=wiki_website
                )
                logger.info(
                    "[%s] Search extraction for %s: about=%d chars",
                    mode,
                    company_display,
                    len(result.get("about", "")),
                )

            # STEP 2: Determine best website URL
            # Priority: extracted website > url_hint (if not job board/search engine)
            website = result.get("website") or ""
            if not website and url_hint:
                if not self._is_job_board_url(url_hint) and not self._is_search_engine_url(
                    url_hint
                ):
                    website = url_hint
                    result["website"] = website

            # STEP 3: Optional scrape for additional detail (focused pass or when gaps)
            if (
                website
                and self._needs_enrichment(result)
                and not self._is_search_engine_url(website)
            ):
                scraped_info = self._scrape_website(website, search_name)
                if scraped_info:
                    result = self._merge_company_info(
                        result,
                        scraped_info,
                        company_name=company_name,
                        preferred_website=wiki_website,
                    )
                    logger.info("[%s] Supplemented with scrape data for %s", mode, company_display)

            # Final website selection: prefer Wikipedia site; lightly probe candidate to avoid obvious mismatches
            result["website"] = self._choose_best_website(
                candidate=result.get("website"),
                wiki_website=wiki_website,
                company_name=company_name,
            )

            logger.info(
                "Final company info for %s: about=%d chars, culture=%d chars",
                company_display,
                len(result.get("about", "")),
                len(result.get("culture", "")),
            )

        except Exception as e:
            logger.error(
                f"Error fetching company info for {company_display} ({type(e).__name__}): {e}",
                exc_info=True,
            )

        return result

    # ============================================================
    # WIKIPEDIA LOOKUP (STEP 0)
    # ============================================================

    def _try_wikipedia(self, company_name: str) -> Optional[Dict[str, Any]]:
        """
        Attempt Wikipedia lookup for company.

        Args:
            company_name: Company name to search for (should be post-Workday resolution)

        Returns:
            Dict with company info fields, or None if not found/error
        """
        try:
            return self.wikipedia_client.search_company(company_name)
        except Exception as e:
            logger.debug(f"Wikipedia lookup failed for {company_name}: {e}")
            return None

    # ============================================================
    # SEARCH + AI EXTRACTION (Primary Method)
    # ============================================================

    def _search_and_extract(
        self,
        company_name: str,
        source_context: Optional[Dict[str, Any]] = None,
        wiki_website: Optional[str] = None,
        wiki_info: Optional[Dict[str, Any]] = None,
        mode: str = "fast",
    ) -> Optional[Dict[str, Any]]:
        """
        Search for company and extract structured info from results.

        Uses multi-query strategy: tries multiple search queries until
        one returns quality results.

        Args:
            company_name: Company name to search for
            source_context: Optional context for better search queries

        Returns:
            Extracted company info dict, or None if search/extraction failed
        """
        if not self.search_client:
            logger.debug("No search client configured, skipping search")
            return self._fallback_ai_search(company_name, wiki_info=wiki_info, mode=mode)

        try:
            # Try multiple search queries until one works
            results = self._search_with_fallbacks(company_name, source_context, mode=mode)

            if not results:
                logger.warning("No quality search results for %s", company_name)
                return self._fallback_ai_search(company_name, wiki_info=wiki_info, mode=mode)

            # Format results for AI extraction
            search_context = self._format_search_results(results)

            # Collect evidence excerpts (official site + LinkedIn) for the agent
            evidence_blocks: List[str] = []
            official_url = self._pick_official_candidate(results, company_name)
            linkedin_url = self._pick_linkedin_candidate(results)

            if official_url:
                excerpt = self._fetch_page_excerpt(official_url)
                if excerpt:
                    evidence_blocks.append(f"Official site excerpt ({official_url}):\n{excerpt}")

            if linkedin_url:
                excerpt = self._fetch_page_excerpt(linkedin_url)
                if excerpt:
                    evidence_blocks.append(f"LinkedIn about excerpt ({linkedin_url}):\n{excerpt}")

            evidence_text = "\n\n".join(evidence_blocks) if evidence_blocks else ""

            # AI extracts structured data from search results
            if self.agent_manager:
                return self._extract_from_search_results(
                    company_name,
                    search_context,
                    source_context,
                    wiki_website=wiki_website,
                    wiki_info=wiki_info,
                    evidence_text=evidence_text,
                    mode=mode,
                )

            # No AI - use heuristics on search snippets
            return self._extract_with_heuristics(search_context)

        except Exception as e:
            logger.warning("Search failed for %s: %s", company_name, e)
            return self._fallback_ai_search(company_name, wiki_info=wiki_info, mode=mode)

    def _search_with_fallbacks(
        self, company_name: str, source_context: Optional[Dict[str, Any]] = None, mode: str = "fast"
    ) -> List[SearchResult]:
        """
        Try multiple search strategies until one returns quality results.

        Args:
            company_name: Company name to search for
            source_context: Optional context for building better queries

        Returns:
            List of SearchResult objects, or empty list if all queries fail
        """
        queries = self._build_search_queries(company_name, source_context, mode=mode)

        for query in queries:
            try:
                results = self.search_client.search(query, max_results=8)
                if results and self._has_quality_results(results, company_name):
                    return results
            except Exception as e:
                logger.debug("Search query '%s' failed: %s", query, e)
                continue

        # Return whatever we got from the last query, even if low quality
        try:
            return self.search_client.search(queries[0], max_results=8)
        except Exception:
            return []

    def _build_search_queries(
        self, company_name: str, source_context: Optional[Dict[str, Any]] = None, mode: str = "fast"
    ) -> List[str]:
        """
        Build a list of search queries to try, ordered by expected quality.

        Args:
            company_name: Company name to search for
            source_context: Optional context for building better queries

        Returns:
            List of search query strings
        """
        queries = []

        # If we have a Workday URL, try the subdomain as company name first
        if source_context:
            base_url = source_context.get("base_url", "")
            if "myworkdayjobs.com" in base_url:
                subdomain = self._extract_workday_subdomain(base_url)
                if subdomain and subdomain.lower() != company_name.lower():
                    queries.append(f"{subdomain} company official website about")

        # Exact match query (quoted) with "official website" bias
        queries.append(f'"{company_name}" company official website')

        # Standard query with disambiguation
        queries.append(f"{company_name} company about headquarters employees")

        # Culture/values focused query to improve culture coverage
        queries.append(f"{company_name} company culture values mission")

        # Tech stack focused query to surface engineering content/StackShare
        queries.append(f"{company_name} engineering tech stack technologies used stackshare")

        if mode == "focused":
            # Push for official about/careers content explicitly
            queries.append(f"{company_name} official site about careers leadership team")
            queries.append(f"{company_name} corporate site headquarters leadership")

        # Tech company context if from tech job board
        if source_context:
            aggregator = source_context.get("aggregator_domain", "")
            if aggregator in ["greenhouse.io", "lever.co", "ashbyhq.com"]:
                queries.append(f"{company_name} tech startup company")

        # Via careers page (sometimes more specific)
        queries.append(f"{company_name} company careers about us")

        return queries

    def _has_quality_results(self, results: List[SearchResult], company_name: str) -> bool:
        """
        Check if search results are likely relevant to the company.

        Args:
            results: Search results to evaluate
            company_name: Company name to match against

        Returns:
            True if results appear relevant
        """
        if not results:
            return False

        company_lower = company_name.lower()
        score = 0
        domain_hits = 0

        for result in results[:5]:  # Check top 5 results
            title_lower = result.title.lower()
            snippet_lower = result.snippet.lower()
            domain = self._domain_from_url(result.url)

            # Down-rank VC/entertainment domains but do not hard-fail
            discouraged = domain in DISCOURAGED_DOMAINS
            if any(
                tok in title_lower for tok in NON_COMPANY_TOKENS
            ) and not self._domain_matches_company(domain, company_lower):
                continue

            # Check if company name appears in title or snippet
            if company_lower in title_lower or company_lower in snippet_lower:
                score += 1

            # Check for company-related terms
            company_terms = ["company", "about", "careers", "jobs", "headquarters", "official site"]
            if any(term in title_lower or term in snippet_lower for term in company_terms):
                score += 1

            if self._domain_matches_company(domain, company_lower):
                domain_hits += 1
                score += 2  # strong signal

            if discouraged:
                score -= 1  # soft penalty but keep in consideration

        # Consider quality if we have at least 2 points and one plausible domain match
        return score >= 2 and domain_hits >= 1

    def _format_search_results(self, results: List[SearchResult]) -> str:
        """Format search results into context string for AI."""
        parts = []
        for r in results:
            parts.append(f"Source: {r.url}\nTitle: {r.title}\n{r.snippet}\n")
        return "\n---\n".join(parts)

    def _extract_from_search_results(
        self,
        company_name: str,
        search_context: str,
        source_context: Optional[Dict[str, Any]] = None,
        wiki_website: Optional[str] = None,
        wiki_info: Optional[Dict[str, Any]] = None,
        evidence_text: str = "",
        mode: str = "fast",
    ) -> Optional[Dict[str, Any]]:
        """Use AI to extract structured company data from search results."""
        if not self.agent_manager:
            return None

        try:
            # Build disambiguation hints based on source context
            disambiguation_hint = self._build_disambiguation_hint(company_name, source_context)

            wiki_hint = (
                f"The Wikipedia official website is '{wiki_website}'. Prefer this unless search "
                "clearly shows a different official domain owned by the company. "
                "Brand domains can be shortened or acronyms (e.g., ibm.com for International Business Machines)."
                if wiki_website
                else "If Wikipedia lists an official website, prefer that. Brand domains may be shortened or acronyms (e.g., ibm.com)."
            )

            wiki_facts = []
            if wiki_info:
                emp = wiki_info.get("employeeCount")
                if emp:
                    wiki_facts.append(f"Wikipedia employees: {emp}")
                if wiki_info.get("headquarters"):
                    wiki_facts.append(f"Wikipedia HQ: {wiki_info.get('headquarters')}")
            wiki_facts_text = "\n".join(f"- {fact}" for fact in wiki_facts) if wiki_facts else ""

            focus_hint = (
                "FOCUSED RETRY: You previously lacked culture/tech stack. Prioritize official about/careers pages, engineering blogs, and StackShare evidence. "
                "If uncertain, leave fields blank.\n"
                if mode == "focused"
                else ""
            )

            evidence_section = f"\n\nEVIDENCE EXCERPTS:\n{evidence_text}" if evidence_text else ""
            wiki_section = f"\n\nKNOWN FACTS:\n{wiki_facts_text}" if wiki_facts_text else ""

            prompt = f"""{focus_hint}Extract company information for "{company_name}" from these search results.
{disambiguation_hint}
SEARCH RESULTS:
{search_context[:6000]}
{evidence_section}
{wiki_section}

IMPORTANT INSTRUCTIONS:
- If "{company_name}" is ambiguous (e.g., "Close" could be multiple companies),
  focus on the tech/software company that would be hiring for tech roles.
- Do NOT guess or make up information. Only include facts clearly stated in the search results.
- If you cannot find reliable information for a field, use empty string/null/false.
- The website must be the company's official website, NOT a job board URL.
- {wiki_hint}
- Prefer the domain that represents the company itself (homepage/about pages). It's okay if the domain is a short brand or acronym.
- Reject investor/portfolio/VC sites (e.g., lsvp.com), generic search pages, unrelated blogs, or recruiter pages.
- Reject Wikipedia/other pages that are about movies, songs, episodes, or books with the same name.
- If multiple domains appear, favor the one whose homepage/about text clearly mentions the company name/brand.
- If multiple candidates appear, pick the one whose homepage/about page text mentions the company name/brand; otherwise choose the Wikipedia site.
- To fill culture, look for values/mission/culture statements on About/Careers pages.
- For techStack, look for engineering blogs, stackshare.io, hiring pages mentioning technologies; do NOT invent technologies—leave [] if not stated.
{HEADCOUNT_INSTRUCTIONS}

Return a JSON object with these fields:
- website: official company website URL (NOT greenhouse.io, lever.co, workday, etc.)
- about: 2-3 sentence company description
- culture: 1-2 sentences on company culture/values (if mentioned)
- mission: mission statement if explicitly stated
- industry: primary business sector
- founded: year founded (just the year as string)
- headquarters: city, state/country
- employeeCount: number of employees if stated (integer or null)
- companySizeCategory: "small" (<100), "medium" (100-999), "large" (1000+), or ""
- isRemoteFirst: true only if explicitly described as remote-first
- aiMlFocus: true only if AI/ML is clearly core to their products
- timezoneOffset: UTC offset of headquarters (e.g., -8 for US Pacific), or null
- products: list of main products/services (max 3 items)
- techStack: list of known technologies they use (max 5 items)

Return ONLY valid JSON, no explanations or markdown formatting."""

            result = self.agent_manager.execute(
                task_type="extraction",
                prompt=prompt,
                max_tokens=1000,
                temperature=0.1,
            )

            return self._parse_json_response(result.text)

        except Exception as e:
            logger.warning("AI extraction failed: %s", e)
            return None

    def _build_disambiguation_hint(
        self, company_name: str, source_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Build a disambiguation hint to help AI identify the correct company.

        Args:
            company_name: Company name being searched
            source_context: Optional context from job source

        Returns:
            Disambiguation hint string to include in prompt
        """
        hints = []

        if source_context:
            aggregator = source_context.get("aggregator_domain", "")
            base_url = source_context.get("base_url", "")

            if aggregator == "greenhouse.io":
                hints.append("This is a tech company that uses Greenhouse for hiring.")
            elif aggregator == "lever.co":
                hints.append("This is a tech company that uses Lever for hiring.")
            elif aggregator == "ashbyhq.com":
                hints.append("This is a tech company that uses Ashby for hiring.")
            elif "myworkdayjobs.com" in base_url:
                hints.append(f"This company uses Workday for hiring (careers URL: {base_url}).")
            elif aggregator in ["weworkremotely.com", "remoteok.com"]:
                hints.append("This is a remote-friendly tech company.")

        # Add hint for commonly ambiguous names
        ambiguous_names = {
            "close": "This is likely Close.com, a CRM/sales software company.",
            "nova": "Focus on the tech/software company named Nova, not other businesses.",
            "signal": "This is likely Signal, the encrypted messaging app company.",
            "notion": "This is likely Notion, the productivity/notes software company.",
            "linear": "This is likely Linear, the project management software company.",
            "stripe": "This is likely Stripe, the payments infrastructure company.",
            "square": "This is likely Square (Block, Inc.), the payments company.",
        }

        name_lower = company_name.lower()
        if name_lower in ambiguous_names:
            hints.append(ambiguous_names[name_lower])

        if hints:
            return "\nCONTEXT:\n" + "\n".join(f"- {h}" for h in hints) + "\n"
        return ""

    def _fallback_ai_search(
        self, company_name: str, wiki_info: Optional[Dict[str, Any]] = None, mode: str = "fast"
    ) -> Optional[Dict[str, Any]]:
        """Fallback: Ask AI directly (relies on AI's web search capability if available)."""
        if not self.agent_manager:
            return None

        try:
            focus_hint = (
                "FOCUSED RETRY: prioritize official about/careers pages and tech evidence; leave blanks if unsure.\n"
                if mode == "focused"
                else ""
            )
            wiki_facts = []
            if wiki_info:
                emp = wiki_info.get("employeeCount")
                if emp:
                    wiki_facts.append(f"Wikipedia employees: {emp}")
                if wiki_info.get("headquarters"):
                    wiki_facts.append(f"Wikipedia HQ: {wiki_info.get('headquarters')}")
            wiki_facts_text = "\n".join(f"- {fact}" for fact in wiki_facts) if wiki_facts else ""

            prompt = f"""{focus_hint}Search the web for factual information about "{company_name}" company.
{('Known facts:' if wiki_facts_text else '')}
{wiki_facts_text}

Return JSON with: website, about, culture, mission, industry, founded, headquarters,
employeeCount, companySizeCategory, isRemoteFirst, aiMlFocus, timezoneOffset, products, techStack.

- Ignore VC/portfolio sites, recruiter sites, and entertainment results (films, songs, etc.).
- Do not invent tech stacks; only include technologies explicitly mentioned in reliable sources.
- {HEADCOUNT_INSTRUCTIONS}

Be factual. Use empty string/null/false if unknown. Return ONLY valid JSON."""

            result = self.agent_manager.execute(
                task_type="extraction",
                prompt=prompt,
                max_tokens=800,
                temperature=0.1,
            )
            return self._parse_json_response(result.text)

        except Exception as e:
            logger.warning("Fallback AI search failed: %s", e)
            return None

    # ============================================================ #
    # Evidence collection helpers                                  #
    # ============================================================ #

    def _pick_official_candidate(
        self, results: List[SearchResult], company_name: str
    ) -> Optional[str]:
        """
        Pick a likely official site from search results to fetch an excerpt for the agent.
        Preference: first result whose domain contains the company token and is not a job board/search.
        """
        company_lower = company_name.lower()
        for r in results:
            domain = self._domain_from_url(r.url)
            if not domain or self._is_job_board_url(r.url) or self._is_search_engine_url(r.url):
                continue
            if self._domain_matches_company(domain, company_lower):
                return r.url
        # fallback to first non-job-board/search result
        for r in results:
            if not self._is_job_board_url(r.url) and not self._is_search_engine_url(r.url):
                return r.url
        return None

    def _pick_linkedin_candidate(self, results: List[SearchResult]) -> Optional[str]:
        """Return the first LinkedIn company about/profile URL from results."""
        for r in results:
            url_lower = r.url.lower()
            if "linkedin.com/company/" in url_lower:
                if not url_lower.endswith("/about") and "/about" not in url_lower:
                    return r.url.rstrip("/") + "/about"
                return r.url
        return None

    def _fetch_page_excerpt(self, url: str, max_chars: int = 12000) -> Optional[str]:
        """Fetch a trimmed excerpt of a page for agent context (reuses existing fetch)."""
        content = self._fetch_page_content(url)
        if not content:
            return None
        return content[:max_chars]

    # ============================================================
    # WEBSITE SCRAPING (Supplementary)
    # ============================================================

    def _scrape_website(self, website: str, company_name: str) -> Optional[Dict[str, Any]]:
        """
        Scrape company website for additional info.

        This is supplementary to search - only used to fill gaps.
        """
        pages_to_try = [
            f"{website}/about",
            f"{website}/about-us",
            f"{website}/company",
            website,
        ]

        content = None
        for page_url in pages_to_try:
            try:
                content = self._fetch_page_content(page_url)
                if content and len(content) > 200:
                    logger.debug("Scraped %d chars from %s", len(content), page_url)
                    break
            except Exception as e:
                logger.debug("Failed to scrape %s: %s", page_url, e)
                continue

        if not content:
            return None

        # Extract info from scraped content
        if self.agent_manager:
            return self._extract_with_ai(content, company_name)

        return self._extract_with_heuristics(content)

    def _fetch_page_content(self, url: str, timeout: int = 10) -> Optional[str]:
        """Fetch and clean page content."""
        try:
            if not url.startswith("http"):
                url = f"https://{url}"

            response = self.session.get(url, timeout=timeout, allow_redirects=True)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, "html.parser")
            for element in soup(["script", "style", "nav", "footer", "header"]):
                element.decompose()

            text = soup.get_text(separator=" ", strip=True)
            return " ".join(text.split())

        except requests.RequestException as e:
            logger.debug(f"Request failed for {url}: {e}")
            return None
        except (AttributeError, TypeError, UnicodeDecodeError) as e:
            logger.debug(f"Error parsing content from {url}: {e}")
            return None

    # ============================================================
    # AI EXTRACTION FROM CONTENT
    # ============================================================

    def _extract_with_ai(self, content: str, company_name: str) -> Dict[str, Any]:
        """Use AI to extract company fields from page content."""
        try:
            prompt = f"""Extract company information from this text about {company_name}.

TEXT:
{content[:5000]}

Return JSON with: website, about, culture, mission, industry, founded, headquarters,
employeeCount, companySizeCategory, isRemoteFirst, aiMlFocus, timezoneOffset, products, techStack.

Be factual. Return ONLY valid JSON."""

            result = self.agent_manager.execute(
                task_type="extraction",
                prompt=prompt,
                max_tokens=1000,
                temperature=0.2,
            )

            return self._parse_json_response(result.text) or {}

        except Exception as e:
            logger.warning("AI extraction error: %s", e)
            return self._extract_with_heuristics(content)

    def _extract_with_heuristics(self, content: str) -> Dict[str, Any]:
        """Extract company info using simple heuristics (fallback)."""
        result: Dict[str, Any] = {
            "about": "",
            "culture": "",
            "mission": "",
            "size": "",
            "industry": "",
            "founded": "",
            "headquarters": "",
            "timezoneOffset": None,
            "employeeCount": None,
            "isRemoteFirst": False,
            "aiMlFocus": False,
            "companySizeCategory": "",
            "products": [],
            "techStack": [],
        }

        content_lower = content.lower()

        # Look for common patterns
        keywords = {
            "mission": ["our mission", "mission statement", "our purpose"],
            "culture": ["our culture", "our values", "work environment"],
            "about": ["about us", "who we are", "what we do"],
        }

        for field, patterns in keywords.items():
            for pattern in patterns:
                if pattern in content_lower:
                    start_idx = content_lower.find(pattern)
                    snippet = content[start_idx : start_idx + 500]
                    result[field] = " ".join(snippet.split())[:300]
                    break

        # Use first 300 chars as about if nothing found
        if not result["about"] and len(content) > 100:
            result["about"] = content[:300].strip()

        # Boolean detections
        result["isRemoteFirst"] = any(
            p in content_lower for p in ["remote-first", "fully remote", "distributed team"]
        )
        result["aiMlFocus"] = any(
            p in content_lower
            for p in ["machine learning", "artificial intelligence", "ai-powered"]
        )

        # Employee count
        match = re.search(r"(\d{2,5})\s+employees", content_lower)
        if match:
            try:
                count = int(match.group(1))
                result["employeeCount"] = count
                if count < 100:
                    result["companySizeCategory"] = "small"
                elif count < 1000:
                    result["companySizeCategory"] = "medium"
                else:
                    result["companySizeCategory"] = "large"
            except ValueError:
                pass

        return result

    # ============================================================
    # HELPERS
    # ============================================================

    def _is_job_board_url(self, url: Optional[str]) -> bool:
        """Check if URL is a job board/ATS (not suitable for company info).

        Delegates to JobSourcesManager.is_job_board_url() which uses
        database-driven aggregator domains from the job_sources table.
        """
        if not self.sources_manager:
            # Fallback: if no sources_manager, can't check
            logger.debug("No sources_manager available for job board URL check")
            return False

        return self.sources_manager.is_job_board_url(url)

    def _is_search_engine_url(self, url: Optional[str]) -> bool:
        """
        Check if URL is a search engine (not suitable for company website).

        These are placeholder URLs that should never be stored as company websites
        or scraped for content.

        Args:
            url: URL to check

        Returns:
            True if URL is a search engine
        """
        if not url:
            return False

        search_engine_patterns = [
            "google.com/search",
            "google.com/url",
            "bing.com/search",
            "duckduckgo.com/",
            "yahoo.com/search",
            "baidu.com/s",
            "yandex.com/search",
            "ecosia.org/search",
            "startpage.com/",
            "ask.com/web",
        ]

        url_lower = url.lower()
        return any(pattern in url_lower for pattern in search_engine_patterns)

    def _extract_company_from_workday_url(self, base_url: str) -> Optional[str]:
        """
        Extract real company name from Workday URL.

        Workday URLs often use stock tickers or abbreviations as subdomains,
        which can help identify the actual company when the job listing has
        a different/incorrect name.

        Examples:
            "https://mdlz.wd3.myworkdayjobs.com" -> "Mondelez International"
            "https://nvidia.wd5.myworkdayjobs.com" -> "NVIDIA"

        Args:
            base_url: Workday careers URL

        Returns:
            Company name if identified, None otherwise
        """
        if not base_url or "myworkdayjobs.com" not in base_url:
            return None

        subdomain = self._extract_workday_subdomain(base_url)
        if not subdomain:
            return None

        # Check known mappings first
        subdomain_lower = subdomain.lower()
        if subdomain_lower in WORKDAY_COMPANY_MAP:
            return WORKDAY_COMPANY_MAP[subdomain_lower]

        # If subdomain looks like a company name (not just a ticker), use it
        if len(subdomain) > 4 and subdomain.isalpha():
            return subdomain.title()

        return None

    def _extract_workday_subdomain(self, base_url: str) -> Optional[str]:
        """
        Extract the company subdomain from a Workday URL.

        Args:
            base_url: Full Workday URL

        Returns:
            Subdomain portion (e.g., "mdlz" from "mdlz.wd3.myworkdayjobs.com")
        """
        try:
            parsed = urlparse(base_url)
            netloc = parsed.netloc.lower()

            # Format: {company}.wd{N}.myworkdayjobs.com
            if "myworkdayjobs.com" in netloc:
                parts = netloc.split(".")
                if len(parts) >= 3:
                    return parts[0]

            return None
        except Exception:
            return None

    def _needs_enrichment(self, info: Dict[str, Any]) -> bool:
        """Check if company info needs additional enrichment."""
        text_limits = get_text_limits()
        min_about = text_limits.get("minCompanyPageLength", 200)

        about_len = len(info.get("about", "") or "")
        culture_missing = not (info.get("culture") or "").strip()
        tech_missing = not info.get("techStack")
        return about_len < min_about or culture_missing or tech_missing

    def _is_acceptable(self, info: Dict[str, Any]) -> bool:
        """Simple acceptance: required fields populated with minimal length."""
        if not info:
            return False
        about_ok = len(info.get("about", "") or "") >= 120
        culture_ok = len(info.get("culture", "") or "") >= 50
        hq_val = info.get("headquarters") or info.get("headquartersLocation") or ""
        if isinstance(hq_val, list):
            hq_val = hq_val[0] if hq_val else ""
        hq_ok = bool(str(hq_val).strip())
        website_ok = bool((info.get("website") or "").strip()) and not self._is_job_board_url(
            info.get("website")
        )
        tech_ok = bool(info.get("techStack"))
        return about_ok and culture_ok and hq_ok and website_ok and tech_ok

    def _score_completeness(self, info: Dict[str, Any]) -> int:
        if not info:
            return 0
        score = 0
        score += min(len(info.get("about", "")) // 100, 3)
        score += min(len(info.get("culture", "")) // 50, 2)
        score += 1 if (info.get("headquarters") or info.get("headquartersLocation")) else 0
        score += 1 if info.get("website") else 0
        score += min(len(info.get("techStack", [])), 3)
        return score

    def _choose_best_website(
        self,
        candidate: Optional[str],
        wiki_website: Optional[str],
        company_name: str,
    ) -> str:
        """
        Final website selection with a light touch:
        - Prefer Wikipedia site if it exists.
        - Otherwise take candidate if it's not a job board/search URL.
        - Optionally probe homepage for brand mention; fall back to Wikipedia if probe fails.
        """
        wiki_normalized = self._normalize_url(wiki_website)
        candidate_normalized = self._normalize_url(candidate)

        wiki_valid = (
            wiki_normalized
            and not self._is_job_board_url(wiki_normalized)
            and not self._is_search_engine_url(wiki_normalized)
        )

        candidate_valid = (
            candidate_normalized
            and not self._is_job_board_url(candidate_normalized)
            and not self._is_search_engine_url(candidate_normalized)
        )

        # Prefer a valid Wikipedia URL if the candidate is missing/invalid
        if wiki_valid and not candidate_valid:
            return wiki_normalized

        # If candidate looks valid, optionally probe; otherwise return it
        if candidate_valid:
            if self._homepage_mentions_brand(candidate_normalized, company_name):
                return candidate_normalized
            # If probe is inconclusive but Wikipedia is valid, fall back to it; else keep candidate.
            return wiki_normalized or candidate_normalized

        return wiki_normalized or ""

        return ""

    def _normalize_url(self, url: Optional[str]) -> str:
        """Normalize URL by ensuring scheme and trimming whitespace."""
        if not url:
            return ""

        url = url.strip()
        if not url:
            return ""

        if not re.match(r"^https?://", url, re.IGNORECASE):
            url = f"https://{url}"

        return url

    def _domain_from_url(self, url: Optional[str]) -> str:
        """Extract domain from URL safely."""
        if not url:
            return ""
        try:
            parsed = urlparse(url if "://" in url else f"https://{url}")
            return parsed.netloc.lower()
        except Exception:
            return ""

    def _domain_matches_company(self, domain: str, company_lower: str) -> bool:
        """Heuristic: does domain contain a token from the company name?"""
        if not domain or not company_lower:
            return False
        # remove tld
        root = domain.split(":")[0].split(".")[0]
        tokens = [t for t in re.findall(r"[a-z0-9]+", company_lower) if len(t) >= 3]
        return any(tok in root for tok in tokens)

    def _homepage_mentions_brand(self, url: str, company_name: str, timeout: int = 5) -> bool:
        """
        Light validation: fetch homepage and see if brand tokens appear in text.
        If request fails, return False to let other options win; do not raise.
        """
        if not company_name or not url:
            return False

        tokens = [t for t in re.findall(r"[a-z0-9]+", company_name.lower()) if len(t) >= 3]
        if not tokens:
            return False

        try:
            response = self.session.get(url, timeout=timeout, allow_redirects=True, stream=True)
            response.raise_for_status()

            # Read only the first ~16KB to avoid large downloads
            chunks = []
            total = 0
            for chunk in response.iter_content(chunk_size=4096, decode_unicode=True):
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
                if total >= 16384:
                    break

            text = "".join(chunks).lower()
            return any(tok in text for tok in tokens)
        except requests.RequestException as e:
            logger.debug("Homepage probe for %s failed: %s", url, e)
            return False
        except Exception as e:
            logger.debug("Homepage probe unexpected error for %s: %s", url, e)
            return False

    def _merge_company_info(
        self,
        primary: Dict[str, Any],
        secondary: Dict[str, Any],
        company_name: Optional[str] = None,
        preferred_website: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Merge two info dicts, preferring longer text for descriptive fields."""
        # Fields where longer text is better (prefer more comprehensive descriptions)
        text_fields = {"about", "culture", "mission"}

        merged = dict(primary)
        for key, val in secondary.items():
            if key == "website":
                candidate = self._normalize_url(val)
                if not candidate:
                    continue

                # Reject obvious non-company URLs
                if self._is_job_board_url(candidate) or self._is_search_engine_url(candidate):
                    continue

                current = self._normalize_url(merged.get("website"))

                preferred_normalized = self._normalize_url(preferred_website)

                current_valid = (
                    current
                    and not self._is_job_board_url(current)
                    and not self._is_search_engine_url(current)
                )
                candidate_valid = not self._is_job_board_url(
                    candidate
                ) and not self._is_search_engine_url(candidate)
                preferred_valid = (
                    preferred_normalized
                    and not self._is_job_board_url(preferred_normalized)
                    and not self._is_search_engine_url(preferred_normalized)
                )

                # Selection priority: preferred (human hint) > current (if valid) > candidate (if valid)
                if preferred_valid:
                    merged["website"] = preferred_normalized
                elif current_valid:
                    merged["website"] = current
                elif candidate_valid:
                    merged["website"] = candidate
                else:
                    merged["website"] = current or candidate
            elif key == "sources":
                merged["sources"] = val or merged.get("sources") or []
            elif key in text_fields:
                # For descriptive text fields, prefer the longer value
                current = merged.get(key) or ""
                new_val = val or ""
                if len(new_val) > len(current):
                    merged[key] = new_val
            elif merged.get(key) in (None, "", [], False, 0):
                if val not in (None, "", [], False):
                    merged[key] = val
        return merged

    def _parse_json_response(self, response: str) -> Optional[Dict[str, Any]]:
        """
        Parse JSON from AI response, handling markdown code blocks.

        Includes retry logic to recover partial JSON from malformed responses.
        """
        if not response:
            return None

        try:
            json_str = extract_json_from_response(response)
            data = json.loads(json_str)
            return self._normalize_company_data(data)
        except json.JSONDecodeError:
            # Try to recover JSON from response
            recovered = self._try_recover_json(response)
            if recovered:
                logger.info("Recovered JSON from malformed response")
                return self._normalize_company_data(recovered)

            logger.warning("Failed to parse JSON response")
            return None

    def _try_recover_json(self, response: str) -> Optional[Dict[str, Any]]:
        """
        Attempt to recover JSON from a malformed response.

        Args:
            response: Raw response text that failed JSON parsing

        Returns:
            Recovered dict if successful, None otherwise
        """
        # Try to find any JSON-like object in the response
        patterns = [
            r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}",  # Nested objects
        ]

        for pattern in patterns:
            matches = re.findall(pattern, response, re.DOTALL)
            for match in matches:
                try:
                    # Try to parse the match
                    data = json.loads(match)
                    if isinstance(data, dict) and any(
                        k in data for k in ["website", "about", "industry", "headquarters"]
                    ):
                        return data
                except json.JSONDecodeError:
                    continue

        return None

    def _normalize_company_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize company data by ensuring all expected keys have defaults.

        Args:
            data: Raw parsed JSON data

        Returns:
            Normalized dict with all expected keys
        """
        # Ensure expected keys have defaults
        for key in [
            "website",
            "about",
            "culture",
            "mission",
            "industry",
            "founded",
            "headquarters",
        ]:
            data.setdefault(key, "")

        for key in ["employeeCount", "timezoneOffset"]:
            data.setdefault(key, None)

        for key in ["isRemoteFirst", "aiMlFocus"]:
            data.setdefault(key, False)

        data.setdefault("products", [])
        data.setdefault("techStack", [])
        data.setdefault("companySizeCategory", "")

        return data
