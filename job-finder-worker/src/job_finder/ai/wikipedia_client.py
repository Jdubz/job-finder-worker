"""Wikipedia API client for company information.

Provides structured company data from Wikipedia and Wikidata as a high-quality
data source for established companies. Used as STEP 0 in the company enrichment
pipeline, before falling back to web search.
"""

import logging
import re
from typing import Dict, Optional
from urllib.parse import quote

import requests

logger = logging.getLogger(__name__)


class WikipediaClient:
    """Fetch structured company data from Wikipedia and Wikidata."""

    BASE_URL = "https://en.wikipedia.org/api/rest_v1"
    SEARCH_URL = "https://en.wikipedia.org/w/api.php"
    WIKIDATA_URL = "https://www.wikidata.org/w/api.php"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": "JobFinderBot/1.0 (job-finder research tool; https://github.com/Jdubz/job-finder)"
            }
        )

    def search_company(self, company_name: str) -> Optional[Dict]:
        """
        Search Wikipedia for a company and extract structured data.

        Args:
            company_name: Name of the company to search for

        Returns:
            Dict with: name, website, about, headquarters, industry,
                      founded, employeeCount, or None if not found
        """
        page_title = self._find_company_page(company_name)
        if not page_title:
            return None

        summary = self._get_page_summary(page_title)
        if not summary:
            return None

        infobox = self._get_infobox_data(page_title)

        return {
            "name": summary.get("title", company_name),
            "about": summary.get("extract", "")[:500],
            "website": infobox.get("website", ""),
            "headquarters": infobox.get("headquarters", ""),
            "industry": infobox.get("industry", ""),
            "founded": infobox.get("founded", ""),
            "employeeCount": self._parse_employee_count(infobox.get("num_employees", "")),
        }

    def _find_company_page(self, company_name: str) -> Optional[str]:
        """Search for the most relevant Wikipedia page."""
        try:
            response = self.session.get(
                self.SEARCH_URL,
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": f"{company_name} company",
                    "srlimit": 5,
                    "format": "json",
                },
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()

            results = data.get("query", {}).get("search", [])
            if not results:
                return None

            # Prefer results where company name appears in title
            company_lower = company_name.lower()
            for result in results:
                title = result.get("title", "")
                if company_lower in title.lower():
                    return title

            # Fall back to first result
            return results[0].get("title")

        except requests.RequestException as e:
            logger.warning(f"Wikipedia search failed for {company_name}: {e}")
            return None
        except (KeyError, ValueError) as e:
            logger.debug(f"Wikipedia search parse error for {company_name}: {e}")
            return None

    def _get_page_summary(self, title: str) -> Optional[Dict]:
        """Get page summary via REST API."""
        try:
            response = self.session.get(
                f"{self.BASE_URL}/page/summary/{quote(title)}",
                timeout=10,
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.warning(f"Wikipedia summary failed for {title}: {e}")
            return None

    def _get_infobox_data(self, title: str) -> Dict:
        """Extract structured data from page infobox via Wikidata."""
        try:
            response = self.session.get(
                self.SEARCH_URL,
                params={
                    "action": "query",
                    "titles": title,
                    "prop": "pageprops",
                    "format": "json",
                },
                timeout=10,
            )
            response.raise_for_status()
            pages = response.json().get("query", {}).get("pages", {})

            for page in pages.values():
                wikidata_id = page.get("pageprops", {}).get("wikibase_item")
                if wikidata_id:
                    return self._get_wikidata_properties(wikidata_id)

            return {}
        except requests.RequestException as e:
            logger.debug(f"Wikidata lookup failed for {title}: {e}")
            return {}

    def _get_wikidata_properties(self, entity_id: str) -> Dict:
        """Fetch company properties from Wikidata.

        Wikidata property IDs:
        - P856: official website
        - P159: headquarters location
        - P452: industry
        - P571: inception (founded date)
        - P1128: employees
        """
        try:
            response = self.session.get(
                self.WIKIDATA_URL,
                params={
                    "action": "wbgetentities",
                    "ids": entity_id,
                    "props": "claims",
                    "format": "json",
                },
                timeout=10,
            )
            response.raise_for_status()

            entity = response.json().get("entities", {}).get(entity_id, {})
            claims = entity.get("claims", {})

            return {
                "website": self._get_claim_value(claims, "P856"),
                "headquarters": self._get_claim_value(claims, "P159"),
                "industry": self._get_claim_value(claims, "P452"),
                "founded": self._get_claim_value(claims, "P571"),
                "num_employees": self._get_claim_value(claims, "P1128"),
            }
        except requests.RequestException as e:
            logger.debug(f"Wikidata fetch failed for {entity_id}: {e}")
            return {}

    def _get_claim_value(self, claims: Dict, property_id: str) -> str:
        """Extract a simple value from Wikidata claims."""
        if property_id not in claims:
            return ""

        try:
            claim = claims[property_id][0]
            mainsnak = claim.get("mainsnak", {})
            datavalue = mainsnak.get("datavalue", {})
            value = datavalue.get("value", "")

            if isinstance(value, str):
                return value
            if isinstance(value, dict):
                if "time" in value:
                    # Time value - extract year (format: +YYYY-MM-DD...)
                    time_str = value["time"]
                    # Handle both +1975-04-04 and similar formats
                    match = re.search(r"[+-]?(\d{4})", time_str)
                    if match:
                        return match.group(1)
                    return ""
                if "id" in value:
                    # Entity reference - resolve to label
                    return self._resolve_entity_label(value["id"])
                if "amount" in value:
                    # Quantity value (e.g., employee count)
                    return value["amount"].lstrip("+")
                return ""
            return str(value)
        except (KeyError, IndexError):
            return ""

    def _resolve_entity_label(self, entity_id: str) -> str:
        """Resolve a Wikidata entity ID to its English label."""
        try:
            response = self.session.get(
                self.WIKIDATA_URL,
                params={
                    "action": "wbgetentities",
                    "ids": entity_id,
                    "props": "labels",
                    "languages": "en",
                    "format": "json",
                },
                timeout=5,
            )
            response.raise_for_status()
            entity = response.json().get("entities", {}).get(entity_id, {})
            return entity.get("labels", {}).get("en", {}).get("value", "")
        except requests.RequestException:
            return ""

    def _parse_employee_count(self, value: str) -> Optional[int]:
        """Parse employee count from various formats."""
        if not value:
            return None
        try:
            # Remove non-digit characters and parse
            digits_only = re.sub(r"[^\d]", "", value)
            if digits_only:
                return int(digits_only)
        except ValueError:
            # Conversion failed (shouldn't happen after regex, but be safe)
            pass
        return None


def get_wikipedia_client() -> WikipediaClient:
    """
    Factory function to get WikipediaClient.

    Returns:
        WikipediaClient instance
    """
    return WikipediaClient()
