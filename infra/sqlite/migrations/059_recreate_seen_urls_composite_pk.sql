-- Recreate seen_urls with composite PK (source_id, url_hash) so the same URL
-- can be tracked independently per source.  The original 058 migration used
-- url_hash alone as PK, which meant a URL first seen by source A would never
-- appear for source B's get_seen_urls_for_source() query.
--
-- seen_urls is a performance cache — dropping it is safe; URLs will simply be
-- re-checked once and re-recorded.

DROP TABLE IF EXISTS seen_urls;

CREATE TABLE seen_urls (
    url_hash      TEXT NOT NULL,
    source_id     TEXT NOT NULL,
    first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (source_id, url_hash)
);
