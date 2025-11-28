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
        """
        Extract company information from page content using AI or heuristics.

        Args:
            content: Page text content
            company_name: Company name

        Returns:
            Dictionary with extracted fields
        """
        result: Dict[str, Any] = {
            "about": "",
            "culture": "",
            "mission": "",
            "size": "",
            "industry": "",
            "founded": "",
            "isRemoteFirst": False,
            "aiMlFocus": False,
            "employeeCount": None,
            "timezoneOffset": None,
        }

        # Start with heuristics to avoid AI cost; only call AI when info is sparse
        result = self._extract_with_heuristics(content)

        # Consider AI only if we have a provider and the heuristic result is sparse
        if self.ai_provider and self._is_sparse_company_info(result):
            ai_result = self._extract_with_ai(content, company_name)
            if ai_result and not self._is_sparse_company_info(ai_result):
                return ai_result

        return result

    def _extract_with_ai(self, content: str, company_name: str) -> Dict[str, Any]:
        """
        Use AI to extract company information from content.

        Args:
            content: Page text content
            company_name: Company name

        Returns:
            Dictionary with extracted fields
        """
        try:
            # Truncate content to reasonable length for AI
            max_chars = 5000
            truncated_content = content[:max_chars]

            prompt = f"""Extract company information from the following text about {company_name}.

Company Website Content:
{truncated_content}

Extract the following information and return as JSON:
1. "about": 2-3 sentence summary of what the company does
2. "culture": 1-2 sentences about company culture, values, or work environment
3. "mission": Company mission statement if mentioned (or empty string)
4. "size": Company size/employees if mentioned (e.g., "500-1000 employees")
5. "industry": Industry/sector (e.g., "Fintech", "E-commerce", "SaaS")
6. "founded": Year founded if mentioned

Be concise and factual. If information is not found, use empty string.

Return ONLY valid JSON in this format:
{{
  "about": "...",
  "culture": "...",
  "mission": "...",
  "size": "...",
  "industry": "...",
  "founded": "..."
}}"""

            # Get model-specific settings or use fallback
            model_name = self.ai_config.get("model", "")
            models_config = self.ai_config.get("models", {})
            model_settings = models_config.get(model_name, {})

            # Use conservative token limit for company info extraction
            max_tokens = min(model_settings.get("max_tokens", 1000), 1000)
            temperature = 0.2  # Lower temperature for factual extraction

            response = self.ai_provider.generate(
                prompt, max_tokens=max_tokens, temperature=temperature
            )

            # Parse JSON response
            response_clean = response.strip()
            if "```json" in response_clean:
                start = response_clean.find("```json") + 7
                end = response_clean.find("```", start)
                response_clean = response_clean[start:end].strip()
            elif "```" in response_clean:
                start = response_clean.find("```") + 3
                end = response_clean.find("```", start)
                response_clean = response_clean[start:end].strip()

            extracted = json.loads(response_clean)
            logger.info(f"AI extracted company info successfully")
            return extracted

        except json.JSONDecodeError as e:
            # AI returned invalid JSON - fall back to heuristics
            logger.warning(f"AI returned invalid JSON, falling back to heuristics: {e}")
            return self._extract_with_heuristics(content)
        except (ValueError, KeyError, AttributeError) as e:
            # AI provider errors or missing response fields
            logger.warning(f"AI extraction error, falling back to heuristics: {e}")
            return self._extract_with_heuristics(content)
        except Exception as e:
            # Unexpected errors - log and fall back
            logger.warning(
                f"Unexpected AI extraction error ({type(e).__name__}), falling back to heuristics: {e}",
                exc_info=True,
            )
            return self._extract_with_heuristics(content)

    def _search_company_web(self, company_name: str) -> Optional[Dict[str, str]]:
        """Use AI provider with web-search tools to gather company info beyond the site."""
        try:
            prompt = f"""
Use web search to gather concise, factual info about {company_name}. You have browsing tools.
CRITICAL: Do NOT invent or guess. If a field is unknown, leave it "".
Return ONLY JSON with these keys: about, culture, mission, size, industry, founded, sources.
- about: 2-3 sentence factual summary (no hype)
- culture: 1-2 sentences (cite actual claims, else "")
- mission: mission statement if available, else ""
- size: employee count or range if found, else ""
- industry: primary sector if found, else ""
- founded: year if found, else ""
- sources: array of up to 3 URLs actually used

Respond with JSON only.
"""
            response = self.ai_provider.generate(prompt, max_tokens=800, temperature=0.2)

            response_clean = response.strip()
            if response_clean.startswith("```"):
                start = response_clean.find("{")
                end = response_clean.rfind("}") + 1
                response_clean = response_clean[start:end]

            data = json.loads(response_clean)
            # Normalize expected fields
            for key in ["about", "culture", "mission", "size", "industry", "founded"]:
                data.setdefault(key, "")
            data.setdefault("sources", [])
            return data
        except Exception as exc:
            logger.warning("AI web search for %s failed: %s", company_name, exc)
            return None

    def _merge_company_info(
        self, scraped: Dict[str, Any], searched: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Combine scraped and searched fields, preferring non-empty values and keeping sources."""
        merged = {
            "about": scraped.get("about") or searched.get("about") or "",
            "culture": scraped.get("culture") or searched.get("culture") or "",
            "mission": scraped.get("mission") or searched.get("mission") or "",
            "size": scraped.get("size") or searched.get("size") or "",
            "industry": scraped.get("industry") or searched.get("industry") or "",
            "founded": scraped.get("founded") or searched.get("founded") or "",
        }

        # Preserve source URLs from search when available
        if searched.get("sources"):
            merged["sources"] = searched.get("sources")

        return merged

    def _is_sparse_company_info(self, info: Dict[str, str]) -> bool:
        """
        Determine if extracted company info is too sparse to be useful.

        Uses length thresholds from config; triggers AI enrichment when below.
        """
        text_limits = get_text_limits()
        min_about = text_limits.get("minCompanyPageLength", 200)
        min_sparse = text_limits.get("minSparseCompanyInfoLength", 100)

        about_len = len(info.get("about", "") or "")
        culture_len = len(info.get("culture", "") or "")
        mission_len = len(info.get("mission", "") or "")

        # Treat as sparse if about is short OR sum of sections is very small
        total_len = about_len + culture_len + mission_len
        return about_len < min_about or total_len < min_sparse

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
            "timezoneOffset": None,
            "employeeCount": None,
            "isRemoteFirst": False,
            "aiMlFocus": False,
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

        # Timezone offset detection (simple UTC±N parsing)
        tz_match = re.search(r"utc\s*([+-]?\d{1,2})", content_lower)
        if tz_match:
            try:
                result["timezoneOffset"] = cast(Any, int(tz_match.group(1)))
            except ValueError:
                result["timezoneOffset"] = None

        return result
