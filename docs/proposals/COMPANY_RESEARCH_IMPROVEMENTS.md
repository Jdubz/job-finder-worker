> Status: Implemented
> Owner: @jdubz
> Last Updated: 2025-12-08

# Company Research Improvements Proposal

## Problem Summary

14 companies (out of 146) have Google search URLs stored as their website, with garbage "about" text. Root causes:

1. **Ambiguous company names** - Generic names like "Close", "Nova" return irrelevant search results
2. **Misextracted company names** - "Chipcolate" is actually Mondelez (from `mdlz.wd3.myworkdayjobs.com`)
3. **AI extraction failures** - Gemini returns non-JSON or empty results for edge cases
4. **Google URL fallback bug** - Placeholder URLs are incorrectly used as company websites
5. **No URL validation** - Search engine URLs aren't filtered out

## Proposed Solutions

### 1. Immediate Fixes (Bug Fixes)

#### 1.1 Filter Search Engine URLs
**File:** `job-finder-worker/src/job_finder/company_info_fetcher.py`

Add a check to reject search engine URLs as company websites:

```python
def _is_search_engine_url(self, url: Optional[str]) -> bool:
    """Check if URL is a search engine (not suitable for company website)."""
    if not url:
        return False
    search_engines = [
        "google.com/search",
        "bing.com/search",
        "duckduckgo.com",
        "yahoo.com/search",
        "baidu.com/s",
    ]
    url_lower = url.lower()
    return any(se in url_lower for se in search_engines)
```

Then in `fetch_company_info()`:
```python
# STEP 2: Determine best website URL
website = result.get("website") or ""
if not website and url_hint:
    # Only use url_hint if it's not a job board OR search engine
    if not self._is_job_board_url(url_hint) and not self._is_search_engine_url(url_hint):
        website = url_hint
        result["website"] = website
```

#### 1.2 Don't Scrape Placeholder URLs
**File:** `job-finder-worker/src/job_finder/company_info_fetcher.py`

In `fetch_company_info()`, skip scraping for search engine URLs:
```python
# STEP 3: Optional scrape for additional detail
if website and self._needs_enrichment(result) and not self._is_search_engine_url(website):
    scraped_info = self._scrape_website(website, company_name)
```

---

### 2. Smarter Search Queries

#### 2.1 Use Context from Job Source
**File:** `job-finder-worker/src/job_finder/company_info_fetcher.py`

Pass the job source context to improve search accuracy:

```python
def fetch_company_info(
    self,
    company_name: str,
    url_hint: Optional[str] = None,
    source_context: Optional[dict] = None,  # NEW
) -> Dict[str, Any]:
    """
    Args:
        source_context: Optional dict with keys:
            - aggregator_domain: e.g., "greenhouse.io", "lever.co"
            - base_url: e.g., "https://mdlz.wd3.myworkdayjobs.com"
            - job_title: Original job title for context
    """
```

Use this context to build better search queries:
```python
def _build_search_query(self, company_name: str, source_context: Optional[dict] = None) -> str:
    """Build an optimized search query based on available context."""
    query_parts = [company_name]

    # Add "company" to disambiguate (e.g., "Close company" vs just "Close")
    query_parts.append("company")

    # If we have a workday/greenhouse URL, extract the subdomain as a hint
    if source_context:
        base_url = source_context.get("base_url", "")
        if "myworkdayjobs.com" in base_url:
            # Extract company identifier: "mdlz.wd3.myworkdayjobs.com" -> "mdlz"
            subdomain = base_url.split(".")[0].replace("https://", "")
            if subdomain and subdomain != company_name.lower():
                query_parts.append(f"OR {subdomain}")

        # Add aggregator as context
        aggregator = source_context.get("aggregator_domain", "")
        if aggregator in ["greenhouse.io", "lever.co"]:
            query_parts.append("startup tech")

    return " ".join(query_parts)
```

#### 2.2 Multi-Query Strategy
Try multiple search queries if the first fails:

```python
def _search_with_fallbacks(self, company_name: str, source_context: Optional[dict] = None) -> List[SearchResult]:
    """Try multiple search strategies until one works."""
    queries = [
        f'"{company_name}" company official website',  # Exact match first
        f"{company_name} company about us headquarters",  # Standard query
        f"{company_name} careers jobs company",  # Via careers page
    ]

    # Add workday subdomain query if available
    if source_context and "base_url" in source_context:
        base_url = source_context["base_url"]
        if "myworkdayjobs.com" in base_url:
            subdomain = base_url.split(".")[0].replace("https://", "")
            queries.insert(0, f"{subdomain} company")  # Try subdomain first

    for query in queries:
        results = self.search_client.search(query, max_results=8)
        if results and self._has_quality_results(results, company_name):
            return results

    return []
```

---

### 3. Wikipedia API Integration

Add Wikipedia as a high-quality data source for established companies.

#### 3.1 New Wikipedia Client
**File:** `job-finder-worker/src/job_finder/ai/wikipedia_client.py`

```python
"""Wikipedia API client for company information."""

import logging
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
        # Step 1: Search for the company page
        page_title = self._find_company_page(company_name)
        if not page_title:
            return None

        # Step 2: Get page summary
        summary = self._get_page_summary(page_title)
        if not summary:
            return None

        # Step 3: Try to get structured infobox data
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

            # Prefer exact or close matches
            company_lower = company_name.lower()
            for result in results:
                title = result.get("title", "")
                if company_lower in title.lower():
                    return title

            # Fall back to first result
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
            # Get Wikidata entity ID
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
                "website": self._get_claim_value(claims, "P856"),  # official website
                "headquarters": self._get_claim_value(claims, "P159"),  # headquarters location
                "industry": self._get_claim_value(claims, "P452"),  # industry
                "founded": self._get_claim_value(claims, "P571"),  # inception date
                "num_employees": self._get_claim_value(claims, "P1128"),  # employees
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
                # Handle time values
                if "time" in value:
                    return value["time"][:4]  # Just the year
                # Handle entity references (need another lookup)
                return ""
            return str(value)
        except (KeyError, IndexError):
            return ""

    def _parse_employee_count(self, value: str) -> Optional[int]:
        """Parse employee count from various formats."""
        if not value:
            return None
        try:
            # Remove commas and extract number
            import re
            match = re.search(r"[\d,]+", value.replace(",", ""))
            if match:
                return int(match.group())
        except ValueError:
            pass
        return None
```

#### 3.2 Integrate Wikipedia into Fetch Pipeline
**File:** `job-finder-worker/src/job_finder/company_info_fetcher.py`

```python
from job_finder.ai.wikipedia_client import WikipediaClient

class CompanyInfoFetcher:
    def __init__(self, ...):
        ...
        self.wikipedia_client = WikipediaClient()

    def fetch_company_info(self, company_name: str, ...) -> Dict[str, Any]:
        ...
        try:
            # STEP 0: Try Wikipedia first (fast, high-quality for established companies)
            wiki_info = self._try_wikipedia(company_name)
            if wiki_info:
                result = self._merge_company_info(result, wiki_info)
                logger.info(f"Wikipedia found data for {company_display}")
                # If Wikipedia gave us good data, we might skip further searches
                if len(result.get("about", "")) >= 100:
                    return result

            # STEP 1: Search for company info (existing code)
            ...
```

---

### 4. Improved AI Extraction

#### 4.1 Better Prompt with Disambiguation
When company name is ambiguous, include disambiguation hints:

```python
def _extract_from_search_results(
    self, company_name: str, search_context: str, source_context: Optional[dict] = None
) -> Optional[Dict[str, Any]]:
    """Use AI to extract structured company data from search results."""

    disambiguation_hint = ""
    if source_context:
        if source_context.get("aggregator_domain") == "greenhouse.io":
            disambiguation_hint = f"\nNote: This is a tech company that uses Greenhouse for hiring."
        elif source_context.get("aggregator_domain") == "myworkdayjobs.com":
            base_url = source_context.get("base_url", "")
            disambiguation_hint = f"\nNote: Their careers page is at {base_url}"

    prompt = f"""Extract company information for "{company_name}" from these search results.
{disambiguation_hint}

SEARCH RESULTS:
{search_context[:6000]}

IMPORTANT:
- If "{company_name}" is ambiguous (e.g., "Close" could be multiple companies),
  focus on the tech/software company that would be hiring.
- Do NOT guess. Only include information clearly stated in the search results.
- If you cannot find reliable information, return empty values.

Return JSON with these fields (use empty string/null/false if truly unknown):
...
"""
```

#### 4.2 Retry with Structured Output
If JSON parsing fails, retry with stricter prompting:

```python
def _parse_json_response(self, response: str) -> Optional[Dict[str, Any]]:
    """Parse JSON from AI response, with retry logic."""
    if not response:
        return None

    try:
        json_str = extract_json_from_response(response)
        return json.loads(json_str)
    except json.JSONDecodeError:
        logger.warning("Failed to parse JSON response, attempting recovery")

        # Try to extract any JSON-like structure
        import re
        json_match = re.search(r'\{[^{}]*\}', response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        return None
```

---

### 5. Workday URL Company Name Extraction

For companies from Workday, the subdomain often reveals the actual company:

```python
def _extract_company_from_workday_url(self, base_url: str) -> Optional[str]:
    """
    Extract real company name from Workday URL.

    Examples:
        "https://mdlz.wd3.myworkdayjobs.com" -> "Mondelez" (MDLZ is stock ticker)
        "https://nvidia.wd5.myworkdayjobs.com" -> "NVIDIA"
    """
    if "myworkdayjobs.com" not in base_url:
        return None

    # Known ticker-to-name mappings
    ticker_map = {
        "mdlz": "Mondelez International",
        "nvidia": "NVIDIA",
        "msft": "Microsoft",
        # Add more as discovered
    }

    try:
        from urllib.parse import urlparse
        parsed = urlparse(base_url)
        subdomain = parsed.netloc.split(".")[0].lower()

        if subdomain in ticker_map:
            return ticker_map[subdomain]

        # Capitalize as company name
        return subdomain.upper()
    except Exception:
        return None
```

---

### 6. Data Cleanup Script

Fix the 14 existing bad records:

```python
# scripts/fix_google_url_companies.py

import sqlite3

def fix_companies(db_path: str):
    """Clear bad data from companies with Google search URLs."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Find affected companies
    cursor.execute("""
        SELECT id, name, website, about
        FROM companies
        WHERE website LIKE '%google.com/search%'
    """)

    affected = cursor.fetchall()
    print(f"Found {len(affected)} companies with Google URLs")

    for company_id, name, website, about in affected:
        print(f"  - {name}: clearing website and about")
        cursor.execute("""
            UPDATE companies
            SET website = '', about = '', culture = '', updated_at = datetime('now')
            WHERE id = ?
        """, (company_id,))

    conn.commit()
    print(f"Cleared {len(affected)} companies. Re-run enrichment to repopulate.")
    conn.close()

if __name__ == "__main__":
    fix_companies("/srv/job-finder/data/jobfinder.db")
```

---

## Implementation Priority

### Phase 1: Bug Fixes (Immediate)
1. ✅ Filter search engine URLs from being stored as website
2. ✅ Don't scrape placeholder URLs
3. ✅ Run cleanup script on existing bad data

### Phase 2: Smarter Queries (This Week)
4. Pass source context (aggregator_domain, base_url) to company fetcher
5. Build better search queries using context
6. Add Workday URL -> company name mapping

### Phase 3: New Data Sources (Next Sprint)
7. Add Wikipedia API integration
8. Consider Crunchbase API for startups (paid)
9. Consider Clearbit for company enrichment (paid)

### Phase 4: AI Improvements (Ongoing)
10. Better disambiguation in prompts
11. Retry logic for JSON parsing failures
12. Consider using Claude instead of Gemini for complex extractions

---

## Success Metrics

- Reduce companies with Google URLs: 14 → 0
- Increase average `about` length for new companies
- Reduce "Failed to parse JSON response" warnings
- Track data quality scores: complete/partial/minimal percentages
