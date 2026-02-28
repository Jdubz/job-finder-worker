-- Fix disabled sources - 2026-02-27
-- Repairs and re-enables sources that were disabled by old timeout bugs or need config fixes.
-- Run against: /srv/job-finder/data/jobfinder.db

-- ============================================================================
-- CATEGORY 1: Re-enable timeout-disabled sources (all verified working)
-- These were disabled by old overall-scrape-timeout code that no longer exists.
-- ============================================================================

-- 1a. Workday API sources (23 sources) - all verified returning jobs
UPDATE job_sources
SET status = 'active',
    config_json = json_remove(config_json, '$.disabled_notes')
WHERE status = 'disabled'
  AND json_extract(config_json, '$.url') LIKE '%myworkdayjobs.com%'
  AND json_extract(config_json, '$.disabled_notes') LIKE '%timed out after%';

-- 1b. SmartRecruiters API sources (4 sources) - all verified returning jobs
UPDATE job_sources
SET status = 'active',
    config_json = json_remove(config_json, '$.disabled_notes')
WHERE id IN (
    '6e04e08e-47c0-4697-8388-611aad9c2578',  -- Docplanner Jobs
    '3975d1c7-9373-46d6-b644-5b53875a3053',  -- Experian Jobs
    'af8e5685-af64-4653-95a0-1bb4105d8ff3',  -- Nagarro Jobs
    '63f9dde9-393a-4034-8a4a-650069cf5829'   -- Visa Jobs
);

-- 1c. Oracle Cloud API sources (2 sources) - both return 200
UPDATE job_sources
SET status = 'active',
    config_json = json_remove(config_json, '$.disabled_notes')
WHERE id IN (
    'f1fbfb33-1f11-41c2-9ffe-c7318aa095b1',  -- ACME Jobs (oraclecloud.com)
    'db886a37-0b07-4448-8fe5-ee262834b6ff'   -- Wood PLC Jobs (oraclecloud.com)
);

-- 1d. Other timeout-disabled sources
UPDATE job_sources
SET status = 'active',
    config_json = json_remove(config_json, '$.disabled_notes')
WHERE id IN (
    'ae7c7804-20cf-4830-b324-24e0042b5dfd',  -- Jobgether Jobs (Lever) - returns empty but retryable
    '4OEPmUgiNuARe5bMBYdZ',                  -- We Work Remotely - Full Stack (RSS, verified 200)
    '0f07bf49-1296-457b-81aa-bd8b9ac46809',  -- Kforce Jobs (Azure Search, verified accessible)
    '90916a4e-9130-4033-a9ac-18693a0fc07e',  -- Cotiviti Jobs (icims.com)
    '8a6c0caa-c3df-47f1-9a60-07e95e59e6a7',  -- Google Jobs (HTML, will be retried)
    '0deac23a-1814-45da-9ccd-7028216fd56e',  -- Insight Global Jobs (HTML)
    '8a70530f-40e9-43d7-82e1-d62f8e5ca062'   -- hireaniner.charlotte.edu Jobs (HTML)
);

-- ============================================================================
-- CATEGORY 2: Fix config and re-enable (switch to correct API)
-- ============================================================================

-- 2a. Attentive: HTML Greenhouse board -> Greenhouse API
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://boards-api.greenhouse.io/v1/boards/attentive/jobs?content=true","response_path":"jobs","company_name":"Attentive","fields":{"title":"title","location":"location.name","description":"content","url":"absolute_url","posted_date":"updated_at"}}')
WHERE id = '3ead81fc-726a-4e69-bb98-28a76943d6db';

-- 2b. Veeva Systems: HTML Lever -> Lever API (1,014 jobs!)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://api.lever.co/v0/postings/veeva?mode=json","response_path":"","company_name":"Veeva Systems","fields":{"title":"text","location":"categories.location","description":"descriptionPlain","url":"hostedUrl","posted_date":"createdAt"}}')
WHERE id = '95e5209a-13d9-4a25-a729-e65831c764bc';

-- 2c. Pulumi: HTML careers page -> Greenhouse API
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://boards-api.greenhouse.io/v1/boards/pulumicorporation/jobs?content=true","response_path":"jobs","company_name":"Pulumi","fields":{"title":"title","location":"location.name","description":"content","url":"absolute_url","posted_date":"updated_at"}}')
WHERE id = '09ed99af-86ba-4f2a-b20d-cac32291eaa8';

-- 2d. PSI CRO: HTML careers page -> SmartRecruiters API (166 jobs!)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://api.smartrecruiters.com/v1/companies/PSICRO/postings?limit=200","response_path":"content","company_name":"PSI CRO","fields":{"title":"name","location":"location.city","url":"ref","posted_date":"releasedDate","description":"jobAd.sections.companyDescription.text"}}')
WHERE id = '68b0d016-13aa-4c26-817a-c84108a50013';

-- 2e. AlphaPoint: Lever (404) -> Workable API
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://apply.workable.com/api/v1/widget/accounts/alphapoint","response_path":"jobs","company_name":"AlphaPoint","fields":{"title":"title","location":"location","url":"url","department":"department"},"validation_policy":"allow_empty"}')
WHERE id = 'e79b5df1-64ef-4513-aefb-4bc74a9978eb';

-- 2f. Toggl: Ashby (404) -> Workable API
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://apply.workable.com/api/v1/widget/accounts/toggl","response_path":"jobs","company_name":"Toggl","fields":{"title":"title","location":"location","url":"url","department":"department"},"validation_policy":"allow_empty"}')
WHERE id = 'ef209939-c0ab-465a-9d18-f99ca151443c';

-- 2g. Civitai: HTML careers page -> Workable API
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://apply.workable.com/api/v1/widget/accounts/civitai","response_path":"jobs","company_name":"Civitai","fields":{"title":"title","location":"location","url":"url","department":"department"},"validation_policy":"allow_empty"}')
WHERE id = 'f498b4e9-4a6c-42bc-b82a-cee028a795a2';

-- 2h. Humana International: HTML -> Manatal API (175 jobs!)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://core.api.manatal.com/open/v3/career-page/humana/jobs/","response_path":"results","company_name":"Humana International Group","fields":{"title":"position_name","location":"location_display","url":"hash","description":"description"}}')
WHERE id = '2593a726-dd81-42c0-b703-fc240635ccb7';

-- 2i. Radix: Fix Recruitee API (redirects to superlinear now)
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"api","url":"https://superlinear.recruitee.com/api/offers","response_path":"offers","company_name":"Radix","fields":{"title":"title","location":"location","url":"careers_url","description":"description","posted_date":"published_at","department":"department"}}')
WHERE id = '0801a170-735c-40bc-92f6-c223ad56677d';

-- 2j. Stord: Fix wrong URL (pointed to akersolutions)
-- Delete this source - it's misconfigured beyond repair (wrong company entirely)
UPDATE job_sources
SET status = 'disabled',
    config_json = json_set(config_json, '$.disabled_notes', 'URL points to wrong company (akersolutions instead of Stord). Needs rediscovery.')
WHERE id = '149274eb-cb59-47d1-9e4d-11b3dd41a31d';

-- 2k. Automattic: Enable JS rendering for SPA
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://automattic.com/jobs/","job_selector":"li.is-active","fields":{"title":"span.title","url":"a@href","location":"span.location"},"requires_js":true,"render_wait_for":"li.is-active","company_name":"Automattic"}')
WHERE id = 'f6a9937d-a943-48e1-b458-da872e608c26';

-- 2l. C TWO: HTML careers page -> BambooHR API
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://ctwo.bamboohr.com/careers/list","response_path":"result","company_name":"C TWO","fields":{"title":"jobOpeningName","location":"location.name","url":"id","department":"departmentLabel"}}')
WHERE id = 'a82c6ace-a123-40ad-9624-d8a9810b86ec';

-- ============================================================================
-- CATEGORY 3: Re-enable failed HTML sources (selectors verified working)
-- ============================================================================

-- 3a. applytojob.com sources (5 sources) - selectors work, server-rendered
UPDATE job_sources
SET status = 'active'
WHERE status = 'failed'
  AND id IN (
    'f4f2e7c6-1025-475c-a297-b1802fa7a35a',  -- American Journal Experts
    'f262e082-9842-480e-b42d-589fefa46e9f',  -- Avolve Software Group
    'd57f9be4-832a-4f2b-b5a2-51197bc3d533',  -- Bitovi
    'a0271f2b-d6e6-4f80-86d5-492b0329c041',  -- Longbow Advantage
    '3e311af8-1e92-4368-8aa5-97e70c90d163'   -- iNTERFACEWARE
  );

-- 3b. Other failed HTML sources with working selectors
UPDATE job_sources
SET status = 'active'
WHERE status = 'failed'
  AND id IN (
    'fc6c559e-5cd0-420d-9bfd-777a4abc8045',  -- Beacon Hill Staffing Group
    '6aff2603-3691-4974-9f6f-f8ee8162458f',  -- CyberCoders
    '02a592f7-a4d4-4b84-a1af-18b19dc62884',  -- Swanky
    'fa63887e-c041-464e-940e-b0d06859275c',  -- Therap (trakstar.com)
    '883801e8-53c0-46e8-8c03-1faaa5e83d2f',  -- allstate-plumbing (jobsoid.com)
    '4f206434-dac9-4e7b-b810-527e084cdd1c',  -- bloXroute Labs
    '6ffb347f-1fdb-411e-9141-ae2fddd8b2f9'   -- SeedTrust (applytojob.com)
  );

-- 3c. NBCUniversal - fix URL to point to actual job search, needs JS
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://www.nbcunicareers.com/find-a-job","job_selector":"div.job-card, div.career-card","fields":{"title":"a","url":"a@href"},"requires_js":true,"render_wait_for":"div.job-card","company_name":"NBCUniversal"}')
WHERE id = 'f95bcc1d-a032-4dc5-9b9a-d4b1e14e5339';

-- 3d. STERIS - fix selector for SuccessFactors table
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://careers.steris.com/search/?q=&sortColumn=referencedate&sortDirection=desc","job_selector":"tr.data-row","fields":{"title":"a.jobTitle-link","url":"a.jobTitle-link@href","location":"span.jobLocation"},"company_name":"STERIS","base_url":"https://careers.steris.com"}')
WHERE id = '4cef5b4e-6d78-4c43-afc7-ca7f1a2193dc';

-- 3e. Cummins - SPA needs JS rendering
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://cummins.jobs/jobs/","job_selector":"a[href*=\"/job/\"]","fields":{"title":"h3, h2, [class*=title]","url":"@href"},"requires_js":true,"render_wait_for":"a[href*=\"/job/\"]","company_name":"Cummins"}')
WHERE id = '09d6de0d-91fe-4a61-90e1-23d3b286df8d';

-- ============================================================================
-- CATEGORY 4: Fix other disabled HTML sources
-- ============================================================================

-- 4a. Digital Resource (ADP) - ADP Workforce Now doesn't have scrapable structure, keep disabled
-- 4b. DreamRider Productions - wrong URL (single job application page), keep disabled

-- 4c. Glama - SSR page, fixable with proper selectors
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://glama.ai/careers","job_selector":"a[href*=\"/careers/\"]","fields":{"title":"::text","url":"@href"},"company_name":"Glama"}')
WHERE id = 'de8c9ee8-94a0-4937-a3e6-bccfcf5a0164';

-- 4d. Pharmavise - no job listings structure, keep disabled
-- 4e. RealPage - iCIMS HTML board
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://careers-realpagepms.icims.com/jobs/search?pr=0&in_iframe=1","job_selector":"div.iCIMS_JobsTable div.row","fields":{"title":"a.iCIMS_Anchor","url":"a.iCIMS_Anchor@href","location":"span.iCIMS_JobHeaderData"},"company_name":"RealPage","base_url":"https://careers-realpagepms.icims.com"}')
WHERE id = '8011d5c0-be50-4637-a96a-f3941c33d166';

-- ============================================================================
-- Verify counts
-- ============================================================================
SELECT 'After fix - source counts by status:';
SELECT count(*) || ' ' || status FROM job_sources GROUP BY status;
