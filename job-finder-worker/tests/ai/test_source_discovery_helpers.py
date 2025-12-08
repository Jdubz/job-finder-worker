from types import SimpleNamespace

import pytest

from job_finder.ai.source_discovery import SourceDiscovery


@pytest.fixture
def discovery():
    return SourceDiscovery(agent_manager=None)


def test_requires_headless_matches_suffix(discovery):
    assert discovery._requires_headless("https://careers.stickermule.com/jobs") is True


def test_requires_headless_handles_invalid_url(discovery):
    assert discovery._requires_headless("not a url") is False


def test_probe_lever_from_posting_builds_config(monkeypatch, discovery):
    captured = {}

    def fake_get(url, headers=None, timeout=None):
        captured["url"] = url
        return SimpleNamespace(status_code=200, json=lambda: [{"id": "123"}])

    monkeypatch.setattr("job_finder.ai.source_discovery.requests.get", fake_get)

    config = discovery._probe_lever_from_posting("https://jobs.lever.co/paymentology/abcd-1234")

    assert captured["url"].startswith("https://api.lever.co/v0/postings/paymentology")
    assert config is not None
    assert config.get("type") == "api"
    assert "paymentology" in config.get("url", "")


def test_probe_lever_from_posting_non_posting_url(discovery):
    assert discovery._probe_lever_from_posting("https://jobs.lever.co/") is None
