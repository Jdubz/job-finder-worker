"""Tests for platform pattern matching and config generation."""

import pytest

from job_finder.scrapers.platform_patterns import (
    PLATFORM_PATTERNS,
    is_single_company_platform,
    match_platform,
)


class TestPlatformPatternRegistry:
    """Test the platform patterns registry."""

    def test_registry_has_expected_platforms(self):
        """Test that registry contains all expected platform patterns."""
        pattern_names = {p.name for p in PLATFORM_PATTERNS}
        expected = {
            "greenhouse_api",
            "greenhouse_html",
            "ashby_api",
            "ashby_html",
            "workday",
            "lever",
            "remotive_api",
            "remoteok_api",
            "monster_rss",
            "indeed_partner_api",
            "indeed_rss",
            "linkedin_stub",
            "smartrecruiters_api",
            "avature_rss",
            "weworkremotely_rss",
            "builtin_html",
            "jobicy_api",
            "breezy_api",
            "workable_api",
            "recruitee_api",
            "jazzhr_stub",
            # HTML/XML platform patterns
            "teamtailor_html",
            "personio_xml",
        }
        assert expected.issubset(pattern_names)

    def test_all_patterns_have_required_fields(self):
        """Test that all patterns have required field mappings."""
        for pattern in PLATFORM_PATTERNS:
            assert "title" in pattern.fields, f"{pattern.name} missing 'title' field"
            assert "url" in pattern.fields, f"{pattern.name} missing 'url' field"


class TestMatchPlatform:
    """Test URL pattern matching."""

    # Greenhouse tests
    def test_greenhouse_api_url(self):
        """Test matching Greenhouse API URLs."""
        url = "https://boards-api.greenhouse.io/v1/boards/discord/jobs"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "greenhouse_api"
        assert groups["board_token"] == "discord"

    def test_greenhouse_api_url_with_query(self):
        """Test Greenhouse API URL with query params."""
        url = "https://boards-api.greenhouse.io/v1/boards/discord/jobs?content=true"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "greenhouse_api"
        assert groups["board_token"] == "discord"

    def test_greenhouse_html_jobs_subdomain(self):
        """Test matching jobs.greenhouse.io URLs."""
        url = "https://jobs.greenhouse.io/discord"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "greenhouse_html"
        assert groups["board_token"] == "discord"

    def test_greenhouse_html_boards_subdomain(self):
        """Test matching boards.greenhouse.io URLs."""
        url = "https://boards.greenhouse.io/anthropic"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "greenhouse_html"
        assert groups["board_token"] == "anthropic"

    def test_greenhouse_html_with_path(self):
        """Test Greenhouse HTML URL with job path is matched correctly."""
        url = "https://jobs.greenhouse.io/openai/jobs/12345"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "greenhouse_html"
        assert groups["board_token"] == "openai"

    def test_greenhouse_job_boards_subdomain(self):
        """Test matching job-boards.greenhouse.io URLs (hyphenated subdomain)."""
        url = "https://job-boards.greenhouse.io/veeamsoftware/jobs/4589680101"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "greenhouse_html"
        assert groups["board_token"] == "veeamsoftware"

    def test_greenhouse_eu_regional_subdomain(self):
        """Test matching job-boards.eu.greenhouse.io URLs (EU regional)."""
        url = "https://job-boards.eu.greenhouse.io/veeamsoftware/jobs/4589680101"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "greenhouse_html"
        assert groups["board_token"] == "veeamsoftware"

    def test_greenhouse_eu_jobs_subdomain(self):
        """Test matching jobs.eu.greenhouse.io URLs."""
        url = "https://jobs.eu.greenhouse.io/eurocompany"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "greenhouse_html"
        assert groups["board_token"] == "eurocompany"

    # Ashby tests
    def test_ashby_api_url(self):
        """Test matching Ashby API URLs."""
        url = "https://api.ashbyhq.com/posting-api/job-board/ramp"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "ashby_api"
        assert groups["board_name"] == "ramp"

    def test_ashby_api_url_with_query(self):
        """Test Ashby API URL with query params."""
        url = "https://api.ashbyhq.com/posting-api/job-board/supabase?includeCompensation=true"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "ashby_api"
        assert groups["board_name"] == "supabase"

    def test_ashby_html_url(self):
        """Test matching jobs.ashbyhq.com URLs."""
        url = "https://jobs.ashbyhq.com/supabase"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "ashby_html"
        assert groups["board_name"] == "supabase"

    def test_ashby_html_url_with_path(self):
        """Test Ashby HTML URL with job path."""
        url = "https://jobs.ashbyhq.com/faire/12345-software-engineer"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "ashby_html"
        assert groups["board_name"] == "faire"

    # Workday tests
    def test_workday_url_with_language_prefix(self):
        """Test matching Workday URLs with language prefix - should skip lang and capture site_id."""
        url = "https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "workday"
        assert groups["tenant"] == "salesforce"
        assert groups["wd_instance"] == "wd12"
        # Should capture 'External_Career_Site', NOT 'en-US'
        assert groups["site_id"] == "External_Career_Site"

    def test_workday_url_without_language_prefix(self):
        """Test Workday URL without language prefix."""
        url = "https://linkedin.wd1.myworkdayjobs.com/jobs"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "workday"
        assert groups["tenant"] == "linkedin"
        assert groups["wd_instance"] == "wd1"
        assert groups["site_id"] == "jobs"

    def test_workday_url_with_language_and_job_path(self):
        """Test Workday URL with language prefix and job path."""
        url = "https://uber.wd5.myworkdayjobs.com/en-US/Uber_Careers/job/12345"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "workday"
        assert groups["tenant"] == "uber"
        assert groups["wd_instance"] == "wd5"
        # Should capture 'Uber_Careers', NOT 'en-US'
        assert groups["site_id"] == "Uber_Careers"

    def test_workday_url_with_fr_fr_language(self):
        """Test Workday URL with fr-FR language prefix."""
        url = "https://company.wd3.myworkdayjobs.com/fr-FR/careers"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "workday"
        assert groups["tenant"] == "company"
        assert groups["wd_instance"] == "wd3"
        assert groups["site_id"] == "careers"

    def test_workday_url_yahoo_regression(self):
        """Regression test: Yahoo Workday URL should capture 'careers' not 'en-US'."""
        url = "https://ouryahoo.wd5.myworkdayjobs.com/en-US/careers/details/Tech-Writer_JR0026219"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "workday"
        assert groups["tenant"] == "ouryahoo"
        assert groups["wd_instance"] == "wd5"
        assert groups["site_id"] == "careers"  # NOT 'en-US'

    # Lever tests
    def test_lever_url(self):
        """Test matching Lever URLs."""
        url = "https://jobs.lever.co/anthropic"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "lever"
        assert groups["company"] == "anthropic"

    def test_lever_url_with_job_id(self):
        """Test Lever URL with job ID path."""
        url = "https://jobs.lever.co/stripe/12345-software-engineer"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "lever"
        assert groups["company"] == "stripe"

    # SmartRecruiters tests
    def test_smartrecruiters_html_url(self):
        """SmartRecruiters careers site should map to smartrecruiters_api."""
        url = "https://www.smartrecruiters.com/Experian"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "smartrecruiters_api"
        assert groups["company"] == "Experian"

    def test_smartrecruiters_api_url(self):
        """Direct API URL should match and extract company."""
        url = "https://api.smartrecruiters.com/v1/companies/stripe/postings"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "smartrecruiters_api"
        assert groups["company"] == "stripe"

    def test_smartrecruiters_www_url(self):
        """www subdomain should also match SmartRecruiters sites."""
        url = "https://www.smartrecruiters.com/Experian/job/123"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "smartrecruiters_api"
        assert groups["company"] == "Experian"

    # Breezy tests
    def test_breezy_api_url(self):
        """Test matching Breezy.hr career pages."""
        url = "https://search-atlas.breezy.hr"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "breezy_api"
        assert groups["company"] == "search-atlas"

    def test_breezy_api_url_with_path(self):
        """Test Breezy URL with path."""
        url = "https://acme-corp.breezy.hr/p/12345-software-engineer"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "breezy_api"
        assert groups["company"] == "acme-corp"

    # Workable tests
    def test_workable_api_url(self):
        """Test matching Workable career pages."""
        url = "https://apply.workable.com/silverfin"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "workable_api"
        assert groups["company"] == "silverfin"

    def test_workable_api_url_with_job_path(self):
        """Test Workable URL with job path."""
        url = "https://apply.workable.com/cytora/j/ABC123-engineer"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "workable_api"
        assert groups["company"] == "cytora"

    # Recruitee tests
    def test_recruitee_api_url(self):
        """Test matching Recruitee career pages."""
        url = "https://kodify.recruitee.com"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "recruitee_api"
        assert groups["company"] == "kodify"

    def test_recruitee_api_url_with_path(self):
        """Test Recruitee URL with offer path."""
        url = "https://acme.recruitee.com/o/senior-developer"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "recruitee_api"
        assert groups["company"] == "acme"

    # JazzHR tests
    def test_jazzhr_stub_url(self):
        """Test matching JazzHR/ApplyToJob pages."""
        url = "https://bitovi.applytojob.com"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "jazzhr_stub"
        assert groups["company"] == "bitovi"
        assert pattern.auth_required is True

    def test_jazzhr_stub_url_with_apply_path(self):
        """Test JazzHR URL with apply path."""
        url = "https://acme.applytojob.com/apply/12345"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "jazzhr_stub"
        assert groups["company"] == "acme"

    # Avature tests
    def test_avature_rss_url(self):
        """Avature SearchJobs feed should match and build RSS config."""
        url = "https://mantech.avature.net/en_US/careers/SearchJobs"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "avature_rss"
        assert groups == {
            "subdomain": "mantech",
            "lang": "en_US",
            "site": "careers",
        }

    def test_avature_rss_multilevel_subdomain(self):
        """Dotted subdomains should be captured fully for Avature."""
        url = "https://us.jobs.company.avature.net/en_GB/talent/SearchJobs"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "avature_rss"
        assert groups == {
            "subdomain": "us.jobs.company",
            "lang": "en_GB",
            "site": "talent",
        }

    # WeWorkRemotely tests
    def test_weworkremotely_company_page(self):
        """Test matching weworkremotely.com company pages."""
        url = "https://weworkremotely.com/company/lemon-io"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "weworkremotely_rss"
        assert pattern.is_remote_source is True

    def test_weworkremotely_remote_jobs(self):
        """Test matching weworkremotely.com remote-jobs page."""
        url = "https://weworkremotely.com/remote-jobs"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "weworkremotely_rss"

    def test_weworkremotely_root(self):
        """Test matching weworkremotely.com root."""
        url = "https://weworkremotely.com"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "weworkremotely_rss"

    # BuiltIn tests
    def test_builtin_root_jobs_page(self):
        """Test matching builtin.com/jobs."""
        url = "https://builtin.com/jobs"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "builtin_html"

    def test_builtin_company_jobs_page(self):
        """Test matching builtin.com/company/xxx/jobs pages."""
        url = "https://builtin.com/company/grow-therapy/jobs"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "builtin_html"

    def test_builtin_company_jobs_different_company(self):
        """Test matching builtin.com/company/xxx/jobs for various companies."""
        urls = [
            "https://builtin.com/company/stripe/jobs",
            "https://builtin.com/company/discord/jobs",
            "https://builtin.com/company/some-company-name/jobs",
        ]
        for url in urls:
            result = match_platform(url)
            assert result is not None, f"Should match: {url}"
            pattern, groups = result
            assert pattern.name == "builtin_html"

    # Non-matching URLs
    def test_unknown_url_returns_none(self):
        """Test that unknown URLs return None."""
        urls = [
            "https://example.com/careers",
            "https://indeed.com/viewjob?jk=123",
            "https://careers.google.com/jobs/results/",
        ]
        for url in urls:
            assert match_platform(url) is None, f"Should not match: {url}"

    def test_linkedin_matches_stub(self):
        """LinkedIn should match stub pattern (auth-required)."""
        result = match_platform("https://linkedin.com/jobs")
        assert result is not None
        pattern, _ = result
        assert pattern.name == "linkedin_stub"
        assert pattern.auth_required is True

    def test_partial_domain_does_not_match(self):
        """Test that partial domain matches don't falsely match."""
        # Should not match fake-greenhouse.io
        url = "https://fake-greenhouse.io/discord"
        assert match_platform(url) is None


class TestFieldMappings:
    """Test field mapping correctness for each platform."""

    def test_greenhouse_field_mappings(self):
        """Test Greenhouse field mappings match API response structure."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "greenhouse_api")
        assert pattern.fields["title"] == "title"
        assert pattern.fields["location"] == "location.name"
        assert pattern.fields["description"] == "content"
        assert pattern.fields["url"] == "absolute_url"
        assert pattern.fields["posted_date"] == "updated_at"

    def test_ashby_field_mappings(self):
        """Test Ashby field mappings match API response structure."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "ashby_api")
        assert pattern.fields["title"] == "title"
        assert pattern.fields["location"] == "location"
        assert pattern.fields["description"] == "descriptionHtml"
        assert pattern.fields["url"] == "jobUrl"
        assert pattern.fields["posted_date"] == "publishedAt"

    def test_workday_field_mappings(self):
        """Test Workday field mappings match API response structure."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "workday")
        assert pattern.fields["title"] == "title"
        assert pattern.fields["location"] == "locationsText"
        assert pattern.fields["url"] == "externalPath"
        assert pattern.fields["posted_date"] == "postedOn"

    def test_lever_field_mappings(self):
        """Test Lever field mappings match API response structure."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "lever")
        assert pattern.fields["title"] == "text"
        assert pattern.fields["location"] == "categories.location"
        assert pattern.fields["description"] == "descriptionPlain"
        assert pattern.fields["url"] == "hostedUrl"
        assert pattern.fields["posted_date"] == "createdAt"

    def test_smartrecruiters_field_mappings(self):
        """Test SmartRecruiters field mappings match API response structure."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "smartrecruiters_api")
        assert pattern.fields["title"] == "name"
        assert pattern.fields["company"] == "company.name"
        assert pattern.fields["location"] == "location.fullLocation"
        assert pattern.fields["description"] == "jobAd.sections.jobDescription.text"
        assert pattern.fields["url"] == "ref"
        assert pattern.fields["posted_date"] == "releasedDate"
        assert pattern.fields["job_type"] == "typeOfEmployment.label"
        assert pattern.fields["department"] == "department.label"


class TestValidationKeys:
    """Test validation key correctness for each platform."""

    def test_greenhouse_validation_key(self):
        """Test Greenhouse validation key."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "greenhouse_api")
        assert pattern.validation_key == "jobs"

    def test_ashby_validation_key(self):
        """Test Ashby validation key."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "ashby_api")
        assert pattern.validation_key == "jobs"

    def test_workday_validation_key(self):
        """Test Workday validation key."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "workday")
        assert pattern.validation_key == "jobPostings"

    def test_lever_validation_key_empty_for_array(self):
        """Test Lever has empty validation key for array response."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "lever")
        assert pattern.validation_key == ""


class TestIsSingleCompanyPlatform:
    """Test the is_single_company_platform helper."""

    @pytest.mark.parametrize(
        "url",
        [
            "https://jobs.lever.co/company",
            "https://boards-api.greenhouse.io/v1/boards/company/jobs",
            "https://api.ashbyhq.com/posting-api/job-board/company",
            "https://company.breezy.hr/json",
            "https://company.wd5.myworkdayjobs.com/en-US/external",
        ],
    )
    def test_single_company_platforms_return_true(self, url):
        """Single-company platform URLs are correctly identified."""
        assert is_single_company_platform(url) is True

    @pytest.mark.parametrize(
        "url",
        [
            "https://remotive.com/api/remote-jobs",
            "https://remoteok.com/api",
            "https://weworkremotely.com/categories/remote-programming-jobs.rss",
            "https://builtin.com/jobs",
        ],
    )
    def test_multi_company_aggregators_return_false(self, url):
        """Multi-company aggregator URLs are NOT identified as single-company."""
        assert is_single_company_platform(url) is False

    def test_unknown_url_returns_false(self):
        """Unknown URLs that don't match any pattern return False."""
        assert is_single_company_platform("https://example.com/careers") is False


class TestIsMultiCompanyField:
    """Test that is_multi_company is set correctly on platform patterns."""

    def test_aggregators_are_multi_company(self):
        """Aggregator platforms must have is_multi_company=True."""
        multi_expected = {
            "remotive_api",
            "remoteok_api",
            "weworkremotely_rss",
            "builtin_html",
            "jobicy_api",
        }
        for pattern in PLATFORM_PATTERNS:
            if pattern.name in multi_expected:
                assert pattern.is_multi_company, f"{pattern.name} should be is_multi_company=True"

    def test_single_company_platforms_not_multi(self):
        """Single-company platforms must have is_multi_company=False."""
        single_expected = {
            "greenhouse_api",
            "ashby_api",
            "lever",
            "workday",
            "breezy_api",
            "workable_api",
            "recruitee_api",
        }
        for pattern in PLATFORM_PATTERNS:
            if pattern.name in single_expected:
                assert (
                    not pattern.is_multi_company
                ), f"{pattern.name} should be is_multi_company=False"


class TestTeamtailorPattern:
    """Test Teamtailor HTML platform pattern matching."""

    def test_matches_standard_teamtailor_url(self):
        """Standard teamtailor.com URL is matched."""
        url = "https://gigster.teamtailor.com/jobs"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "teamtailor_html"
        assert groups["company"] == "gigster"

    def test_matches_regional_teamtailor_url(self):
        """Regional teamtailor URL with TLD prefix is matched."""
        url = "https://zinkworks.ie.teamtailor.com/jobs"
        result = match_platform(url)
        assert result is not None
        pattern, _ = result
        assert pattern.name == "teamtailor_html"

    def test_teamtailor_has_html_config_type(self):
        """Teamtailor pattern uses HTML config type."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "teamtailor_html")
        assert pattern.config_type == "html"
        assert pattern.job_selector != ""

    def test_teamtailor_fields_include_title_and_url(self):
        """Teamtailor pattern has title and url field mappings."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "teamtailor_html")
        assert "title" in pattern.fields
        assert "url" in pattern.fields


class TestPersonioPattern:
    """Test Personio XML platform pattern matching."""

    def test_matches_personio_com_url(self):
        """Personio .com URL is matched."""
        url = "https://stark.jobs.personio.com"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "personio_xml"
        assert groups["company"] == "stark"
        assert groups["tld"] == "com"

    def test_matches_personio_de_url(self):
        """Personio .de URL is matched."""
        url = "https://c4a8.jobs.personio.de"
        result = match_platform(url)
        assert result is not None
        pattern, groups = result
        assert pattern.name == "personio_xml"
        assert groups["company"] == "c4a8"
        assert groups["tld"] == "de"

    def test_personio_has_html_config_type(self):
        """Personio uses HTML config type (BS4 parses the XML)."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "personio_xml")
        assert pattern.config_type == "html"

    def test_personio_job_selector_is_position(self):
        """Personio XML uses <position> as the job selector."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "personio_xml")
        assert pattern.job_selector == "position"

    def test_personio_has_base_url_template(self):
        """Personio has a base URL template for constructing job URLs."""
        pattern = next(p for p in PLATFORM_PATTERNS if p.name == "personio_xml")
        assert "personio" in pattern.base_url_template
        assert "{company}" in pattern.base_url_template
