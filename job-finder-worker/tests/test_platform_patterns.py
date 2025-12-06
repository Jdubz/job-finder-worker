"""Tests for platform pattern matching and config generation."""

from job_finder.scrapers.platform_patterns import (
    PLATFORM_PATTERNS,
    build_config_from_pattern,
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

    def test_greenhouse_regional_api_url_generation(self):
        """Verify EU/regional URLs still generate correct API URL."""
        url = "https://job-boards.eu.greenhouse.io/veeamsoftware"
        pattern, groups = match_platform(url)
        config = build_config_from_pattern(pattern, groups)
        # API URL should always use boards-api.greenhouse.io (not regional)
        assert (
            config["url"]
            == "https://boards-api.greenhouse.io/v1/boards/veeamsoftware/jobs?content=true"
        )

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

    def test_weworkremotely_config_uses_rss(self):
        """Verify WeWorkRemotely config uses RSS feed with company extraction."""
        url = "https://weworkremotely.com/company/lemon-io"
        pattern, groups = match_platform(url)
        config = build_config_from_pattern(pattern, groups)
        assert config["type"] == "rss"
        assert config["url"] == "https://weworkremotely.com/remote-jobs.rss"
        assert config.get("is_remote_source") is True
        # Company is extracted from "Company: Job Title" format in RSS titles
        assert config.get("company_extraction") == "from_title"

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

    def test_builtin_config_has_follow_detail(self):
        """Verify BuiltIn config has follow_detail for job enrichment."""
        url = "https://builtin.com/company/grow-therapy/jobs"
        pattern, groups = match_platform(url)
        config = build_config_from_pattern(pattern, groups)
        assert config["type"] == "html"
        assert config.get("follow_detail") is True

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


class TestBuildConfigFromPattern:
    """Test config building from matched patterns."""

    def test_greenhouse_config_structure(self):
        """Test Greenhouse config has correct structure."""
        url = "https://jobs.greenhouse.io/discord"
        pattern, groups = match_platform(url)
        config = build_config_from_pattern(pattern, groups)

        assert config["type"] == "api"
        assert (
            config["url"] == "https://boards-api.greenhouse.io/v1/boards/discord/jobs?content=true"
        )
        assert config["response_path"] == "jobs"
        assert "title" in config["fields"]
        assert "url" in config["fields"]
        assert "method" not in config  # GET is default, not included

    def test_ashby_html_to_api_conversion(self):
        """Test Ashby HTML URL converts to API URL."""
        url = "https://jobs.ashbyhq.com/supabase"
        pattern, groups = match_platform(url)
        config = build_config_from_pattern(pattern, groups)

        assert config["type"] == "api"
        assert (
            config["url"]
            == "https://api.ashbyhq.com/posting-api/job-board/supabase?includeCompensation=true"
        )
        assert config["response_path"] == "jobs"

    def test_workday_config_has_post_method(self):
        """Test Workday config has POST method and body."""
        url = "https://salesforce.wd12.myworkdayjobs.com/External_Career_Site"
        pattern, groups = match_platform(url)
        config = build_config_from_pattern(pattern, groups)

        assert config["type"] == "api"
        assert config["method"] == "POST"
        assert config["post_body"] == {"limit": 20, "offset": 0}
        assert config["response_path"] == "jobPostings"
        assert "Content-Type" in config["headers"]

    def test_workday_config_has_base_url(self):
        """Test Workday config includes base_url for relative job URLs."""
        url = "https://salesforce.wd12.myworkdayjobs.com/External_Career_Site"
        pattern, groups = match_platform(url)
        config = build_config_from_pattern(pattern, groups)

        assert "base_url" in config
        assert (
            config["base_url"] == "https://salesforce.wd12.myworkdayjobs.com/External_Career_Site"
        )

    def test_lever_config_has_empty_response_path(self):
        """Test Lever config has empty response_path for array response."""
        url = "https://jobs.lever.co/anthropic"
        pattern, groups = match_platform(url)
        config = build_config_from_pattern(pattern, groups)

        assert config["type"] == "api"
        assert config["url"] == "https://api.lever.co/v0/postings/anthropic?mode=json"
        assert config["response_path"] == ""

    def test_config_fields_are_copied(self):
        """Test that field mappings are copied, not referenced."""
        url = "https://jobs.greenhouse.io/discord"
        pattern, groups = match_platform(url)
        config1 = build_config_from_pattern(pattern, groups)
        config2 = build_config_from_pattern(pattern, groups)

        # Modify one config's fields
        config1["fields"]["custom"] = "value"

        # Other config should not be affected
        assert "custom" not in config2["fields"]
        # Original pattern should not be affected
        assert "custom" not in pattern.fields


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
