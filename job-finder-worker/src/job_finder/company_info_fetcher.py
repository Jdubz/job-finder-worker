"""Company information fetcher using AI and web scraping."""

import json
import logging
import re
from typing import Any, Dict, Optional, cast

import requests
from bs4 import BeautifulSoup

from job_finder.logging_config import format_company_name
from job_finder.settings import get_text_limits

logger = logging.getLogger(__name__)


class CompanyInfoFetcher:
    """Fetches and extracts company information from websites."""

    def __init__(self, ai_provider=None, ai_config=None):
        """
        Initialize company info fetcher.

        Args:
            ai_provider: Optional AI provider for content extraction
            ai_config: Optional AI configuration dictionary
        """
        self.ai_provider = ai_provider
        self.ai_config = ai_config or {}
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )

    def fetch_company_info(self, company_name: str, company_website: str) -> Dict[str, Any]:
        """
        Fetch comprehensive company information.

        Args:
            company_name: Name of the company
            company_website: Company website URL

        Returns:
            Dictionary with company information:
            {
                'name': str,
                'website': str,
                'about': str,
                'culture': str,
                'mission': str,
                'size': str (optional),
                'industry': str (optional),
                'founded': str (optional)
            }
        """
        _, company_display = format_company_name(company_name)
        logger.info(f"Fetching company info for {company_display}")

        result: Dict[str, Any] = {
            "name": company_name,
            "website": company_website,
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
        }

        try:
            scraped_info: Dict[str, Any] = {}
            search_info: Dict[str, Any] = {}

            # Always attempt site scrape when a URL is provided
            content = None
            if company_website:
                pages_to_try = [
                    f"{company_website}/about",
                    f"{company_website}/about-us",
                    f"{company_website}/company",
                    f"{company_website}/careers",
                    company_website,  # Homepage as fallback
                ]

                for page_url in pages_to_try:
                    try:
                        content = self._fetch_page_content(page_url)
                        text_limits = get_text_limits()
                        min_page_length = text_limits.get("minCompanyPageLength", 200)
                        if content and len(content) > min_page_length:  # Got meaningful content
                            logger.info(f"Successfully fetched content from {page_url}")
                            break
                    except (requests.RequestException, ValueError, AttributeError) as e:
                        logger.debug(f"Failed to fetch {page_url}: {e}")
                        continue

            if content:
                scraped_info = self._extract_company_info(content, company_name)

            # Always run AI web search (when available) to widen coverage beyond the career site
            if self.ai_provider:
                logger.info("Running AI web search for %s to enrich company data", company_display)
                search_info = self._search_company_web(company_name) or {}

            # Merge scraped + searched info, prefer non-empty factual fields, carry sources if present
            merged = self._merge_company_info(scraped_info, search_info)
            result.update(merged)

            _, company_display = format_company_name(company_name)
            logger.info(
                "Compiled company info for %s: about=%d chars, culture=%d chars",
                company_display,
                len(result.get("about", "")),
                len(result.get("culture", "")),
            )

        except (requests.RequestException, ValueError, AttributeError) as e:
            _, company_display = format_company_name(company_name)
            logger.error(f"Error fetching company info for {company_display}: {e}")
        except Exception as e:
            logger.error(
                f"Unexpected error fetching company info for {company_name} ({type(e).__name__}): {e}",
                exc_info=True,
            )

        return result

    def _fetch_page_content(self, url: str, timeout: int = 10) -> Optional[str]:
        """
        Fetch and clean page content.

        Args:
            url: URL to fetch
            timeout: Request timeout in seconds

        Returns:
            Cleaned text content or None
        """
        try:
            # Normalize URL
            if not url.startswith("http"):
                url = f"https://{url}"

            response = self.session.get(url, timeout=timeout, allow_redirects=True)
            response.raise_for_status()

            # Parse HTML
            soup = BeautifulSoup(response.content, "html.parser")

            # Remove script, style, and other non-content tags
            for element in soup(["script", "style", "nav", "footer", "header"]):
                element.decompose()

            # Get text content
            text = soup.get_text(separator=" ", strip=True)

            # Clean up whitespace
            text = " ".join(text.split())

            return text

        except requests.RequestException as e:
            # HTTP errors (connection, timeout, HTTP status codes)
            logger.debug(f"Request failed for {url}: {e}")
            return None
        except (AttributeError, UnicodeDecodeError, ValueError) as e:
            # HTML parsing errors or encoding issues
            logger.debug(f"Error parsing {url}: {e}")
            return None
        except Exception as e:
            # Unexpected errors - log with more detail
            logger.debug(f"Unexpected error fetching {url} ({type(e).__name__}): {e}")
            return None

    def _extract_company_info(self, content: str, company_name: str) -> Dict[str, Any]:
        """Extract company info using heuristics → AI → web-search (gap fill)."""
        result: Dict[str, Any] = self._extract_with_heuristics(content)

        if self.ai_provider and self._needs_ai_enrichment(result):
            ai_result = self._extract_with_ai(content, company_name)
            if ai_result:
                result = self._merge_company_info(result, ai_result)

        if self.ai_provider and self._needs_ai_enrichment(result):
            search_result = self._search_company_web(company_name)
            if search_result:
                result = self._merge_company_info(result, search_result)

        return result

    def _extract_with_ai(self, content: str, company_name: str) -> Dict[str, Any]:
        """Use AI to extract enriched company fields from on-site content."""
        try:
            max_chars = 5000
            truncated_content = content[:max_chars]

            prompt = f"""Extract company information from the following text about {company_name}. Respond with JSON only.

Company Website Content:
{truncated_content}

Return JSON with these keys:
- about: 2-3 sentence summary
- culture: 1-2 sentences on culture/values
- mission: mission statement if present, else ""
- size: size or range string (e.g., "500-1000 employees" or funding + size)
- industry: primary sector
- founded: year founded if present
- headquarters: city/state/country HQ string
- employeeCount: integer if stated, else null
- companySizeCategory: one of ["small","medium","large"] if derivable, else ""
- isRemoteFirst: boolean if explicitly remote/remote-first
- aiMlFocus: boolean if core products use AI/ML
- timezoneOffset: numeric UTC offset if stated (e.g., -8)
- products: list (<=3) of flagship products/services
- jobBoardUrl: careers/board URL if clearly present
- sources: array (may be empty)

If a field is unknown, use empty string, null, or false as appropriate.
"""

            model_name = self.ai_config.get("model", "")
            models_config = self.ai_config.get("models", {})
            model_settings = models_config.get(model_name, {})
            max_tokens = min(model_settings.get("max_tokens", 1000), 1000)
            temperature = 0.2

            response = self.ai_provider.generate(
                prompt, max_tokens=max_tokens, temperature=temperature
            )

            response_clean = response.strip()
            if response_clean.startswith("```"):
                start = response_clean.find("{")
                end = response_clean.rfind("}") + 1
                response_clean = response_clean[start:end]

            extracted = json.loads(response_clean)
            return extracted

        except Exception as e:
            logger.warning(
                "AI extraction error (%s), falling back to heuristics", type(e).__name__, exc_info=True
            )
            return self._extract_with_heuristics(content)

    def _search_company_web(self, company_name: str) -> Optional[Dict[str, str]]:
        """Use AI + web search to fill missing company fields."""
        try:
            prompt = f"""
Use web search to gather concise, factual info about {company_name}. You have browsing tools.
DO NOT GUESS. If unknown, use "" or null.
Return ONLY JSON with keys: about, culture, mission, size, industry, founded, headquarters, employeeCount, companySizeCategory, isRemoteFirst, aiMlFocus, timezoneOffset, products, sources, jobBoardUrl.
"""
            response = self.ai_provider.generate(prompt, max_tokens=800, temperature=0.2)

            response_clean = response.strip()
            if response_clean.startswith("```"):
                start = response_clean.find("{")
                end = response_clean.rfind("}") + 1
                response_clean = response_clean[start:end]

            data = cast(Dict[str, Any], json.loads(response_clean))
            for key in [
                "about",
                "culture",
                "mission",
                "size",
                "industry",
                "founded",
                "headquarters",
                "employeeCount",
                "companySizeCategory",
                "isRemoteFirst",
                "aiMlFocus",
                "timezoneOffset",
                "products",
                "jobBoardUrl",
            ]:
                default: Any
                if key in ["employeeCount", "timezoneOffset"]:
                    default = None
                elif key == "products":
                    default = []
                else:
                    default = ""
                data.setdefault(key, default)
            data.setdefault("sources", [])
            return data
        except Exception as exc:
            logger.warning("AI web search for %s failed: %s", company_name, exc)
            return None

    def _merge_company_info(
        self, primary: Dict[str, Any], secondary: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Combine two info dicts, preferring existing/non-empty values in primary."""
        merged = dict(primary)
        for key, val in secondary.items():
            if key == "sources":
                merged["sources"] = val or merged.get("sources") or []
                continue
            if merged.get(key) in (None, "", []):
                merged[key] = val
        return merged

    def _needs_ai_enrichment(self, info: Dict[str, Any]) -> bool:
        required_text = [
            "about",
            "culture",
            "mission",
            "industry",
            "size",
            "founded",
            "headquarters",
        ]
        numeric_fields = ["employeeCount", "timezoneOffset"]
        bool_fields = ["isRemoteFirst", "aiMlFocus"]

        text_limits = get_text_limits()
        min_about = text_limits.get("minCompanyPageLength", 200)
        min_sparse = text_limits.get("minSparseCompanyInfoLength", 100)

        about_len = len(info.get("about", "") or "")
        total_len = about_len + len(info.get("culture", "") or "") + len(
            info.get("mission", "") or ""
        )

        if about_len < min_about or total_len < min_sparse:
            return True

        for key in required_text:
            if not info.get(key):
                return True
        for key in numeric_fields:
            if info.get(key) in (None, ""):
                return True
        for key in bool_fields:
            if info.get(key) is None:
                return True

        return False

    def _extract_with_heuristics(self, content: str) -> Dict[str, Any]:
        """
        Extract company info using simple heuristics (fallback).

        Args:
            content: Page text content

        Returns:
            Dictionary with extracted fields
        """
        result = {
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
        }

        # Try to find common patterns
        content_lower = content.lower()

        # Look for mission/about sections
        keywords = {
            "mission": ["our mission", "mission statement", "our purpose"],
            "culture": ["our culture", "our values", "work environment", "company culture"],
            "about": ["about us", "who we are", "what we do"],
        }

        for field, patterns in keywords.items():
            for pattern in patterns:
                if pattern in content_lower:
                    # Find the section and extract a snippet
                    start_idx = content_lower.find(pattern)
                    snippet = content[start_idx : start_idx + 500]

                    # Clean and truncate
                    snippet = " ".join(snippet.split())[:300]
                    result[field] = snippet
                    break

        # If we found nothing, use first 300 chars as about
        text_limits = get_text_limits()
        min_sparse_length = text_limits.get("minSparseCompanyInfoLength", 100)
        if not result["about"] and len(content) > min_sparse_length:
            result["about"] = content[:300].strip()

        # Remote-first detection
        remote_patterns = ["remote-first", "fully remote", "remote company", "distributed team"]
        result["isRemoteFirst"] = any(pat in content_lower for pat in remote_patterns)

        # AI/ML focus detection
        ai_patterns = [
            "ai",
            "machine learning",
            "ml",
            "artificial intelligence",
            "gen ai",
            "generative ai",
        ]
        result["aiMlFocus"] = any(pat in content_lower for pat in ai_patterns)

        # Employee count detection (simple numeric heuristic)
        employee_match = re.search(
            r"(over|more than|approximately|around)?\s*(\d{2,5})\s+employees", content_lower
        )
        if employee_match:
            try:
                result["employeeCount"] = cast(Any, int(employee_match.group(2)))
            except ValueError:
                result["employeeCount"] = None

        # Company size category from employee count if available
        count = result.get("employeeCount")
        if isinstance(count, int):
            if count < 100:
                result["companySizeCategory"] = "small"
            elif count < 1000:
                result["companySizeCategory"] = "medium"
            else:
                result["companySizeCategory"] = "large"

        # Headquarters detection (simple pattern)
        hq_match = re.search(
            r"headquarters(?:\s*[:\-]?\s*|\s+in\s+)([A-Za-z ,]+)", content, re.IGNORECASE
        )
        if hq_match:
            result["headquarters"] = hq_match.group(1).strip()[:120]

        # Timezone offset detection (simple UTC±N parsing)
        tz_match = re.search(r"utc\s*([+-]?\d{1,2})", content_lower)
        if tz_match:
            try:
                result["timezoneOffset"] = cast(Any, int(tz_match.group(1)))
            except ValueError:
                result["timezoneOffset"] = None

        return result
