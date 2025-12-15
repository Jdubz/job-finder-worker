import pytest

from job_finder.company_info_fetcher import CompanyInfoFetcher


@pytest.fixture
def fetcher():
    # No agent/search clients needed for these helper methods
    return CompanyInfoFetcher(agent_manager=None)


def test_is_acceptable_true(fetcher):
    info = {
        "about": "A" * 150,
        "culture": "We value impact and kindness" + "!" * 30,
        "headquarters": "NYC",
        "website": "https://example.com",
        "techStack": ["Python", "Postgres"],
    }

    assert fetcher._is_acceptable(info) is True


@pytest.mark.parametrize(
    "missing_field",
    ["about", "culture", "headquarters", "website", "techStack"],
)
def test_is_acceptable_false_when_required_missing(fetcher, missing_field):
    info = {
        "about": "A" * 150,
        "culture": "culture" * 10,
        "headquarters": "Remote",
        "website": "https://example.com",
        "techStack": ["Go"],
    }

    info[missing_field] = "" if missing_field != "techStack" else []

    assert fetcher._is_acceptable(info) is False


def test_is_acceptable_headquarters_as_list(fetcher):
    """Test that headquarters can be a list (AI sometimes returns this)."""
    info = {
        "about": "A" * 150,
        "culture": "We value impact and kindness" + "!" * 30,
        "headquarters": ["San Francisco, CA", "New York, NY"],
        "website": "https://example.com",
        "techStack": ["Python", "Postgres"],
    }
    assert fetcher._is_acceptable(info) is True


def test_is_acceptable_headquarters_as_empty_list(fetcher):
    """Test that empty list headquarters is treated as missing."""
    info = {
        "about": "A" * 150,
        "culture": "We value impact and kindness" + "!" * 30,
        "headquarters": [],
        "website": "https://example.com",
        "techStack": ["Python", "Postgres"],
    }
    assert fetcher._is_acceptable(info) is False


def test_is_acceptable_headquartersLocation_as_list(fetcher):
    """Test fallback field headquartersLocation also handles lists."""
    info = {
        "about": "A" * 150,
        "culture": "We value impact and kindness" + "!" * 30,
        "headquartersLocation": ["Remote", "Austin, TX"],
        "website": "https://example.com",
        "techStack": ["Python", "Postgres"],
    }
    assert fetcher._is_acceptable(info) is True


def test_score_completeness_weights(fetcher):
    base = {
        "about": "A" * 250,  # 2 points (capped to 3 overall for about)
        "culture": "C" * 120,  # 2 points (capped to 2 for culture)
        "headquarters": "SF",
        "website": "https://example.com",
        "techStack": ["Python", "React"],
    }

    assert fetcher._score_completeness(base) >= fetcher._score_completeness({})

    # Adding more tech increases score up to cap
    richer = {**base, "techStack": ["Python", "React", "Postgres"]}
    assert fetcher._score_completeness(richer) >= fetcher._score_completeness(base)
