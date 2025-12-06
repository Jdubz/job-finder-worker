from job_finder.ai.source_discovery import SourceDiscovery
from job_finder.scrapers.platform_patterns import match_platform, build_config_from_pattern
from job_finder.scrapers.source_config import SourceConfig


BUILTIN_URL = "https://builtin.com/jobs?search=software"


def test_match_platform_builtin_html():
    pattern, groups = match_platform(BUILTIN_URL)
    assert pattern is not None
    assert pattern.name == "builtin_html"
    assert pattern.config_type == "html"
    assert groups == {}


def test_build_config_includes_follow_detail_and_selector():
    pattern, groups = match_platform(BUILTIN_URL)
    cfg = build_config_from_pattern(pattern, groups)

    assert cfg["type"] == "html"
    assert cfg["url"] == "https://builtin.com/jobs"
    assert cfg["job_selector"] == "[data-id=job-card]"
    assert cfg["fields"]["title"] == "a[data-id=job-card-title]"
    assert cfg["fields"]["url"].endswith("@href")
    assert cfg.get("follow_detail") is True


def test_source_config_accepts_follow_detail():
    pattern, groups = match_platform(BUILTIN_URL)
    cfg_dict = build_config_from_pattern(pattern, groups)
    cfg = SourceConfig.from_dict(cfg_dict)

    cfg.validate()  # should not raise

    assert cfg.follow_detail is True
    assert cfg.job_selector == "[data-id=job-card]"


def test_source_discovery_uses_pattern_without_ai_probe(monkeypatch):
    """Discovery should succeed via pattern without hitting network/AI."""

    # Stub GenericScraper.scrape so _validate_config doesn't perform network I/O.
    calls = {}

    def fake_scrape(self):
        calls["scrape_called"] = True
        # minimal valid job to satisfy validation (title + url)
        return [
            {
                "title": "Software Engineer",
                "url": "https://builtin.com/job/software-engineer/123",
                "description": "test",
            }
        ]

    monkeypatch.setattr(
        "job_finder.ai.source_discovery.GenericScraper.scrape",
        fake_scrape,
        raising=True,
    )

    discovery = SourceDiscovery(agent_manager=None)
    config, meta = discovery.discover(BUILTIN_URL)

    assert config is not None
    assert config.get("type") == "html"
    assert config.get("follow_detail") is True
    assert meta.get("success") is True
    assert calls.get("scrape_called") is True
