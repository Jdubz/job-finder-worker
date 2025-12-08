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
from job_finder.logging_config import format_company_name
from job_finder.settings import get_text_limits

if TYPE_CHECKING:
    from job_finder.ai.agent_manager import AgentManager

logger = logging.getLogger(__name__)

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
        Fetch comprehensive company information.

        Strategy (search-first):
        1. Search for company by name (primary data source)
        2. AI extracts structured data from search results
        3. Optionally scrape website for additional detail (if valid URL found)

        Args:
            company_name: Name of the company (required)
            url_hint: Optional URL hint (may be ignored if it's a job board)
            source_context: Optional context from job source with keys:
                - aggregator_domain: e.g., "greenhouse.io", "lever.co"
                - base_url: e.g., "https://mdlz.wd3.myworkdayjobs.com"
                - job_title: Original job title for context

        Returns:
            Dictionary with company information
        """
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
            # STEP 1: Search for company info (primary method)
            search_info = self._search_and_extract(search_name, source_context)
            if search_info:
                result = self._merge_company_info(result, search_info)
                logger.info(
                    "Search extraction for %s: about=%d chars",
                    company_display,
                    len(result.get("about", "")),
                )

            # STEP 2: Determine best website URL
            # Priority: extracted website > url_hint (if not job board/search engine)
            website = result.get("website") or ""
            if not website and url_hint:
                # Only use url_hint if it's a valid company website
                if not self._is_job_board_url(url_hint) and not self._is_search_engine_url(
                    url_hint
                ):
                    website = url_hint
                    result["website"] = website

            # STEP 3: Optional scrape for additional detail
            # Skip scraping if website is a search engine URL (placeholder)
            if (
                website
                and self._needs_enrichment(result)
                and not self._is_search_engine_url(website)
            ):
                scraped_info = self._scrape_website(website, search_name)
                if scraped_info:
                    result = self._merge_company_info(result, scraped_info)
                    logger.info("Supplemented with scrape data for %s", company_display)

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
    # SEARCH + AI EXTRACTION (Primary Method)
    # ============================================================

    def _search_and_extract(
        self, company_name: str, source_context: Optional[Dict[str, Any]] = None
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
            return self._fallback_ai_search(company_name)

        try:
            # Try multiple search queries until one works
            results = self._search_with_fallbacks(company_name, source_context)

            if not results:
                logger.warning("No quality search results for %s", company_name)
                return self._fallback_ai_search(company_name)

            # Format results for AI extraction
            search_context = self._format_search_results(results)

            # AI extracts structured data from search results
            if self.agent_manager:
                return self._extract_from_search_results(
                    company_name, search_context, source_context
                )

            # No AI - use heuristics on search snippets
            return self._extract_with_heuristics(search_context)

        except Exception as e:
            logger.warning("Search failed for %s: %s", company_name, e)
            return self._fallback_ai_search(company_name)

    def _search_with_fallbacks(
        self, company_name: str, source_context: Optional[Dict[str, Any]] = None
    ) -> List[SearchResult]:
        """
        Try multiple search strategies until one returns quality results.

        Args:
            company_name: Company name to search for
            source_context: Optional context for building better queries

        Returns:
            List of SearchResult objects, or empty list if all queries fail
        """
        queries = self._build_search_queries(company_name, source_context)

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
        self, company_name: str, source_context: Optional[Dict[str, Any]] = None
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

        # Exact match query (quoted)
        queries.append(f'"{company_name}" company official website')

        # Standard query with disambiguation
        queries.append(f"{company_name} company about headquarters employees")

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
        relevant_count = 0

        for result in results[:5]:  # Check top 5 results
            title_lower = result.title.lower()
            snippet_lower = result.snippet.lower()

            # Check if company name appears in title or snippet
            if company_lower in title_lower or company_lower in snippet_lower:
                relevant_count += 1

            # Check for company-related terms
            company_terms = ["company", "about", "careers", "jobs", "headquarters"]
            if any(term in title_lower or term in snippet_lower for term in company_terms):
                relevant_count += 1

        # Consider quality if at least 2 relevant signals
        return relevant_count >= 2

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
    ) -> Optional[Dict[str, Any]]:
        """Use AI to extract structured company data from search results."""
        if not self.agent_manager:
            return None

        try:
            # Build disambiguation hints based on source context
            disambiguation_hint = self._build_disambiguation_hint(company_name, source_context)

            prompt = f"""Extract company information for "{company_name}" from these search results.
{disambiguation_hint}
SEARCH RESULTS:
{search_context[:6000]}

IMPORTANT INSTRUCTIONS:
- If "{company_name}" is ambiguous (e.g., "Close" could be multiple companies),
  focus on the tech/software company that would be hiring for tech roles.
- Do NOT guess or make up information. Only include facts clearly stated in the search results.
- If you cannot find reliable information for a field, use empty string/null/false.
- The website must be the company's official website, NOT a job board URL.

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

    def _fallback_ai_search(self, company_name: str) -> Optional[Dict[str, Any]]:
        """Fallback: Ask AI directly (relies on AI's web search capability if available)."""
        if not self.agent_manager:
            return None

        try:
            prompt = f"""Search the web for factual information about "{company_name}" company.

Return JSON with: website, about, culture, mission, industry, founded, headquarters,
employeeCount, companySizeCategory, isRemoteFirst, aiMlFocus, timezoneOffset, products, techStack.

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
        return about_len < min_about

    def _needs_ai_enrichment(self, info: Dict[str, Any]) -> bool:
        """Check if info is sparse enough to warrant AI enrichment."""
        return self._needs_enrichment(info)

    def _merge_company_info(
        self, primary: Dict[str, Any], secondary: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Merge two info dicts, preferring non-empty values."""
        merged = dict(primary)
        for key, val in secondary.items():
            if key == "website":
                # Replace with better website if current is empty, a job board, or search engine
                if val and (
                    not merged.get("website")
                    or self._is_job_board_url(merged.get("website"))
                    or self._is_search_engine_url(merged.get("website"))
                ):
                    # Only accept if the new value is also not a search engine
                    if not self._is_search_engine_url(val):
                        merged["website"] = val
            elif key == "sources":
                merged["sources"] = val or merged.get("sources") or []
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
            r"\{[^{}]+\}",  # Simple object
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
