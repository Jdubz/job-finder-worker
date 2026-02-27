"""Tests for PromptPair return types from extraction and matcher prompts.

Verifies that prompt functions return (system, user) tuples and that
the system/user split preserves the expected content.
"""

from unittest.mock import Mock

from job_finder.ai.extraction_prompts import (
    PromptPair,
    build_extraction_prompt,
    build_repair_prompt,
)
from job_finder.ai.prompts import JobMatchPrompts


class TestExtractionPromptPair:
    """Test build_extraction_prompt returns a valid PromptPair."""

    def test_returns_tuple_of_two_strings(self):
        result = build_extraction_prompt("Engineer", "Build things")
        assert isinstance(result, tuple)
        assert len(result) == 2
        system, user = result
        assert isinstance(system, str)
        assert isinstance(user, str)

    def test_system_contains_json_schema(self):
        system, _ = build_extraction_prompt("Engineer", "Build things")
        assert '"seniority"' in system
        assert '"workArrangement"' in system
        assert '"technologies"' in system

    def test_system_contains_rules(self):
        system, _ = build_extraction_prompt("Engineer", "Build things")
        assert "Rules:" in system
        assert "Infer seniority" in system
        assert "Detect work arrangement" in system

    def test_system_contains_todays_date(self):
        from datetime import date

        system, _ = build_extraction_prompt("Engineer", "Build things")
        assert date.today().isoformat() in system

    def test_user_contains_job_title(self):
        _, user = build_extraction_prompt("Senior Backend Engineer", "Build APIs")
        assert "Senior Backend Engineer" in user

    def test_user_contains_description(self):
        _, user = build_extraction_prompt("Engineer", "Build distributed systems")
        assert "Build distributed systems" in user

    def test_user_contains_location_when_provided(self):
        _, user = build_extraction_prompt("Engineer", "desc", location="Remote - US")
        assert "Remote - US" in user

    def test_user_contains_posted_date_when_provided(self):
        _, user = build_extraction_prompt("Engineer", "desc", posted_date="2025-12-01")
        assert "2025-12-01" in user

    def test_user_contains_salary_when_provided(self):
        _, user = build_extraction_prompt("Engineer", "desc", salary_range="USD 150000-200000")
        assert "USD 150000-200000" in user

    def test_user_contains_url_when_provided(self):
        _, user = build_extraction_prompt("Engineer", "desc", url="https://example.com/job/123")
        assert "https://example.com/job/123" in user

    def test_system_does_not_contain_job_specific_data(self):
        """System prompt should be static (cacheable) — no job-specific data."""
        system, _ = build_extraction_prompt(
            "Unique Title XYZ",
            "Unique description ABC",
            location="Unique Location",
        )
        assert "Unique Title XYZ" not in system
        assert "Unique description ABC" not in system
        assert "Unique Location" not in system


class TestRepairPromptPair:
    """Test build_repair_prompt returns a valid PromptPair."""

    def test_returns_tuple_of_two_strings(self):
        result = build_repair_prompt("Engineer", "Build things", ["seniority"])
        assert isinstance(result, tuple)
        assert len(result) == 2
        system, user = result
        assert isinstance(system, str)
        assert isinstance(user, str)

    def test_system_contains_field_hints(self):
        system, _ = build_repair_prompt("Engineer", "desc", ["seniority", "work_arrangement"])
        assert "seniority" in system
        assert "workArrangement" in system

    def test_user_contains_job_title(self):
        _, user = build_repair_prompt("Staff Engineer", "desc", ["seniority"])
        assert "Staff Engineer" in user

    def test_user_contains_description(self):
        _, user = build_repair_prompt("Engineer", "Build APIs and services", ["seniority"])
        assert "Build APIs and services" in user

    def test_user_contains_location_when_provided(self):
        _, user = build_repair_prompt(
            "Engineer", "desc", ["timezone"], location="San Francisco, CA"
        )
        assert "San Francisco, CA" in user


class TestMatcherPromptPair:
    """Test analyze_job_match returns a valid PromptPair."""

    def _make_profile(self):
        profile = Mock()
        profile.name = "Test User"
        profile.location = "Portland, OR"
        profile.summary = "Experienced engineer"
        profile.years_of_experience = 5
        profile.skills = []
        profile.experience = []
        profile.education = []
        profile.projects = []
        profile.certifications = []
        profile.languages = ["English"]
        profile.preferences = None
        profile.get_current_role = Mock(return_value=None)
        return profile

    def _make_job(self):
        return {
            "title": "Senior Engineer",
            "company": "Acme Corp",
            "location": "Remote",
            "salary": "$150k-200k",
            "description": "Build scalable systems",
            "url": "https://acme.com/job/1",
        }

    def test_returns_tuple_of_two_strings(self):
        result = JobMatchPrompts.analyze_job_match(self._make_profile(), self._make_job())
        assert isinstance(result, tuple)
        assert len(result) == 2
        system, user = result
        assert isinstance(system, str)
        assert isinstance(user, str)

    def test_system_contains_profile_summary(self):
        system, _ = JobMatchPrompts.analyze_job_match(self._make_profile(), self._make_job())
        assert "Test User" in system

    def test_system_contains_deliverables(self):
        system, _ = JobMatchPrompts.analyze_job_match(self._make_profile(), self._make_job())
        assert "matched_skills" in system
        assert "missing_skills" in system

    def test_user_contains_job_details(self):
        _, user = JobMatchPrompts.analyze_job_match(self._make_profile(), self._make_job())
        assert "Senior Engineer" in user
        assert "Acme Corp" in user
        assert "Build scalable systems" in user

    def test_system_does_not_contain_job_data(self):
        """System prompt should not contain job-specific data."""
        system, _ = JobMatchPrompts.analyze_job_match(self._make_profile(), self._make_job())
        assert "Acme Corp" not in system
        assert "Build scalable systems" not in system


class TestResumeIntakePromptPair:
    """Test generate_resume_intake_data returns a valid PromptPair."""

    def _make_profile(self):
        profile = Mock()
        profile.name = "Test User"
        profile.location = "Portland, OR"
        profile.summary = "Experienced engineer"
        profile.years_of_experience = 5
        profile.skills = []
        profile.experience = []
        profile.education = []
        profile.projects = []
        profile.certifications = []
        profile.languages = ["English"]
        profile.preferences = None
        profile.get_current_role = Mock(return_value=None)
        return profile

    def test_returns_tuple_of_two_strings(self):
        result = JobMatchPrompts.generate_resume_intake_data(
            self._make_profile(),
            {"title": "Engineer", "company": "Co", "description": "desc"},
            {
                "matched_skills": ["Python"],
                "missing_skills": [],
                "key_strengths": [],
                "potential_concerns": [],
            },
        )
        assert isinstance(result, tuple)
        assert len(result) == 2
        system, user = result
        assert isinstance(system, str)
        assert isinstance(user, str)
