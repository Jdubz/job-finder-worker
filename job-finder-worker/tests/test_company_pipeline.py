"""Tests for single-pass company processing."""

import pytest
from unittest.mock import Mock

from job_finder.job_queue.models import (
    JobQueueItem,
    QueueItemType,
    QueueStatus,
)
from job_finder.job_queue.processor import QueueItemProcessor


class TestCompanyProcessing:
    """Test single-pass company processing."""

    @pytest.fixture
    def mock_dependencies(self):
        """Create mock dependencies for processor."""
        return {
            "queue_manager": Mock(),
            "config_loader": Mock(),
            "job_storage": Mock(),
            "job_listing_storage": Mock(),
            "companies_manager": Mock(),
            "sources_manager": Mock(),
            "company_info_fetcher": Mock(),
            "ai_matcher": Mock(),
        }

    @pytest.fixture
    def processor(self, mock_dependencies):
        """Create processor with mocked dependencies."""
        # Mock config_loader methods
        mock_dependencies["config_loader"].get_job_filters.return_value = {}
        mock_dependencies["config_loader"].get_technology_ranks.return_value = {
            "python": 30,
            "react": 25,
            "docker": 20,
        }

        return QueueItemProcessor(**mock_dependencies)

    def test_single_pass_company_processing(self, processor, mock_dependencies):
        """Test that company items are processed in a single pass."""
        queue_item = JobQueueItem(
            id="test-id",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example Corp",
        )

        # Mock stop list check
        mock_dependencies["config_loader"].get_stop_list.return_value = {
            "excludedCompanies": [],
            "excludedKeywords": [],
            "excludedDomains": [],
        }

        # Mock the company_info_fetcher methods
        mock_dependencies["company_info_fetcher"]._fetch_page_content.return_value = (
            "Example Corp is a great company. We build software with Python and React. " * 10
        )
        mock_dependencies["company_info_fetcher"]._extract_company_info.return_value = {
            "about": "Example Corp builds great software",
            "culture": "Fast-paced and collaborative",
            "mission": "Making tech accessible",
        }

        # Mock company save
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        # Execute
        processor.process_item(queue_item)

        # Verify update_status was called with PROCESSING then SUCCESS
        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        assert len(calls) >= 2

        # First call should be PROCESSING
        assert calls[0][0][1] == QueueStatus.PROCESSING

        # Last call should be SUCCESS
        last_call = calls[-1]
        assert last_call[0][1] == QueueStatus.SUCCESS

        # Should have fetched pages
        assert mock_dependencies["company_info_fetcher"]._fetch_page_content.called

        # Should have extracted company info
        assert mock_dependencies["company_info_fetcher"]._extract_company_info.called

        # Should have saved the company
        assert mock_dependencies["companies_manager"].save_company.called
        save_call = mock_dependencies["companies_manager"].save_company.call_args[0][0]
        assert save_call["name"] == "Example Corp"
        assert save_call["website"] == "https://example.com"

    def test_company_with_job_board_spawns_source_discovery(self, processor, mock_dependencies):
        """Test that company with detected job board spawns source discovery."""
        queue_item = JobQueueItem(
            id="test-id",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example Corp",
        )

        # Mock stop list check
        mock_dependencies["config_loader"].get_stop_list.return_value = {
            "excludedCompanies": [],
            "excludedKeywords": [],
            "excludedDomains": [],
        }

        # Mock fetch to return Greenhouse job board link
        mock_dependencies["company_info_fetcher"]._fetch_page_content.return_value = (
            "Join us at https://boards.greenhouse.io/examplecorp to see our open roles! " * 10
        )
        mock_dependencies["company_info_fetcher"]._extract_company_info.return_value = {
            "about": "We are Example Corp",
            "culture": "Great culture",
            "mission": "Our mission",
        }
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        # Execute
        processor.process_item(queue_item)

        # Verify SOURCE_DISCOVERY was spawned
        assert mock_dependencies["queue_manager"].add_item.called
        source_item = mock_dependencies["queue_manager"].add_item.call_args[0][0]
        assert source_item.type == QueueItemType.SOURCE_DISCOVERY
        assert "greenhouse" in source_item.source_discovery_config.url

    def test_company_fetch_failure(self, processor, mock_dependencies):
        """Test that company processing fails gracefully when fetch fails."""
        queue_item = JobQueueItem(
            id="test-id",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example Corp",
        )

        # Mock stop list check
        mock_dependencies["config_loader"].get_stop_list.return_value = {
            "excludedCompanies": [],
            "excludedKeywords": [],
            "excludedDomains": [],
        }

        # Mock fetch to return empty content (simulating failure)
        mock_dependencies["company_info_fetcher"]._fetch_page_content.return_value = ""

        # Execute
        processor.process_item(queue_item)

        # Verify status was set to FAILED
        calls = mock_dependencies["queue_manager"].update_status.call_args_list
        failed_calls = [c for c in calls if c[0][1] == QueueStatus.FAILED]
        assert len(failed_calls) > 0

    def test_company_reanalysis_with_company_id(self, processor, mock_dependencies):
        """Test that re-analysis passes existing company_id."""
        queue_item = JobQueueItem(
            id="test-id",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example Corp",
            company_id="existing-company-123",
        )

        # Mock stop list check
        mock_dependencies["config_loader"].get_stop_list.return_value = {
            "excludedCompanies": [],
            "excludedKeywords": [],
            "excludedDomains": [],
        }

        # Mock successful processing
        mock_dependencies["company_info_fetcher"]._fetch_page_content.return_value = (
            "Example Corp content " * 50
        )
        mock_dependencies["company_info_fetcher"]._extract_company_info.return_value = {
            "about": "Updated about",
            "culture": "Updated culture",
            "mission": "Updated mission",
        }
        mock_dependencies["companies_manager"].save_company.return_value = "existing-company-123"

        # Execute
        processor.process_item(queue_item)

        # Verify company was saved with existing ID
        assert mock_dependencies["companies_manager"].save_company.called
        save_call = mock_dependencies["companies_manager"].save_company.call_args[0][0]
        assert save_call["id"] == "existing-company-123"

    def test_detect_tech_stack(self, processor):
        """Test tech stack detection from company info."""
        extracted_info = {
            "about": "We use Python, React, and Docker",
            "culture": "Modern tech stack with Kubernetes",
        }
        html_content = {
            "careers": "Looking for Go developers",
        }

        tech_stack = processor.company_processor._detect_tech_stack(extracted_info, html_content)

        assert "python" in tech_stack
        assert "react" in tech_stack
        assert "docker" in tech_stack
        assert "kubernetes" in tech_stack
        assert "go" in tech_stack

    def test_detect_job_board_greenhouse(self, processor):
        """Test Greenhouse job board detection."""
        html_content = {
            "careers": "Apply at https://boards.greenhouse.io/examplecorp/jobs/123456",
        }

        job_board_url = processor.company_processor._detect_job_board(
            "https://example.com", html_content
        )

        assert job_board_url == "https://boards.greenhouse.io/examplecorp"
