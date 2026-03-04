-- Migration 061: Fix Workable sources with generic /careers slug, disable dead sources,
-- delete duplicate hims source, and disable misconfigured Microsoft Recruitee source.
--
-- Context: 24 Workable sources were discovered with apply.workable.com/careers as their
-- career page, causing the ATS prober to capture "careers" as the company slug. All 24
-- hit the same generic endpoint returning ~7 jobs instead of company-specific listings.

-- ============================================================
-- 1. Fix 20 Workable sources: replace generic /careers with correct company slug
--    All slugs verified via Workable API (HTTP 200).
-- ============================================================

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/oracle')
WHERE name = 'Oracle Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/vituity')
WHERE name = 'Vituity Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/tidio')
WHERE name = 'Tidio Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/icf')
WHERE name = 'ICF Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/klick')
WHERE name = 'Klick Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/tietoevry')
WHERE name = 'Tietoevry Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/tkxel')
WHERE name = 'Tkxel Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/the-hershey-company')
WHERE name = 'The Hershey Company Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/sopra-steria')
WHERE name = 'Sopra Steria Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/ntt-data')
WHERE name = 'NTT DATA Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/harris')
WHERE name = 'Harris Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/syndicode')
WHERE name = 'Syndicode Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/aflac')
WHERE name = 'Aflac Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/capgemini')
WHERE name = 'Capgemini Technology Services Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/leidos')
WHERE name = 'Leidos Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/hostpapa')
WHERE name = 'HostPapa Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/efood')
WHERE name = 'efood Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/teksystems')
WHERE name = 'TEKsystems Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/ford')
WHERE name = 'Ford Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET config_json = json_set(config_json, '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/trina-solar')
WHERE name = 'Trina Solar Jobs (workable.com)' AND status = 'active';

-- ============================================================
-- 2. Clear seen_urls for all fixed sources so they re-scrape fresh
-- ============================================================

DELETE FROM seen_urls WHERE source_id IN (
    SELECT id FROM job_sources WHERE name IN (
        'Oracle Jobs (workable.com)',
        'Vituity Jobs (workable.com)',
        'Tidio Jobs (workable.com)',
        'ICF Jobs (workable.com)',
        'Klick Jobs (workable.com)',
        'Tietoevry Jobs (workable.com)',
        'Tkxel Jobs (workable.com)',
        'The Hershey Company Jobs (workable.com)',
        'Sopra Steria Jobs (workable.com)',
        'NTT DATA Jobs (workable.com)',
        'Harris Jobs (workable.com)',
        'Syndicode Jobs (workable.com)',
        'Aflac Jobs (workable.com)',
        'Capgemini Technology Services Jobs (workable.com)',
        'Leidos Jobs (workable.com)',
        'HostPapa Jobs (workable.com)',
        'efood Jobs (workable.com)',
        'TEKsystems Jobs (workable.com)',
        'Ford Jobs (workable.com)',
        'Trina Solar Jobs (workable.com)'
    )
);

-- ============================================================
-- 3. Disable 4 dead Workable sources (no valid Workable page exists)
-- ============================================================

UPDATE job_sources
SET status = 'disabled',
    config_json = json_set(config_json, '$.disabled_tags', json('["no_workable_page"]'))
WHERE name = 'Presight Solutions AS Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET status = 'disabled',
    config_json = json_set(config_json, '$.disabled_tags', json('["no_workable_page"]'))
WHERE name = 'Raw Power Games Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET status = 'disabled',
    config_json = json_set(config_json, '$.disabled_tags', json('["no_workable_page"]'))
WHERE name = 'Epoch AI Jobs (workable.com)' AND status = 'active';

UPDATE job_sources
SET status = 'disabled',
    config_json = json_set(config_json, '$.disabled_tags', json('["no_workable_page"]'))
WHERE name = 'AskVinny Jobs (workable.com)' AND status = 'active';

-- ============================================================
-- 4. Delete duplicate hims source (same Ashby API URL as "Hims & Hers")
-- ============================================================

DELETE FROM seen_urls WHERE source_id IN (
    SELECT id FROM job_sources WHERE name = 'hims Jobs (ashbyhq.com)'
);
DELETE FROM job_sources WHERE name = 'hims Jobs (ashbyhq.com)';

-- ============================================================
-- 5. Disable misconfigured Microsoft Recruitee source
--    (Microsoft does not use Recruitee)
-- ============================================================

UPDATE job_sources
SET status = 'disabled',
    config_json = json_set(config_json, '$.disabled_tags', json('["misconfigured"]'))
WHERE name = 'Microsoft Jobs (recruitee.com)' AND status = 'active';

-- Note: schema_migrations entry is inserted automatically by the migration runner.
