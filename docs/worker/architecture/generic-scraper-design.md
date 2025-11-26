> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Generic Scraper Design

## Problem

Automatically onboard new job sources (like Netflix) without writing custom code.

## Solution

One generic scraper driven by a config that tells it how to parse each source.

---

# Full Replacement Plan

This is a **complete replacement** of the legacy scraper system. No backwards compatibility. No legacy code left behind.

## Current State (To Be Deleted)

### Files to DELETE

```
src/job_finder/scrapers/
├── base.py                 # DELETE - Abstract base class
├── greenhouse_scraper.py   # DELETE - Custom Greenhouse implementation
├── rss_scraper.py          # DELETE - Custom RSS implementation
├── remoteok_scraper.py     # DELETE - Custom RemoteOK implementation
├── text_sanitizer.py       # KEEP - Shared utility, still needed
└── __init__.py             # UPDATE - Remove old exports

src/job_finder/ai/
└── selector_discovery.py   # DELETE - Replaced by source_discovery.py

src/job_finder/utils/
└── source_type_detector.py # DELETE - Detection now happens in AI discovery

tests/
├── test_greenhouse_scraper.py  # DELETE - Replace with generic scraper tests
└── test_rss_scraper.py         # DELETE - Replace with generic scraper tests
```

### Current Config Formats in DB (To Be Migrated)

| sourceType | Current config_json | New config_json |
|------------|---------------------|-----------------|
| `greenhouse` | `{"board_token":"coinbase"}` | `{"type":"api","url":"https://boards-api.greenhouse.io/v1/boards/coinbase/jobs?content=true","response_path":"jobs","fields":{...}}` |
| `rss` | `{"url":"...","title_field":"title",...}` | `{"type":"rss","url":"...","fields":{"title":"title",...}}` |
| `api` | `{"base_url":"https://remoteok.com/api"}` | `{"type":"api","url":"...","response_path":"[1:]","fields":{...}}` |
| `company-page` | `{"api_endpoint":"...","selectors":{...}}` | `{"type":"html","url":"...","job_selector":"...","fields":{...}}` |

### Code Locations That Import Scrapers

1. `scrape_runner.py:29` - `from job_finder.scrapers.greenhouse_scraper import GreenhouseScraper`
2. `scrape_runner.py:277` - `from job_finder.scrapers.rss_scraper import RSSJobScraper`
3. `scrape_runner.py:296` - `from job_finder.scrapers.remoteok_scraper import RemoteOKScraper`
4. `source_processor.py:453` - `from job_finder.scrapers.greenhouse_scraper import GreenhouseScraper`
5. `source_processor.py:464` - `from job_finder.scrapers.rss_scraper import RSSJobScraper`
6. `source_processor.py:341` - `from job_finder.ai.selector_discovery import SelectorDiscovery`

---

## New Architecture

### Files to CREATE

```
src/job_finder/scrapers/
├── __init__.py             # Export GenericScraper only
├── generic_scraper.py      # Single scraper for all source types
├── source_config.py        # SourceConfig dataclass
└── text_sanitizer.py       # KEEP existing

src/job_finder/ai/
└── source_discovery.py     # AI-powered config generation (replaces selector_discovery.py)
```

### Config Schema

```python
@dataclass
class SourceConfig:
    type: str              # "api" | "rss" | "html"
    url: str               # Endpoint or feed URL

    # Field mappings - path to each field in response
    fields: Dict[str, str] # {"title": "position", "company": "company_name", ...}

    # Optional
    response_path: str = ""         # Path to jobs array: "jobs", "data.results", "[1:]"
    job_selector: str = ""          # CSS selector for job items (HTML only)
    company_name: str = ""          # Override company name
    headers: Dict[str, str] = {}    # Custom headers

    # Authentication (for Workday, Adzuna, etc.)
    api_key: str = ""               # API key (stored encrypted in DB)
    auth_type: str = ""             # "header" | "query" | "bearer"
    auth_param: str = ""            # Header name or query param name (e.g., "X-API-Key", "api_key")

    # Salary handling (when split into min/max fields)
    salary_min_field: str = ""      # e.g., "salaryMin", "salary_min"
    salary_max_field: str = ""      # e.g., "salaryMax", "salary_max"
```

### Authentication Types

| auth_type | Behavior |
|-----------|----------|
| `header` | Adds `{auth_param}: {api_key}` to request headers |
| `query` | Adds `?{auth_param}={api_key}` to URL |
| `bearer` | Adds `Authorization: Bearer {api_key}` header |

---

## Config Examples

### Greenhouse
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

### RemoteOK
```json
{
  "type": "api",
  "url": "https://remoteok.com/api",
  "response_path": "[1:]",
  "fields": {
    "title": "position",
    "company": "company",
    "location": "location",
    "description": "description",
    "url": "url",
    "posted_date": "date"
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

### HTML Page
```json
{
  "type": "html",
  "url": "https://example.com/careers",
  "job_selector": ".job-listing",
  "fields": {
    "title": ".job-title",
    "company": ".company-name",
    "location": ".location",
    "description": ".description",
    "url": "a@href"
  }
}
```

### Adzuna (Authenticated)
```json
{
  "type": "api",
  "url": "https://api.adzuna.com/v1/api/jobs/us/search/1",
  "response_path": "results",
  "auth_type": "query",
  "auth_param": "app_key",
  "api_key": "{{ADZUNA_API_KEY}}",
  "headers": {"app_id": "{{ADZUNA_APP_ID}}"},
  "fields": {
    "title": "title",
    "company": "company.display_name",
    "location": "location.display_name",
    "description": "description",
    "url": "redirect_url",
    "posted_date": "created"
  },
  "salary_min_field": "salary_min",
  "salary_max_field": "salary_max"
}
```

### Jobicy (with salary fields)
```json
{
  "type": "api",
  "url": "https://jobicy.com/api/v2/remote-jobs",
  "response_path": "jobs",
  "fields": {
    "title": "jobTitle",
    "company": "companyName",
    "location": "jobGeo",
    "description": "jobDescription",
    "url": "url",
    "posted_date": "pubDate"
  },
  "salary_min_field": "salaryMin",
  "salary_max_field": "salaryMax"
}
```

---

## Implementation

### GenericScraper Class

```python
class GenericScraper:
    def __init__(self, config: SourceConfig):
        self.config = config

    def scrape(self) -> List[Dict]:
        # 1. Fetch based on type
        if self.config.type == "api":
            data = self._fetch_json()
        elif self.config.type == "rss":
            data = self._fetch_rss()
        elif self.config.type == "html":
            data = self._fetch_html()

        # 2. Parse each item
        jobs = []
        for item in data:
            job = self._extract_fields(item)
            if job.get("title") and job.get("url"):
                jobs.append(job)

        return jobs

    def _fetch_json(self) -> List[Dict]:
        """Fetch JSON API with optional auth."""
        url = self.config.url
        headers = dict(self.config.headers)

        # Apply authentication
        if self.config.api_key:
            if self.config.auth_type == "bearer":
                headers["Authorization"] = f"Bearer {self.config.api_key}"
            elif self.config.auth_type == "header":
                headers[self.config.auth_param] = self.config.api_key
            elif self.config.auth_type == "query":
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}{self.config.auth_param}={self.config.api_key}"

        response = requests.get(url, headers=headers)
        data = response.json()

        # Navigate to jobs array using response_path
        return self._navigate_path(data, self.config.response_path)

    def _fetch_rss(self) -> List[Dict]:
        """Fetch and parse RSS feed."""
        feed = feedparser.parse(self.config.url)
        return feed.entries

    def _fetch_html(self) -> List[Any]:
        """Fetch HTML and select job elements."""
        response = requests.get(self.config.url)
        soup = BeautifulSoup(response.text, 'html.parser')
        return soup.select(self.config.job_selector)

    def _extract_fields(self, item) -> Dict:
        """Extract fields using config mappings."""
        job = {}
        for field, path in self.config.fields.items():
            value = self._get_value(item, path)

            # Convert timestamps to ISO format
            if field == "posted_date" and isinstance(value, (int, float)):
                value = datetime.fromtimestamp(value).isoformat()

            job[field] = value

        # Combine salary min/max if specified
        if self.config.salary_min_field:
            min_val = self._get_value(item, self.config.salary_min_field)
            max_val = self._get_value(item, self.config.salary_max_field) if self.config.salary_max_field else None
            if min_val:
                job["salary"] = f"${min_val:,}-${max_val:,}" if max_val else f"${min_val:,}+"

        # Override company if specified
        if self.config.company_name:
            job["company"] = self.config.company_name

        return job

    def _get_value(self, item, path: str):
        """Get value using dot notation (api/rss) or CSS selector (html)."""
        if self.config.type == "html":
            return self._css_select(item, path)
        else:
            return self._dot_access(item, path)

    def _dot_access(self, item, path: str):
        """Navigate nested dict with dot notation: 'company.display_name'"""
        for key in path.split("."):
            if item is None:
                return None
            item = item.get(key) if isinstance(item, dict) else None
        return item

    def _css_select(self, element, selector: str):
        """Extract value using CSS selector or attribute."""
        if "@" in selector:
            # Attribute selector: "a@href"
            sel, attr = selector.split("@")
            el = element.select_one(sel) if sel else element
            return el.get(attr) if el else None
        else:
            el = element.select_one(selector)
            return el.get_text(strip=True) if el else None

    def _navigate_path(self, data, path: str) -> List:
        """Navigate to jobs array. Supports: 'jobs', 'data.results', '[1:]'"""
        if not path:
            return data if isinstance(data, list) else [data]
        if path.startswith("["):  # Array slice like "[1:]"
            return eval(f"data{path}")
        return self._dot_access(data, path) or []
```

---

## AI Discovery

When user submits a new careers URL:

1. Fetch the URL
2. Detect type (check for RSS headers, JSON response, or HTML)
3. Send sample to AI with prompt:

```
Analyze this careers page and generate a scraper config.

URL: {url}
Type: {detected_type}
Sample:
{truncated_sample}

Return JSON config with:
- type: "api" | "rss" | "html"
- response_path: path to jobs array (if api)
- job_selector: CSS selector for job items (if html)
- fields: mapping of {title, company, location, description, url, posted_date}

Only include fields you can identify. Use dot notation for nested JSON, CSS selectors for HTML.
```

4. Validate by test scraping
5. Save config to `job_sources` table

---

## Migration Strategy

### Step 1: Create new files
- `scrapers/source_config.py`
- `scrapers/generic_scraper.py`
- `ai/source_discovery.py`

### Step 2: Update scrape_runner.py
Replace all scraper instantiation with GenericScraper:

```python
# OLD:
if source_type == "greenhouse":
    scraper = GreenhouseScraper(config)
elif source_type == "rss":
    scraper = RSSJobScraper(config, listing_config)
...

# NEW:
source_config = SourceConfig.from_dict(config)
scraper = GenericScraper(source_config)
jobs = scraper.scrape()
```

### Step 3: Update source_processor.py
- Replace `SelectorDiscovery` with new `SourceDiscovery`
- Remove type-specific discovery methods
- Use unified config format

### Step 4: Migrate existing job_sources configs
SQL migration script to convert old configs to new format.

### Step 5: Delete legacy files
- `scrapers/base.py`
- `scrapers/greenhouse_scraper.py`
- `scrapers/rss_scraper.py`
- `scrapers/remoteok_scraper.py`
- `ai/selector_discovery.py`
- `utils/source_type_detector.py`

### Step 6: Update tests
- Delete `test_greenhouse_scraper.py`
- Delete `test_rss_scraper.py`
- Create `test_generic_scraper.py`

---

## Output

Same standardized job dict as existing scrapers:

```python
{
    "title": str,
    "company": str,
    "location": str,
    "description": str,
    "url": str,
    "posted_date": str,  # optional
    "salary": str,       # optional
}
```

---

## Database Changes

The `job_sources` table `config_json` column format changes. The `sourceType` column becomes redundant (type is inside config) but can be kept for quick filtering.

### Migration SQL

```sql
-- Example: Convert greenhouse sources
UPDATE job_sources
SET config_json = json_object(
    'type', 'api',
    'url', 'https://boards-api.greenhouse.io/v1/boards/' || json_extract(config_json, '$.board_token') || '/jobs?content=true',
    'response_path', 'jobs',
    'company_name', name,
    'fields', json_object(
        'title', 'title',
        'location', 'location.name',
        'description', 'content',
        'url', 'absolute_url',
        'posted_date', 'updated_at'
    )
)
WHERE sourceType = 'greenhouse';
```

Similar migrations needed for RSS and other source types.
