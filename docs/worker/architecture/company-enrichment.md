> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-09

# Company Enrichment Architecture

The company enrichment pipeline fetches structured company information from multiple data sources to provide context for job matching and scoring.

## Data Flow

```
company_name (from job listing)
    ↓
Workday URL resolution → search_name (may be corrected)
    ↓
STEP 0: Wikipedia/Wikidata lookup
    ↓
STEP 1: Web search (Tavily/Brave)
    ↓
STEP 2: Website URL determination
    ↓
STEP 3: Optional website scraping
    ↓
Merged company info
```

## Data Sources

### Wikipedia/Wikidata (STEP 0)

**File:** `job-finder-worker/src/job_finder/ai/wikipedia_client.py`

High-quality structured data for established companies. Queries:
- Wikipedia Search API to find company page
- Wikipedia REST API for page summary
- Wikidata API for structured properties (P856=website, P159=HQ, P452=industry, P571=founded, P1128=employees)

**Fields provided:** name, about, website, headquarters, industry, founded, employeeCount

### Web Search (STEP 1)

**File:** `job-finder-worker/src/job_finder/ai/search_client.py`

General web search via Tavily or Brave APIs. Always runs after Wikipedia to fill gaps.

**Fields provided:** All fields, plus culture, mission, techStack, products, isRemoteFirst, aiMlFocus

### Website Scraping (STEP 3)

Optional enrichment when `about` text is below minimum threshold. Scrapes company website directly.

## Merge Strategy

The `_merge_company_info()` function in `company_info_fetcher.py` uses:

1. **Text fields** (`about`, `culture`, `mission`): Prefers the **longer** value from any source
2. **Website**: Prefers valid company URLs over job boards and search engine placeholders
3. **Other fields**: Fills empty slots from secondary source

This ensures comprehensive descriptions are retained regardless of which source provides them.

## Company Name Resolution

Before any external API calls, the pipeline resolves company names:

1. **Workday URL mapping**: Converts ticker symbols (e.g., "mdlz" → "Mondelez International")
2. **Known mappings**: 25+ pre-configured mappings in `WORKDAY_COMPANY_MAP`
3. **Subdomain extraction**: Falls back to extracting subdomain from Workday URLs

## Data Schema

```python
{
    "name": str,              # Company name
    "website": str,           # Official website URL
    "about": str,             # Company description (2-3 sentences)
    "culture": str,           # Company culture (1-2 sentences)
    "mission": str,           # Mission statement
    "industry": str,          # Primary industry
    "founded": str,           # Year founded
    "headquarters": str,      # HQ location (city, state/country)
    "employeeCount": int,     # Number of employees
    "companySizeCategory": str,  # "small"/"medium"/"large"
    "isRemoteFirst": bool,    # Remote-first company
    "aiMlFocus": bool,        # AI/ML focused company
    "timezoneOffset": int,    # HQ timezone offset from UTC
    "products": list[str],    # Main products (max 3)
    "techStack": list[str],   # Technology stack (max 5)
}
```

## Key Files

| File | Purpose |
|------|---------|
| `company_info_fetcher.py` | Main orchestrator, merge logic |
| `ai/wikipedia_client.py` | Wikipedia/Wikidata integration |
| `ai/search_client.py` | Tavily/Brave search clients |
| `job_queue/processors/company_processor.py` | Queue processor entry point |

## Configuration

Wikipedia enrichment is always enabled. Web search requires API keys:
- `TAVILY_API_KEY` - Tavily Search API (preferred)
- `BRAVE_API_KEY` - Brave Search API (fallback)
