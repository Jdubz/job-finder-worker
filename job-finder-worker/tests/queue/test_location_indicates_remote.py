"""Tests for _location_indicates_remote deterministic override."""

import pytest

from job_finder.job_queue.processors.job_processor import _location_indicates_remote


class TestLocationIndicatesRemote:
    """Test the deterministic remote-work detection helper."""

    @pytest.mark.parametrize(
        "location",
        [
            "United States - Remote",
            "Remote - USA",
            "Remote (USA)",
            "San Francisco, CA (Remote)",
            "New York, NY, United States (or Remote in the United States)",
            "remote",
            "REMOTE",
            "Fully Remote",
        ],
    )
    def test_remote_keyword_detected(self, location: str):
        assert _location_indicates_remote(location) is True

    @pytest.mark.parametrize(
        "location",
        [
            "Distributed",
            "distributed",
            "Distributed; Hybrid",
            "DISTRIBUTED - US",
        ],
    )
    def test_distributed_keyword_detected(self, location: str):
        assert _location_indicates_remote(location) is True

    @pytest.mark.parametrize(
        "location",
        [
            "San Francisco, CA",
            "New York, NY",
            "Portland, OR, United States",
            "Austin, TX",
            "",
        ],
    )
    def test_office_only_not_detected(self, location: str):
        assert _location_indicates_remote(location) is False
