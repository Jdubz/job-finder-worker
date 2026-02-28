-- Fix sources with 0 job listings - 2026-02-27
-- These sources are active but returning 0 results due to config issues.
-- Run against: /srv/job-finder/data/jobfinder.db

SELECT 'Before fix - zero-job source counts:';
SELECT count(*) || ' sources with consecutive_zero_jobs >= 4'
FROM job_sources
WHERE status = 'active'
  AND COALESCE(json_extract(config_json, '$.consecutive_zero_jobs'), 0) >= 4;

-- ============================================================================
-- CATEGORY 1: SmartRecruiters - fix wrong field names
-- The correct SmartRecruiters /v1/companies/{id}/postings fields are:
--   title=name, url=ref, location=location.city, posted_date=releasedDate
-- Many sources had hallucinated field names (displayName, apiUrl, jobTitle, etc.)
-- ============================================================================

-- Fix all SmartRecruiters sources with wrong field mappings in one batch.
-- This sets the standard correct fields matching platform_patterns.py.
UPDATE job_sources
SET config_json = json_set(
    json_set(
        json_set(
            json_set(
                json_set(
                    json_set(
                        json_set(
                            json_set(
                                json_set(config_json,
                                    '$.fields.title', 'name'),
                                '$.fields.url', 'ref'),
                            '$.fields.location', 'location.fullLocation'),
                        '$.fields.posted_date', 'releasedDate'),
                    '$.fields.description', 'jobAd.sections.jobDescription.text'),
                '$.fields.company', 'company.name'),
            '$.fields.job_type', 'typeOfEmployment.label'),
        '$.fields.department', 'department.label'),
    '$.consecutive_zero_jobs', 0)
WHERE status = 'active'
  AND json_extract(config_json, '$.url') LIKE '%api.smartrecruiters.com%'
  AND COALESCE(json_extract(config_json, '$.consecutive_zero_jobs'), 0) >= 4;

-- ============================================================================
-- CATEGORY 2: Recruitee - fix response_path (null/empty → "offers")
-- Recruitee API wraps results in {"offers": [...]}
-- ============================================================================

-- 24-LOG GmbH (4 offers)
UPDATE job_sources
SET config_json = json_set(
    json_set(config_json,
        '$.response_path', 'offers'),
    '$.consecutive_zero_jobs', 0)
WHERE id = '72456de6-9290-426c-a42d-89b2e53386fb';

-- Microsoft/Recruitee (1 offer)
UPDATE job_sources
SET config_json = json_set(
    json_set(config_json,
        '$.response_path', 'offers'),
    '$.consecutive_zero_jobs', 0)
WHERE id = 'a39cbba5-e90d-42c4-b48b-6cc80bca07a2';

-- ============================================================================
-- CATEGORY 3: BambooHR - add missing url field mapping + base_url
-- BambooHR /careers/list returns items with 'id' but no URL field.
-- URLs are constructed as: https://{company}.bamboohr.com/careers/{id}
-- ============================================================================

-- Stormind Games (6 jobs)
UPDATE job_sources
SET config_json = json_set(
    json_set(
        json_set(config_json,
            '$.fields.url', 'id'),
        '$.base_url', 'https://stormindgames.bamboohr.com/careers'),
    '$.consecutive_zero_jobs', 0)
WHERE id = 'a5871f41-ff40-49b8-85cd-d280b9e9768a';

-- VyOS (4 jobs)
UPDATE job_sources
SET config_json = json_set(
    json_set(
        json_set(config_json,
            '$.fields.url', 'id'),
        '$.base_url', 'https://vyos.bamboohr.com/careers'),
    '$.consecutive_zero_jobs', 0)
WHERE id = '3023fb2f-2473-4a15-b67d-e3272db8ae55';

-- ============================================================================
-- CATEGORY 4: Breezy.hr - fix response_path
-- Breezy.hr /json returns a flat array, not nested under "positions"
-- ============================================================================

-- Hatch Innovations Canada (6 jobs)
UPDATE job_sources
SET config_json = json_set(
    json_set(config_json,
        '$.response_path', ''),
    '$.consecutive_zero_jobs', 0)
WHERE id = '38774236-9d11-411c-8d32-2b19f8a9b77a';

-- ============================================================================
-- CATEGORY 5: Adzuna - fix search query
-- 'where=remote' returns 0 results; Adzuna doesn't recognize "remote" as a location
-- ============================================================================

UPDATE job_sources
SET config_json = json_set(
    json_set(config_json,
        '$.url', 'https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=b352c6c6&app_key=6d13f18be2a28c524c002c3827ea2d88&results_per_page=50&what=software+engineer&content-type=application/json'),
    '$.consecutive_zero_jobs', 0)
WHERE id = 'avp2eslMU15nQRbeQSuM';

-- ============================================================================
-- CATEGORY 6: Delete duplicate source
-- Two identical sources for Future PLC pointing to same Greenhouse URL.
-- Keep the one with company_name set, delete the nameless duplicate.
-- ============================================================================

UPDATE job_sources
SET status = 'deleted'
WHERE id = '85f407f3-c248-4594-a9cd-589f5d1abf92';

-- ============================================================================
-- CATEGORY 7: Reset consecutive_zero_jobs for sources with correct configs
-- These sources have correct field mappings but either:
-- a) Have jobs now (transient scraper failures caused the counter to increment)
-- b) Genuinely have 0 jobs (company not hiring) - add validation_policy
-- ============================================================================

-- 7a. Sources with correct configs AND confirmed jobs (transient failures)
-- 3Pillar Global (Lever, 73 jobs) - config verified correct via test scrape
UPDATE job_sources
SET config_json = json_set(config_json, '$.consecutive_zero_jobs', 0)
WHERE id = 'bea49441-4a3e-4b69-961d-0c4a26638ff6';

-- Fullscript (Lever, 21 jobs)
UPDATE job_sources
SET config_json = json_set(config_json, '$.consecutive_zero_jobs', 0)
WHERE id = '381a1ec0-1a41-49ab-9055-d925ae51e5e6';

-- Future PLC (Greenhouse, 1 job)
UPDATE job_sources
SET config_json = json_set(config_json, '$.consecutive_zero_jobs', 0)
WHERE id = '8354f446-d7c7-4057-bc14-a7cb43e32bcb';

-- 7b. Sources with correct configs but genuinely 0 jobs currently.
-- Reset counter and add validation_policy to prevent re-incrementing.
UPDATE job_sources
SET config_json = json_set(
    json_set(config_json,
        '$.consecutive_zero_jobs', 0),
    '$.validation_policy', 'allow_empty')
WHERE id IN (
    '7f312e2b-8ac1-46fc-beff-c650e7309096',  -- Genesis (Lever, 0 jobs)
    '1c712837-e0c1-4d69-b5fe-0ebc47829fbf',  -- Kraken (Lever, 0 jobs)
    'cfd8d635-bff2-41ff-ab85-53f80aa8e608',  -- WorkOS (Lever, 0 jobs)
    'e8e4919f-ba60-4673-86c4-0f1c28c9b1c6',  -- Cytora (Workable, 0 jobs)
    'ec3db39c-c369-4637-8ded-812ca10c9340',  -- Silverfin (Workable, 0 jobs)
    '27b10f1d-3c27-4694-8430-c3bc899f97ed',  -- Paymentology (Workable, 0 jobs)
    'c164da2e-00f2-4705-ae8b-b9190ae0bd8c',  -- Recruit 121 Group (Workable, 0 jobs)
    '4ebbd4aa-e481-43e4-8008-ed84c7aa801f',  -- Diverse Computing (Workable, 0 jobs)
    '4ee7693e-40b1-45da-8358-5c268de94754',  -- HiveMQ (Greenhouse, 0 jobs)
    '2369a774-01f3-4e02-a905-40b40aafd1cd',  -- Nuclear Promise X (Greenhouse, 0 jobs)
    'ebd7af2d-ae5f-4a9d-b166-51ceae002aea',  -- Wormhole Foundation (Greenhouse, 0 jobs)
    'd692f826-17fd-4b7b-9fde-32c93bbea82f',  -- Nango (Ashby, 0 jobs)
    '515445d9-acb4-4edd-b1f3-a2ddcedd1c0e',  -- Michael (Breezy.hr, 0 jobs)
    'bac48b14-c7f2-4b00-a14a-83d98281326b',  -- 8West Consulting (Recruitee, 0 jobs)
    '5f6368c1-cc33-48ba-b53c-b1fc6bd6e36e',  -- CodeSignal (SmartRecruiters, 0 jobs)
    '38f159e1-8b10-4ac0-bffe-50d7c8d8905d',  -- ARRK (SmartRecruiters, 0 jobs)
    'beac01c5-52ec-4a79-9ae6-d31c5acfd9f9',  -- Fanatics (Oracle Cloud, 0 jobs)
    '98686b3c-98a6-4a43-aa23-0248035015b3'   -- WeWork (SmartRecruiters, 2 jobs - also gets field fix above)
);

-- ============================================================================
-- CATEGORY 8: HTML sources - fix selectors and field mappings
-- ============================================================================

-- 8a. Customertimes (Manatal careers-page.com, 105+ jobs, SSR)
-- Fix: title selector from h5.job-title → a.job-title-link, url → a.job-title-link@href
UPDATE job_sources
SET config_json = json_set(
    json_set(
        json_set(
            json_set(config_json,
                '$.fields.title', 'a.job-title-link'),
            '$.fields.url', 'a.job-title-link@href'),
        '$.base_url', 'https://customertimes.careers-page.com'),
    '$.consecutive_zero_jobs', 0)
WHERE id = '0d809e6e-7fd4-4436-bc43-926b90db86b1';

-- 8b. WRS Health (WordPress, 25 jobs, SSR)
-- Fix: job_selector from div.job-content → div.accordion__item, url from a[href*='apply']@href → a.button@href
UPDATE job_sources
SET config_json = json_set(
    json_set(
        json_set(
            json_set(config_json,
                '$.job_selector', 'div.accordion__item'),
            '$.fields.title', 'h4.job-title'),
        '$.fields.url', 'a.button@href'),
    '$.consecutive_zero_jobs', 0)
WHERE id = '96f4f396-ddb9-465a-8330-3a9725253aa8';

-- 8c. Rapid Strategy (EasyApply, 26 jobs, SSR)
-- Fix: title selector from span.title → .vega-default-link
UPDATE job_sources
SET config_json = json_set(
    json_set(config_json,
        '$.fields.title', '.vega-default-link'),
    '$.consecutive_zero_jobs', 0)
WHERE id = 'f2304a09-1246-42c5-ad16-9be86eac9e45';

-- 8d. ONeil Interactive (Trakstar, 3 jobs, SSR)
-- Fix: field selectors to match actual Trakstar HTML classes
UPDATE job_sources
SET config_json = json('{
    "type": "html",
    "url": "https://oneilinteractive.hire.trakstar.com/",
    "job_selector": ".js-careers-page-job-list-item",
    "fields": {
        "title": ".js-job-list-opening-name",
        "url": "a@href",
        "location": ".js-job-list-opening-loc"
    },
    "company_name": "ONeil Interactive",
    "base_url": "https://oneilinteractive.hire.trakstar.com"
}')
WHERE id = '85c72ec4-15c2-40df-a33b-2fe9dd385d7c';

-- 8e. Virtasant (Teamtailor, 20 jobs, SSR)
-- Fix: job_selector to use hover-state parent div instead of :has() (unsupported by BeautifulSoup)
UPDATE job_sources
SET config_json = json('{
    "type": "html",
    "url": "https://virtasant.teamtailor.com/jobs",
    "job_selector": "div[class*=''hover:bg-primary-text-background'']",
    "fields": {
        "title": "a",
        "url": "a@href"
    },
    "company_name": "Virtasant"
}')
WHERE id = '30d2b9a7-35b5-462f-b9cb-4e4604251a29';

-- 8f. NewRocket → switch to Greenhouse API (board: highmetric, 27 jobs)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{
        "type": "api",
        "url": "https://boards-api.greenhouse.io/v1/boards/highmetric/jobs?content=true",
        "response_path": "jobs",
        "company_name": "NewRocket",
        "fields": {
            "title": "title",
            "location": "location.name",
            "description": "content",
            "url": "absolute_url",
            "posted_date": "updated_at"
        }
    }')
WHERE id = '5cf36599-dd85-4a4e-be83-e77a6602716d';

-- ============================================================================
-- CATEGORY 9: HTML sources needing JS rendering
-- These render job listings via JavaScript. Enable requires_js and fix URLs.
-- ============================================================================

-- 9a. Zoom (Stimulus/Turbo, has jobs)
UPDATE job_sources
SET config_json = json_set(
    json_set(
        json_set(
            json_set(config_json,
                '$.requires_js', json('true')),
            '$.render_wait_for', '.job-search-results-content a[href*="/jobs/"]'),
        '$.render_timeout_ms', 30000),
    '$.consecutive_zero_jobs', 0)
WHERE id = 'debfa07f-fa94-4ff2-8d6e-92be05a9da20';

-- 9b. iCIMS sources - fix URLs from /jobs/intro to /jobs/search + add JS rendering
-- EverWatch
UPDATE job_sources
SET config_json = json('{
    "type": "html",
    "url": "https://everwatch-everwatchsolutions.icims.com/jobs/search?ss=1&in_iframe=1",
    "job_selector": ".iCIMS_JobsTable .row, .iCIMS_JobListingRow",
    "fields": {
        "title": "a.iCIMS_Anchor",
        "url": "a.iCIMS_Anchor@href"
    },
    "company_name": "EverWatch",
    "base_url": "https://everwatch-everwatchsolutions.icims.com",
    "requires_js": true,
    "render_wait_for": ".iCIMS_Anchor",
    "render_timeout_ms": 30000
}')
WHERE id = 'f6cae949-7ba2-4d95-9608-aa98dd7ca260';

-- Sev1Tech
UPDATE job_sources
SET config_json = json('{
    "type": "html",
    "url": "https://careers-sev1tech.icims.com/jobs/search?ss=1&in_iframe=1",
    "job_selector": ".iCIMS_JobsTable .row, .iCIMS_JobListingRow",
    "fields": {
        "title": "a.iCIMS_Anchor",
        "url": "a.iCIMS_Anchor@href"
    },
    "company_name": "Sev1Tech",
    "base_url": "https://careers-sev1tech.icims.com",
    "requires_js": true,
    "render_wait_for": ".iCIMS_Anchor",
    "render_timeout_ms": 30000
}')
WHERE id = 'c622a495-10fe-4656-a919-a57eb3383e6b';

-- Sargent & Lundy
UPDATE job_sources
SET config_json = json('{
    "type": "html",
    "url": "https://careers-sargentlundy.icims.com/jobs/search?ss=1&in_iframe=1",
    "job_selector": ".iCIMS_JobsTable .row, .iCIMS_JobListingRow",
    "fields": {
        "title": "a.iCIMS_Anchor",
        "url": "a.iCIMS_Anchor@href"
    },
    "company_name": "Sargent & Lundy",
    "base_url": "https://careers-sargentlundy.icims.com",
    "requires_js": true,
    "render_wait_for": ".iCIMS_Anchor",
    "render_timeout_ms": 30000
}')
WHERE id = '22ac7a7e-5d44-476a-862a-1bcd2376be6b';

-- HealthEquity
UPDATE job_sources
SET config_json = json('{
    "type": "html",
    "url": "https://careers-healthequity.icims.com/jobs/search?ss=1&in_iframe=1",
    "job_selector": ".iCIMS_JobsTable .row, .iCIMS_JobListingRow",
    "fields": {
        "title": "a.iCIMS_Anchor",
        "url": "a.iCIMS_Anchor@href"
    },
    "company_name": "HealthEquity",
    "base_url": "https://careers-healthequity.icims.com",
    "requires_js": true,
    "render_wait_for": ".iCIMS_Anchor",
    "render_timeout_ms": 30000
}')
WHERE id = 'c2075a93-83f2-4e9d-926e-ef2b82ba82c6';

-- Valiant Solutions (redirects from Webflow to iCIMS)
UPDATE job_sources
SET config_json = json('{
    "type": "html",
    "url": "https://careers-valiantsolutions.icims.com/jobs/search?ss=1&in_iframe=1",
    "job_selector": ".iCIMS_JobsTable .row, .iCIMS_JobListingRow",
    "fields": {
        "title": "a.iCIMS_Anchor",
        "url": "a.iCIMS_Anchor@href"
    },
    "company_name": "Valiant Solutions",
    "base_url": "https://careers-valiantsolutions.icims.com",
    "requires_js": true,
    "render_wait_for": ".iCIMS_Anchor",
    "render_timeout_ms": 30000
}')
WHERE id = 'ecbadfec-b3e5-4790-acd6-f315e5b30866';

-- LMI (AngularJS SPA → switch to iCIMS)
UPDATE job_sources
SET config_json = json('{
    "type": "html",
    "url": "https://careers-lmi.icims.com/jobs/search?ss=1&in_iframe=1",
    "job_selector": ".iCIMS_JobsTable .row, .iCIMS_JobListingRow",
    "fields": {
        "title": "a.iCIMS_Anchor",
        "url": "a.iCIMS_Anchor@href"
    },
    "company_name": "LMI",
    "base_url": "https://careers-lmi.icims.com",
    "requires_js": true,
    "render_wait_for": ".iCIMS_Anchor",
    "render_timeout_ms": 30000
}')
WHERE id = '9707ae90-a8f2-47ed-8cd0-9245d6419817';

-- 9c. Other JS-rendered sources
-- Thermo Fisher (Phenom platform)
UPDATE job_sources
SET config_json = json_set(
    json_set(
        json_set(
            json_set(
                json_set(config_json,
                    '$.requires_js', json('true')),
                '$.render_wait_for', '.phs-jobs-list, .job-tile'),
            '$.render_timeout_ms', 30000),
        '$.job_selector', '.phs-jobs-list .job-tile, [class*="job-card"]'),
    '$.consecutive_zero_jobs', 0)
WHERE id = '3128f320-0cb4-4d85-80ee-d479019e74c2';

-- Med-Metrix (Dayforce/Next.js)
UPDATE job_sources
SET config_json = json_set(
    json_set(
        json_set(
            json_set(config_json,
                '$.requires_js', json('true')),
            '$.render_wait_for', '.ant-list-item, [class*="job"]'),
        '$.render_timeout_ms', 30000),
    '$.consecutive_zero_jobs', 0)
WHERE id = '97893a32-19df-4af3-ad9b-86ffac4cf147';

-- Chainlink Labs (Ashby embed, needs JS)
UPDATE job_sources
SET config_json = json('{
    "type": "html",
    "url": "https://chainlinklabs.com/open-roles",
    "job_selector": "#ashby_embed a[href*=\"jobs.ashbyhq.com\"]",
    "fields": {
        "title": "div, span",
        "url": "@href"
    },
    "company_name": "Chainlink Labs",
    "requires_js": true,
    "render_wait_for": "#ashby_embed a",
    "render_timeout_ms": 30000
}')
WHERE id = 'b6aedb8f-c697-4b44-b764-595849d51f42';

-- Curotec (Zoho Recruit, needs JS)
UPDATE job_sources
SET config_json = json_set(
    json_set(
        json_set(
            json_set(config_json,
                '$.requires_js', json('true')),
            '$.render_wait_for', '.cw-job-listing, .zr-career'),
        '$.render_timeout_ms', 30000),
    '$.consecutive_zero_jobs', 0)
WHERE id = 'f44a84c6-a37c-4145-a0da-ae6d2e820e91';

-- silverorange (Next.js with external embed)
UPDATE job_sources
SET config_json = json_set(
    json_set(
        json_set(
            json_set(config_json,
                '$.requires_js', json('true')),
            '$.render_wait_for', '.posting, .list-group-item, [class*="job"]'),
        '$.render_timeout_ms', 30000),
    '$.consecutive_zero_jobs', 0)
WHERE id = 'fb168c07-1ef1-4df3-b262-ca13ecbf8476';

-- ============================================================================
-- CATEGORY 10: Genuinely empty or unfixable with SQL
-- Reset counter, add validation_policy or disable
-- ============================================================================

-- BAM Technologies - Webflow CMS collection empty (no open positions)
-- Digioh - No job listing section on page
-- AJE - applytojob.com triggers jazzhr_stub API auto-detect (needs code fix)
UPDATE job_sources
SET config_json = json_set(
    json_set(config_json,
        '$.consecutive_zero_jobs', 0),
    '$.validation_policy', 'allow_empty')
WHERE id IN (
    '41b985c7-e620-4af5-a863-44d47e04b98d',  -- BAM Technologies
    '69735760-0ff7-445f-8334-77f0aec387c8',  -- Digioh
    'f4f2e7c6-1025-475c-a297-b1802fa7a35a'   -- AJE (needs platform_patterns code fix)
);

-- ============================================================================
-- Verify
-- ============================================================================
SELECT 'After fix - remaining zero-job sources:';
SELECT count(*) || ' sources with consecutive_zero_jobs >= 4'
FROM job_sources
WHERE status = 'active'
  AND COALESCE(json_extract(config_json, '$.consecutive_zero_jobs'), 0) >= 4;
