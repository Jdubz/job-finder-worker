"""Tests for URL normalization utility."""

from job_finder.utils.url_utils import (
    compute_content_fingerprint,
    derive_apply_url,
    normalize_url,
    normalize_job_url,
    get_url_hash,
    urls_are_equivalent,
)


class TestNormalizeUrl:
    """Test URL normalization."""

    def test_normalize_removes_trailing_slash(self):
        """Test that trailing slashes are removed."""
        url1 = "https://example.com/job/123"
        url2 = "https://example.com/job/123/"
        assert normalize_url(url1) == normalize_url(url2)

    def test_normalize_lowercase_domain(self):
        """Test that domain is converted to lowercase."""
        url1 = "https://example.com/job/123"
        url2 = "https://EXAMPLE.COM/job/123"
        assert normalize_url(url1) == normalize_url(url2)

    def test_normalize_removes_tracking_params(self):
        """Test that tracking parameters are removed."""
        url1 = "https://example.com/job/123"
        url2 = "https://example.com/job/123?utm_source=google&utm_campaign=search"
        assert normalize_url(url1) == normalize_url(url2)

    def test_normalize_removes_fbclid(self):
        """Test that fbclid is removed."""
        url1 = "https://example.com/job/123"
        url2 = "https://example.com/job/123?fbclid=abc123"
        assert normalize_url(url1) == normalize_url(url2)

    def test_normalize_sorts_params(self):
        """Test that query parameters are sorted."""
        url1 = "https://example.com/job?foo=1&bar=2"
        url2 = "https://example.com/job?bar=2&foo=1"
        assert normalize_url(url1) == normalize_url(url2)

    def test_normalize_removes_fragment(self):
        """Test that fragments are removed."""
        url1 = "https://example.com/job/123"
        url2 = "https://example.com/job/123#section"
        assert normalize_url(url1) == normalize_url(url2)

    def test_normalize_keeps_important_params(self):
        """Test that important params are kept."""
        url = "https://example.com/job?id=123&foo=1"
        normalized = normalize_url(url)
        assert "id=123" in normalized
        assert "foo=1" in normalized

    def test_normalize_empty_string(self):
        """Test that empty strings are handled."""
        assert normalize_url("") == ""

    def test_normalize_invalid_url(self):
        """Test that invalid URLs are handled gracefully."""
        # Should return original URL if parsing fails
        result = normalize_url("not a url")
        assert result is not None


class TestGetUrlHash:
    """Test URL hash generation."""

    def test_equivalent_urls_have_same_hash(self):
        """Test that equivalent URLs produce the same hash."""
        url1 = "https://example.com/job/123"
        url2 = "https://example.com/job/123/"
        assert get_url_hash(url1) == get_url_hash(url2)

    def test_different_urls_have_different_hashes(self):
        """Test that different URLs produce different hashes."""
        url1 = "https://example.com/job/123"
        url2 = "https://example.com/job/456"
        assert get_url_hash(url1) != get_url_hash(url2)

    def test_hash_is_deterministic(self):
        """Test that hashing is deterministic."""
        url = "https://example.com/job/123"
        hash1 = get_url_hash(url)
        hash2 = get_url_hash(url)
        assert hash1 == hash2


class TestUrlsAreEquivalent:
    """Test URL equivalence checking."""

    def test_equivalent_with_trailing_slash(self):
        """Test equivalence with trailing slash."""
        assert urls_are_equivalent("https://example.com/job/123", "https://example.com/job/123/")

    def test_equivalent_with_tracking_params(self):
        """Test equivalence with tracking parameters."""
        assert urls_are_equivalent(
            "https://example.com/job/123",
            "https://example.com/job/123?utm_source=google",
        )

    def test_equivalent_case_insensitive(self):
        """Test equivalence is case insensitive."""
        assert urls_are_equivalent("https://example.com/job/123", "https://EXAMPLE.COM/job/123")

    def test_not_equivalent_different_urls(self):
        """Test non-equivalent URLs."""
        assert not urls_are_equivalent("https://example.com/job/123", "https://example.com/job/456")

    def test_complex_equivalence(self):
        """Test complex equivalence with multiple differences."""
        url1 = "https://example.com/job/123?id=456&search=dev"
        url2 = "https://EXAMPLE.COM/job/123/?search=dev&id=456&utm_source=test&utm_campaign=camp"
        assert urls_are_equivalent(url1, url2)


class TestNormalizeJobUrl:
    """Test job-specific URL normalization."""

    def test_normalize_job_url_is_alias(self):
        """Test that normalize_job_url is an alias for normalize_url."""
        url = "https://example.com/jobs/123?utm_source=linkedin"
        assert normalize_job_url(url) == normalize_url(url)

    def test_normalize_greenhouse_url(self):
        """Test normalization of Greenhouse job URLs."""
        url1 = "https://boards.greenhouse.io/company/jobs/123?t=abc123"
        url2 = "https://boards.greenhouse.io/company/jobs/123"
        assert normalize_job_url(url1) == normalize_job_url(url2)

    def test_normalize_workday_url(self):
        """Test normalization of Workday job URLs."""
        url1 = "https://example.myworkdayjobs.com/en-US/Careers/job/Software-Engineer_123/"
        url2 = "https://example.myworkdayjobs.com/en-US/Careers/job/Software-Engineer_123"
        assert normalize_job_url(url1) == normalize_job_url(url2)

    def test_normalize_with_ref_param(self):
        """Test removal of ref tracking parameter."""
        url1 = "https://example.com/jobs/123?ref=social"
        url2 = "https://example.com/jobs/123"
        assert normalize_job_url(url1) == normalize_job_url(url2)

    def test_normalize_preserves_job_params(self):
        """Test that job-specific params are preserved."""
        url = "https://example.com/jobs?category=engineering&location=remote"
        normalized = normalize_job_url(url)
        assert "category=engineering" in normalized
        assert "location=remote" in normalized
        # Should be sorted alphabetically
        assert normalized.index("category") < normalized.index("location")


class TestPathCaseLowering:
    """Test that URL path is lowercased for ATS dedup."""

    def test_ashby_path_case_convergence(self):
        """Jerry.ai vs jerry.ai in Ashby URL paths should converge."""
        url1 = "https://jobs.ashbyhq.com/Jerry.ai/abc-123"
        url2 = "https://jobs.ashbyhq.com/jerry.ai/abc-123"
        assert normalize_url(url1) == normalize_url(url2)

    def test_greenhouse_path_case(self):
        """Greenhouse path case differences should converge."""
        url1 = "https://boards.greenhouse.io/CompanyName/jobs/12345"
        url2 = "https://boards.greenhouse.io/companyname/jobs/12345"
        assert normalize_url(url1) == normalize_url(url2)

    def test_mixed_case_path_segments(self):
        """Path with mixed case should be lowered."""
        url = "https://example.com/Jobs/Senior-Engineer_123"
        normalized = normalize_url(url)
        assert "/jobs/senior-engineer_123" in normalized

    def test_preserves_query_param_values(self):
        """Query parameter values should NOT be lowercased."""
        url = "https://example.com/jobs?token=AbCdEf"
        normalized = normalize_url(url)
        assert "AbCdEf" in normalized


class TestContentFingerprint:
    """Test content-based fingerprinting for semantic dedup."""

    def test_same_content_same_fingerprint(self):
        """Identical content should produce the same fingerprint."""
        fp1 = compute_content_fingerprint("Software Engineer", "Acme", "Build things")
        fp2 = compute_content_fingerprint("Software Engineer", "Acme", "Build things")
        assert fp1 == fp2

    def test_different_title_different_fingerprint(self):
        """Different titles should produce different fingerprints."""
        fp1 = compute_content_fingerprint("Software Engineer", "Acme", "Build things")
        fp2 = compute_content_fingerprint("Product Manager", "Acme", "Build things")
        assert fp1 != fp2

    def test_title_punctuation_convergence(self):
        """'Full-Stack' and 'Full Stack' should produce the same fingerprint."""
        fp1 = compute_content_fingerprint("Senior Software Engineer (Full-Stack)", "Jerry", "desc")
        fp2 = compute_content_fingerprint("Senior Software Engineer (Full Stack)", "Jerry", "desc")
        assert fp1 == fp2

    def test_company_domain_suffix_convergence(self):
        """'Jerry.ai' and 'Jerry' should produce the same fingerprint."""
        fp1 = compute_content_fingerprint("Software Engineer", "Jerry.ai", "desc")
        fp2 = compute_content_fingerprint("Software Engineer", "Jerry", "desc")
        assert fp1 == fp2

    def test_company_case_convergence(self):
        """Company name case should not matter."""
        fp1 = compute_content_fingerprint("SWE", "CLOUDFLARE", "desc")
        fp2 = compute_content_fingerprint("SWE", "cloudflare", "desc")
        assert fp1 == fp2

    def test_description_prefix_used(self):
        """Only the first 500 chars of description should matter."""
        shared_prefix = "A" * 500
        fp1 = compute_content_fingerprint("SWE", "Co", shared_prefix + " Portland, OR")
        fp2 = compute_content_fingerprint("SWE", "Co", shared_prefix + " San Francisco, CA")
        assert fp1 == fp2

    def test_different_description_prefix(self):
        """Completely different descriptions should differ."""
        fp1 = compute_content_fingerprint("SWE", "Co", "We build widgets")
        fp2 = compute_content_fingerprint("SWE", "Co", "We sell insurance")
        assert fp1 != fp2

    def test_fingerprint_is_hex_sha256(self):
        """Fingerprint should be a 64-char hex string (SHA256)."""
        fp = compute_content_fingerprint("SWE", "Co", "desc")
        assert len(fp) == 64
        assert all(c in "0123456789abcdef" for c in fp)


class TestDeriveApplyUrl:
    """Test apply URL derivation for known ATS platforms."""

    def test_greenhouse_apply_url(self):
        """Greenhouse should append #app."""
        url = "https://boards.greenhouse.io/acme/jobs/12345"
        assert derive_apply_url(url) == "https://boards.greenhouse.io/acme/jobs/12345#app"

    def test_lever_apply_url(self):
        """Lever should append /apply."""
        url = "https://jobs.lever.co/acme/abc-123-def"
        assert derive_apply_url(url) == "https://jobs.lever.co/acme/abc-123-def/apply"

    def test_lever_already_has_apply(self):
        """Lever URL already ending in /apply should not double-append."""
        url = "https://jobs.lever.co/acme/abc-123-def/apply"
        assert derive_apply_url(url) == url

    def test_ashby_returns_same_url(self):
        """Ashby URLs are already the apply page."""
        url = "https://jobs.ashbyhq.com/acme/abc-123"
        assert derive_apply_url(url) == url

    def test_workable_apply_url(self):
        """Workable should append /apply."""
        url = "https://apply.workable.com/acme/j/ABC123"
        assert derive_apply_url(url) == "https://apply.workable.com/acme/j/ABC123/apply"

    def test_unknown_platform_returns_none(self):
        """Unknown platforms should return None."""
        assert derive_apply_url("https://careers.example.com/jobs/123") is None

    def test_empty_url_returns_none(self):
        """Empty URL should return None."""
        assert derive_apply_url("") is None
