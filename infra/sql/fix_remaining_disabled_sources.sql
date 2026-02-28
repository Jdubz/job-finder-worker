-- Fix remaining 14 disabled sources (excluding 3 anti-bot)
-- Run against: /srv/job-finder/data/jobfinder.db

-- ============================================================================
-- Sources with discovered API endpoints
-- ============================================================================

-- 1. ClearBridge Technology Group -> WordPress REST API (43 jobs)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://clearbridgetech.com/wp-json/wp/v2/job?per_page=100","response_path":"","company_name":"ClearBridge Technology Group","fields":{"title":"title.rendered","url":"link","description":"content.rendered","posted_date":"date"}}')
WHERE id = 'a2e57fe9-d8af-42d7-90ff-d03678eb214c';

-- 2. MissionWired -> Lever API (28 jobs)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://api.lever.co/v0/postings/MissionWired?mode=json","response_path":"","company_name":"MissionWired","fields":{"title":"text","location":"categories.location","description":"descriptionPlain","url":"hostedUrl","posted_date":"createdAt"}}')
WHERE id = '9add082c-6291-4d29-a94a-2bb9c7d432a4';

-- 3. Stord -> Workday API (67 jobs) - was pointing to wrong company (akersolutions)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://stord.wd503.myworkdayjobs.com/wday/cxs/stord/Stord_External_Career/jobs","method":"POST","post_body":{"limit":20,"offset":0},"response_path":"jobPostings","company_name":"Stord","fields":{"title":"title","location":"locationsText","url":"externalPath","posted_date":"postedOn"},"base_url":"https://stord.wd503.myworkdayjobs.com/Stord_External_Career","follow_detail":true}')
WHERE id = '149274eb-cb59-47d1-9e4d-11b3dd41a31d';

-- 4. evoila GmbH -> WordPress REST API (12 jobs)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://evoila.com/wp-json/wp/v2/job?per_page=100","response_path":"","company_name":"evoila GmbH","fields":{"title":"title.rendered","url":"link","description":"content.rendered","posted_date":"date"}}')
WHERE id = '4f7d411a-8a85-425e-8239-10e2c411c0dc';

-- 5. Pharmavise Corporation -> Zoho Recruit API (59 jobs)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://pharmavise.zohorecruit.com/recruit/v2/public/Job_Openings?pagename=Careers","response_path":"data","company_name":"Pharmavise Corporation","fields":{"title":"Posting_Title","url":"$url","location":"City","posted_date":"Publish","job_type":"Job_Type"}}')
WHERE id = 'b61a56d3-4ea1-4c78-85b3-3d8f118b819e';

-- 6. Digital Resource -> ADP Workforce Now API (1 job)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions?cid=11803d10-313d-49cd-a2bb-26522c9bc2d6&ccId=19000101_000001&type=MP&lang=en_US","response_path":"jobRequisitions","company_name":"Digital Resource","fields":{"title":"requisitionTitle","url":"itemID","location":"requisitionLocations.0.address.cityName","posted_date":"postDate","job_type":"workLevelCode.shortName"}}')
WHERE id = 'f306a62a-b9e9-4ef4-95c8-08ecd290a3f2';

-- 7. MORI Associates -> JazzHR/applytojob (4 jobs, SSR HTML)
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://moriassociates.applytojob.com/apply","job_selector":"li.list-group-item","fields":{"title":"a, .job-title, h3","url":"a@href"},"company_name":"MORI Associates","base_url":"https://moriassociates.applytojob.com"}')
WHERE id = 'f3f41ac4-089a-47f4-8a3e-72ac16fb7a5a';

-- 8. Radity -> Manatal careers-page.com (6 jobs, SSR HTML)
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://radity.careers-page.com/","job_selector":"article.job-card","fields":{"title":".jobs-title","url":"a@href"},"company_name":"Radity","base_url":"https://radity.careers-page.com"}')
WHERE id = '84f87fb3-b9f1-4616-b94d-284ea882f78b';

-- 9. DreamRider Productions -> Humi/applytojobs (1 job, SSR HTML)
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://dreamriderproductions.applytojobs.ca/","job_selector":"div.job-posting","fields":{"title":"a","url":"a@href"},"company_name":"DreamRider Productions","base_url":"https://dreamriderproductions.applytojobs.ca"}')
WHERE id = '7cfd7788-c8d5-4929-a0ba-a0e5357caad4';

-- 10. Hypergiant Industries -> Rippling (9 jobs, embedded JSON in __NEXT_DATA__)
UPDATE job_sources
SET status = 'active',
    source_type = 'html',
    config_json = json('{"type":"html","url":"https://ats.rippling.com/accelinthypergiant/jobs","embedded_json_selector":"script#__NEXT_DATA__","response_path":"props.pageProps.dehydratedState.queries.0.state.data.items","fields":{"title":"name","url":"url","department":"department.name"},"company_name":"Hypergiant Industries"}')
WHERE id = 'c1759573-bf45-40d8-8276-1f7562df2794';

-- 11. RxCloud -> Zoho Recruit API (0 jobs currently but valid endpoint)
UPDATE job_sources
SET status = 'active',
    source_type = 'api',
    config_json = json('{"type":"api","url":"https://therxcloud.zohorecruit.com/recruit/v2/public/Job_Openings?pagename=Careers","response_path":"data","company_name":"RxCloud","fields":{"title":"Posting_Title","url":"$url","location":"City","posted_date":"Publish","job_type":"Job_Type"},"validation_policy":"allow_empty"}')
WHERE id = 'ae4b2efb-720e-4d3b-a7a9-81253f460423';

-- ============================================================================
-- SPA sources that need JS rendering
-- ============================================================================

-- 12. Greater Goods -> Angular SPA, needs JS rendering
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://greatergoods.com/careers","job_selector":"a[href*=\"career\"], a[href*=\"job\"], a[href*=\"position\"], div.career-item, div.job-item","fields":{"title":"::text","url":"@href"},"requires_js":true,"render_wait_for":"app-root","render_timeout_ms":30000,"company_name":"Greater Goods"}')
WHERE id = '90d8948b-d416-40d7-92a4-d7a4c64f847f';

-- 13. Rapinno Tech -> Angular SPA, needs JS rendering
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://rapinnotech.com/career","job_selector":"a[href*=\"career\"], a[href*=\"job\"], a[href*=\"position\"], div.career-item, div.job-item","fields":{"title":"::text","url":"@href"},"requires_js":true,"render_wait_for":"app-root","render_timeout_ms":30000,"company_name":"Rapinno Tech"}')
WHERE id = '0a1a0c4e-5452-4715-a4df-ea37a52f735a';

-- 14. Happy Lemon Games -> join.com is a Next.js SPA, needs JS rendering
UPDATE job_sources
SET status = 'active',
    config_json = json('{"type":"html","url":"https://join.com/companies/colacycom","job_selector":"a[href*=\"/jobs/\"], div[class*=\"job\"], div[class*=\"position\"]","fields":{"title":"::text","url":"@href"},"requires_js":true,"render_wait_for":"main","render_timeout_ms":30000,"company_name":"Happy Lemon Games","base_url":"https://join.com"}')
WHERE id = '9cddf00e-45be-4df1-a895-ef16486b558f';

-- ============================================================================
-- Verify
-- ============================================================================
SELECT 'After fix - source counts by status:';
SELECT count(*) || ' ' || status FROM job_sources GROUP BY status;
