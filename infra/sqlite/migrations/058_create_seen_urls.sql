-- Track every URL encountered during scraping, regardless of outcome.
-- URLs that fail pre-filtering or are "board URL without detail" are discarded
-- with no record today, causing them to be re-scraped every cycle.
-- This lightweight table closes that gap so the known-URL set can skip them.
-- Composite PK allows the same URL to be tracked independently per source.

CREATE TABLE IF NOT EXISTS seen_urls (
    url_hash      TEXT NOT NULL,
    source_id     TEXT NOT NULL,
    first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (source_id, url_hash)
);
