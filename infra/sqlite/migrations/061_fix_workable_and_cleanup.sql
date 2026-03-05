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
SET config_json = json_set(
    config_json,
    '$.url',
    'https://apply.workable.com/api/v1/widget/accounts/' || CASE name
        WHEN 'Oracle Jobs (workable.com)' THEN 'oracle'
        WHEN 'Vituity Jobs (workable.com)' THEN 'vituity'
        WHEN 'Tidio Jobs (workable.com)' THEN 'tidio'
        WHEN 'ICF Jobs (workable.com)' THEN 'icf'
        WHEN 'Klick Jobs (workable.com)' THEN 'klick'
        WHEN 'Tietoevry Jobs (workable.com)' THEN 'tietoevry'
        WHEN 'Tkxel Jobs (workable.com)' THEN 'tkxel'
        WHEN 'The Hershey Company Jobs (workable.com)' THEN 'the-hershey-company'
        WHEN 'Sopra Steria Jobs (workable.com)' THEN 'sopra-steria'
        WHEN 'NTT DATA Jobs (workable.com)' THEN 'ntt-data'
        WHEN 'Harris Jobs (workable.com)' THEN 'harris'
        WHEN 'Syndicode Jobs (workable.com)' THEN 'syndicode'
        WHEN 'Aflac Jobs (workable.com)' THEN 'aflac'
        WHEN 'Capgemini Technology Services Jobs (workable.com)' THEN 'capgemini'
        WHEN 'Leidos Jobs (workable.com)' THEN 'leidos'
        WHEN 'HostPapa Jobs (workable.com)' THEN 'hostpapa'
        WHEN 'efood Jobs (workable.com)' THEN 'efood'
        WHEN 'TEKsystems Jobs (workable.com)' THEN 'teksystems'
        WHEN 'Ford Jobs (workable.com)' THEN 'ford'
        WHEN 'Trina Solar Jobs (workable.com)' THEN 'trina-solar'
    END
)
WHERE name IN (
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
) AND status = 'active';

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
WHERE name IN (
    'Presight Solutions AS Jobs (workable.com)',
    'Raw Power Games Jobs (workable.com)',
    'Epoch AI Jobs (workable.com)',
    'AskVinny Jobs (workable.com)'
) AND status = 'active';

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
