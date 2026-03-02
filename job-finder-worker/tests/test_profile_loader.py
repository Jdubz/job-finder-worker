"""Tests for profile data loader."""

import json

import pytest

from job_finder.exceptions import ProfileError
from job_finder.profile.loader import ProfileLoader
from job_finder.profile.schema import Experience, Profile, Skill


class TestLoadFromJson:
    """Test loading profile from JSON file."""

    def test_load_valid_json(self, tmp_path):
        """Test loading valid profile JSON."""
        profile_data = {
            "name": "Test User",
            "email": "test@example.com",
            "phone": None,
            "location": "San Francisco, CA",
            "linkedin_url": None,
            "github_url": None,
            "portfolio_url": None,
            "summary": "Software engineer with 5 years experience",
            "years_of_experience": 5.0,
            "skills": [
                {
                    "name": "Python",
                    "level": "advanced",
                    "years_experience": 5.0,
                    "category": "programming",
                }
            ],
            "experience": [],
            "education": [],
            "projects": [],
            "preferences": None,
            "certifications": [],
            "languages": ["English"],
        }

        # Create temp JSON file
        json_file = tmp_path / "profile.json"
        with open(json_file, "w") as f:
            json.dump(profile_data, f)

        # Load profile
        profile = ProfileLoader.load_from_json(str(json_file))

        assert isinstance(profile, Profile)
        assert profile.name == "Test User"
        assert profile.email == "test@example.com"
        assert profile.years_of_experience == 5.0
        assert len(profile.skills) == 1
        assert profile.skills[0].name == "Python"

    def test_load_file_not_found(self):
        """Test loading from non-existent file raises ProfileError."""
        with pytest.raises(ProfileError) as exc_info:
            ProfileLoader.load_from_json("/nonexistent/path/profile.json")

        assert "Profile file not found" in str(exc_info.value)

    def test_load_invalid_json(self, tmp_path):
        """Test loading invalid JSON raises ValueError."""
        json_file = tmp_path / "invalid.json"
        with open(json_file, "w") as f:
            f.write("{ invalid json ")

        with pytest.raises((ValueError, json.JSONDecodeError)):
            ProfileLoader.load_from_json(str(json_file))

    def test_load_invalid_schema(self, tmp_path):
        """Test loading data with invalid field types raises ProfileError."""
        invalid_data = {
            "name": "Test User",
            "skills": "not a list",  # Invalid type - should be list
            "years_of_experience": "not a number",  # Invalid type
        }

        json_file = tmp_path / "invalid_schema.json"
        with open(json_file, "w") as f:
            json.dump(invalid_data, f)

        with pytest.raises(ProfileError) as exc_info:
            ProfileLoader.load_from_json(str(json_file))

        assert "Invalid profile data" in str(exc_info.value)

    def test_load_empty_json(self, tmp_path):
        """Test loading empty JSON raises ProfileError."""
        json_file = tmp_path / "empty.json"
        with open(json_file, "w") as f:
            json.dump({}, f)

        with pytest.raises(ProfileError) as exc_info:
            ProfileLoader.load_from_json(str(json_file))

        assert "Invalid profile data" in str(exc_info.value)


class TestLoadFromDict:
    """Test loading profile from dictionary."""

    def test_load_valid_dict(self):
        """Test loading valid profile dictionary."""
        profile_data = {
            "name": "Test User",
            "email": "test@example.com",
            "phone": None,
            "location": "San Francisco, CA",
            "linkedin_url": None,
            "github_url": None,
            "portfolio_url": None,
            "summary": "Software engineer",
            "years_of_experience": 5.0,
            "skills": [],
            "experience": [],
            "education": [],
            "projects": [],
            "preferences": None,
            "certifications": [],
            "languages": [],
        }

        profile = ProfileLoader.load_from_dict(profile_data)

        assert isinstance(profile, Profile)
        assert profile.name == "Test User"
        assert profile.email == "test@example.com"

    def test_load_dict_with_nested_objects(self):
        """Test loading dictionary with nested objects."""
        profile_data = {
            "name": "Test User",
            "email": "test@example.com",
            "phone": None,
            "location": None,
            "linkedin_url": None,
            "github_url": None,
            "portfolio_url": None,
            "summary": None,
            "years_of_experience": 3.0,
            "skills": [
                {
                    "name": "Python",
                    "level": "advanced",
                    "years_experience": 3.0,
                    "category": "programming",
                }
            ],
            "experience": [
                {
                    "company": "Tech Corp",
                    "title": "Software Engineer",
                    "start_date": "2020-01",
                    "end_date": "2023-06",
                    "location": "SF",
                    "description": "Built things",
                    "responsibilities": [],
                    "achievements": [],
                    "technologies": ["Python"],
                    "is_current": False,
                }
            ],
            "education": [],
            "projects": [],
            "preferences": None,
            "certifications": [],
            "languages": [],
        }

        profile = ProfileLoader.load_from_dict(profile_data)

        assert len(profile.skills) == 1
        assert profile.skills[0].name == "Python"
        assert len(profile.experience) == 1
        assert profile.experience[0].company == "Tech Corp"

    def test_load_invalid_dict(self):
        """Test loading dictionary with invalid field types raises ProfileError."""
        invalid_data = {
            "name": "Test User",
            "skills": "not a list",  # Invalid type
            "experience": "not a list",  # Invalid type
        }

        with pytest.raises(ProfileError) as exc_info:
            ProfileLoader.load_from_dict(invalid_data)

        assert "Invalid profile data" in str(exc_info.value)

    def test_load_empty_dict(self):
        """Test loading empty dictionary raises ProfileError."""
        with pytest.raises(ProfileError) as exc_info:
            ProfileLoader.load_from_dict({})

        assert "Invalid profile data" in str(exc_info.value)


