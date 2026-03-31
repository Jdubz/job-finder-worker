-- Support ghost matches: job applications tracked without a full job listing
-- (e.g., user applied directly on a company site outside the system)

-- Sentinel listing row that all ghost matches reference (satisfies FK constraint)
INSERT OR IGNORE INTO job_listings (id, url, title, company_name, description, status, created_at, updated_at)
VALUES ('__ghost_listing__', '', 'Ghost Listing (system)', 'N/A', 'Sentinel row for ghost matches', 'matched', datetime('now'), datetime('now'));

ALTER TABLE job_matches ADD COLUMN is_ghost INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_matches ADD COLUMN ghost_company TEXT;
ALTER TABLE job_matches ADD COLUMN ghost_title TEXT;
ALTER TABLE job_matches ADD COLUMN ghost_url TEXT;
ALTER TABLE job_matches ADD COLUMN ghost_notes TEXT;
