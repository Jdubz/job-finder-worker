"""Tests for single-pass company processing pipeline."""

import pytest
from unittest.mock import ANY, Mock

from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus
from job_finder.job_queue.processor import QueueItemProcessor


class TestCompanyPipeline:
    """Test single-pass company processing."""

    @pytest.fixture
    def mock_dependencies(self):
        return {
            "queue_manager": Mock(),
            "config_loader": Mock(
                get_job_filters=Mock(return_value={}),
                get_technology_ranks=Mock(return_value={"python": 30, "react": 25, "docker": 20}),
            ),
            "job_storage": Mock(),
            "job_listing_storage": Mock(),
            "companies_manager": Mock(),
            "sources_manager": Mock(),
            "company_info_fetcher": Mock(),
            "ai_matcher": Mock(),
        }

    @pytest.fixture
    def processor(self, mock_dependencies):
        return QueueItemProcessor(**mock_dependencies)

    def test_single_pass_success_with_source_discovery(self, processor, mock_dependencies):
        item = JobQueueItem(
            id="c1",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        mock_dependencies["company_info_fetcher"]._fetch_page_content.return_value = (
            "Example builds with Python and React. Careers at https://boards.greenhouse.io/example"
            * 5
        )
        mock_dependencies["company_info_fetcher"]._extract_company_info.return_value = {
            "about": "We build things",
            "culture": "Collaborative",
            "mission": "Ship value",
        }
        mock_dependencies["sources_manager"].get_source_for_url.return_value = None
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        # AI deemed sufficient
        mock_dependencies["company_info_fetcher"]._needs_ai_enrichment.return_value = False

        processor.company_processor.process_company(item)

        # company saved
        mock_dependencies["companies_manager"].save_company.assert_called_once()
        # source discovery enqueued
        mock_dependencies["queue_manager"].add_item.assert_called_once()
        source_item = mock_dependencies["queue_manager"].add_item.call_args[0][0]
        assert source_item.type == QueueItemType.SOURCE_DISCOVERY
        # status set to success
        mock_dependencies["queue_manager"].update_status.assert_called_with(
            "c1", QueueStatus.SUCCESS, ANY
        )

    def test_single_pass_no_job_board(self, processor, mock_dependencies):
        item = JobQueueItem(
            id="c2",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        mock_dependencies["company_info_fetcher"]._fetch_page_content.return_value = (
            "Example builds with Python and React." * 5
        )
        mock_dependencies["company_info_fetcher"]._extract_company_info.return_value = {
            "about": "We build things",
            "culture": "Collaborative",
            "mission": "Ship value",
        }

        processor.company_processor.process_company(item)

        assert not mock_dependencies["queue_manager"].add_item.called
        mock_dependencies["queue_manager"].update_status.assert_called()

    def test_fetch_failure_marks_failed(self, processor, mock_dependencies):
        item = JobQueueItem(
            id="c3",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        mock_dependencies["company_info_fetcher"]._fetch_page_content.return_value = ""

        processor.company_processor.process_company(item)

        mock_dependencies["queue_manager"].update_status.assert_any_call(
            "c3",
            QueueStatus.FAILED,
            "Could not fetch any content from company website",
            error_details=ANY,
        )

    def test_ai_missing_fields_marks_failed(self, processor, mock_dependencies):
        item = JobQueueItem(
            id="c4",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        # Heuristics produce data but AI enrichment still required
        # Skip network: provide fetched pages directly
        processor.company_processor._fetch_company_pages = Mock(
            return_value={"about": "stub content long enough"}
        )
        mock_dependencies["company_info_fetcher"]._extract_company_info.return_value = {
            "about": "short",
            "culture": "",
            "mission": "",
        }
        mock_dependencies["company_info_fetcher"].ai_provider = object()
        # Heuristic pass says needs AI; after AI still sparse
        mock_dependencies["company_info_fetcher"]._needs_ai_enrichment.side_effect = [True, True]
        # Simulate AI call returning empty dict (did not populate)
        mock_dependencies["company_info_fetcher"]._extract_with_ai.return_value = {}

        processor.company_processor.process_company(item)

        # Verify AI enrichment was attempted
        mock_dependencies["company_info_fetcher"]._extract_with_ai.assert_called_once()
        mock_dependencies["queue_manager"].update_status.assert_any_call(
            "c4", QueueStatus.FAILED, "AI enrichment failed to populate required company fields"
        )

    def test_ai_enrichment_success(self, processor, mock_dependencies):
        """Test that AI enrichment populates sparse fields and allows success.

        Verifies that:
        1. AI enrichment is triggered when heuristics produce sparse data
        2. AI values overwrite sparse heuristic values (not just empty ones)
        3. The enriched data is saved to the company record
        """
        item = JobQueueItem(
            id="c5",
            type=QueueItemType.COMPANY,
            url="https://example.com",
            company_name="Example",
            status=QueueStatus.PROCESSING,
        )

        # Skip network: provide fetched pages directly
        processor.company_processor._fetch_company_pages = Mock(
            return_value={"about": "stub content long enough"}
        )

        # Heuristics produce sparse but non-empty data
        sparse_heuristic_data = {
            "about": "short",  # Non-empty but insufficient
            "culture": "",
            "mission": "",
        }
        mock_dependencies["company_info_fetcher"]._extract_company_info.return_value = (
            sparse_heuristic_data
        )
        mock_dependencies["company_info_fetcher"].ai_provider = object()

        # AI provides comprehensive data that should overwrite sparse heuristic values
        comprehensive_ai_data = {
            "about": "A comprehensive company description from AI that is much longer and more detailed",
            "culture": "Great culture values with collaborative environment",
            "mission": "To build great things and deliver value",
            "industry": "Technology",
        }
        mock_dependencies["company_info_fetcher"]._extract_with_ai.return_value = (
            comprehensive_ai_data
        )

        # First check: needs AI (sparse heuristics). Second check: sufficient (after AI merge)
        mock_dependencies["company_info_fetcher"]._needs_ai_enrichment.side_effect = [True, False]
        mock_dependencies["companies_manager"].save_company.return_value = "company-123"

        processor.company_processor.process_company(item)

        # Verify AI enrichment was called
        mock_dependencies["company_info_fetcher"]._extract_with_ai.assert_called_once()

        # Verify the saved company has AI-enriched values (not the sparse heuristic values)
        mock_dependencies["companies_manager"].save_company.assert_called_once()
        saved_company = mock_dependencies["companies_manager"].save_company.call_args[0][0]

        # AI "about" should overwrite sparse heuristic "about" (key behavior being tested)
        assert (
            saved_company["about"] == comprehensive_ai_data["about"]
        ), "AI values should overwrite sparse heuristic values, not just empty ones"
        assert saved_company["culture"] == comprehensive_ai_data["culture"]
        assert saved_company["mission"] == comprehensive_ai_data["mission"]
        assert saved_company["industry"] == comprehensive_ai_data["industry"]

        # Status should be success
        mock_dependencies["queue_manager"].update_status.assert_called_with(
            "c5", QueueStatus.SUCCESS, ANY
        )

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
