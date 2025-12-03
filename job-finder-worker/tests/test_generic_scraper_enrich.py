import json
from types import SimpleNamespace

import pytest

from job_finder.scrapers.generic_scraper import GenericScraper
from job_finder.scrapers.source_config import SourceConfig


def _make_resp(html: str):
    return SimpleNamespace(status_code=200, text=html, raise_for_status=lambda: None)


@pytest.fixture(autouse=True)
def stub_requests(monkeypatch):
    calls = {}

    def fake_get(url, headers=None, timeout=None):
        calls.setdefault("urls", []).append(url)
        return _make_resp(fake_get.payloads[url])

    fake_get.payloads = {}
    monkeypatch.setattr("job_finder.scrapers.generic_scraper.requests.get", fake_get)
    return fake_get


def test_enrich_from_detail_uses_jsonld_graph(monkeypatch, stub_requests):
    cfg = SourceConfig.from_dict(
        {
            "type": "html",
            "url": "https://builtin.com/jobs",
            "job_selector": "[data-id=job-card]",
            "fields": {"title": "h2", "url": "a@href"},
            "follow_detail": True,
        }
    )

    jsonld = {
        "@graph": [
            {"@type": "BreadcrumbList"},
            {
                "@type": "JobPosting",
                "title": "Backend Engineer",
                "description": "<p>Great job</p>",
                "hiringOrganization": {"name": "Acme"},
                "jobLocation": {
                    "@type": "Place",
                    "address": {
                        "addressLocality": "NYC",
                        "addressRegion": "NY",
                        "addressCountry": "USA",
                    },
                },
                "datePosted": "2025-12-01",
            },
        ]
    }
    stub_requests.payloads["https://detail"] = (
        '<script type="application/ld+json">' + json.dumps(jsonld) + "</script>"
    )

    scraper = GenericScraper(cfg)

    job = {
        "title": "Backend Engineer",
        "url": "https://detail",
        # leave company/description/location absent to allow enrichment to fill them
    }

    enriched = scraper._enrich_from_detail(job)
    assert enriched["company"] == "Acme"
    assert enriched["description"].startswith("<p>Great job")
    assert enriched["location"] == "NYC, NY, USA"
    assert enriched["posted_date"] == "2025-12-01"


def test_enrich_from_detail_handles_bad_json(monkeypatch, stub_requests):
    cfg = SourceConfig.from_dict(
        {
            "type": "html",
            "url": "https://builtin.com/jobs",
            "job_selector": "[data-id=job-card]",
            "fields": {"title": "h2", "url": "a@href"},
            "follow_detail": True,
        }
    )

    # Malformed JSON-LD should be ignored without raising
    stub_requests.payloads["https://detail"] = '<script type="application/ld+json">{</script>'

    scraper = GenericScraper(cfg)
    job = {"title": "T", "url": "https://detail", "description": ""}
    enriched = scraper._enrich_from_detail(job)
    assert enriched == job


def test_enrich_from_detail_skips_when_no_url():
    cfg = SourceConfig.from_dict(
        {
            "type": "html",
            "url": "https://builtin.com/jobs",
            "job_selector": "[data-id=job-card]",
            "fields": {"title": "h2", "url": "a@href"},
            "follow_detail": True,
        }
    )
    scraper = GenericScraper(cfg)
    job = {"title": "T", "description": ""}
    assert scraper._enrich_from_detail(job) == job
