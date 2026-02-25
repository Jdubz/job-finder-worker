-- Scrape reports: persistent observability for each scrape run.
-- Captures per-source breakdown of what was found, filtered, and queued.
CREATE TABLE IF NOT EXISTS scrape_reports (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',  -- running | completed | failed
    sources_scraped INTEGER NOT NULL DEFAULT 0,
    total_jobs_found INTEGER NOT NULL DEFAULT 0,
    total_jobs_submitted INTEGER NOT NULL DEFAULT 0,
    total_duplicates INTEGER NOT NULL DEFAULT 0,
    total_prefiltered INTEGER NOT NULL DEFAULT 0,
    source_details TEXT,       -- JSON array of per-source stats
    filter_breakdown TEXT,     -- JSON aggregate of filter reason counts
    errors TEXT,               -- JSON array of error strings
    trigger TEXT               -- how the scrape was initiated (scheduled, manual, api)
);

CREATE INDEX IF NOT EXISTS idx_scrape_reports_started_at
    ON scrape_reports(started_at);
