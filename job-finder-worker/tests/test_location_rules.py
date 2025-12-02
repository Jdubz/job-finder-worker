import pytest
from job_finder.utils.location_rules import LocationContext, evaluate_location_rules


def test_remote_tz_penalty_applied():
    ctx = LocationContext(
        user_city="portland",
        user_timezone=-8,
        relocation_allowed=False,
        relocation_penalty=80,
        location_penalty=60,
        ambiguous_location_penalty=40,
        max_timezone_diff_hours=3,
        per_hour_penalty=5,
        hard_timezone_penalty=60,
    )
    res = evaluate_location_rules(job_city="Remote", job_timezone=0, remote=True, hybrid=False, ctx=ctx)
    assert res.hard_reject is False
    assert res.strikes == 60  # hard cap when beyond max diff


def test_onsite_hard_reject_outside_city_no_relocation():
    ctx = LocationContext(
        user_city="portland",
        user_timezone=-8,
        relocation_allowed=False,
        relocation_penalty=80,
        location_penalty=60,
        ambiguous_location_penalty=40,
        max_timezone_diff_hours=3,
        per_hour_penalty=5,
        hard_timezone_penalty=60,
    )
    res = evaluate_location_rules(job_city="seattle", job_timezone=-8, remote=False, hybrid=False, ctx=ctx)
    assert res.hard_reject is True


def test_onsite_relocation_allowed_penalty():
    ctx = LocationContext(
        user_city="portland",
        user_timezone=-8,
        relocation_allowed=True,
        relocation_penalty=80,
        location_penalty=60,
        ambiguous_location_penalty=40,
        max_timezone_diff_hours=3,
        per_hour_penalty=5,
        hard_timezone_penalty=60,
    )
    res = evaluate_location_rules(job_city="seattle", job_timezone=-8, remote=False, hybrid=False, ctx=ctx)
    assert res.hard_reject is False
    assert res.strikes == 80


def test_remote_within_window_uses_per_hour():
    ctx = LocationContext(
        user_city="portland",
        user_timezone=-8,
        relocation_allowed=False,
        relocation_penalty=80,
        location_penalty=60,
        ambiguous_location_penalty=40,
        max_timezone_diff_hours=6,
        per_hour_penalty=5,
        hard_timezone_penalty=60,
    )
    res = evaluate_location_rules(job_city="Remote", job_timezone=-6, remote=True, hybrid=False, ctx=ctx)
    assert res.hard_reject is False
    assert res.strikes == 10
