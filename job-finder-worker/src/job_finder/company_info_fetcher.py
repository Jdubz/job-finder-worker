"""Company information fetcher using search APIs and AI extraction.

Philosophy: Search by company name first, then AI extracts structured data.
Scraping is supplementary, not primary. URL is a hint, not a requirement.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from job_finder.ai.search_client import get_search_client, SearchResult
from job_finder.logging_config import format_company_name
from job_finder.settings import get_text_limits

logger = logging.getLogger(__name__)


class CompanyInfoFetcher:
    """Fetches and extracts company information using search + AI."""

    def __init__(self, ai_provider=None, ai_config=None, db_path: Optional[str] = None):
        """
        Initialize company info fetcher.

        Args:
            ai_provider: AI provider for content extraction
            ai_config: AI configuration dictionary
            db_path: Database path for aggregator domain lookup
        """
        self.ai_provider = ai_provider
        self.ai_config = ai_config or {}
        self.db_path = db_path
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )
        self.search_client = get_search_client()

        # Cache for aggregator domains (loaded once per instance)
        self._aggregator_domains_cache: Optional[List[str]] = None

        # Static list of known ATS platforms (not aggregators, but job board hosts)
        # These can host company-specific boards but shouldn't be used for company info
        self._ats_domains = [
            "greenhouse.io",
            "lever.co",
            "ashbyhq.com",
            "workday.com",
            "myworkdayjobs.com",
            "smartrecruiters.com",
            "jobvite.com",
            "icims.com",
            "taleo.net",
            "breezy.hr",
            "applytojob.com",
            "ultipro.com",
        ]

    # ============================================================
    # MAIN ENTRY POINT
    # ============================================================

    def fetch_company_info(
        self, company_name: str, url_hint: Optional[str] = None
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

        Returns:
            Dictionary with company information
        """
        _, company_display = format_company_name(company_name)
        logger.info(f"Fetching company info for {company_display}")

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
            search_info = self._search_and_extract(company_name)
            if search_info:
                result = self._merge_company_info(result, search_info)
                logger.info(
                    "Search extraction for %s: about=%d chars",
                    company_display,
                    len(result.get("about", "")),
                )

            # STEP 2: Determine best website URL
            # Priority: extracted website > url_hint (if not job board)
            website = result.get("website") or ""
            if not website and url_hint and not self._is_job_board_url(url_hint):
                website = url_hint
                result["website"] = website

            # STEP 3: Optional scrape for additional detail
            if website and self._needs_enrichment(result):
                scraped_info = self._scrape_website(website, company_name)
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

    def _search_and_extract(self, company_name: str) -> Optional[Dict[str, Any]]:
        """
        Search for company and extract structured info from results.

        Args:
            company_name: Company name to search for

        Returns:
            Extracted company info dict, or None if search/extraction failed
        """
        if not self.search_client:
            logger.debug("No search client configured, skipping search")
            return self._fallback_ai_search(company_name)

        try:
            # Search for company info
            query = f"{company_name} company about headquarters employees"
            results = self.search_client.search(query, max_results=8)

            if not results:
                logger.warning("No search results for %s", company_name)
                return self._fallback_ai_search(company_name)

            # Format results for AI extraction
            search_context = self._format_search_results(results)

            # AI extracts structured data from search results
            if self.ai_provider:
                return self._extract_from_search_results(company_name, search_context)

            # No AI - use heuristics on search snippets
            return self._extract_with_heuristics(search_context)

        except Exception as e:
            logger.warning("Search failed for %s: %s", company_name, e)
            return self._fallback_ai_search(company_name)

    def _format_search_results(self, results: List[SearchResult]) -> str:
        """Format search results into context string for AI."""
        parts = []
        for r in results:
            parts.append(f"Source: {r.url}\nTitle: {r.title}\n{r.snippet}\n")
        return "\n---\n".join(parts)

    def _extract_from_search_results(
        self, company_name: str, search_context: str
    ) -> Optional[Dict[str, Any]]:
        """Use AI to extract structured company data from search results."""
        if not self.ai_provider:
            return None

        try:
            prompt = f"""Extract company information for "{company_name}" from these search results.

SEARCH RESULTS:
{search_context[:6000]}

Return JSON with these fields (use empty string/null/false if truly unknown):
- website: official company website (NOT a job board like greenhouse.io, lever.co)
- about: 2-3 sentence company description
- culture: 1-2 sentences on company culture/values
- mission: mission statement if found
- industry: primary business sector
- founded: year founded
- headquarters: city, state/country
- employeeCount: number if stated (integer or null)
- companySizeCategory: "small" (<100), "medium" (100-999), "large" (1000+), or ""
- isRemoteFirst: true only if explicitly remote-first
- aiMlFocus: true if AI/ML is core to their products
- timezoneOffset: UTC offset of HQ (e.g., -8 for Pacific), or null
- products: list of main products/services (max 3)
- techStack: list of known technologies they use (max 5)

Be factual. Only include information present in the search results.
Return ONLY valid JSON, no other text."""

            model_name = self.ai_config.get("model", "")
            models_config = self.ai_config.get("models", {})
            model_settings = models_config.get(model_name, {})
            max_tokens = min(model_settings.get("max_tokens", 1000), 1000)

            response = self.ai_provider.generate(prompt, max_tokens=max_tokens, temperature=0.1)

            return self._parse_json_response(response)

        except Exception as e:
            logger.warning("AI extraction failed: %s", e)
            return None

    def _fallback_ai_search(self, company_name: str) -> Optional[Dict[str, Any]]:
        """Fallback: Ask AI directly (relies on AI's web search capability if available)."""
        if not self.ai_provider:
            return None

        try:
            prompt = f"""Search the web for factual information about "{company_name}" company.

Return JSON with: website, about, culture, mission, industry, founded, headquarters,
employeeCount, companySizeCategory, isRemoteFirst, aiMlFocus, timezoneOffset, products, techStack.

Be factual. Use empty string/null/false if unknown. Return ONLY valid JSON."""

            response = self.ai_provider.generate(prompt, max_tokens=800, temperature=0.1)
            return self._parse_json_response(response)

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
        if self.ai_provider:
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

        except Exception as e:
            logger.debug(f"Failed to fetch {url}: {e}")
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

            model_name = self.ai_config.get("model", "")
            models_config = self.ai_config.get("models", {})
            model_settings = models_config.get(model_name, {})
            max_tokens = min(model_settings.get("max_tokens", 1000), 1000)

            response = self.ai_provider.generate(prompt, max_tokens=max_tokens, temperature=0.2)

            return self._parse_json_response(response) or {}

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
        """Check if URL is a job board/ATS (not suitable for company info)."""
        if not url:
            return False

        try:
            netloc = urlparse(url.lower()).netloc
        except Exception:
            netloc = url.lower()

        # Check against known ATS domains
        for domain in self._ats_domains:
            if domain in netloc:
                return True

        # Check aggregator domains from database
        aggregator_domains = self._get_aggregator_domains_from_db()
        for domain in aggregator_domains:
            if domain in netloc:
                return True

        return False

    def _get_aggregator_domains_from_db(self) -> List[str]:
        """Get aggregator domains from job_sources table (cached per instance)."""
        if self._aggregator_domains_cache is not None:
            return self._aggregator_domains_cache

        try:
            from job_finder.storage.sqlite_client import sqlite_connection

            with sqlite_connection(self.db_path) as conn:
                rows = conn.execute(
                    "SELECT DISTINCT aggregator_domain FROM job_sources WHERE aggregator_domain IS NOT NULL"
                ).fetchall()
            self._aggregator_domains_cache = [row[0] for row in rows if row[0]]
        except Exception:
            self._aggregator_domains_cache = []

        return self._aggregator_domains_cache

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
                # Replace with better website if current is empty or a job board
                if val and (
                    not merged.get("website") or self._is_job_board_url(merged.get("website"))
                ):
                    merged["website"] = val
            elif key == "sources":
                merged["sources"] = val or merged.get("sources") or []
            elif merged.get(key) in (None, "", [], False, 0):
                if val not in (None, "", [], False):
                    merged[key] = val
        return merged

    def _parse_json_response(self, response: str) -> Optional[Dict[str, Any]]:
        """Parse JSON from AI response, handling markdown code blocks."""
        if not response:
            return None

        response_clean = response.strip()
        if response_clean.startswith("```"):
            start = response_clean.find("{")
            end = response_clean.rfind("}") + 1
            if start >= 0 and end > start:
                response_clean = response_clean[start:end]

        try:
            data = json.loads(response_clean)
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
        except json.JSONDecodeError:
            logger.warning("Failed to parse JSON response")
            return None
