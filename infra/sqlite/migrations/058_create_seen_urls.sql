-- Track every URL encountered during scraping, regardless of outcome.
-- URLs that fail pre-filtering or are "board URL without detail" are discarded
-- with no record today, causing them to be re-scraped every cycle.
-- This lightweight table closes that gap so the known-URL set can skip them.

CREATE TABLE IF NOT EXISTS seen_urls (
    url_hash   TEXT PRIMARY KEY,
    source_id  TEXT,
    first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_seen_urls_source ON seen_urls(source_id);
