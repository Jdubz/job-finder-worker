"""Shared pytest fixtures for all tests."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, Mock

import pytest


@pytest.fixture(autouse=True)
def set_test_environment(monkeypatch):
    """
    Automatically set ENVIRONMENT variable for all tests.

    This prevents ValueError from being raised when initializing
    StructuredLogger or calling setup_logging() in tests.
    """
    monkeypatch.setenv("ENVIRONMENT", "development")


@pytest.fixture
def sample_job():
    """
    Create a standardized sample job dictionary.

    Returns a job dict with all standard fields for testing.
    Individual tests can override specific fields by updating the returned dict.
    """
    return {
        "title": "Senior Software Engineer",
        "company": "Test Company",
        "company_website": "https://test.com",
        "location": "Remote",
        "description": "We are looking for a senior software engineer...",
        "url": "https://test.com/job/123",
        "posted_date": datetime.now(timezone.utc).isoformat(),
        "company_info": "About the company",
    }


@pytest.fixture
def mock_profile():
    """
    Create a standardized mock profile.

    Returns a Mock object with all Profile fields set to sensible defaults.
    Individual tests can override specific attributes as needed.
    """
    profile = Mock()
    profile.name = "Test User"
    profile.location = "Portland, OR"
    profile.email = "test@example.com"
    profile.phone = None
    profile.linkedin_url = None
    profile.github_url = None
    profile.portfolio_url = None
    profile.summary = "Experienced software engineer"
    profile.years_of_experience = 5.0
    profile.skills = []
    profile.experience = []
    profile.education = []
    profile.projects = []
    profile.certifications = []
    profile.languages = ["English"]
    profile.preferences = None
    profile.get_current_role = Mock(return_value=None)
    profile.get_all_skills = Mock(return_value=[])
    return profile
