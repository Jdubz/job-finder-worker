"""Tests for FK repair helper in BaseProcessor."""

from unittest.mock import Mock

from job_finder.job_queue.processors.base_processor import BaseProcessor


class TestEnsureCompanySourceLink:
    """Tests for ensure_company_source_link static method."""

    def test_resolves_company_from_source(self):
        """Test resolving company_id when only source_id is provided."""
        sources_manager = Mock()
        sources_manager.get_source_by_id.return_value = {
            "id": "source-123",
            "companyId": "company-456",
        }

        company_id, source_id = BaseProcessor.ensure_company_source_link(
            sources_manager,
            company_id=None,
            source_id="source-123",
        )

        assert company_id == "company-456"
        assert source_id == "source-123"
        sources_manager.get_source_by_id.assert_called_with("source-123")

    def test_links_source_to_company(self):
        """Test linking source to company when both IDs provided but not linked."""
        sources_manager = Mock()
        sources_manager.get_source_by_id.return_value = {
            "id": "source-123",
            "companyId": None,  # Not linked yet
        }

        company_id, source_id = BaseProcessor.ensure_company_source_link(
            sources_manager,
            company_id="company-456",
            source_id="source-123",
        )

        assert company_id == "company-456"
        assert source_id == "source-123"
        sources_manager.update_company_link.assert_called_once_with(
            "source-123", "company-456"
        )

    def test_skips_link_when_already_linked(self):
        """Test that existing links are not modified."""
        sources_manager = Mock()
        sources_manager.get_source_by_id.return_value = {
            "id": "source-123",
            "companyId": "company-456",  # Already linked
        }

        company_id, source_id = BaseProcessor.ensure_company_source_link(
            sources_manager,
            company_id="company-456",
            source_id="source-123",
        )

        assert company_id == "company-456"
        assert source_id == "source-123"
        sources_manager.update_company_link.assert_not_called()

    def test_looks_up_source_by_url(self):
        """Test looking up and linking source by URL when source_id is missing."""
        sources_manager = Mock()
        sources_manager.get_source_for_url.return_value = {
            "id": "source-123",
            "companyId": None,
        }

        company_id, source_id = BaseProcessor.ensure_company_source_link(
            sources_manager,
            company_id="company-456",
            source_id=None,
            source_url="https://example.com/jobs",
        )

        assert company_id == "company-456"
        assert source_id == "source-123"
        sources_manager.get_source_for_url.assert_called_with(
            "https://example.com/jobs"
        )
        sources_manager.update_company_link.assert_called_once_with(
            "source-123", "company-456"
        )

    def test_handles_missing_source(self):
        """Test graceful handling when source is not found."""
        sources_manager = Mock()
        sources_manager.get_source_by_id.return_value = None

        company_id, source_id = BaseProcessor.ensure_company_source_link(
            sources_manager,
            company_id=None,
            source_id="non-existent",
        )

        assert company_id is None
        assert source_id == "non-existent"
        sources_manager.update_company_link.assert_not_called()

    def test_handles_missing_source_url(self):
        """Test graceful handling when source URL lookup fails."""
        sources_manager = Mock()
        sources_manager.get_source_for_url.return_value = None

        company_id, source_id = BaseProcessor.ensure_company_source_link(
            sources_manager,
            company_id="company-456",
            source_id=None,
            source_url="https://unknown.com/jobs",
        )

        assert company_id == "company-456"
        assert source_id is None
        sources_manager.update_company_link.assert_not_called()

    def test_returns_original_values_when_nothing_to_do(self):
        """Test that original values are returned when no repair needed."""
        sources_manager = Mock()

        company_id, source_id = BaseProcessor.ensure_company_source_link(
            sources_manager,
            company_id=None,
            source_id=None,
            source_url=None,
        )

        assert company_id is None
        assert source_id is None
        sources_manager.get_source_by_id.assert_not_called()
        sources_manager.get_source_for_url.assert_not_called()
        sources_manager.update_company_link.assert_not_called()
