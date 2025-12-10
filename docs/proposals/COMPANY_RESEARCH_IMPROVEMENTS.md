> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

# Company Research Improvements - Phase 3: Wikipedia Integration

## Background

Phases 1-2 of company research improvements have been implemented:
- Search engine URL filtering (`_is_search_engine_url()`)
- Multi-query search strategy with fallbacks
- Workday URL company name extraction (20+ ticker mappings)
- Source context for disambiguation
- JSON parsing retry logic

This document covers the remaining Phase 3 work: Wikipedia API integration.

## Problem

For established companies, Wikipedia provides high-quality, structured data that could supplement or replace web search results. Currently, all company enrichment relies on general web search, which may return inconsistent or sparse data for well-known companies.

## Proposed Solution

Add Wikipedia as a high-priority data source for established companies.

### 1. WikipediaClient Class

**File:** `job-finder-worker/src/job_finder/ai/wikipedia_client.py`

```python
"""Wikipedia API client for company information."""

import logging
import os
import re
import requests
from typing import Dict, Optional
from urllib.parse import quote

logger = logging.getLogger(__name__)


class WikipediaClient:
    """Fetch structured company data from Wikipedia."""

    BASE_URL = "https://en.wikipedia.org/api/rest_v1"
    SEARCH_URL = "https://en.wikipedia.org/w/api.php"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "JobFinderBot/1.0 (job-finder research tool)"
        })

    def search_company(self, company_name: str) -> Optional[Dict]:
        """
        Search Wikipedia for a company and extract structured data.

        Returns:
            Dict with: name, website, about, headquarters, industry,
                      founded, employee_count, or None if not found
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
            "employee_count": self._parse_employee_count(infobox.get("num_employees", "")),
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

            company_lower = company_name.lower()
            for result in results:
                title = result.get("title", "")
                if company_lower in title.lower():
                    return title

            return results[0].get("title")

        except Exception as e:
            logger.warning(f"Wikipedia search failed for {company_name}: {e}")
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
        except Exception as e:
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
        except Exception as e:
            logger.debug(f"Wikidata lookup failed for {title}: {e}")
            return {}

    def _get_wikidata_properties(self, entity_id: str) -> Dict:
        """Fetch company properties from Wikidata."""
        try:
            response = self.session.get(
                "https://www.wikidata.org/w/api.php",
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
        except Exception as e:
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
                    # Time value - extract year
                    return value["time"][:4]
                if "id" in value:
                    # Entity reference - resolve to label
                    return self._resolve_entity_label(value["id"])
                return ""
            return str(value)
        except (KeyError, IndexError):
            return ""

    def _resolve_entity_label(self, entity_id: str) -> str:
        """Resolve a Wikidata entity ID to its English label."""
        try:
            response = self.session.get(
                "https://www.wikidata.org/w/api.php",
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
        except Exception:
            return ""

    def _parse_employee_count(self, value: str) -> Optional[int]:
        """Parse employee count from various formats."""
        if not value:
            return None
        try:
            digits_only = re.sub(r"[^\d]", "", value)
            if digits_only:
                return int(digits_only)
        except ValueError:
            pass
        return None


def get_wikipedia_client() -> Optional["WikipediaClient"]:
    """
    Factory function to get WikipediaClient based on configuration.

    Returns WikipediaClient if ENABLE_WIKIPEDIA_ENRICHMENT is set to "true",
    otherwise returns None. This follows the same pattern as get_search_client().

    Returns:
        WikipediaClient instance or None if not enabled
    """
    if os.getenv("ENABLE_WIKIPEDIA_ENRICHMENT", "").lower() == "true":
        return WikipediaClient()

    logger.debug("Wikipedia enrichment not enabled (set ENABLE_WIKIPEDIA_ENRICHMENT=true)")
    return None
```

### 2. Integration in CompanyInfoFetcher

**File:** `job-finder-worker/src/job_finder/company_info_fetcher.py`

Add Wikipedia as STEP 0 before search queries:

```python
from job_finder.ai.wikipedia_client import get_wikipedia_client

class CompanyInfoFetcher:
    def __init__(self, ...):
        ...
        self.wikipedia_client = get_wikipedia_client()  # May be None if not enabled

    def fetch_company_info(self, company_name: str, ...) -> Dict[str, Any]:
        ...
        # Existing: Workday name resolution (lines 116-129)
        # This sets search_name which may differ from company_name

        try:
            # STEP 0: Try Wikipedia first (fast, high-quality for established companies)
            # IMPORTANT: Use search_name (post-Workday resolution), not company_name
            if self.wikipedia_client:
                wiki_info = self._try_wikipedia(search_name)
                if wiki_info:
                    result = self._merge_company_info(result, wiki_info)
                    logger.info(f"Wikipedia found data for {company_display}")

            # STEP 1: Search for company info (existing code)
            # Always run search to fill gaps (culture, mission, techStack, etc.)
            # Wikipedia doesn't provide these fields
            search_info = self._search_and_extract(search_name, source_context)
            if search_info:
                result = self._merge_company_info(result, search_info)
            ...

    def _try_wikipedia(self, company_name: str) -> Optional[Dict]:
        """Attempt Wikipedia lookup for company."""
        try:
            return self.wikipedia_client.search_company(company_name)
        except Exception as e:
            logger.debug(f"Wikipedia lookup failed for {company_name}: {e}")
            return None
```

### 3. Pre-Implementation Cleanup

Before implementing Wikipedia integration, remove dead code in `company_info_fetcher.py`:

**Remove `_needs_ai_enrichment()` method (line 761-763):**
```python
# DELETE THIS - it's never called and duplicates _needs_enrichment()
def _needs_ai_enrichment(self, info: Dict[str, Any]) -> bool:
    """Check if info is sparse enough to warrant AI enrichment."""
    return self._needs_enrichment(info)
```

## Architecture Notes

### Why No Early Exit

The original proposal suggested returning early if Wikipedia provides 100+ chars of `about` text. However, this would skip valuable data that only comes from web search:

| Field | Wikipedia | Web Search |
|-------|-----------|------------|
| about | Yes | Yes |
| website | Yes | Yes |
| headquarters | Yes | Yes |
| industry | Yes | Yes |
| founded | Yes | Yes |
| employeeCount | Yes | Yes |
| culture | No | Yes |
| mission | No | Yes |
| techStack | No | Yes |
| products | No | Yes |
| isRemoteFirst | No | Yes |
| aiMlFocus | No | Yes |

**Recommendation:** Always run STEP 1 (search) after Wikipedia to fill these gaps. The merge logic already handles this correctly by preferring non-empty values.

### Factory Pattern

Following the existing `get_search_client()` pattern:
- `get_wikipedia_client()` returns `Optional[WikipediaClient]`
- Controlled by `ENABLE_WIKIPEDIA_ENRICHMENT` env var
- Gracefully degrades when not configured

### Name Resolution Order

```
company_name (from job listing)
    ↓
Workday URL resolution → search_name (may be corrected)
    ↓
Wikipedia lookup (uses search_name)
    ↓
Web search (uses search_name)
```

This ensures "mdlz" from Workday URLs becomes "Mondelez International" before any external API calls.

## Implementation Tasks

- [ ] Remove dead `_needs_ai_enrichment()` method from CompanyInfoFetcher
- [ ] Create `job-finder-worker/src/job_finder/ai/wikipedia_client.py`
- [ ] Add `get_wikipedia_client()` factory function
- [ ] Add `_try_wikipedia()` method to CompanyInfoFetcher
- [ ] Integrate Wikipedia as STEP 0 in `fetch_company_info()` (use `search_name`)
- [ ] Add `ENABLE_WIKIPEDIA_ENRICHMENT` to environment variable docs
- [ ] Add unit tests for WikipediaClient
- [ ] Add integration tests for Wikipedia pipeline
- [ ] Update `__init__.py` exports

## Success Metrics

- Reduce search API calls for Fortune 500 / well-known companies
- Improve data quality (website, headquarters, employee count) for established companies
- Maintain current quality for startups/smaller companies (fallback to search)
