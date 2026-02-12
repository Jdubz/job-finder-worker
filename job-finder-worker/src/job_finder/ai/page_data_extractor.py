"""Extract job data from a URL using Playwright rendering + AI.

Used as a fallback in the job pipeline when no pre-scraped data is available
(e.g., URL-only user submissions). Renders the page with headless Chromium,
tries JSON-LD structured data first, then falls back to AI extraction from
visible page text.
"""

import ipaddress
import json
import logging
import socket
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from job_finder.ai.agent_manager import AgentManager
from job_finder.ai.response_parser import extract_json_from_response
from job_finder.exceptions import NoAgentsAvailableError
from job_finder.rendering.playwright_renderer import RenderRequest, get_renderer
from job_finder.scrapers.text_sanitizer import sanitize_html_description, sanitize_title

logger = logging.getLogger(__name__)

# Cap visible text sent to AI to avoid token limits
MAX_PAGE_TEXT_CHARS = 10_000

EXTRACTION_PROMPT = """\
You are a job posting data extractor. Given the text content of a web page,
extract the job posting details if present.

Return a JSON object with these fields (use null for any field you cannot determine):
{
  "title": "exact job title",
  "description": "full job description text",
  "company": "company name",
  "location": "job location (city, state, country, or Remote)",
  "salary": "salary range if mentioned",
  "posted_date": "date posted in YYYY-MM-DD format if found"
}

Return ONLY the JSON object, no other text.

Page content:
"""


class PageDataExtractor:
    """Extracts job data from a URL by rendering with Playwright and parsing with AI."""

    def __init__(self, agent_manager: AgentManager):
        self.agent_manager = agent_manager

    @staticmethod
    def _validate_url(url: str) -> None:
        """Validate URL to prevent SSRF attacks.

        Blocks private, loopback, and link-local IPs to prevent rendering
        user-submitted URLs that target internal services.

        Raises:
            ValueError: If the URL is not safe to render.
        """
        parsed = urlparse(url)

        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Invalid URL scheme: {parsed.scheme}")

        hostname = parsed.hostname
        if not hostname:
            raise ValueError("URL has no hostname")

        blocked_hostnames = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
        if hostname.lower() in blocked_hostnames:
            raise ValueError(f"Blocked hostname: {hostname}")

        # Resolve DNS and reject private/internal IPs
        try:
            addrinfo = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
            for _family, _type, _proto, _canonname, sockaddr in addrinfo:
                ip = ipaddress.ip_address(sockaddr[0])
                if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                    raise ValueError(f"URL resolves to blocked IP range: {hostname} -> {ip}")
        except socket.gaierror:
            pass  # DNS resolution failed; let Playwright handle the error

    def extract(self, url: str) -> Optional[Dict[str, Any]]:
        """Render a URL and extract job posting data.

        Tries JSON-LD structured data first, then AI extraction from page text.

        Args:
            url: The job posting URL to extract from.

        Returns:
            Dict with {title, description, company, location, url, salary, posted_date}
            or None if extraction fails or yields insufficient data.

        Raises:
            ValueError: If the URL fails SSRF validation.
        """
        self._validate_url(url)

        try:
            html = self._render_page(url)
        except Exception as e:
            logger.warning("Page render failed for %s: %s", url, e)
            return None

        if not html:
            logger.warning("Empty HTML from rendering %s", url)
            return None

        soup = BeautifulSoup(html, "html.parser")

        # Try JSON-LD structured data first
        result: Dict[str, Any] = {"url": url}
        self._extract_from_jsonld(soup, result)

        has_title = bool(result.get("title"))
        has_description = bool(result.get("description"))

        # If JSON-LD didn't give us title+description, try AI extraction
        if not has_title or not has_description:
            page_text = self._extract_visible_text(soup)
            if page_text:
                ai_result = self._extract_with_ai(page_text)
                if ai_result:
                    # JSON-LD takes priority; AI fills gaps
                    for key in (
                        "title",
                        "description",
                        "company",
                        "location",
                        "salary",
                        "posted_date",
                    ):
                        if not result.get(key) and ai_result.get(key):
                            result[key] = ai_result[key]

        # Sanitize output
        if result.get("title"):
            result["title"] = sanitize_title(result["title"])
        if result.get("description"):
            result["description"] = sanitize_html_description(result["description"])

        # Validate minimum required fields
        if not result.get("title") or not result.get("description"):
            logger.warning(
                "Insufficient data extracted from %s: title=%s, description=%s",
                url,
                bool(result.get("title")),
                bool(result.get("description")),
            )
            return None

        return result

    def _render_page(self, url: str) -> str:
        """Render a URL with Playwright and return HTML content."""
        renderer = get_renderer()
        req = RenderRequest(url=url, wait_timeout_ms=30_000)
        result = renderer.render(req)
        return result.html

    def _extract_from_jsonld(self, soup: BeautifulSoup, job: Dict[str, Any]) -> None:
        """Extract job data from JSON-LD JobPosting schema.

        Modifies job dict in-place with title, company, description, location,
        and posted_date if found in JSON-LD.
        """
        for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                data = json.loads(script.string or "{}")
            except json.JSONDecodeError:
                continue

            postings = []
            if isinstance(data, list):
                postings = [
                    d for d in data if isinstance(d, dict) and d.get("@type") == "JobPosting"
                ]
            elif isinstance(data, dict):
                graph = data.get("@graph")
                if graph and isinstance(graph, list):
                    postings = [
                        g for g in graph if isinstance(g, dict) and g.get("@type") == "JobPosting"
                    ]
                elif data.get("@type") == "JobPosting":
                    postings = [data]

            if not postings:
                continue

            jp = postings[0]
            job.setdefault("title", jp.get("title") or "")
            hiring_org = jp.get("hiringOrganization")
            company_name = ""
            if isinstance(hiring_org, dict):
                company_name = hiring_org.get("name", "") or ""
            elif isinstance(hiring_org, str):
                company_name = hiring_org
            elif isinstance(hiring_org, list) and hiring_org:
                first_org = hiring_org[0]
                if isinstance(first_org, dict):
                    company_name = first_org.get("name", "") or ""
                elif isinstance(first_org, str):
                    company_name = first_org
            job.setdefault("company", company_name)
            job.setdefault("description", jp.get("description", ""))

            # Location: try place then address fields
            if not job.get("location"):
                loc = None
                place = jp.get("jobLocation")
                if isinstance(place, list):
                    place = place[0] if place else None
                if isinstance(place, dict):
                    addr = place.get("address") or {}
                    # JSON-LD fields can be dicts (e.g. {"@type": "Country", "name": "US"})
                    parts = [
                        addr.get("addressLocality"),
                        addr.get("addressRegion"),
                        addr.get("addressCountry"),
                    ]
                    parts = [(p.get("name", "") if isinstance(p, dict) else p or "") for p in parts]
                    loc = ", ".join(p for p in parts if p)
                if loc:
                    job["location"] = loc

            if not job.get("posted_date") and jp.get("datePosted"):
                job["posted_date"] = jp.get("datePosted")

            # Salary from JSON-LD
            base_salary = jp.get("baseSalary")
            if not job.get("salary") and isinstance(base_salary, dict):
                value = base_salary.get("value")
                currency = base_salary.get("currency", "")
                if isinstance(value, dict):
                    min_val = value.get("minValue", "")
                    max_val = value.get("maxValue", "")
                    if min_val and max_val:
                        job["salary"] = f"{currency} {min_val}-{max_val}".strip()
                elif value:
                    job["salary"] = f"{currency} {value}".strip()

            return  # Found and processed JobPosting, done

    def _extract_visible_text(self, soup: BeautifulSoup) -> str:
        """Extract visible page text, stripping scripts/styles/nav."""
        # Remove non-visible elements
        for tag in soup.find_all(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)

        # Cap length
        if len(text) > MAX_PAGE_TEXT_CHARS:
            text = text[:MAX_PAGE_TEXT_CHARS]

        return text

    def _extract_with_ai(self, page_text: str) -> Optional[Dict[str, Any]]:
        """Use AI to extract job data from page text.

        Raises:
            NoAgentsAvailableError: Propagated to stop queue when all agents are down.
        """
        prompt = EXTRACTION_PROMPT + page_text

        try:
            result = self.agent_manager.execute(
                task_type="extraction",
                prompt=prompt,
                max_tokens=2000,
                temperature=0.3,
            )
            json_str = extract_json_from_response(result.text)
            if not json_str:
                return None

            parsed = json.loads(json_str)
            if not isinstance(parsed, dict):
                return None

            # Normalize null values to empty strings
            return {
                k: (v if v is not None else "")
                for k, v in parsed.items()
                if k in ("title", "description", "company", "location", "salary", "posted_date")
            }
        except NoAgentsAvailableError:
            raise  # Critical - must propagate to stop queue
        except Exception as e:
            logger.warning("AI extraction failed: %s", e)
            return None
