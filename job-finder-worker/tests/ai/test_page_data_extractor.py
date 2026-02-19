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


# ── Greenhouse embed detection ───────────────────────────────────


def _greenhouse_embed_html(board_token="acmecorp"):
    """Build HTML with a Greenhouse embed script tag."""
    return f"""<html><head>
    <script src="https://boards.greenhouse.io/embed/job_board/js?for={board_token}"></script>
    </head><body>
    <div id="grnhse_app"></div>
    <p>Company marketing content</p>
    </body></html>"""


class TestGreenhouseEmbed:
    """Test Greenhouse iframe/embed detection and API fetch."""

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_detects_embed_script_and_fetches_api(self, mock_get):
        extractor, _ = _make_extractor()
        html = _greenhouse_embed_html("twochairs")
        url = "https://www.twochairs.com/careers?gh_jid=8298038002"

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "title": "Senior Software Engineer",
            "content": "<p>Build great things</p>",
            "company_name": "Two Chairs",
            "location": {"name": "Remote, United States"},
            "updated_at": "2026-02-11T21:17:49-05:00",
        }
        mock_get.return_value = mock_resp

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract(url)

        assert result is not None
        assert result["title"] == "Senior Software Engineer"
        assert "great things" in result["description"]
        assert result["company"] == "Two Chairs"
        assert result["location"] == "Remote, United States"
        mock_get.assert_called_once_with(
            "https://boards-api.greenhouse.io/v1/boards/twochairs/jobs/8298038002",
            headers={"User-Agent": "JobFinderBot/1.0", "Accept": "application/json"},
            timeout=10,
        )

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_detects_greenhouse_iframe_src(self, mock_get):
        extractor, _ = _make_extractor()
        html = """<html><body>
        <iframe src="https://boards.greenhouse.io/acmecorp/jobs/12345"></iframe>
        </body></html>"""
        url = "https://acme.com/careers?gh_jid=12345"

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "title": "Engineer",
            "content": "Description",
            "company_name": "Acme",
            "location": {"name": "NYC"},
        }
        mock_get.return_value = mock_resp

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract(url)

        assert result is not None
        assert result["title"] == "Engineer"

    def test_skips_when_no_gh_jid_param(self):
        extractor, agent = _make_extractor()
        html = _greenhouse_embed_html("twochairs")
        agent.execute.side_effect = Exception("AI failed")

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            # No gh_jid param → Greenhouse detection skipped, AI fails → None
            result = extractor.extract("https://www.twochairs.com/careers")

        assert result is None

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_returns_none_when_api_fails(self, mock_get):
        from requests.exceptions import ConnectionError as ReqConnectionError

        extractor, agent = _make_extractor()
        html = _greenhouse_embed_html("twochairs")
        url = "https://www.twochairs.com/careers?gh_jid=999"

        mock_get.side_effect = ReqConnectionError("Connection error")
        agent.execute.side_effect = Exception("AI also failed")

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract(url)

        assert result is None

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_returns_none_when_api_returns_404(self, mock_get):
        """Verify raise_for_status() catches non-2xx responses."""
        from requests.exceptions import HTTPError

        extractor, agent = _make_extractor()
        html = _greenhouse_embed_html("twochairs")
        url = "https://www.twochairs.com/careers?gh_jid=999"

        mock_resp = MagicMock()
        mock_resp.raise_for_status.side_effect = HTTPError("404 Not Found")
        mock_get.return_value = mock_resp
        agent.execute.side_effect = Exception("AI also failed")

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract(url)

        assert result is None
        mock_resp.raise_for_status.assert_called_once()

    def test_returns_none_when_gh_jid_but_no_greenhouse_elements(self):
        """gh_jid in URL but page has no Greenhouse script or iframe."""
        extractor, agent = _make_extractor()
        html = "<html><body><p>Regular page content</p></body></html>"
        url = "https://example.com/careers?gh_jid=12345"
        agent.execute.side_effect = Exception("AI failed")

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            result = extractor.extract(url)

        assert result is None


# ── API probe (Greenhouse/Lever direct URLs) ─────────────────────


class TestAPIProbe:
    """Test API-first probe for direct Greenhouse/Lever URLs."""

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_greenhouse_direct_url_skips_playwright(self, mock_get):
        """Direct Greenhouse URL fetches from API without rendering."""
        extractor, _ = _make_extractor()
        url = "https://boards.greenhouse.io/acmecorp/jobs/4567890"

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "title": "Staff Engineer",
            "content": "<p>Lead technical projects</p>",
            "company_name": "Acme Corp",
            "location": {"name": "San Francisco, CA"},
            "updated_at": "2026-01-15T10:00:00-08:00",
        }
        mock_get.return_value = mock_resp

        with patch.object(extractor, "_validate_url"):
            with patch.object(extractor, "_render_page") as mock_render:
                result = extractor.extract(url)

        assert result is not None
        assert result["title"] == "Staff Engineer"
        assert "Lead technical projects" in result["description"]
        assert result["company"] == "Acme Corp"
        assert result["location"] == "San Francisco, CA"
        assert result["url"] == url
        mock_render.assert_not_called()
        mock_get.assert_called_once_with(
            "https://boards-api.greenhouse.io/v1/boards/acmecorp/jobs/4567890",
            headers={"User-Agent": "JobFinderBot/1.0", "Accept": "application/json"},
            timeout=10,
        )

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_job_boards_subdomain_recognized(self, mock_get):
        """job-boards.greenhouse.io subdomain is recognized."""
        extractor, _ = _make_extractor()
        url = "https://job-boards.greenhouse.io/acmecorp/jobs/4567890"

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "title": "Engineer",
            "content": "Description",
            "company_name": "Acme",
            "location": {"name": "Remote"},
        }
        mock_get.return_value = mock_resp

        with patch.object(extractor, "_validate_url"):
            with patch.object(extractor, "_render_page") as mock_render:
                result = extractor.extract(url)

        assert result is not None
        assert result["title"] == "Engineer"
        mock_render.assert_not_called()

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_regional_greenhouse_url_recognized(self, mock_get):
        """Regional URLs like job-boards.eu.greenhouse.io work."""
        extractor, _ = _make_extractor()
        url = "https://job-boards.eu.greenhouse.io/europecorp/jobs/789"

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "title": "EU Engineer",
            "content": "European role",
            "company_name": "EuropeCorp",
            "location": "Berlin, Germany",
        }
        mock_get.return_value = mock_resp

        with patch.object(extractor, "_validate_url"):
            with patch.object(extractor, "_render_page") as mock_render:
                result = extractor.extract(url)

        assert result is not None
        assert result["title"] == "EU Engineer"
        assert result["location"] == "Berlin, Germany"
        mock_render.assert_not_called()

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_lever_direct_url_skips_playwright(self, mock_get):
        """Direct Lever URL fetches from API without rendering."""
        extractor, _ = _make_extractor()
        url = "https://jobs.lever.co/stripe/a0b1c2d3-e4f5-6789-abcd-ef0123456789"

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "text": "Backend Engineer",
            "descriptionPlain": "Build payment infrastructure",
            "categories": {"location": "Seattle, WA"},
            "createdAt": 1700000000000,  # 2023-11-14
        }
        mock_get.return_value = mock_resp

        with patch.object(extractor, "_validate_url"):
            with patch.object(extractor, "_render_page") as mock_render:
                result = extractor.extract(url)

        assert result is not None
        assert result["title"] == "Backend Engineer"
        assert "payment infrastructure" in result["description"]
        assert result["location"] == "Seattle, WA"
        assert result["posted_date"] == "2023-11-14"
        assert result["url"] == url
        mock_render.assert_not_called()
        mock_get.assert_called_once_with(
            "https://api.lever.co/v0/postings/stripe/a0b1c2d3-e4f5-6789-abcd-ef0123456789?mode=json",
            headers={"User-Agent": "JobFinderBot/1.0", "Accept": "application/json"},
            timeout=10,
        )

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_lever_apply_suffix_handled(self, mock_get):
        """Lever URL with /apply suffix still matches."""
        extractor, _ = _make_extractor()
        url = "https://jobs.lever.co/company/a0b1c2d3-e4f5-6789-abcd-ef0123456789/apply"

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "text": "Frontend Engineer",
            "descriptionPlain": "Build UIs",
            "categories": {"location": "Remote"},
        }
        mock_get.return_value = mock_resp

        with patch.object(extractor, "_validate_url"):
            with patch.object(extractor, "_render_page") as mock_render:
                result = extractor.extract(url)

        assert result is not None
        assert result["title"] == "Frontend Engineer"
        mock_render.assert_not_called()

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_api_probe_failure_falls_through_to_rendering(self, mock_get):
        """When API probe fails, extraction falls through to Playwright pipeline."""
        from requests.exceptions import ConnectionError as ReqConnectionError

        extractor, agent = _make_extractor()
        url = "https://boards.greenhouse.io/acmecorp/jobs/999"

        mock_get.side_effect = ReqConnectionError("Connection refused")
        agent.execute.side_effect = Exception("AI also failed")

        with patch.object(extractor, "_validate_url"):
            with patch.object(
                extractor,
                "_render_page",
                return_value="<html><body><p>Fallback content</p></body></html>",
            ) as mock_render:
                result = extractor.extract(url)

        # API probe failed, fell through to Playwright, AI also failed → None
        assert result is None
        mock_render.assert_called_once()

    def test_non_ats_url_does_not_trigger_probe(self):
        """Non-ATS URLs skip the API probe entirely."""
        extractor, agent = _make_extractor()
        url = "https://example.com/careers/engineer"
        ai_response = MagicMock()
        ai_response.text = json.dumps(
            {
                "title": "Engineer",
                "description": "A job at Example",
                "company": "Example",
                "location": "Remote",
            }
        )
        agent.execute.return_value = ai_response

        with patch.object(extractor, "_validate_url"):
            with patch.object(
                extractor,
                "_render_page",
                return_value="<html><body><p>Job posting</p></body></html>",
            ) as mock_render:
                with patch("job_finder.ai.page_data_extractor.requests.get") as mock_get:
                    result = extractor.extract(url)

        assert result is not None
        mock_render.assert_called_once()
        mock_get.assert_not_called()

    def test_board_only_url_does_not_trigger_probe(self):
        """Board-level URL without /jobs/{id} doesn't trigger API probe."""
        extractor, agent = _make_extractor()
        url = "https://boards.greenhouse.io/acmecorp"
        agent.execute.side_effect = Exception("AI failed")

        with patch.object(extractor, "_validate_url"):
            with patch.object(
                extractor,
                "_render_page",
                return_value="<html><body><p>Job board</p></body></html>",
            ):
                with patch("job_finder.ai.page_data_extractor.requests.get") as mock_get:
                    extractor.extract(url)

        mock_get.assert_not_called()

    @patch("job_finder.ai.page_data_extractor.requests.get")
    def test_api_probe_partial_data_falls_through(self, mock_get):
        """API probe returning title but no description falls through to rendering."""
        extractor, agent = _make_extractor()
        url = "https://boards.greenhouse.io/acmecorp/jobs/123"

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "title": "Engineer",
            "content": "",  # Empty description
            "company_name": "Acme",
        }
        mock_get.return_value = mock_resp

        ai_response = MagicMock()
        ai_response.text = json.dumps(
            {
                "title": "Engineer",
                "description": "AI filled description",
                "company": "Acme",
                "location": "Remote",
            }
        )
        agent.execute.return_value = ai_response

        with patch.object(extractor, "_validate_url"):
            with patch.object(
                extractor,
                "_render_page",
                return_value="<html><body><p>Job content</p></body></html>",
            ) as mock_render:
                result = extractor.extract(url)

        assert result is not None
        mock_render.assert_called_once()


# ── Max tokens ────────────────────────────────────────────────────


class TestMaxTokens:
    """Test that AI extraction uses the correct max_tokens value."""

    def test_ai_extraction_uses_4096_max_tokens(self):
        extractor, agent = _make_extractor()
        html = "<html><body><h1>Engineer</h1><p>Build stuff</p></body></html>"
        ai_response = MagicMock()
        ai_response.text = json.dumps(
            {
                "title": "Engineer",
                "description": "Build stuff",
                "company": "Co",
                "location": "Remote",
            }
        )
        agent.execute.return_value = ai_response

        with (
            patch.object(extractor, "_render_page", return_value=html),
            patch.object(extractor, "_validate_url"),
        ):
            extractor.extract("https://example.com/job")

        agent.execute.assert_called_once()
        _, kwargs = agent.execute.call_args
        assert kwargs["max_tokens"] == 4096
