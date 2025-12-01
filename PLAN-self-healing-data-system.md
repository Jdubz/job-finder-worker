# Self-Healing Data System Audit & Improvement Plan

## Executive Summary

This plan addresses comprehensive improvements to the automatic discovery and self-healing data system across all queue processors. The goal is to ensure:

1. **Job tasks** create companies when they don't exist
2. **Company tasks** create sources from careers pages and fill in FK fields
3. **Source tasks** create companies and connect FK relationships
4. **All tasks** pass accurate data to child tasks via input/output JSON
5. **Code cleanup** for child task spawning and input/output patterns

---

## Current State Analysis

### Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   JOB TASK      │────▶│  COMPANY TASK    │────▶│ SOURCE_DISCOVERY  │
│                 │     │                  │     │                   │
│ Creates company │     │ Discovers career │     │ Creates company   │
│ stub if missing │     │ pages, spawns    │     │ if not exists,    │
│                 │     │ source discovery │     │ links FK fields   │
└─────────────────┘     └──────────────────┘     └───────────────────┘
        │                       │                        │
        ▼                       ▼                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   companies     │◀───▶│   job_sources    │◀───▶│  job_listings     │
│                 │     │                  │     │                   │
│ id, name,       │     │ id, name,        │     │ id, title,        │
│ website, about  │     │ company_id (FK)  │     │ company_id (FK)   │
│ culture, etc.   │     │ source_type      │     │ source_id (FK)    │
└─────────────────┘     └──────────────────┘     └───────────────────┘
```

### Current Gaps Identified

#### 1. Inconsistent Child Task Spawning
| Processor | Current Method | Should Use |
|-----------|---------------|------------|
| JobProcessor | `spawn_item_safely()` ✅ | - |
| CompanyProcessor | `add_item()` ❌ | `spawn_item_safely()` |
| SourceProcessor | `add_item()` ❌ | `spawn_item_safely()` |

#### 2. Missing Self-Healing Logic
- **CompanyProcessor**: Only spawns source discovery if URL is already a job board; doesn't discover careers pages
- **SourceProcessor**: Doesn't update company FK if source exists but isn't linked
- **JobProcessor**: Doesn't verify/repair source-company FK relationships

#### 3. "Unknown" Fallbacks Causing Orphan Data
- `source_processor.py:206`: `company_name="Unknown"` when spawning SCRAPE_SOURCE
- Various scrapers return `"Unknown"` for missing fields (partially fixed)

#### 4. Inconsistent Input/Output JSON
- Some data in `input`, some in top-level fields, some in `output`
- No clear contract for what goes where
- Child tasks don't receive full context from parents

---

## Implementation Plan

### Phase 1: Standardize Child Task Spawning (Priority: HIGH)

**Goal**: All child task spawning uses `spawn_item_safely()` with proper context propagation.

#### 1.1 CompanyProcessor Changes

**File**: `job-finder-worker/src/job_finder/job_queue/processors/company_processor.py`

```python
# BEFORE (lines 167-178)
source_item = JobQueueItem(
    type=QueueItemType.SOURCE_DISCOVERY,
    url="",  # ❌ Empty URL
    company_name=company_name,
    company_id=company_id,
    source="automated_scan",
    source_discovery_config=discovery_config,
    tracking_id=item.tracking_id,
    parent_item_id=item.id,
)
self.queue_manager.add_item(source_item)  # ❌ Direct add

# AFTER
spawned_id = self.queue_manager.spawn_item_safely(
    current_item=item,
    new_item_data={
        "type": QueueItemType.SOURCE_DISCOVERY,
        "url": job_board_url,  # ✅ Use actual URL
        "company_name": company_name,
        "company_id": company_id,
        "source": "automated_scan",
        "source_discovery_config": discovery_config,
    }
)
```

#### 1.2 SourceProcessor Changes

**File**: `job-finder-worker/src/job_finder/job_queue/processors/source_processor.py`

```python
# BEFORE (lines 203-212) - SCRAPE_SOURCE spawn
scrape_item = JobQueueItem(
    type=QueueItemType.SCRAPE_SOURCE,
    url="",
    company_name=company_name or "Unknown",  # ❌ Bad fallback
    source="automated_scan",
    scraped_data={"source_id": source_id},
    tracking_id=str(uuid.uuid4()),  # ❌ New tracking_id breaks lineage
)
self.queue_manager.add_item(scrape_item)

# AFTER
self.queue_manager.spawn_item_safely(
    current_item=item,
    new_item_data={
        "type": QueueItemType.SCRAPE_SOURCE,
        "url": "",
        "company_name": company_name or "",  # ✅ Empty string, not "Unknown"
        "company_id": company_id,
        "source": "automated_scan",
        "source_id": source_id,
        "scraped_data": {"source_id": source_id},
    }
)

# BEFORE (lines 223-232) - COMPANY spawn
company_item = JobQueueItem(
    type=QueueItemType.COMPANY,
    url=company_website,
    company_name=company_name,
    company_id=company_id,
    source="automated_scan",
    tracking_id=item.tracking_id,
    parent_item_id=item.id,
)
self.queue_manager.add_item(company_item)

# AFTER
self.queue_manager.spawn_item_safely(
    current_item=item,
    new_item_data={
        "type": QueueItemType.COMPANY,
        "url": company_website,
        "company_name": company_name,
        "company_id": company_id,
        "source": "automated_scan",
    }
)
```

---

### Phase 2: Self-Healing FK Relationships (Priority: HIGH)

**Goal**: Every processor attempts to fill in missing FK relationships.

#### 2.1 Add FK Repair Helper

**File**: `job-finder-worker/src/job_finder/job_queue/processors/base_processor.py`

```python
def ensure_company_source_link(
    self,
    company_id: Optional[str],
    source_id: Optional[str],
    source_url: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Ensure company and source are properly linked.

    Returns:
        (company_id, source_id) - potentially updated values
    """
    # If we have source_id but no company_id, look up company from source
    if source_id and not company_id:
        source = self.sources_manager.get_source_by_id(source_id)
        if source and source.get("companyId"):
            company_id = source["companyId"]

    # If we have company but source isn't linked, try to link
    if company_id and source_id:
        source = self.sources_manager.get_source_by_id(source_id)
        if source and not source.get("companyId"):
            self.sources_manager.update_company_link(source_id, company_id)

    # If we have company and source_url but no source_id, look up source
    if company_id and source_url and not source_id:
        source = self.sources_manager.get_source_for_url(source_url)
        if source:
            source_id = source["id"]
            if not source.get("companyId"):
                self.sources_manager.update_company_link(source_id, company_id)

    return company_id, source_id
```

#### 2.2 JobSourcesManager: Add `update_company_link`

**File**: `job-finder-worker/src/job_finder/storage/job_sources_manager.py`

```python
def update_company_link(self, source_id: str, company_id: str) -> None:
    """Link a source to a company (self-healing)."""
    with sqlite_connection(self.db_path) as conn:
        conn.execute(
            """
            UPDATE job_sources
            SET company_id = ?, updated_at = ?
            WHERE id = ? AND company_id IS NULL
            """,
            (company_id, _utcnow_iso(), source_id),
        )
    logger.info("Linked source %s to company %s", source_id, company_id)
```

#### 2.3 Apply in Each Processor

**JobProcessor** (`_ensure_company_dependency`):
```python
# After resolving company, also check source linking
company_id, source_id = self.ensure_company_source_link(
    company_id=company_id,
    source_id=item.source_id,
    source_url=job_data.get("source_url"),
)
```

**CompanyProcessor** (in `process_company`):
```python
# After saving company, check if existing sources should be linked
if company_id:
    # Check for unlinked sources that might belong to this company
    self._repair_orphan_sources(company_id, company_name)
```

**SourceProcessor** (in `process_source_discovery`):
```python
# Before creating source, ensure company exists and get ID
if company_name and not company_id:
    company = self.companies_manager.get_or_create_company(company_name)
    company_id = company["id"]
```

---

### Phase 3: Search-Powered Career Page Discovery (Priority: MEDIUM)

**Goal**: Company processor uses API search to discover career pages, then spawns source discovery.

The system already has a powerful `SearchClient` abstraction (Tavily/Brave) and `CompanyInfoFetcher` that uses search + AI extraction. We'll leverage this for career page discovery.

#### 3.1 Add Career Page Discovery Method

**File**: `job-finder-worker/src/job_finder/job_queue/processors/company_processor.py`

```python
from job_finder.ai.search_client import get_search_client

def _discover_career_pages_via_search(
    self,
    company_name: str,
    company_id: str,
    website: Optional[str],
) -> List[str]:
    """
    Use API search + AI to discover career page URLs for a company.

    Strategy:
    1. Search for "{company_name} careers jobs greenhouse lever workday"
    2. AI extracts career page URLs from search results
    3. Validate URLs are actual job boards/career pages

    Returns:
        List of discovered career page URLs
    """
    search_client = get_search_client()
    if not search_client:
        logger.debug("No search client available for career discovery")
        return self._discover_career_pages_heuristic(website)

    try:
        # Search specifically for careers/jobs pages
        query = f'"{company_name}" careers jobs site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:workday.com'
        results = search_client.search(query, max_results=5)

        if not results:
            # Fallback to broader search
            query = f'"{company_name}" careers jobs hiring'
            results = search_client.search(query, max_results=5)

        # Extract career URLs from results
        career_urls = []
        ats_domains = ["greenhouse.io", "lever.co", "ashbyhq.com", "workday.com", "myworkdayjobs.com"]

        for result in results:
            url = result.url.lower()
            # Check if URL is from known ATS platform
            if any(ats in url for ats in ats_domains):
                career_urls.append(result.url)
            # Check if URL contains careers/jobs path
            elif "/careers" in url or "/jobs" in url or "jobs." in url:
                career_urls.append(result.url)

        logger.info(
            "Career page search for %s found %d URLs: %s",
            company_name,
            len(career_urls),
            career_urls[:3],  # Log first 3
        )
        return career_urls

    except Exception as e:
        logger.warning("Career page search failed for %s: %s", company_name, e)
        return self._discover_career_pages_heuristic(website)

def _discover_career_pages_heuristic(self, website: Optional[str]) -> List[str]:
    """
    Fallback: Try common career page URL patterns.

    Used when search API is unavailable.
    """
    if not website:
        return []

    patterns = [
        f"{website.rstrip('/')}/careers",
        f"{website.rstrip('/')}/jobs",
        f"{website.rstrip('/')}/join-us",
        f"{website.rstrip('/')}/work-with-us",
    ]

    discovered = []
    for url in patterns:
        if self._validate_career_url(url):
            discovered.append(url)
            break  # Just use first valid one

    return discovered

def _validate_career_url(self, url: str) -> bool:
    """Quick HEAD request to validate URL exists."""
    try:
        response = requests.head(url, timeout=5, allow_redirects=True)
        return response.status_code < 400
    except Exception:
        return False
```

#### 3.2 Integrate into Company Processing Flow

**File**: `job-finder-worker/src/job_finder/job_queue/processors/company_processor.py`

In `process_company()`, after saving company, add career discovery:

```python
# After company saved (line ~148)
company_id = self.companies_manager.save_company(company_record)
logger.info(f"Company saved: {company_display} (ID: {company_id})")

# NEW: Discover and spawn source discovery for career pages
career_urls = self._discover_career_pages_via_search(
    company_name=company_name,
    company_id=company_id,
    website=extracted_info.get("website"),
)

sources_spawned = 0
for career_url in career_urls:
    # Check if source already exists
    existing = self.sources_manager.get_source_for_url(career_url)
    if existing:
        # Self-heal: ensure FK is linked
        if not existing.get("companyId"):
            self.sources_manager.update_company_link(existing["id"], company_id)
        logger.info("Source already exists for %s", career_url)
        continue

    # Spawn source discovery
    discovery_config = SourceDiscoveryConfig(
        url=career_url,
        type_hint=SourceTypeHint.AUTO,
        company_id=company_id,
        company_name=company_name,
    )

    spawned_id = self.queue_manager.spawn_item_safely(
        current_item=item,
        new_item_data={
            "type": QueueItemType.SOURCE_DISCOVERY,
            "url": career_url,
            "company_name": company_name,
            "company_id": company_id,
            "source": "automated_scan",
            "source_discovery_config": discovery_config,
        }
    )
    if spawned_id:
        sources_spawned += 1
        logger.info("Spawned SOURCE_DISCOVERY for %s: %s", company_display, career_url)

# Update result message
if sources_spawned > 0:
    result_parts.append(f"career_pages_discovered={sources_spawned}")
```

#### 3.3 AI-Assisted Career URL Extraction (Advanced)

For more sophisticated discovery, use AI to analyze search results:

```python
def _extract_career_urls_with_ai(
    self,
    company_name: str,
    search_results: List[SearchResult],
) -> List[str]:
    """
    Use AI to identify career page URLs from search results.

    The AI can understand context and identify career pages even
    when URL patterns don't match exactly.
    """
    if not self.ai_provider:
        return []

    context = "\n".join([
        f"Title: {r.title}\nURL: {r.url}\nSnippet: {r.snippet}\n"
        for r in search_results
    ])

    prompt = f"""From these search results, identify URLs that are career/jobs pages for "{company_name}".

SEARCH RESULTS:
{context[:4000]}

Return a JSON array of URLs that are likely career pages. Include:
- ATS platforms (greenhouse.io, lever.co, ashbyhq.com, workday.com)
- Company career pages (/careers, /jobs)
- Job board listings for this specific company

Return ONLY valid JSON array of URLs, nothing else. Example: ["url1", "url2"]"""

    try:
        response = self.ai_provider.generate(prompt, max_tokens=500, temperature=0.1)
        urls = json.loads(response.strip())
        return [u for u in urls if isinstance(u, str) and u.startswith("http")]
    except Exception as e:
        logger.warning("AI career URL extraction failed: %s", e)
        return []
```

---

### Phase 4: Input/Output JSON Standardization (Priority: MEDIUM)

**Goal**: Clear contract for what goes in `input` vs `output`.

#### 4.1 Input JSON Contract

```typescript
// input: Task configuration and references (set at creation, immutable)
interface TaskInput {
  // Identity references
  company_id?: string;
  company_name?: string;
  source_id?: string;
  source_type?: string;

  // Task-specific config
  scrape_config?: ScrapeConfig;
  source_discovery_config?: SourceDiscoveryConfig;

  // Metadata
  source: QueueSource;
  submitted_by?: string;
  metadata?: Record<string, unknown>;
}
```

#### 4.2 Output JSON Contract

```typescript
// output: Task results and telemetry (set during/after processing)
interface TaskOutput {
  // Results
  scraped_data?: Record<string, any>;
  pipeline_state?: Record<string, any>;

  // Created/discovered entities
  created_company_id?: string;
  created_source_id?: string;
  discovered_urls?: string[];

  // Telemetry
  jobs_found?: number;
  jobs_submitted?: number;
  processing_time_ms?: number;
  data_quality?: 'complete' | 'partial' | 'minimal';
}
```

#### 4.3 Update Repository Serialization

**File**: `job-finder-BE/server/src/modules/job-queue/job-queue.repository.ts`

Ensure all top-level convenience fields are properly packed into input/output:

```typescript
const inputData: Record<string, unknown> = {
  ...(data.input ?? {}),
  // Always include if defined (even empty string)
  ...(data.company_name != null && { company_name: data.company_name }),
  ...(data.company_id != null && { company_id: data.company_id }),
  ...(data.source != null && { source: data.source }),
  ...(data.source_id != null && { source_id: data.source_id }),
  ...(data.source_type != null && { source_type: data.source_type }),
  // ... etc
};
```

---

### Phase 5: Remove "Unknown" Fallbacks (Priority: HIGH)

**Goal**: No more orphan records with "Unknown" names.

#### Files to Update:
1. ✅ `job_processor.py` - Generic scraper (already fixed)
2. ✅ `job_processor.py` - Greenhouse scraper (already fixed)
3. ✅ `job_processor.py` - WWR/Remotive scrapers (already fixed)
4. ❌ `source_processor.py:206` - SCRAPE_SOURCE spawn
5. Any other occurrences

```bash
# Find all remaining "Unknown" fallbacks
grep -rn '"Unknown"' job-finder-worker/src/
```

---

## Implementation Order

### Week 1: Critical Fixes
1. [ ] Phase 5: Remove remaining "Unknown" fallbacks
2. [ ] Phase 1.1: CompanyProcessor use `spawn_item_safely()`
3. [ ] Phase 1.2: SourceProcessor use `spawn_item_safely()`

### Week 2: Self-Healing
4. [ ] Phase 2.1: Add `ensure_company_source_link` helper
5. [ ] Phase 2.2: Add `update_company_link` to JobSourcesManager
6. [ ] Phase 2.3: Apply FK repair in all processors

### Week 3: Discovery & Cleanup
7. [ ] Phase 3: Career page discovery in CompanyProcessor
8. [ ] Phase 4: Input/Output JSON standardization

---

## Testing Strategy

### Unit Tests
- Test each processor spawns children with correct data
- Test FK repair helper correctly links entities
- Test career page discovery patterns

### Integration Tests
- Submit job → verify company created → verify source discovered
- Submit company → verify source discovered → verify FK linked
- Submit source discovery → verify company created/linked

### E2E Tests
- Full pipeline: job URL → job_listing + company + source all linked
- Re-analysis: company with existing source gets FK repaired

---

## Success Metrics

1. **Zero orphan records**: No companies/sources with "Unknown" names
2. **Complete FK chains**: Every job_listing has valid company_id and source_id
3. **Proper lineage**: All child tasks have correct tracking_id and parent_item_id
4. **Data propagation**: Child tasks receive full context from parents

---

## Files to Modify

| File | Changes |
|------|---------|
| `company_processor.py` | spawn_item_safely, career discovery, FK repair |
| `source_processor.py` | spawn_item_safely, remove "Unknown", FK repair |
| `job_processor.py` | FK repair helper calls |
| `base_processor.py` | Add `ensure_company_source_link` helper |
| `job_sources_manager.py` | Add `update_company_link` method |
| `job-queue.repository.ts` | Standardize input/output serialization |
| `models.py` | Document input/output contracts in docstrings |
