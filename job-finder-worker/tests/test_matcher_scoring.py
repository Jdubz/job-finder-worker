import pytest

from job_finder.ai.matcher import AIJobMatcher, ScoreBreakdown
from job_finder.ai.providers import CodexCLIProvider
from job_finder.profile.schema import Profile


def make_matcher(extra_config=None, monkeypatch=None):
    profile = Profile(
        name="Test",
        email="t@test.com",
        location="portland",
        years_of_experience=5,
    )
    cfg = extra_config or {}
    matcher = AIJobMatcher(
        provider=CodexCLIProvider(model="gpt-4o"),
        profile=profile,
        min_match_score=0,
        generate_intake=False,  # avoid hitting provider twice in tests
        config=cfg,
        company_weights={},
        dealbreakers={
            "maxTimezoneDiffHours": 8,
            "perHourTimezonePenalty": 5,
            "hardTimezonePenalty": 60,
            "requireRemote": False,
            "allowHybridInTimezone": True,
            "relocationAllowed": False,
            "locationPenaltyPoints": 60,
            "relocationPenaltyPoints": 80,
            "ambiguousLocationPenaltyPoints": 40,
        },
    )
    if monkeypatch:
        # Never call real providers during tests; stub match analysis once.
        monkeypatch.setattr(
            matcher,
            "_analyze_match",
            lambda job: {
                "match_score": 50,
                "matched_skills": [],
                "missing_skills": [],
                "application_priority": "Medium",
                "experience_match": "",
                "key_strengths": [],
                "match_reasons": [],
                "potential_concerns": [],
            },
        )

        # Simplify scoring to isolate strike effects (avoid freshness/role bonuses).
        def fake_calc(match_analysis, has_portland_office, job):
            base = match_analysis.get("match_score", 0)
            tech_delta, tech_reason = matcher._apply_technology_ranks(job)
            exp_delta, exp_reason = matcher._apply_experience_strike(job)
            final = base + tech_delta + exp_delta
            adjustments = []
            if tech_delta:
                adjustments.append(tech_reason)
            if exp_delta:
                adjustments.append(exp_reason)
            breakdown = ScoreBreakdown(base_score=base, final_score=final, adjustments=adjustments)
            return final, breakdown

        monkeypatch.setattr(matcher, "_calculate_adjusted_score", fake_calc)
    return matcher


def test_tech_strike_applied(monkeypatch):
    matcher = make_matcher(
        {
            "technologyRanks": {
                "technologies": {
                    "java": {"rank": "strike", "points": 5},
                }
            }
        },
        monkeypatch=monkeypatch,
    )
    job = {"title": "Java Engineer", "description": "We use Java", "location": "remote", "company": "Acme"}
    result = matcher.analyze_job(job, return_below_threshold=True)
    assert result is not None
    assert result.match_score == 45  # base 50 minus strike
    assert result.match_score < result.score_breakdown.base_score  # strike applied


def test_experience_gap_penalty(monkeypatch):
    matcher = make_matcher(
        {"experienceStrike": {"enabled": True, "minPreferred": 8, "points": 4}}, monkeypatch=monkeypatch
    )
    job = {"title": "Senior Engineer", "description": "", "location": "remote", "company": "Acme"}
    result = matcher.analyze_job(job, return_below_threshold=True)
    assert result is not None
    assert result.match_score == 46  # base 50 minus 4
    assert result.match_score < result.score_breakdown.base_score
