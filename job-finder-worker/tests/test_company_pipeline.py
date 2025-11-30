"""Tests for single-pass company processing pipeline."""

import pytest
from unittest.mock import Mock

from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus
from job_finder.job_queue.processor import QueueItemProcessor


class TestCompanyPipeline:
    """Test single-pass company processing."""

    @pytest.fixture
    def mock_dependencies(self):
        config_loader = Mock()
        config_loader.get_stop_list.return_value = {
            "excludedCompanies": [],
            "excludedDomains": [],
            "excludedKeywords": [],
        }
        config_loader.get_prefilter_policy.return_value = {
            "stopList": {"excludedCompanies": [], "excludedDomains": [], "excludedKeywords": []},
            "strikeEngine": {
                "enabled": False,
                "hardRejections": {
                    "excludedJobTypes": [],
                    "excludedSeniority": [],
                    "excludedCompanies": [],
                    "excludedKeywords": [],
                },
                "remotePolicy": {},
                "salaryStrike": {},
                "seniorityStrikes": {},
                "qualityStrikes": {},
                "ageStrike": {},
            },
            "technologyRanks": {"technologies": {}},
        }

        company_info_fetcher = Mock()
        company_info_fetcher._is_job_board_url.return_value = False

        return {
            "queue_manager": Mock(),
            "config_loader": config_loader,
            "job_storage": Mock(),
            "job_listing_storage": Mock(),
            "companies_manager": Mock(),
            "sources_manager": Mock(),
            "company_info_fetcher": company_info_fetcher,
            "ai_matcher": Mock(),
        }

    @pytest.fixture
    def processor(self, mock_dependencies):
        return QueueItemProcessor(**mock_dependencies)

    def test_single_pass_success_with_job_board_url(self, processor, mock_dependencies):
        """Test that company processing works and spawns source discovery for job board URLs."""
        item = JobQueueItem(
            id="c1",
            type=QueueItemType.COMPANY,
            url="https://boards.greenhouse.io/example",  # Job board URL
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        # Configure fetcher to return company info
        mock_dependencies["company_info_fetcher"].fetch_company_info.return_value = {
            "name": "Example",
            "website": "https://example.com",
            "about": "We build great products with modern tech stacks and distributed teams",
            "culture": "Remote-first with collaborative environment",
            "mission": "Ship value",
        }
        # URL is a job board
        mock_dependencies["company_info_fetcher"]._is_job_board_url.return_value = True
        mock_dependencies["sources_manager"].get_source_for_url.return_value = None
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        processor.company_processor.process_company(item)

        # Company saved
        mock_dependencies["companies_manager"].save_company.assert_called_once()
        # Source discovery enqueued (since URL is a job board)
        mock_dependencies["queue_manager"].add_item.assert_called_once()
        source_item = mock_dependencies["queue_manager"].add_item.call_args[0][0]
        assert source_item.type == QueueItemType.SOURCE_DISCOVERY
        # Status set to success
        mock_dependencies["queue_manager"].update_status.assert_called()
        final_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert final_call[0][0] == "c1"
        assert final_call[0][1] == QueueStatus.SUCCESS

    def test_single_pass_no_job_board(self, processor, mock_dependencies):
        """Test that no source discovery is spawned when URL is not a job board."""
        item = JobQueueItem(
            id="c2",
            type=QueueItemType.COMPANY,
            url="https://example.com",  # Regular company website
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        mock_dependencies["company_info_fetcher"].fetch_company_info.return_value = {
            "name": "Example",
            "website": "https://example.com",
            "about": "We build great products",
            "culture": "Collaborative",
        }
        mock_dependencies["company_info_fetcher"]._is_job_board_url.return_value = False
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        processor.company_processor.process_company(item)

        # No source discovery spawned
        assert not mock_dependencies["queue_manager"].add_item.called
        # Status set to success
        mock_dependencies["queue_manager"].update_status.assert_called()

    def test_company_saved_with_minimal_data(self, processor, mock_dependencies):
        """Test that company is saved even with minimal data (only name required)."""
        item = JobQueueItem(
            id="c3",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        # Fetcher returns minimal data
        mock_dependencies["company_info_fetcher"].fetch_company_info.return_value = {
            "name": "Example",
            "website": "",
            "about": "",
            "culture": "",
        }
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        processor.company_processor.process_company(item)

        # Company saved even with minimal data
        mock_dependencies["companies_manager"].save_company.assert_called_once()
        # Status should still be success (data quality tracked separately)
        mock_dependencies["queue_manager"].update_status.assert_called()
        final_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        assert final_call[0][1] == QueueStatus.SUCCESS

    def test_complete_data_quality_indicator(self, processor, mock_dependencies):
        """Test that complete data results in 'complete' quality indicator."""
        item = JobQueueItem(
            id="c4",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        # Fetcher returns complete data (about >= 100 chars, culture >= 50 chars)
        mock_dependencies["company_info_fetcher"].fetch_company_info.return_value = {
            "name": "Example",
            "about": "A" * 150,  # >= 100 chars
            "culture": "B" * 60,  # >= 50 chars
        }
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        processor.company_processor.process_company(item)

        # Check result message contains 'complete'
        final_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        result_message = final_call[0][2]
        assert "complete" in result_message

    def test_partial_data_quality_indicator(self, processor, mock_dependencies):
        """Test that partial data results in 'partial' quality indicator."""
        item = JobQueueItem(
            id="c5",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        # Fetcher returns partial data (about >= 50 chars but < 100, culture < 50)
        mock_dependencies["company_info_fetcher"].fetch_company_info.return_value = {
            "name": "Example",
            "about": "A" * 60,  # >= 50 but < 100
            "culture": "B" * 20,  # < 50
        }
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        processor.company_processor.process_company(item)

        # Check result message contains 'partial'
        final_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        result_message = final_call[0][2]
        assert "partial" in result_message

    def test_minimal_data_quality_indicator(self, processor, mock_dependencies):
        """Test that minimal data results in 'minimal' quality indicator."""
        item = JobQueueItem(
            id="c6",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        # Fetcher returns minimal data
        mock_dependencies["company_info_fetcher"].fetch_company_info.return_value = {
            "name": "Example",
            "about": "short",  # < 50 chars
            "culture": "",
        }
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        processor.company_processor.process_company(item)

        # Check result message contains 'minimal'
        final_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        result_message = final_call[0][2]
        assert "minimal" in result_message

    def test_existing_source_not_spawned(self, processor, mock_dependencies):
        """Test that source discovery is not spawned if source already exists."""
        item = JobQueueItem(
            id="c7",
            type=QueueItemType.COMPANY,
            url="https://boards.greenhouse.io/example",
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        mock_dependencies["company_info_fetcher"].fetch_company_info.return_value = {
            "name": "Example",
            "about": "Great company",
        }
        mock_dependencies["company_info_fetcher"]._is_job_board_url.return_value = True
        # Source already exists
        mock_dependencies["sources_manager"].get_source_for_url.return_value = {
            "id": "source-existing"
        }
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        processor.company_processor.process_company(item)

        # Source discovery NOT spawned
        assert not mock_dependencies["queue_manager"].add_item.called
        # Result message should indicate source exists
        final_call = mock_dependencies["queue_manager"].update_status.call_args_list[-1]
        result_message = final_call[0][2]
        assert "job_board_exists" in result_message
