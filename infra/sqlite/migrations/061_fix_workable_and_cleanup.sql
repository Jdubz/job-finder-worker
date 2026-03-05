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
    'https://apply.workable.com/api/v1/widget/accounts/' || (
        SELECT slug FROM (
            VALUES
                ('Oracle Jobs (workable.com)', 'oracle'),
                ('Vituity Jobs (workable.com)', 'vituity'),
                ('Tidio Jobs (workable.com)', 'tidio'),
                ('ICF Jobs (workable.com)', 'icf'),
                ('Klick Jobs (workable.com)', 'klick'),
                ('Tietoevry Jobs (workable.com)', 'tietoevry'),
                ('Tkxel Jobs (workable.com)', 'tkxel'),
                ('The Hershey Company Jobs (workable.com)', 'the-hershey-company'),
                ('Sopra Steria Jobs (workable.com)', 'sopra-steria'),
                ('NTT DATA Jobs (workable.com)', 'ntt-data'),
                ('Harris Jobs (workable.com)', 'harris'),
                ('Syndicode Jobs (workable.com)', 'syndicode'),
                ('Aflac Jobs (workable.com)', 'aflac'),
                ('Capgemini Technology Services Jobs (workable.com)', 'capgemini'),
                ('Leidos Jobs (workable.com)', 'leidos'),
                ('HostPapa Jobs (workable.com)', 'hostpapa'),
                ('efood Jobs (workable.com)', 'efood'),
                ('TEKsystems Jobs (workable.com)', 'teksystems'),
                ('Ford Jobs (workable.com)', 'ford'),
                ('Trina Solar Jobs (workable.com)', 'trina-solar')
        ) AS mapping(source_name, slug)
        WHERE mapping.source_name = job_sources.name
    )
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
