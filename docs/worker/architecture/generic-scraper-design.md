> Status: Active
> Owner: @jdubz
> Last Updated: 2026-02-17

# Generic Scraper Architecture

## Overview

One generic scraper handles all job sources via config-driven parsing. No per-vendor scraper classes.

## Source Types

| Type | Fetch Method | Field Extraction |
|------|-------------|-----------------|
| `api` | HTTP GET/POST (requests) | Dot-notation paths into JSON (`location.name`) |
| `rss` | feedparser | RSS field names (`title`, `link`, `summary`) |
| `html` | requests.get OR **Playwright** | CSS selectors (`.job-title`, `a@href`) |

## JavaScript Rendering (Playwright)

The system **fully supports JavaScript-rendered pages** via a headless Chromium browser powered by Playwright.

When `requires_js: true` is set in the source config:
1. The page is loaded in headless Chromium instead of plain HTTP
2. JavaScript executes and the DOM renders fully
3. The scraper waits for `render_wait_for` selector to appear (or `job_selector` as fallback)
4. CSS selectors in `fields` are applied to the rendered DOM

This means **any publicly accessible page can be scraped**, including:
- Single Page Applications (React, Angular, Vue, Remix, etc.)
- Enterprise ATS portals (SuccessFactors, Oracle Cloud HCM, Taleo, Bullhorn)
- WordPress sites with dynamically loaded job widgets
- Any page that loads job listings via XHR/fetch after initial page load

### JS Rendering Config Fields

| Field | Required | Description |
|-------|----------|-------------|
| `requires_js` | Yes | Set `true` to use Playwright instead of requests |
| `render_wait_for` | Recommended | CSS selector to wait for before scraping (e.g., `.job-card`, `[data-job-id]`) |
| `render_timeout_ms` | Optional | Max wait time in ms (default: 20000, use 30000+ for slow enterprise portals) |

### Implementation

- **Renderer**: `rendering/playwright_renderer.py` — singleton headless Chromium
- **Integration**: `generic_scraper.py:_fetch_html_page()` checks `requires_js` and routes to Playwright or requests
- **Probe support**: `source_processor.py:_probe_config()` uses Playwright for JS sources during discovery

## File Layout

```
src/job_finder/
├── scrapers/
│   ├── generic_scraper.py      # Single scraper for all source types
│   ├── source_config.py        # SourceConfig dataclass
│   ├── config_expander.py      # Legacy config → full config expansion
│   ├── platform_patterns.py    # Known ATS field mappings
│   └── text_sanitizer.py       # HTML → text utilities
├── rendering/
│   └── playwright_renderer.py  # Headless Chromium via Playwright
└── ai/
    └── source_analysis_agent.py # AI-powered source classification
```

## SourceConfig Schema

```python
@dataclass
class SourceConfig:
    type: str              # "api" | "rss" | "html"
    url: str               # Endpoint URL, RSS feed URL, or page URL

    # Field mappings — path to each field in response
    fields: Dict[str, str] # {"title": "position", "url": "hostedUrl", ...}

    # Common optional
    response_path: str = ""         # Path to jobs array: "jobs", "data.results", "[1:]"
    job_selector: str = ""          # CSS selector for each job item (HTML only)
    company_name: str = ""          # Override company name for all jobs
    headers: Dict[str, str] = {}    # Custom HTTP headers

    # Authentication
    api_key: str = ""               # API key
    auth_type: str = ""             # "header" | "query" | "bearer"
    auth_param: str = ""            # Header/query param name

    # Salary handling
    salary_min_field: str = ""
    salary_max_field: str = ""

    # POST APIs (e.g., Workday)
    method: str = "GET"             # "GET" | "POST"
    post_body: Dict = {}            # Request body for POST
    base_url: str = ""              # Base URL for relative paths

    # JS rendering (Playwright)
    requires_js: bool = False       # Use Playwright instead of requests
    render_wait_for: str = ""       # CSS selector to wait for after page load
    render_timeout_ms: int = 20000  # Render timeout in milliseconds

    # Pagination
    pagination_type: str = ""       # "page_num" | "offset" | "cursor" | "url_template"
    pagination_param: str = ""      # Query/body param name
    page_size: int = 0
    max_pages: int = 50

    # Other
    company_extraction: str = ""    # "from_title" | "from_description"
    is_remote_source: bool = False  # All jobs assumed remote
    company_filter: str = ""        # Filter to specific company on aggregators
    embedded_json_selector: str = "" # CSS selector for elements containing JSON
    follow_detail: bool = False     # Fetch each job's detail page
```

## Config Examples

### API — Greenhouse
```json
{
  "type": "api",
  "url": "https://boards-api.greenhouse.io/v1/boards/databricks/jobs?content=true",
  "response_path": "jobs",
  "company_name": "Databricks",
  "fields": {
    "title": "title",
    "location": "location.name",
    "description": "content",
    "url": "absolute_url",
    "posted_date": "updated_at"
  }
}
```

### API — Workday (POST)
```json
{
  "type": "api",
  "url": "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs",
  "method": "POST",
  "post_body": {"limit": 50, "offset": 0},
  "response_path": "jobPostings",
  "base_url": "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
  "fields": {
    "title": "title",
    "url": "externalPath",
    "location": "locationsText",
    "posted_date": "postedOn"
  }
}
```

### RSS Feed
```json
{
  "type": "rss",
  "url": "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  "fields": {
    "title": "title",
    "description": "summary",
    "url": "link",
    "posted_date": "published"
  }
}
```

### HTML — Static Page
```json
{
  "type": "html",
  "url": "https://example.com/careers",
  "job_selector": ".job-listing",
  "fields": {
    "title": ".job-title",
    "location": ".location",
    "url": "a@href"
  }
}
```

### HTML — JavaScript-Rendered (Playwright)
```json
{
  "type": "html",
  "url": "https://careers.steris.com/?locale=en_GB",
  "requires_js": true,
  "render_wait_for": ".job-card",
  "render_timeout_ms": 30000,
  "job_selector": ".job-card",
  "company_name": "STERIS",
  "fields": {
    "title": ".job-title",
    "location": ".job-location",
    "url": "a@href"
  }
}
```

## Key Behaviors

### Empty Results Are Valid

A scrape returning 0 jobs is a **valid state** — the company simply has no current openings. The system records this as a successful scrape and does NOT disable the source. Sources are only disabled for actual errors (endpoint gone, bot protection, auth required).

### Self-Healing

When a scrape returns sparse or malformed results, the system asks an AI agent to propose a fixed config and retries once. If the healed config produces better results, it's persisted.

### Probing

During source discovery, configs are validated by a "probe" that fetches the endpoint and checks for job items. The probe uses Playwright for `requires_js` sources, with a shorter timeout for fast failure on bad selectors.
