# Plan: Company vs Job Source Separation

**STATUS: IMPLEMENTED** ✓

---

## Key Concept: `aggregator_domain` Field

Add a nullable `aggregator_domain` field to `job_sources`. When set, it means:
1. This source is a job board platform (hosts jobs for multiple companies)
2. The domain value (e.g., "greenhouse.io") should never be used as a company.website
3. Jobs from this source need company info extracted from the listing, not the source

**This replaces hardcoded domain lists with dynamic, data-driven validation.**

### The Greenhouse Edge Case

Greenhouse (the company) posts jobs on greenhouse.io (their platform):

| Entity | Type | Key Fields |
|--------|------|------------|
| Greenhouse Inc | Company | `website = "greenhouse.com"` (corporate site) |
| Greenhouse Platform | Source | `aggregator_domain = "greenhouse.io"`, `company_id = NULL` |
| Greenhouse Careers | Source | `aggregator_domain = NULL`, `company_id = <greenhouse-inc>` |

- The **Platform** source is the aggregator - it has `aggregator_domain` set
- The **Careers** source is company-specific - it's linked to Greenhouse Inc via `company_id`
- Greenhouse Inc's `website` is their corporate site, NOT the job board

For Coinbase using Greenhouse:
| Entity | Type | Key Fields |
|--------|------|------------|
| Coinbase | Company | `website = "coinbase.com"` |
| Coinbase Jobs | Source | `aggregator_domain = NULL`, `company_id = <coinbase>` |

The Coinbase source is company-specific (no aggregator_domain), even though the URL happens to be on greenhouse.io.

---

## The 3 Core Problems

### Problem 1: Source URL used as company website
**Location:** `source_processor.py:150-154`

```python
# CURRENT (WRONG)
company_website = self._extract_base_url(url)  # url = boards.greenhouse.io/acme
company_record = self.companies_manager.get_or_create_company(
    company_name=company_name,
    company_website=company_website,  # Sets website to greenhouse.io!
)
```

### Problem 2: Source name used as company name fallback
**Location:** `scrape_runner.py:243`

```python
# CURRENT (WRONG)
company_name = source.get("company_name") or source.get("companyName") or source_name
# If source is "Remotive", jobs get company_name="Remotive" even when Remotive isn't hiring
```

### Problem 3: Band-aid detection instead of proper data flow
**Location:** `job_processor.py:671-679` and `company_name_utils.py:101`

The `is_source_name()` function exists to detect when company_name was incorrectly set to a source name. This is treating the symptom, not the cause.

---

## Fixes

### Fix 1: Never derive company website from source URL

**File:** `source_processor.py`

**Change:** When discovering a source, do NOT create/update company with the source URL as website. If a company needs to be created, leave website NULL - the company enrichment pipeline will find the real website later.

```python
# BEFORE (lines 148-154)
if not company_id and company_name:
    company_website = self._extract_base_url(url)  # ❌ DELETE THIS
    company_record = self.companies_manager.get_or_create_company(
        company_name=company_name,
        company_website=company_website,  # ❌ REMOVE
    )

# AFTER
if not company_id and company_name:
    company_record = self.companies_manager.get_or_create_company(
        company_name=company_name,
        company_website=None,  # Let enrichment find the real website
    )
```

**Also delete:** The `_extract_base_url()` method (lines 275-294) since it's only used for this broken purpose.

---

### Fix 2: Never fallback to source name as company name

**File:** `scrape_runner.py`

**Change:** If a source has no linked company, the scraped jobs must get their company name from the job listing itself, NOT from the source.

```python
# BEFORE (line 243)
company_name = source.get("company_name") or source.get("companyName") or source_name

# AFTER
company_name = None
if source.get("company_id") or source.get("companyId"):
    company_id = source.get("company_id") or source.get("companyId")
    company = self.companies_manager.get_company_by_id(company_id)
    if company:
        company_name = company.get("name")
# If no linked company, company_name stays None - scraper must extract it from each job
```

**Downstream impact:** Scrapers must be responsible for extracting `company` field from each job listing. If a listing doesn't have a company field, it should be flagged for review, not defaulted to the source name.

**File:** `scrapers/source_config.py` and individual scrapers

Ensure scrapers are extracting `company` from job listings. For aggregator sources (Remotive, WWR, etc.), the company name MUST come from the listing, not the source config.

---

### Fix 3: Require either company_id OR aggregator_domain on every source

**File:** `job_sources_manager.py` - `create_from_discovery()` method

**Change:** Every source must be either linked to a company OR marked as an aggregator. No ambiguous sources.

```python
def create_from_discovery(
    self,
    name: str,
    source_type: str,
    config: Dict[str, Any],
    company_id: Optional[str] = None,
    aggregator_domain: Optional[str] = None,
    ...
):
    # Every source must be EITHER company-specific OR an aggregator
    if not company_id and not aggregator_domain:
        raise ValueError(
            f"Source '{name}' must have either company_id (company-specific) "
            "or aggregator_domain (job board platform)"
        )
```

This forces explicit classification at creation time - no more ambiguous sources that aren't clearly one or the other.

---

### Fix 4: Remove denormalized company_name from job_sources

**Current state:** `job_sources` table has both `company_id` (FK) and `company_name` (text).

**Problem:** These can get out of sync. The `company_name` column is redundant and creates confusion.

**Migration:**
```sql
-- Remove redundant column
ALTER TABLE job_sources DROP COLUMN company_name;
```

**Code changes:**
- `job_sources_manager.py`: Remove all `company_name` parameter usage
- When displaying source info, JOIN to companies table to get name

---

### Fix 5: Add `aggregator_domain` field and use it for validation

**Migration:**
```sql
ALTER TABLE job_sources ADD COLUMN aggregator_domain TEXT;

-- Backfill known aggregators (one-time data migration)
UPDATE job_sources SET aggregator_domain = 'greenhouse.io'
WHERE source_type = 'greenhouse' AND company_id IS NULL;
-- etc for lever, remotive, etc.
```

**File:** `companies_manager.py` - `save_company()` or `get_or_create_company()`

**Change:** Query aggregator_domains dynamically and reject matching URLs.

```python
def save_company(self, company_data: Dict) -> str:
    website = company_data.get("website")
    if website:
        # Get all aggregator domains from job_sources
        aggregator_domains = self.sources_manager.get_aggregator_domains()

        from urllib.parse import urlparse
        domain = urlparse(website).netloc.lower()

        for agg_domain in aggregator_domains:
            if agg_domain in domain:
                logger.warning(f"Rejecting aggregator URL as company website: {website}")
                company_data["website"] = None
                break
    # ... continue with save
```

**File:** `job_sources_manager.py` - add helper method

```python
def get_aggregator_domains(self) -> List[str]:
    """Return all unique aggregator_domain values (non-null)."""
    with sqlite_connection(self.db_path) as conn:
        rows = conn.execute(
            "SELECT DISTINCT aggregator_domain FROM job_sources WHERE aggregator_domain IS NOT NULL"
        ).fetchall()
    return [row[0] for row in rows]
```

**File:** `scrape_runner.py` - use aggregator_domain to determine behavior

```python
# BEFORE
company_name = source.get("company_name") or source.get("companyName") or source_name

# AFTER
is_aggregator = bool(source.get("aggregator_domain"))
if is_aggregator:
    company_name = None  # Must come from job listing
else:
    company_id = source.get("company_id") or source.get("companyId")
    if company_id:
        company = self.companies_manager.get_company_by_id(company_id)
        company_name = company.get("name") if company else None
    else:
        company_name = None
```

This is vendor-agnostic - the validation uses data from the sources table, not hardcoded strings.

---

## Summary of Changes

| File | Change |
|------|--------|
| `source_processor.py:148-154` | Stop using `_extract_base_url()` for company website |
| `source_processor.py:275-294` | Delete `_extract_base_url()` method |
| `scrape_runner.py:243` | Use `aggregator_domain` to decide company resolution strategy |
| `job_sources_manager.py` | Add `get_aggregator_domains()` helper |
| `job_sources_manager.py` | Remove `company_name` parameter (use FK only) |
| `companies_manager.py` | Query aggregator_domains and reject matching URLs |
| Migration | Add `aggregator_domain` column to `job_sources` |
| Migration | Drop `company_name` column from `job_sources` |

---

## What This Achieves

1. **Source URLs never pollute company.website** - Dynamic validation against `aggregator_domain` values
2. **Source names never pollute job.company** - `aggregator_domain` presence triggers per-listing extraction
3. **Vendor-agnostic** - No hardcoded domain lists, uses source metadata
4. **Single source of truth** - Company info via FK, aggregator status via `aggregator_domain`
5. **Handles edge cases** - Greenhouse Inc can have a company record with proper website while greenhouse.io is still blocked as a company website

The `is_source_name()` detection in job_processor.py can remain as a safety net, but it should rarely trigger once upstream issues are fixed.
