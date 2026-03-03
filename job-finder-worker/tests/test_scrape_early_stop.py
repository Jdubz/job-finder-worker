"""Tests for pagination early-stop and enrichment skip for known URLs."""

from unittest.mock import MagicMock

from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig
from job_finder.storage.seen_urls_storage import SeenUrlsStorage


def _make_config(**overrides) -> SourceConfig:
    """Create a minimal SourceConfig for testing pagination."""
    defaults = {
        "url": "https://api.example.com/jobs",
        "type": "api",
        "fields": {"title": "title", "url": "url"},
        "response_path": "jobs",
        "pagination_type": "page_num",
        "page_size": 3,
        "max_pages": 10,
    }
    defaults.update(overrides)
    return SourceConfig.from_dict(defaults)


def _make_scraper(config: SourceConfig) -> GenericScraper:
    return GenericScraper(config, request_timeout=10)


class TestPaginationEarlyStop:
    def test_stops_when_most_urls_known(self):
        """Pagination should stop when ≥80% of page URLs are known."""
        config = _make_config()
        scraper = _make_scraper(config)

        # Simulate 3 pages: page 0 = all new, page 1 = all known → stop
        page_items = [
            # Page 0: fresh items
            [
                {"title": "New Job 1", "url": "https://example.com/new/1"},
                {"title": "New Job 2", "url": "https://example.com/new/2"},
                {"title": "New Job 3", "url": "https://example.com/new/3"},
            ],
            # Page 1: all known → should trigger early stop
            [
                {"title": "Old Job 1", "url": "https://example.com/old/1"},
                {"title": "Old Job 2", "url": "https://example.com/old/2"},
                {"title": "Old Job 3", "url": "https://example.com/old/3"},
            ],
            # Page 2: should never be reached
            [
                {"title": "More 1", "url": "https://example.com/more/1"},
            ],
        ]

        call_count = [0]

        def mock_fetch_single_page(url, cursor):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(page_items):
                return page_items[idx], {"jobs": page_items[idx]}
            return [], None

        scraper._fetch_single_page = mock_fetch_single_page

        known_urls = {
            "https://example.com/old/1",
            "https://example.com/old/2",
            "https://example.com/old/3",
        }

        results = scraper._fetch_paginated(known_urls=known_urls)

        # Should have fetched pages 0 and 1 (6 items), stopped before page 2
        assert len(results) == 6
        assert call_count[0] == 2

    def test_continues_when_urls_mostly_new(self):
        """Pagination should continue when most URLs on a page are new."""
        config = _make_config()
        scraper = _make_scraper(config)

        page_items = [
            # Page 0
            [
                {"title": "Job 1", "url": "https://example.com/a"},
                {"title": "Job 2", "url": "https://example.com/b"},
                {"title": "Job 3", "url": "https://example.com/c"},
            ],
            # Page 1: 1/3 known (33%) → keep going
            [
                {"title": "Job 4", "url": "https://example.com/d"},
                {"title": "Job 5", "url": "https://example.com/known1"},
                {"title": "Job 6", "url": "https://example.com/e"},
            ],
            # Page 2: fewer than page_size → natural stop
            [
                {"title": "Job 7", "url": "https://example.com/f"},
            ],
        ]

        call_count = [0]

        def mock_fetch_single_page(url, cursor):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(page_items):
                return page_items[idx], {"jobs": page_items[idx]}
            return [], None

        scraper._fetch_single_page = mock_fetch_single_page

        known_urls = {"https://example.com/known1"}

        results = scraper._fetch_paginated(known_urls=known_urls)

        # Should fetch all 3 pages (page 2 has <page_size items → natural stop)
        assert call_count[0] == 3
        assert len(results) == 7

    def test_no_early_stop_without_known_urls(self):
        """Without known_urls, pagination proceeds normally."""
        config = _make_config(max_pages=2)
        scraper = _make_scraper(config)

        page_items = [
            [
                {"title": "J1", "url": "https://example.com/1"},
                {"title": "J2", "url": "https://example.com/2"},
                {"title": "J3", "url": "https://example.com/3"},
            ],
            [
                {"title": "J4", "url": "https://example.com/4"},
                {"title": "J5", "url": "https://example.com/5"},
                {"title": "J6", "url": "https://example.com/6"},
            ],
        ]
        call_count = [0]

        def mock_fetch_single_page(url, cursor):
            idx = call_count[0]
            call_count[0] += 1
            return (page_items[idx], None) if idx < len(page_items) else ([], None)

        scraper._fetch_single_page = mock_fetch_single_page
        results = scraper._fetch_paginated(known_urls=None)

        assert call_count[0] == 2
        assert len(results) == 6

    def test_early_stop_skips_page_zero(self):
        """Early-stop should not trigger on page 0 (always fetch first page)."""
        config = _make_config()
        scraper = _make_scraper(config)

        # Page 0 is ALL known URLs, but we should still fetch page 1
        page_items = [
            [
                {"title": "Old 1", "url": "https://example.com/old/1"},
                {"title": "Old 2", "url": "https://example.com/old/2"},
                {"title": "Old 3", "url": "https://example.com/old/3"},
            ],
            # Page 1: also all known → now trigger early stop
            [
                {"title": "Old 4", "url": "https://example.com/old/4"},
                {"title": "Old 5", "url": "https://example.com/old/5"},
                {"title": "Old 6", "url": "https://example.com/old/6"},
            ],
        ]

        call_count = [0]

        def mock_fetch_single_page(url, cursor):
            idx = call_count[0]
            call_count[0] += 1
            return (page_items[idx], None) if idx < len(page_items) else ([], None)

        scraper._fetch_single_page = mock_fetch_single_page

        known_urls = {
            "https://example.com/old/1",
            "https://example.com/old/2",
            "https://example.com/old/3",
            "https://example.com/old/4",
            "https://example.com/old/5",
            "https://example.com/old/6",
        }

        results = scraper._fetch_paginated(known_urls=known_urls)

        # Fetched page 0 (no early-stop check) and page 1 (triggers early-stop)
        assert call_count[0] == 2
        assert len(results) == 6

    def test_early_stop_via_seen_hashes(self):
        """Early-stop should also trigger when URLs match seen_hashes."""
        config = _make_config()
        scraper = _make_scraper(config)

        page_items = [
            [
                {"title": "New 1", "url": "https://example.com/new/1"},
                {"title": "New 2", "url": "https://example.com/new/2"},
                {"title": "New 3", "url": "https://example.com/new/3"},
            ],
            # Page 1: all URLs in seen_hashes → should trigger early stop
            [
                {"title": "Seen 1", "url": "https://example.com/seen/1"},
                {"title": "Seen 2", "url": "https://example.com/seen/2"},
                {"title": "Seen 3", "url": "https://example.com/seen/3"},
            ],
            [
                {"title": "More 1", "url": "https://example.com/more/1"},
            ],
        ]

        call_count = [0]

        def mock_fetch_single_page(url, cursor):
            idx = call_count[0]
            call_count[0] += 1
            if idx < len(page_items):
                return page_items[idx], {"jobs": page_items[idx]}
            return [], None

        scraper._fetch_single_page = mock_fetch_single_page

        # Build seen_hashes from the URLs on page 1
        seen_hashes = {
            SeenUrlsStorage.hash_url("https://example.com/seen/1"),
            SeenUrlsStorage.hash_url("https://example.com/seen/2"),
            SeenUrlsStorage.hash_url("https://example.com/seen/3"),
        }

        # No known_urls, only seen_hashes
        results = scraper._fetch_paginated(known_urls=None, seen_hashes=seen_hashes)

        assert len(results) == 6
        assert call_count[0] == 2


class TestEnrichmentSkip:
    """Detail enrichment should be skipped for known URLs."""

    def test_skips_enrichment_for_known_urls(self):
        """scrape() should not call _enrich_from_detail for URLs in known_urls."""
        config = _make_config(
            pagination_type=None,
            follow_detail=True,
        )
        scraper = _make_scraper(config)

        # Mock _fetch_json to return items
        items = [
            {"title": "Known Job", "url": "https://example.com/known/1"},
            {"title": "New Job", "url": "https://example.com/new/1"},
        ]
        scraper._fetch_json = MagicMock(return_value=items)

        enrich_calls = []

        def tracking_enrich(job):
            enrich_calls.append(job["url"])
            return job

        scraper._enrich_from_detail = tracking_enrich

        known_urls = {"https://example.com/known/1"}
        jobs = scraper.scrape(known_urls=known_urls)

        # Both jobs should be in results (they have title + url)
        assert len(jobs) == 2
        # Only the new URL should have been enriched
        assert len(enrich_calls) == 1
        assert enrich_calls[0] == "https://example.com/new/1"

    def test_skips_enrichment_for_seen_hashes(self):
        """scrape() should not call _enrich_from_detail for URLs matching seen_hashes."""
        config = _make_config(
            pagination_type=None,
            follow_detail=True,
        )
        scraper = _make_scraper(config)

        items = [
            {"title": "Seen Job", "url": "https://example.com/seen/1"},
            {"title": "Fresh Job", "url": "https://example.com/fresh/1"},
        ]
        scraper._fetch_json = MagicMock(return_value=items)

        enrich_calls = []

        def tracking_enrich(job):
            enrich_calls.append(job["url"])
            return job

        scraper._enrich_from_detail = tracking_enrich

        seen_hashes = {SeenUrlsStorage.hash_url("https://example.com/seen/1")}
        jobs = scraper.scrape(seen_hashes=seen_hashes)

        assert len(jobs) == 2
        assert len(enrich_calls) == 1
        assert enrich_calls[0] == "https://example.com/fresh/1"

    def test_enrichment_cap_limits_detail_fetches(self):
        """scrape() should stop enriching after _MAX_DETAIL_ENRICHMENTS."""
        config = _make_config(
            pagination_type=None,
            follow_detail=True,
        )
        scraper = _make_scraper(config)
        # Set a low cap for testing
        scraper._MAX_DETAIL_ENRICHMENTS = 2

        items = [{"title": f"Job {i}", "url": f"https://example.com/job/{i}"} for i in range(5)]
        scraper._fetch_json = MagicMock(return_value=items)

        enrich_calls = []

        def tracking_enrich(job):
            enrich_calls.append(job["url"])
            return job

        scraper._enrich_from_detail = tracking_enrich

        jobs = scraper.scrape()

        # Only 2 enriched; 3 cap-skipped jobs excluded from results
        # so they aren't recorded in seen_urls and can be retried
        assert len(jobs) == 2
        assert len(enrich_calls) == 2
