-- Migration 060: Add server-side facet filtering to Workday sources
--
-- Workday's CXS API supports appliedFacets in the POST body for server-side
-- category filtering. Without facets, large tenants (Boeing: 1115, GE Vernova:
-- 2233, Concentrix: 1801) return ALL jobs across every department. With
-- follow_detail enabled, each job triggers a sequential HTTP call (1s delay),
-- hanging the worker for 30+ minutes on a single source.
--
-- This migration adds engineering/tech-relevant facet IDs to each source's
-- post_body. The scraper already forwards post_body as-is to the API, so no
-- code changes are needed. Each facet configuration was tested against the
-- live Workday CXS API to confirm the parameter name and category IDs.
--
-- Estimated reduction: ~16,000 total jobs → ~3,800 (75% fewer API calls).
--
-- Sections:
--   1. Sources using jobFamilyGroup facet (most common)
--   2. Red Hat — uses single-letter facet key "d" (Job Function)
--   3. Logicalis — uses jobFamily (not jobFamilyGroup)
--   4. Clear stale seen_urls for all updated sources


-- ============================================================
-- 1. Sources using jobFamilyGroup facet
-- ============================================================

-- Boeing: 1115 → ~275 jobs
-- Categories: Software Eng, IT, Electrical Eng, Systems Eng
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["8b618a30e00f01c7277572e8143f8b25", "8b618a30e00f0117c89a81e8143fad25", "8b618a30e00f0162e6d16be8143f7925", "8b618a30e00f01585ff870e8143f8725"]}}')
)
WHERE name = 'Boeing Jobs (myworkdayjobs.com)';

-- Salesforce: 1313 → ~166 jobs
-- Categories: Software Eng, Enterprise Tech & Infrastructure, Data
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["14fa3452ec7c1011f90d0002a2100000", "14fa3452ec7c1011f90cf8c9c5960000", "14fa3452ec7c1011f90cf661a7c80000"]}}')
)
WHERE name = 'Salesforce Jobs (myworkdayjobs.com)';

-- GE Vernova: 2233 → ~924 jobs
-- Categories: Engineering/Technology, Digital Technology
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["efb947d8be4310015d7e5284718f0000", "efb947d8be4310015d736c3065810000"]}}')
)
WHERE name = 'GE Vernova Jobs (myworkdayjobs.com)';

-- GE HealthCare: 1115 → ~304 jobs
-- Categories: Digital Technology, Engineering/Technology
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["864c17d3c011100151ac102b68ea0000", "864c17d3c011100151aaff090fe60000"]}}')
)
WHERE name = 'GE HealthCare Jobs (myworkdayjobs.com)';

-- RELX: 971 → ~349 jobs
-- Categories: Technology, Data/Research/Analytics
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["8c5fc5940f0b01ba8d012114be0035b9", "8c5fc5940f0b01602e831f13be00aeb8"]}}')
)
WHERE name = 'RELX Jobs (myworkdayjobs.com)';

-- Concentrix: 1801 → ~153 jobs
-- Categories: Application Development, IT
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["0227dc387a0901953338594ceb6523d4", "0227dc387a09016bad567901ec6584db"]}}')
)
WHERE name = 'Concentrix Jobs (myworkdayjobs.com)';

-- GDIT: 948 → ~562 jobs
-- Categories: Core Technology, IT Services and Support
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["ff1bc674c7631001ae780fa5630d0000", "ff1bc674c7631001ae783fb8cff70000"]}}')
)
WHERE name = 'GD Information Technology Jobs (myworkdayjobs.com)';

-- Autodesk: 684 → ~340 jobs
-- Categories: Dev Engineering, AI, Technology, Cybersecurity
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["1f75c4299c9201c0f3b5f8e6fa01c5bf", "cebdb69fb1cc10006a257c84e5560000", "cebdb69fb1cc10005cc6ab3438260000", "cebdb69fb1cc10006aa832992f760000"]}}')
)
WHERE name = 'Autodesk Jobs (myworkdayjobs.com)';

-- WEX: 135 → ~90 jobs
-- Categories: Product Dev/Engineering, IT
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["40f00ebfe434012a8073f9433a076920", "40f00ebfe43401da8361e9433a076720"]}}')
)
WHERE name = 'WEX Jobs (myworkdayjobs.com)';

-- Genesys: 206 → ~63 jobs
-- Categories: Engineering, IT
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["0b40e66ca32e1025ac5265e727b00002", "0b40e66ca32e1025ac5250e97bd80000"]}}')
)
WHERE name = 'Genesys Jobs (myworkdayjobs.com)';

-- CSG: 109 → ~79 jobs
-- Categories: Software Development, IT
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["2679412f35711000b2487cfe18d62549", "2679412f35711000b2486dd5b6f5253b"]}}')
)
WHERE name = 'CSG Jobs (myworkdayjobs.com)';

-- Yahoo: 94 → ~66 jobs
-- Categories: Software Development, Engineering
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["91f14896cbbe0150163e1d3fc7463fb2", "91f14896cbbe0172a9e4f13ec7462fb2"]}}')
)
WHERE name = 'Yahoo Jobs (myworkdayjobs.com)';

-- Ciena: 149 → ~68 jobs
-- Categories: Engineering, IT
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["f08e25a5d78010903df730510aefa016", "f08e25a5d78010903df743451bd7a026"]}}')
)
WHERE name = 'Ciena Jobs (myworkdayjobs.com)';

-- Astreya: 160 → ~69 jobs
-- Categories: Software Dev, Networking, IT Services
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["98cfd9c8c1e5011e764f630baf01ce7d", "e035002b03bc013d665f468723147732", "e035002b03bc01958d70448723146f32"]}}')
)
WHERE name = 'Astreya Jobs (myworkdayjobs.com)';

-- Progressive Leasing: 99 → ~36 jobs
-- Categories: Tech
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["27259d9f1ccb1000cbee4831de610000"]}}')
)
WHERE name = 'Progressive Leasing Jobs (myworkdayjobs.com)';

-- Mondelez: 1573 → ~124 jobs
-- Categories: Science & Engineering, Technology & Digital
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["05fb736b3afb01a7ee6fbbe2af00c71c", "05fb736b3afb015f7485bce2af00cb1c"]}}')
)
WHERE name = 'Mondelez Jobs (myworkdayjobs.com)';

-- Dow: 113 → ~64 jobs
-- Categories: Manufacturing & Engineering, IT
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["a0f6e0da36fe01230d04d0befc09a519", "a0f6e0da36fe0180c06fc7befc09a119"]}}')
)
WHERE name = 'Dow Jobs (myworkdayjobs.com)';

-- Bristol Myers Squibb: 609 → ~52 jobs
-- Categories: IT, Engineering
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["149748d319111024cd21c66e420c40ae", "149748d319111024cd21b32afd1440a2"]}}')
)
WHERE name = 'Bristol Myers Squibb Jobs (myworkdayjobs.com)';

-- Centene: 306 → ~27 jobs
-- Categories: Information Technology
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["e8e87c5e1ec6108fd6496097d2e51122"]}}')
)
WHERE name = 'Centene Jobs (myworkdayjobs.com)';

-- Duck Creek: 33 → ~14 jobs
-- Categories: Technology
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["beaf58f764b11001b1197107e6160000"]}}')
)
WHERE name = 'Duck Creek Jobs (myworkdayjobs.com)';

-- Solenis: 539 → ~25 jobs
-- Categories: Engineering, IT
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["951766abe68d0186b84fed6cad357c35", "951766abe68d01402ea3fe6cad358635"]}}')
)
WHERE name = 'Solenis Jobs (myworkdayjobs.com)';

-- Eos Energy: 35 → ~17 jobs
-- Categories: Engineering
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["ef3970a4f39c100112f3d6debace0000"]}}')
)
WHERE name = 'Eos Energy Jobs (myworkdayjobs.com)';

-- Stord: 67 → ~9 jobs
-- Categories: Research & Development
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["1f8a0088691110446bf274f860880002"]}}')
)
WHERE name = 'Stord Jobs (myworkdayjobs.com)';

-- Cardlytics: 11 → ~3 jobs
-- Categories: Engineering Group
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamilyGroup": ["769f66ea6d291002127920a9716c0000"]}}')
)
WHERE name = 'Cardlytics Jobs (myworkdayjobs.com)';


-- ============================================================
-- 2. Red Hat — uses single-letter facet key "d" (Job Function)
-- ============================================================

-- Red Hat: 395 → ~213 jobs
-- Categories: Engineering, IT
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"d": ["c18026e77576010f6ef6126f4e43ec4a", "c18026e7757601cf6eb0136f4e43f04a"]}}')
)
WHERE name = 'Red Hat Jobs (myworkdayjobs.com)';


-- ============================================================
-- 3. Logicalis — uses jobFamily (not jobFamilyGroup)
-- ============================================================

-- Logicalis: 109 → ~38 jobs
-- Categories: Network Eng, Systems Dev, IT Security
UPDATE job_sources
SET config_json = json_set(
  config_json,
  '$.post_body', json('{"limit": 20, "offset": 0, "appliedFacets": {"jobFamily": ["9c8acc7b99a901c70e6b39f54f01a807", "9c8acc7b99a90132f69921f54f019c07", "9c8acc7b99a901da301d1cf64f01e407"]}}')
)
WHERE name = 'Logicalis Jobs (myworkdayjobs.com)';


-- ============================================================
-- 4. Clear stale seen_urls for all updated sources
--
-- The filtered result sets will differ from what was previously
-- cached. Clearing seen_urls ensures the next scrape processes
-- the new (smaller) result set cleanly without skipping jobs
-- that appear at different positions in filtered results.
-- ============================================================

DELETE FROM seen_urls WHERE source_id IN (
  SELECT id FROM job_sources WHERE name IN (
    'Boeing Jobs (myworkdayjobs.com)',
    'Salesforce Jobs (myworkdayjobs.com)',
    'GE Vernova Jobs (myworkdayjobs.com)',
    'GE HealthCare Jobs (myworkdayjobs.com)',
    'RELX Jobs (myworkdayjobs.com)',
    'Concentrix Jobs (myworkdayjobs.com)',
    'GD Information Technology Jobs (myworkdayjobs.com)',
    'Autodesk Jobs (myworkdayjobs.com)',
    'WEX Jobs (myworkdayjobs.com)',
    'Genesys Jobs (myworkdayjobs.com)',
    'CSG Jobs (myworkdayjobs.com)',
    'Yahoo Jobs (myworkdayjobs.com)',
    'Ciena Jobs (myworkdayjobs.com)',
    'Astreya Jobs (myworkdayjobs.com)',
    'Progressive Leasing Jobs (myworkdayjobs.com)',
    'Mondelez Jobs (myworkdayjobs.com)',
    'Dow Jobs (myworkdayjobs.com)',
    'Bristol Myers Squibb Jobs (myworkdayjobs.com)',
    'Centene Jobs (myworkdayjobs.com)',
    'Duck Creek Jobs (myworkdayjobs.com)',
    'Solenis Jobs (myworkdayjobs.com)',
    'Eos Energy Jobs (myworkdayjobs.com)',
    'Stord Jobs (myworkdayjobs.com)',
    'Cardlytics Jobs (myworkdayjobs.com)',
    'Red Hat Jobs (myworkdayjobs.com)',
    'Logicalis Jobs (myworkdayjobs.com)'
  )
);
