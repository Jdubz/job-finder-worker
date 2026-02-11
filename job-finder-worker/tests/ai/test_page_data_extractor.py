"""Tests for PageDataExtractor: URL rendering + JSON-LD/AI job data extraction."""

import json
from unittest.mock import MagicMock, patch

import pytest

from job_finder.ai.page_data_extractor import PageDataExtractor
from job_finder.exceptions import NoAgentsAvailableError


def _make_extractor():
    agent_manager = MagicMock()
    return PageDataExtractor(agent_manager), agent_manager


# ── SSRF URL validation ───────────────────────────────────────────


class TestValidateUrl:
    """Test URL validation / SSRF protections."""

    def test_rejects_non_http_scheme(self):
        with pytest.raises(ValueError, match="Invalid URL scheme"):
            PageDataExtractor._validate_url("ftp://example.com/job")

    def test_rejects_file_scheme(self):
        with pytest.raises(ValueError, match="Invalid URL scheme"):
            PageDataExtractor._validate_url("file:///etc/passwd")

    def test_rejects_localhost(self):
        with pytest.raises(ValueError, match="Blocked hostname"):
            PageDataExtractor._validate_url("http://localhost/admin")

    def test_rejects_127_0_0_1(self):
        with pytest.raises(ValueError, match="Blocked hostname"):
            PageDataExtractor._validate_url("http://127.0.0.1:8080/api")

    def test_rejects_ipv6_loopback(self):
        # urlparse returns hostname=None for bare IPv6, caught by "no hostname" check
        with pytest.raises(ValueError):
            PageDataExtractor._validate_url("http://::1/secret")

    def test_rejects_bracketed_ipv6_loopback(self):
        with pytest.raises(ValueError, match="Blocked hostname"):
            PageDataExtractor._validate_url("http://[::1]/secret")

    def test_rejects_no_hostname(self):
        with pytest.raises(ValueError, match="no hostname"):
            PageDataExtractor._validate_url("http://")

    @patch("job_finder.ai.page_data_extractor.socket.getaddrinfo")
    def test_rejects_private_ip_after_dns(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (2, 1, 6, "", ("192.168.1.1", 0)),
        ]
        with pytest.raises(ValueError, match="blocked IP range"):
            PageDataExtractor._validate_url("http://internal.company.local/admin")

    @patch("job_finder.ai.page_data_extractor.socket.getaddrinfo")
    def test_accepts_public_url(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (2, 1, 6, "", ("104.16.100.1", 0)),
        ]
        PageDataExtractor._validate_url("https://boards.greenhouse.io/company/jobs/123")


# ── JSON-LD extraction ────────────────────────────────────────────


def _html_with_jsonld(jsonld_data):
    """Build a minimal HTML page with embedded JSON-LD."""
    return f"""<html><head>
    <script type="application/ld+json">{json.dumps(jsonld_data)}</script>
    </head><body><p>Job posting content</p></body></html>"""


class TestExtractFromJsonld:
    """Test JSON-LD JobPosting structured data extraction."""

    def test_extracts_basic_job_posting(self):
        extractor, _ = _make_extractor()
        html = _html_with_jsonld(
            {
                "@type": "JobPosting",
                "title": "Software Engineer",
                "description": "Build great things",
                "hiringOrganization": {"@type": "Organization", "name": "Acme"},
            }
        )
        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is not None
        assert result["title"] == "Software Engineer"
        assert result["description"] == "Build great things"
        assert result["company"] == "Acme"

    def test_handles_hiring_org_as_string(self):
        extractor, _ = _make_extractor()
        html = _html_with_jsonld(
            {
                "@type": "JobPosting",
                "title": "Engineer",
                "description": "A great job",
                "hiringOrganization": "StringCompany",
            }
        )
        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is not None
        assert result["company"] == "StringCompany"

    def test_handles_hiring_org_as_list(self):
        extractor, _ = _make_extractor()
        html = _html_with_jsonld(
            {
                "@type": "JobPosting",
                "title": "Engineer",
                "description": "A great job",
                "hiringOrganization": [{"@type": "Organization", "name": "ListCompany"}],
            }
        )
        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is not None
        assert result["company"] == "ListCompany"

    def test_handles_graph_wrapper(self):
        extractor, _ = _make_extractor()
        html = _html_with_jsonld(
            {
                "@context": "https://schema.org",
                "@graph": [
                    {"@type": "JobPosting", "title": "Graph Job", "description": "In a graph"},
                ],
            }
        )
        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is not None
        assert result["title"] == "Graph Job"

    def test_extracts_salary_range(self):
        extractor, _ = _make_extractor()
        html = _html_with_jsonld(
            {
                "@type": "JobPosting",
                "title": "Engineer",
                "description": "A job",
                "baseSalary": {
                    "currency": "USD",
                    "value": {"minValue": 100000, "maxValue": 150000},
                },
            }
        )
        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is not None
        assert result["salary"] == "USD 100000-150000"

    def test_returns_none_when_no_jsonld_and_no_ai(self):
        extractor, agent = _make_extractor()
        html = "<html><body><p>No structured data here</p></body></html>"
        agent.execute.side_effect = Exception("AI failed")

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is None


# ── AI fallback extraction ────────────────────────────────────────


class TestAIFallback:
    """Test AI-based extraction when JSON-LD is absent or incomplete."""

    def test_falls_back_to_ai_when_no_jsonld(self):
        extractor, agent = _make_extractor()
        html = "<html><body><h1>Senior Dev</h1><p>Build stuff at TechCo</p></body></html>"
        ai_response = MagicMock()
        ai_response.text = json.dumps(
            {
                "title": "Senior Dev",
                "description": "Build stuff at TechCo",
                "company": "TechCo",
                "location": "Remote",
            }
        )
        agent.execute.return_value = ai_response

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is not None
        assert result["title"] == "Senior Dev"
        assert result["company"] == "TechCo"
        agent.execute.assert_called_once()

    def test_jsonld_takes_priority_ai_fills_gaps(self):
        extractor, agent = _make_extractor()
        # JSON-LD has title+description but no company/location
        html = _html_with_jsonld(
            {
                "@type": "JobPosting",
                "title": "JSON-LD Title",
                "description": "JSON-LD Desc",
            }
        )
        ai_response = MagicMock()
        ai_response.text = json.dumps(
            {
                "title": "AI Title",
                "description": "AI Desc",
                "company": "AI Company",
                "location": "AI Location",
            }
        )
        agent.execute.return_value = ai_response

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is not None
        # JSON-LD wins for title/description
        assert result["title"] == "JSON-LD Title"
        assert result["description"] == "JSON-LD Desc"
        # AI was NOT called because JSON-LD had both title+desc
        agent.execute.assert_not_called()

    def test_ai_fills_missing_description(self):
        extractor, agent = _make_extractor()
        # JSON-LD has title only
        html = _html_with_jsonld(
            {
                "@type": "JobPosting",
                "title": "JSON-LD Title",
            }
        )
        ai_response = MagicMock()
        ai_response.text = json.dumps(
            {
                "title": "AI Title",
                "description": "AI filled description",
                "company": "AI Company",
            }
        )
        agent.execute.return_value = ai_response

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is not None
        assert result["title"] == "JSON-LD Title"  # JSON-LD kept
        assert result["description"] == "AI filled description"  # AI filled gap

    def test_propagates_no_agents_available_error(self):
        extractor, agent = _make_extractor()
        html = "<html><body><p>Some job posting</p></body></html>"
        agent.execute.side_effect = NoAgentsAvailableError("All agents down")

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            with pytest.raises(NoAgentsAvailableError):
                extractor.extract("https://example.com/job")

    def test_returns_none_on_render_failure(self):
        extractor, _ = _make_extractor()

        with (
            patch.object(extractor, "_render_page", side_effect=Exception("Timeout")),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is None

    def test_returns_none_on_empty_html(self):
        extractor, _ = _make_extractor()

        with (
            patch.object(extractor, "_render_page", return_value=""),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract("https://example.com/job")

        assert result is None
