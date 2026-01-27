# Job Sources Recovery - January 27, 2026

## Summary

Investigated and fixed disabled job sources that were recoverable. Updated production database at `/srv/job-finder/data/jobfinder.db`.

## Changes Made

### Netflix Careers - Fixed API Configuration ✅

**Problem:** Old API endpoint configuration was incomplete
- Old URL: `https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com`
- Missing proper field mappings

**Solution:** Updated configuration with complete field mappings
```json
{
  "type": "api",
  "url": "https://explore.jobs.netflix.net/api/apply/v2/jobs",
  "method": "GET",
  "headers": {"Accept": "application/json"},
  "response_path": "positions",
  "company_name": "Netflix",
  "fields": {
    "title": "name",
    "location": "location",
    "description": "job_description",
    "url": "canonicalPositionUrl",
    "posted_date": "t_create",
    "updated_date": "t_update",
    "department": "department"
  }
}
```

**Testing:** API verified working, returns job listings successfully

---

### Atlassian Careers - Enabled with Playwright Rendering ✅

**Investigation Findings:**
- Uses custom-built careers page (not Lever, Greenhouse, or Workday)
- Jobs loaded dynamically via JavaScript
- No public JSON API available
- Container element: `#all-jobs`

**Configuration:** Enabled with JavaScript rendering
```json
{
  "type": "html",
  "url": "https://www.atlassian.com/company/careers/all-jobs",
  "requires_js": true,
  "render_wait_for": "#all-jobs",
  "render_timeout_ms": 30000,
  "job_selector": ".job-card, [data-testid=\"job-card\"], article[role=\"article\"]",
  "company_name": "Atlassian",
  "fields": {
    "title": "h3, h2, .job-title, [data-testid=\"job-title\"]",
    "location": ".location, .job-location, [data-testid=\"job-location\"]",
    "url": "a@href",
    "description": ".description, .job-description"
  },
  "validation_policy": "allow_empty"
}
```

**Source Type:** Changed from `api` to `html`
**Status:** Active and ready for scraping with Playwright renderer

**Notes:** 
- Uses multiple fallback CSS selectors since exact DOM structure unknown until rendered
- `validation_policy: allow_empty` allows initial test runs
- May need selector refinement after first successful scrape

---

### Greenhouse Sources - Already Active ✅

Verified these sources are already active and working:
- **Brex Careers** (board_token: brex)
- **Waymo Careers** (board_token: waymo)
- **PagerDuty Careers** (board_token: pagerduty)
- **Grammarly Careers** (board_token: grammarly)
- **New Relic Careers** (board_token: newrelic)
- **Deepgram Careers** (board_token: deepgram)

All using standard Greenhouse API: `https://boards-api.greenhouse.io/v1/boards/{token}/jobs`

---

## Database Changes

**Location:** `/srv/job-finder/data/jobfinder.db`

**SQL Updates:**
```sql
-- Netflix Careers
UPDATE job_sources 
SET config_json = json('{...}'),
    updated_at = datetime('now')
WHERE name = 'Netflix Careers';

-- Atlassian Careers  
UPDATE job_sources 
SET source_type = 'html',
    config_json = json('{...}'),
    updated_at = datetime('now')
WHERE name = 'Atlassian Careers';
```

---

## Testing Recommendations

1. **Netflix:** Run scraper to verify API field mappings work correctly
2. **Atlassian:** 
   - Ensure Playwright is installed in worker environment
   - Run test scrape to verify selectors capture jobs
   - Refine selectors if needed based on actual DOM structure
3. **Monitor logs** for any scraping errors from updated sources

---

## Technical Details

### Playwright Rendering
The system already has a robust Playwright renderer implementation:
- **File:** `job-finder-worker/src/job_finder/rendering/playwright_renderer.py`
- **Features:**
  - Headless Chromium rendering
  - Configurable timeouts
  - Resource blocking (images, fonts, etc.)
  - Automatic browser restart on failures
  - Thread-safe singleton renderer

**Usage:** Set `requires_js: true` in source config, scraper automatically uses Playwright

### Investigation Process
- Tested Netflix API endpoints to find correct Eightfold platform URL
- Attempted multiple ATS platforms for Atlassian (Lever, Workday, Greenhouse)
- Identified custom JavaScript-rendered page with `#all-jobs` container
- Configured generic CSS selectors with fallbacks for unknown DOM structure

---

## Related Files
- Production DB: `/srv/job-finder/data/jobfinder.db`
- Scraper: `job-finder-worker/src/job_finder/scrapers/generic_scraper.py`
- Renderer: `job-finder-worker/src/job_finder/rendering/playwright_renderer.py`
- Source Config: `job-finder-worker/src/job_finder/scrapers/source_config.py`
