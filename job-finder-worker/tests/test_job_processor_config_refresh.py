import pytest
from unittest.mock import MagicMock

from job_finder.exceptions import InitializationError
from job_finder.job_queue.processors.job_processor import JobProcessor


class StubLoader:
    def __init__(self):
        self.ai_settings = {
            "worker": {"selected": {"provider": "codex", "interface": "cli", "model": "gpt-5-codex"}},
            "documentGenerator": {
                "selected": {"provider": "codex", "interface": "cli", "model": "gpt-5-codex"}
            },
            "options": [],
        }
        self.match_policy = {"jobMatch": {"userTimezone": -7}, "dealbreakers": {}}
        self.prefilter_policy = {"strikeEngine": {}}

    def get_ai_settings(self):
        return self.ai_settings

    def get_match_policy(self):
        return self.match_policy

    def get_prefilter_policy(self):
        return self.prefilter_policy

    def get_job_match(self):
        return self.match_policy.get("jobMatch", {})


def _make_processor(monkeypatch, loader=None):
    loader = loader or StubLoader()
    monkeypatch.setattr(
        "job_finder.ai.providers.create_provider_from_config",
        lambda cfg, task=None: f"{task}-provider",
    )
    ai_matcher = MagicMock()
    ai_matcher.min_match_score = 0
    ai_matcher.generate_intake = True
    ai_matcher.portland_office_bonus = 0
    ai_matcher.user_timezone = 0
    ai_matcher.prefer_large_companies = True
    ai_matcher.company_weights = {}
    ai_matcher.dealbreakers = {}

    qp = JobProcessor(
        queue_manager=MagicMock(),
        config_loader=loader,
        job_storage=MagicMock(),
        job_listing_storage=MagicMock(),
        companies_manager=MagicMock(),
        sources_manager=MagicMock(),
        company_info_fetcher=MagicMock(),
        ai_matcher=ai_matcher,
    )
    return qp


def test_refresh_uses_latest_match_policy(monkeypatch):
    loader = StubLoader()
    processor = _make_processor(monkeypatch, loader)
    processor._refresh_runtime_config()

    # after construction the user_timezone should reflect the match policy
    assert processor.filter_engine.user_timezone == -7
    assert processor.ai_matcher.user_timezone == -7


def test_refresh_raises_when_config_missing(monkeypatch):
    class BrokenLoader:
        def get_ai_settings(self):
            raise InitializationError("missing ai-settings")

        def get_match_policy(self):
            return {}

        def get_prefilter_policy(self):
            return {}

    monkeypatch.setattr(
        "job_finder.ai.providers.create_provider_from_config",
        lambda cfg, task=None: f"{task}-provider",
    )

    with pytest.raises(InitializationError):
        processor = _make_processor(monkeypatch, BrokenLoader())
        processor._refresh_runtime_config()
