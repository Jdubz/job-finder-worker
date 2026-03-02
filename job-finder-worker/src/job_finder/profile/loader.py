"""Profile data loader from various sources."""

import json
from pathlib import Path
from typing import Any, Dict

from job_finder.exceptions import ProfileError
from job_finder.profile.schema import Profile


class ProfileLoader:
    """Loads user profile data from files."""

    @staticmethod
    def load_from_json(file_path: str) -> Profile:
        """
        Load profile from a JSON file.

        Args:
            file_path: Path to JSON file containing profile data.

        Returns:
            Profile instance.

        Raises:
            FileNotFoundError: If the file doesn't exist.
            ValueError: If the JSON is invalid or doesn't match the schema.
        """
        path = Path(file_path)

        if not path.exists():
            raise ProfileError(f"Profile file not found: {file_path}")

        with open(path, "r") as f:
            data = json.load(f)

        try:
            return Profile(**data)
        except Exception as e:
            raise ProfileError(f"Invalid profile data: {str(e)}") from e

    @staticmethod
    def load_from_dict(data: Dict[str, Any]) -> Profile:
        """
        Load profile from a dictionary.

        Args:
            data: Dictionary containing profile data.

        Returns:
            Profile instance.

        Raises:
            ValueError: If the data doesn't match the schema.
        """
        try:
            return Profile(**data)
        except Exception as e:
            raise ProfileError(f"Invalid profile data: {str(e)}") from e

