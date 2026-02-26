-- Migration 050: Fix zero-result HTML sources
--
-- Addresses ~90 active HTML sources that have never produced job listings.
-- Root causes include: wrong source_type, broken CSS selectors, missing JS
-- rendering flags, and sources best scraped via their underlying ATS API.
--
-- Sections:
--  1-16:  Fix source_type, selectors, JS flags for known platforms
-- 17-18:  Additional Webflow and applytojob fixes
-- 19-21:  Convert sources to Lever/Greenhouse/Personio APIs
-- 22-27:  Fix individual selectors (BRYTER, CyberCoders, etc.)
--    28:  Disable sources with no scrapable content
--    29:  Convert sources to BambooHR API

-- ============================================================
-- 1. Fix source_type for API sources incorrectly typed as 'html'
-- These have config_json.type='api' but source_type='html' in the DB.
-- The config_expander handles this correctly at runtime, but fixing
-- the DB column avoids confusion and ensures consistency.
-- ============================================================

UPDATE job_sources SET source_type = 'api'
WHERE id IN (
    'cjD6piPzI0juRZoHadBR',   -- Atlassian Careers
    '3975d1c7-9373-46d6-b644-5b53875a3053', -- Experian Jobs (SmartRecruiters API)
    'af8e5685-af64-4653-95a0-1bb4105d8ff3', -- Nagarro Jobs (SmartRecruiters API)
    '3b2f6cde-3adb-42d7-a578-1b3afca4dd68'  -- REI Jobs
) AND source_type = 'html';


-- ============================================================
-- 2. Convert Teamtailor sources to use correct selectors
-- Teamtailor is server-rendered HTML. The old '.card-body' selector
-- no longer matches. The correct structure uses li items with job links.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'li.w-full:has(a[href*="/jobs/"])',
    '$.fields', json('{"title": "a[href*=''/jobs/'']", "url": "a[href*=''/jobs/'']@href", "location": ".mt-1.text-md span:nth-child(3)", "department": ".mt-1.text-md span:first-child"}')
)
WHERE id = '30d2b9a7-35b5-462f-b9cb-4e4604251a29' -- Gigster Jobs (teamtailor.com)
  AND status = 'active';

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'li.w-full:has(a[href*="/jobs/"])',
    '$.fields', json('{"title": "a[href*=''/jobs/'']", "url": "a[href*=''/jobs/'']@href", "location": ".mt-1.text-md span:nth-child(3)", "department": ".mt-1.text-md span:first-child"}')
)
WHERE id = '912ee957-878f-49d6-a14f-46d4e5e3e612' -- Valce Talent Solutions Jobs (teamtailor.com)
  AND status = 'active';

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'li.w-full:has(a[href*="/jobs/"])',
    '$.fields', json('{"title": "a[href*=''/jobs/'']", "url": "a[href*=''/jobs/'']@href", "location": ".mt-1.text-md span:nth-child(3)", "department": ".mt-1.text-md span:first-child"}')
)
WHERE id = '10125a42-5309-4169-a50f-210c3e8514f5' -- Zinkworks Jobs (teamtailor.com)
  AND status = 'active';


-- ============================================================
-- 3. Convert Personio sources to use XML feed
-- Personio exposes an XML feed at /xml that contains structured
-- job data. This is more reliable than scraping their JS-rendered pages.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    json_set(
        config_json,
        '$.url', 'https://stark.jobs.personio.com/xml',
        '$.job_selector', 'position',
        '$.fields', json('{"title": "name", "url": "id", "location": "office", "department": "department"}'),
        '$.base_url', 'https://stark.jobs.personio.com/job/'
    ),
    '$.requires_js', json('false')
)
WHERE id = '8c4995b5-d28d-4b5c-98e6-032d7019d865' -- Stark Defence Jobs (personio.com)
  AND status = 'active';

UPDATE job_sources SET config_json = json_set(
    json_set(
        config_json,
        '$.url', 'https://c4a8.jobs.personio.de/xml',
        '$.job_selector', 'position',
        '$.fields', json('{"title": "name", "url": "id", "location": "office", "department": "department"}'),
        '$.base_url', 'https://c4a8.jobs.personio.de/job/'
    ),
    '$.requires_js', json('false')
)
WHERE id = 'cb863a28-bcdd-4b7f-85ff-9023d559b59a' -- glueckkanja AG Jobs (personio.de)
  AND status = 'active';


-- ============================================================
-- 4. Fix iCIMS sources
-- iCIMS portals are fully JS-rendered. Sources without requires_js
-- get empty HTML. Also fix field selectors (comma-separated selectors
-- with @attr don't work — use single reliable selectors instead).
-- ============================================================

-- Add requires_js to iCIMS sources that lack it
UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.requires_js', json('true'),
    '$.render_wait_for', '.iCIMS_JobsTable, .iCIMS_Expandable_Container, [class*="job"]',
    '$.render_timeout_ms', 30000,
    '$.job_selector', '.iCIMS_JobsTable .row',
    '$.fields', json('{"title": "a.iCIMS_Anchor", "url": "a.iCIMS_Anchor@href"}')
)
WHERE id IN (
    'f6cae949-7ba2-4d95-9608-aa98dd7ca260', -- EverWatch Jobs (icims.com)
    'c2075a93-83f2-4e9d-926e-ef2b82ba82c6', -- HealthEquity Jobs (icims.com)
    '22ac7a7e-5d44-476a-862a-1bcd2376be6b', -- Sargent & Lundy Jobs (icims.com)
    'c622a495-10fe-4656-a919-a57eb3383e6b'  -- Sev1Tech Jobs (icims.com)
) AND status = 'active';

-- Fix field selectors for iCIMS sources that already have requires_js
-- The comma-separated selector+@attr format doesn't work correctly
UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.render_wait_for', '.iCIMS_JobsTable, .iCIMS_Expandable_Container, [class*="job"]',
    '$.render_timeout_ms', 30000,
    '$.job_selector', '.iCIMS_JobsTable .row',
    '$.fields', json('{"title": "a.iCIMS_Anchor", "url": "a.iCIMS_Anchor@href"}')
)
WHERE id IN (
    '25e94e18-5b6b-4772-a323-dae38abf15c4', -- NV5 Jobs (icims.com)
    '1b754441-951a-41f9-8ea1-6e0a27bbcaad'  -- Peraton Jobs (icims.com)
) AND status = 'active';

-- LMI/iCIMS (different URL pattern - join.lmi.org which redirects to iCIMS)
UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.render_wait_for', '[class*="job"], .search-result, .ats-results',
    '$.render_timeout_ms', 30000,
    '$.job_selector', '[class*="search-result-item"], .job-item, li:has(a[href*="/job/"])',
    '$.fields', json('{"title": "a[href*=''/job/'']", "url": "a[href*=''/job/'']@href"}')
)
WHERE id = '9707ae90-a8f2-47ed-8cd0-9245d6419817' -- Logistics Management Institute Jobs (icims.com)
  AND status = 'active';


-- ============================================================
-- 5. Fix Webflow sources (add JS rendering)
-- Webflow dynamic items (.w-dyn-item) require JavaScript to render.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.requires_js', json('true'),
    '$.render_wait_for', '.w-dyn-item'
)
WHERE id IN (
    '69735760-0ff7-445f-8334-77f0aec387c8', -- Digioh Jobs
    '5cf36599-dd85-4a4e-be83-e77a6602716d', -- NewRocket Jobs
    'ecbadfec-b3e5-4790-acd6-f315e5b30866'  -- Valiant Solutions Jobs
) AND status = 'active';


-- ============================================================
-- 6. Fix Customertimes selector
-- Page uses <article class="job-card"> not <div class="card job-card">
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'article.job-card'
)
WHERE id = '0d809e6e-7fd4-4436-bc43-926b90db86b1' -- Customertimes Jobs (careers-page.com)
  AND status = 'active';


-- ============================================================
-- 7. Fix ZohoRecruit sources
-- ZohoRecruit is JS-rendered. Need requires_js and correct selectors.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.requires_js', json('true'),
    '$.render_wait_for', '.cw-job-listing, [class*="job-card"], [class*="job-item"]',
    '$.render_timeout_ms', 30000,
    '$.job_selector', '.cw-job-listing li, [class*="job-card"]',
    '$.fields', json('{"title": "a", "url": "a@href"}')
)
WHERE id IN (
    '681639c3-e66d-40e1-b805-69e42280ef49', -- Lithan Jobs (zohorecruit.com)
    '882b684e-2bf5-4eef-b57c-fbf15845474e'  -- Madiff Jobs (zohorecruit.com)
) AND status = 'active';

-- Curotec is actually a ZohoRecruit career site
UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.requires_js', json('true'),
    '$.render_wait_for', '.cw-job-listing, [class*="job-card"], [class*="job-item"]',
    '$.render_timeout_ms', 30000,
    '$.job_selector', '.cw-job-listing li, [class*="job-card"]',
    '$.fields', json('{"title": "a", "url": "a@href"}')
)
WHERE id = 'f44a84c6-a37c-4145-a0da-ae6d2e820e91' -- Curotec Jobs
  AND status = 'active';


-- ============================================================
-- 8. Disable major SPA sources that can't be reliably scraped
-- These are complex React/Angular SPAs with anti-bot protection.
-- Logs show "Not Found" pages, dynamic selectors, or bot detection.
-- ============================================================

UPDATE job_sources SET
    status = 'disabled',
    config_json = json_set(config_json, '$.disabled_notes',
        'Disabled: complex SPA with anti-bot protection, needs dedicated API integration')
WHERE id IN (
    '13ef4cb2-9673-4792-91c6-fb0e878b3aeb', -- Meta Jobs (React SPA, anti-bot)
    'fa5b4845-2883-4fc0-a0b1-bcae67abe1a7', -- Microsoft Jobs (returns "Not Found" page)
    '520d2ca6-7496-4603-9bab-61694d4f70d1'  -- UnitedHealth Group Jobs (returns "Page not found")
) AND status = 'active';


-- ============================================================
-- 9. Fix Zoom Jobs selector
-- Zoom careers page has job elements but the li:has(h3 a) selector
-- doesn't match. The actual structure uses different elements.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.render_wait_for', '[class*="job"], a[href*="/jobs/"]',
    '$.job_selector', 'a[href*="/jobs/"]:has(h2, h3, [class*="title"])',
    '$.fields', json('{"title": "h2, h3, [class*=''title'']", "url": "@href"}')
)
WHERE id = 'debfa07f-fa94-4ff2-8d6e-92be05a9da20' -- zoom Jobs
  AND status = 'active';


-- ============================================================
-- 10. Fix Thermo Fisher selector
-- Uses custom web components (ph-search-results-job-card) that
-- BeautifulSoup can't select. Fall back to standard CSS classes.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.render_wait_for', '.job-cart, [class*="job-card"], [class*="search-result"]',
    '$.job_selector', 'li.job-cart',
    '$.fields', json('{"title": "a", "url": "a@href", "location": "[class*=''location'']"}')
)
WHERE id = '3128f320-0cb4-4d85-80ee-d479019e74c2' -- Thermo Fisher Scientific Jobs
  AND status = 'active';


-- ============================================================
-- 11. Fix ADP/Dayforce source
-- ADP WorkforceNow and Dayforce portals are heavily JS-rendered.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.render_wait_for', '[class*="job"], [class*="search"], .ant-collapse',
    '$.render_timeout_ms', 30000,
    '$.job_selector', '.ant-collapse-item, [class*="job-card"], a[href*="/job/"]',
    '$.fields', json('{"title": ".ant-collapse-header, [class*=''title'']", "url": "a[href*=''/job/'']@href"}')
)
WHERE id = '97893a32-19df-4af3-ad9b-86ffac4cf147' -- Med-Metrix Jobs (Dayforce)
  AND status = 'active';


-- ============================================================
-- 12. Fix applytojob.com / JazzHR sources
-- These need requires_js for proper rendering. The posting element
-- selector varies by site template.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.requires_js', json('true'),
    '$.render_wait_for', '.posting, .job-listing, li.list-group-item, [class*="position"]',
    '$.render_timeout_ms', 25000,
    '$.job_selector', '.posting, li.list-group-item',
    '$.fields', json('{"title": "a, .job-title, h3", "url": "a@href"}')
)
WHERE id IN (
    'f4f2e7c6-1025-475c-a297-b1802fa7a35a', -- American Journal Experts (AJE)
    'f262e082-9842-480e-b42d-589fefa46e9f', -- Avolve Software Group
    'a0271f2b-d6e6-4f80-86d5-492b0329c041', -- Longbow Advantage
    '6ffb347f-1fdb-411e-9141-ae2fddd8b2f9'  -- SeedTrust
) AND status = 'active';


-- ============================================================
-- 13. Fix trakstar.com sources
-- Trakstar uses .js-careers-page-job-list-item which works for some.
-- Fix ONeil which uses different selector.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', '.js-careers-page-job-list-item, .job, .opening'
)
WHERE id = '85c72ec4-15c2-40df-a33b-2fe9dd385d7c' -- ONeil Interactive Jobs (trakstar.com)
  AND status = 'active';


-- ============================================================
-- 14. Fix Chainlink Labs (Webflow site, needs JS)
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.requires_js', json('true'),
    '$.render_wait_for', 'a[href*="/jobs/"], .w-dyn-item, [class*="career"]',
    '$.job_selector', '.w-dyn-item, a[href*="/jobs/"]:not([href="/jobs/"])',
    '$.fields', json('{"title": "a, h3, [class*=''title'']", "url": "a@href"}')
)
WHERE id = 'b6aedb8f-c697-4b44-b764-595849d51f42' -- Chainlink Labs Jobs
  AND status = 'active';


-- ============================================================
-- 15. Disable sources with no job listings content or broken pages
-- ============================================================

-- Pharmavise: uses an embedded widget with no accessible job data
-- DreamRider: URL is humi.ca apply page, not a job listing page
-- Digital Resource: ADP WorkforceNow portal, extremely complex JS rendering
UPDATE job_sources SET
    status = 'disabled',
    config_json = json_set(config_json, '$.disabled_notes',
        'Disabled: page has no scrapable job listing structure')
WHERE id IN (
    'b61a56d3-4ea1-4c78-85b3-3d8f118b819e', -- Pharmavise Corporation Jobs
    '7cfd7788-c8d5-4929-a0ba-a0e5357caad4', -- DreamRider Productions Jobs
    'f306a62a-b9e9-4ef4-95c8-08ecd290a3f2'  -- Digital Resource Jobs (ADP)
) AND status = 'active';


-- ============================================================
-- 16. Fix source_type for additional API sources incorrectly typed as 'html'
-- These use Lever, Ashby, Rippling, or Breezy JSON APIs but have
-- source_type='html'. Also affected by company_filter bug (now fixed).
-- ============================================================

UPDATE job_sources SET source_type = 'api'
WHERE id IN (
    'bea49441-4a3e-4b69-961d-0c4a26638ff6', -- 3Pillar Global Jobs (Lever API)
    'fbe392f7-c4ef-4d8e-976e-798955caaf1e', -- Almedia Jobs (Ashby API)
    '381a1ec0-1a41-49ab-9055-d925ae51e5e6', -- Fullscript Jobs (Lever API)
    'd692f826-17fd-4b7b-9fde-32c93bbea82f', -- Nango Jobs (Ashby API)
    '09dd2690-df4d-4bd6-8428-084316bd1a4b', -- Radian Generation Jobs (Rippling API)
    '534cad1f-1f8f-4cbb-a21f-55e3843fa525', -- Scentbird Jobs (Rippling API)
    'ba7be138-ec15-4556-9b25-061fbde33cc4'  -- Splash, Inc. Jobs (Breezy API)
) AND source_type = 'html';


-- ============================================================
-- 17. Fix additional Webflow sources (add JS rendering)
-- These use .w-dyn-item which requires JavaScript to render.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.requires_js', json('true'),
    '$.render_wait_for', '.w-dyn-item'
)
WHERE id IN (
    '41b985c7-e620-4af5-a863-44d47e04b98d', -- BAM Technologies (Webflow)
    '569f1597-15ea-47dc-94ee-36528b99b5dc'  -- Thesiliconforest (Webflow)
) AND status = 'active';


-- ============================================================
-- 18. Fix additional applytojob.com / JazzHR sources
-- Same fix as section 12 — these need JS rendering and correct selectors.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.requires_js', json('true'),
    '$.render_wait_for', '.posting, .job-listing, li.list-group-item, [class*="position"]',
    '$.render_timeout_ms', 25000,
    '$.job_selector', '.posting, li.list-group-item',
    '$.fields', json('{"title": "a, .job-title, h3", "url": "a@href"}')
)
WHERE id IN (
    'd57f9be4-832a-4f2b-b5a2-51197bc3d533', -- Bitovi Jobs (applytojob.com)
    '3e311af8-1e92-4368-8aa5-97e70c90d163'  -- iNTERFACEWARE Jobs (applytojob.com)
) AND status = 'active';

-- silverorange uses applytojobs.ca (Canadian domain), same platform
UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.requires_js', json('true'),
    '$.render_wait_for', '.posting, .job-listing, li.list-group-item, [class*="position"]',
    '$.render_timeout_ms', 25000,
    '$.job_selector', '.posting, li.list-group-item, .job-posting',
    '$.fields', json('{"title": "a, .job-title, h3", "url": "a@href"}')
)
WHERE id = 'fb168c07-1ef1-4df3-b262-ca13ecbf8476' -- silverorange Jobs (applytojobs.ca)
  AND status = 'active';


-- ============================================================
-- 19. Convert sources to Lever API
-- These career pages link to Lever. Scrape the Lever API directly.
-- ============================================================

-- Allata: careers page links to jobs.lever.co/Allata (10 jobs confirmed via API)
UPDATE job_sources SET
    source_type = 'api',
    config_json = json_object(
        'type', 'api',
        'url', 'https://api.lever.co/v0/postings/Allata?mode=json',
        'response_path', '',
        'fields', json('{"title": "text", "url": "hostedUrl", "location": "categories.location", "department": "categories.department", "description": "descriptionPlain"}')
    )
WHERE id = '4a0e76fa-100c-49cd-984d-91187dc347b3' -- Allata Jobs
  AND status = 'active';

-- AlphaPoint: embedded Lever board (2 jobs confirmed via API)
UPDATE job_sources SET
    source_type = 'api',
    config_json = json_object(
        'type', 'api',
        'url', 'https://api.lever.co/v0/postings/alphapoint?mode=json',
        'response_path', '',
        'fields', json('{"title": "text", "url": "hostedUrl", "location": "categories.location", "department": "categories.department", "description": "descriptionPlain"}')
    )
WHERE id = 'e79b5df1-64ef-4513-aefb-4bc74a9978eb' -- AlphaPoint Jobs
  AND status = 'active';


-- ============================================================
-- 20. Convert sources to Greenhouse API
-- These career pages embed Greenhouse boards. Scrape the API directly.
-- ============================================================

-- Tenable: links to boards.greenhouse.io/tenableinc (64 jobs confirmed)
UPDATE job_sources SET
    source_type = 'api',
    config_json = json_object(
        'type', 'api',
        'url', 'https://boards-api.greenhouse.io/v1/boards/tenableinc/jobs?content=true',
        'response_path', 'jobs',
        'fields', json('{"title": "title", "url": "absolute_url", "location": "location.name", "description": "content", "posted_date": "updated_at"}')
    )
WHERE id = '7eb40ba1-9140-4d8d-af3e-aa718de82d48' -- Tenable Jobs
  AND status = 'active';

-- Ren: links to job-boards.greenhouse.io/renpsg (1 job confirmed)
UPDATE job_sources SET
    source_type = 'api',
    config_json = json_object(
        'type', 'api',
        'url', 'https://boards-api.greenhouse.io/v1/boards/renpsg/jobs?content=true',
        'response_path', 'jobs',
        'fields', json('{"title": "title", "url": "absolute_url", "location": "location.name", "description": "content", "posted_date": "updated_at"}')
    )
WHERE id = 'babfdc39-7a20-42e8-8c7d-1b9049890898' -- Ren Jobs
  AND status = 'active';


-- ============================================================
-- 21. Convert Cycloid to Personio XML
-- Career page links to cycloid.jobs.personio.de (7 positions confirmed)
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    json_set(
        config_json,
        '$.url', 'https://cycloid.jobs.personio.de/xml',
        '$.job_selector', 'position',
        '$.fields', json('{"title": "name", "url": "id", "location": "office", "department": "department"}'),
        '$.base_url', 'https://cycloid.jobs.personio.de/job/'
    ),
    '$.requires_js', json('false')
)
WHERE id = 'ca8566e1-3043-491f-89dd-a5d46003c448' -- Cycloid Jobs
  AND status = 'active';


-- ============================================================
-- 22. Fix BRYTER selector
-- Uses a.careers-listing-item (confirmed 3+ matches)
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'a.careers-listing-item',
    '$.fields', json('{"title": "div.career-item-header ~ *", "url": "@href"}')
)
WHERE id = 'a02e993a-6f0e-4566-a774-40871c7a9206' -- BRYTER Jobs
  AND status = 'active';


-- ============================================================
-- 23. Fix CyberCoders selector
-- Uses div.job-listing-item (confirmed 21+ matches)
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'div.job-listing-item',
    '$.fields', json('{"title": "div.job-title", "url": "a@href", "location": "div.job-location"}')
)
WHERE id = '6aff2603-3691-4974-9f6f-f8ee8162458f' -- CyberCoders Jobs
  AND status = 'active';


-- ============================================================
-- 24. Fix Rapid Strategy selector (EasyApply platform)
-- Uses a.job_row elements (confirmed 26 matches)
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'a.job_row',
    '$.fields', json('{"title": "span.title", "url": "@href", "location": "span.location"}')
)
WHERE id = 'f2304a09-1246-42c5-ad16-9be86eac9e45' -- Rapid Strategy Jobs (easyapply.co)
  AND status = 'active';


-- ============================================================
-- 25. Fix allstate-plumbing selector (Jobsoid platform)
-- Uses a.jobDetailsLink (confirmed 1 match)
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'a.jobDetailsLink',
    '$.fields', json('{"title": "h3", "url": "@href"}')
)
WHERE id = '883801e8-53c0-46e8-8c03-1faaa5e83d2f' -- allstate-plumbing Jobs (jobsoid.com)
  AND status = 'active';


-- ============================================================
-- 26. Fix bloXroute selector
-- WordPress site with direct job links (confirmed 9 matches)
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'a[href*="/jobs/"]:not([href$="/jobs/"])',
    '$.fields', json('{"title": "", "url": "@href"}')
)
WHERE id = '4f206434-dac9-4e7b-b810-527e084cdd1c' -- bloXroute Labs Jobs
  AND status = 'active';


-- ============================================================
-- 27. Fix Swanky selector
-- Custom WP theme with job posts at /job/{slug}/ (confirmed 24 links)
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'a[href*="/job/"]:not([href="/job/"]):not([href$="/job/"])',
    '$.fields', json('{"title": "", "url": "@href"}')
)
WHERE id = '02a592f7-a4d4-4b84-a1af-18b19dc62884' -- Swanky Jobs
  AND status = 'active';


-- ============================================================
-- 27b. Fix WRS Health selector
-- Talent portal has job content in div.job-content (25 matches confirmed).
-- Previous selector 'article' was wrong.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'div.job-content',
    '$.fields', json('{"title": "h4.job-title", "url": "a[href*=''apply'']@href"}')
)
WHERE id = '96f4f396-ddb9-465a-8330-3a9725253aa8' -- WRS Health Jobs
  AND status = 'active';


-- ============================================================
-- 27c. Fix NBCUniversal: category index, not individual job listings
-- The careers page shows department categories (Accounting, Admin, etc.)
-- not individual jobs. The career-cont-top cards link to filtered job pages.
-- ============================================================

UPDATE job_sources SET config_json = json_set(
    config_json,
    '$.job_selector', 'div.col-lg-3.career-col-sep',
    '$.fields', json('{"title": "div.career-term", "url": "a@href"}')
)
WHERE id = 'f95bcc1d-a032-4dc5-9b9a-d4b1e14e5339' -- NBCUniversal Jobs
  AND status = 'active';


-- ============================================================
-- 28. Disable remaining sources with no scrapable content
-- Includes: SPAs needing JS (no workaround), empty pages, 403 blocked,
-- embedded ATS iframes that need separate integration, and sites
-- with no visible job listings.
-- ============================================================

UPDATE job_sources SET
    status = 'disabled',
    config_json = json_set(config_json, '$.disabled_notes',
        'Disabled: SPA requires JS rendering / no scrapable job content')
WHERE id IN (
    -- SPAs needing JS / complex client-side rendering
    'f6a9937d-a943-48e1-b458-da872e608c26', -- Automattic Jobs (WordPress JS widget)
    'f498b4e9-4a6c-42bc-b82a-cee028a795a2', -- Civitai Jobs (Next.js SPA)
    '9cddf00e-45be-4df1-a895-ef16486b558f', -- Happy Lemon Games Jobs (Cloudflare + SPA)
    '9add082c-6291-4d29-a94a-2bb9c7d432a4', -- MissionWired Jobs (JS-loaded HubSpot)
    '09ed99af-86ba-4f2a-b20d-cac32291eaa8', -- Pulumi Jobs (web components SPA)
    '0a1a0c4e-5452-4715-a4df-ea37a52f735a', -- Rapinno Tech Jobs (Angular SPA)
    '95e5209a-13d9-4a25-a729-e65831c764bc', -- Veeva Systems Jobs (Vue SPA)
    '90d8948b-d416-40d7-92a4-d7a4c64f847f', -- Great Good Jobs (Angular SPA, tiny page)
    -- No visible job listings / embedded ATS needing separate integration
    'a82c6ace-a123-40ad-9624-d8a9810b86ec', -- C TWO Jobs (brochure page, no listings)
    'c1759573-bf45-40d8-8276-1f7562df2794', -- Hypergiant Industries Jobs (0 Greenhouse jobs)
    '84f87fb3-b9f1-4616-b94d-284ea882f78b', -- Radity Jobs (links to careers-page.com)
    '2593a726-dd81-42c0-b703-fc240635ccb7', -- Humana International Jobs (iframe to careers-page.com)
    'ae4b2efb-720e-4d3b-a7a9-81253f460423', -- RxCloud Jobs (links to ZohoRecruit)
    'a2e57fe9-d8af-42d7-90ff-d03678eb214c', -- ClearBridge Jobs (Bullhorn iframe)
    'f3f41ac4-089a-47f4-8a3e-72ac16fb7a5a', -- MORI Associates Jobs (JazzHR iframe)
    '4f7d411a-8a85-425e-8239-10e2c411c0dc', -- evoila GmbH Jobs (jobs on separate /jobs/ page)
    'de8c9ee8-94a0-4937-a3e6-bccfcf5a0164', -- Glama Jobs (SPA with minimal content)
    -- Cloudflare / WAF blocked
    '8011d5c0-be50-4637-a96a-f3941c33d166', -- RealPage Jobs (Cloudflare + iCIMS link)
    '68b0d016-13aa-4c26-817a-c84108a50013'  -- PSI CRO Jobs (Cloudflare blocked)
) AND status = 'active';


-- ============================================================
-- 29. Convert Stormind and VyOS to BambooHR API
-- Both link to bamboohr.com careers API (confirmed via JSON endpoint)
-- ============================================================

UPDATE job_sources SET
    source_type = 'api',
    config_json = json_object(
        'type', 'api',
        'url', 'https://stormindgames.bamboohr.com/careers/list',
        'response_path', 'result',
        'fields', json('{"title": "jobOpeningName", "location": "location.city", "department": "departmentLabel", "job_type": "employmentStatusLabel"}')
    )
WHERE id = 'a5871f41-ff40-49b8-85cd-d280b9e9768a' -- Stormind Games Jobs
  AND status = 'active';

UPDATE job_sources SET
    source_type = 'api',
    config_json = json_object(
        'type', 'api',
        'url', 'https://vyos.bamboohr.com/careers/list',
        'response_path', 'result',
        'fields', json('{"title": "jobOpeningName", "location": "location.city", "department": "departmentLabel", "job_type": "employmentStatusLabel"}')
    )
WHERE id = '3023fb2f-2473-4a15-b67d-e3272db8ae55' -- VyOS Networks Jobs
  AND status = 'active';
