"""Tests for company name normalization utilities."""

from job_finder.utils.company_name_utils import (
    clean_company_name,
    normalize_company_name,
    normalize_title,
)


class TestNormalizeCompanyName:
    """Test company name normalization."""

    def test_removes_careers_suffix(self):
        """Should remove 'Careers' suffix."""
        assert normalize_company_name("Cloudflare Careers") == "cloudflare"
        assert normalize_company_name("Google Career") == "google"

    def test_removes_jobs_suffix(self):
        """Should remove 'Jobs' suffix."""
        assert normalize_company_name("Microsoft Jobs") == "microsoft"
        assert normalize_company_name("Apple Job") == "apple"

    def test_removes_legal_entity_suffixes(self):
        """Should remove legal entity suffixes."""
        assert normalize_company_name("Netflix Inc.") == "netflix"
        assert normalize_company_name("Amazon Corporation") == "amazon"
        assert normalize_company_name("Stripe LLC") == "stripe"
        assert normalize_company_name("Shopify Ltd") == "shopify"

    def test_removes_combined_suffixes(self):
        """Should handle multiple suffixes."""
        assert normalize_company_name("Datadog Inc. Careers") == "datadog"
        assert normalize_company_name("GitHub Corp Jobs") == "github"

    def test_handles_dash_separator(self):
        """Should remove dash-separated careers."""
        assert normalize_company_name("Spotify - Careers") == "spotify"
        assert normalize_company_name("Reddit | Careers") == "reddit"

    def test_case_insensitive(self):
        """Should convert to lowercase."""
        assert normalize_company_name("CLOUDFLARE") == "cloudflare"
        assert normalize_company_name("CloudFlare") == "cloudflare"

    def test_preserves_company_name(self):
        """Should preserve actual company name without suffixes."""
        assert normalize_company_name("Cloudflare") == "cloudflare"
        assert normalize_company_name("Google") == "google"
        assert normalize_company_name("Microsoft") == "microsoft"

    def test_handles_empty_string(self):
        """Should handle empty strings."""
        assert normalize_company_name("") == ""
        assert normalize_company_name("   ") == ""

    def test_removes_extra_whitespace(self):
        """Should normalize whitespace."""
        assert normalize_company_name("  Cloudflare  Careers  ") == "cloudflare"
        assert normalize_company_name("Google   Jobs") == "google"

    def test_deduplication_examples(self):
        """Test real-world deduplication scenarios."""
        # These should all normalize to the same value
        cloudflare_variants = [
            "Cloudflare",
            "cloudflare",
            "Cloudflare Careers",
            "Cloudflare Jobs",
            "Cloudflare Inc.",
            "Cloudflare, Inc.",
        ]

        normalized_values = [normalize_company_name(name) for name in cloudflare_variants]

        # All should be the same
        assert len(set(normalized_values)) == 1
        assert normalized_values[0] == "cloudflare"


class TestCleanCompanyName:
    """Test cleaning of display names (preserve casing)."""

    def test_strips_job_board_suffixes(self):
        assert clean_company_name("Cloudflare Careers") == "Cloudflare"
        assert clean_company_name("Stripe - Careers") == "Stripe"
        assert clean_company_name("GitHub | Careers") == "GitHub"

    def test_preserves_legal_suffixes(self):
        # Cleaning should only strip job-board fluff, not legal entities
        assert clean_company_name("Netflix Inc.") == "Netflix Inc."
        assert clean_company_name("Amazon LLC") == "Amazon LLC"

    def test_handles_whitespace_and_punctuation(self):
        assert clean_company_name("  Datadog Careers  ") == "Datadog"
        assert clean_company_name("Canva Careers,") == "Canva"

    def test_empty_input(self):
        assert clean_company_name("") == ""
        assert clean_company_name("   ") == ""

    def test_preserves_domain_suffixes(self):
        """clean_company_name should NOT strip .ai, .io, etc. — that's only for normalization."""
        assert clean_company_name("Jerry.ai") == "Jerry.ai"
        assert clean_company_name("Linear.app") == "Linear.app"


class TestDomainSuffixStripping:
    """Test that normalize_company_name strips domain-like suffixes."""

    def test_strips_ai_suffix(self):
        assert normalize_company_name("Jerry.ai") == "jerry"
        assert normalize_company_name("Jerry") == "jerry"

    def test_strips_io_suffix(self):
        assert normalize_company_name("Hasura.io") == "hasura"
        assert normalize_company_name("Hasura") == "hasura"

    def test_strips_com_suffix(self):
        assert normalize_company_name("Booking.com") == "booking"

    def test_strips_dev_suffix(self):
        assert normalize_company_name("Glitch.dev") == "glitch"

    def test_strips_app_suffix(self):
        assert normalize_company_name("Linear.app") == "linear"

    def test_strips_tech_suffix(self):
        assert normalize_company_name("Acme.tech") == "acme"

    def test_real_world_dedup_pairs(self):
        """Known duplicate pairs from production should converge."""
        assert normalize_company_name("Jerry") == normalize_company_name("Jerry.ai")

    def test_combined_with_legal_suffix(self):
        """Domain + legal suffix stripping should work together."""
        assert normalize_company_name("Jerry.ai Inc.") == "jerry"

    def test_combined_with_job_board_suffix(self):
        """Domain + job board suffix stripping should work together."""
        assert normalize_company_name("Jerry.ai Careers") == "jerry"


class TestNormalizeTitle:
    """Test job title normalization for fingerprinting."""

    def test_full_stack_hyphen_convergence(self):
        """'Full-Stack' and 'Full Stack' should converge."""
        assert normalize_title("Full-Stack Engineer") == normalize_title("Full Stack Engineer")

    def test_lowercases(self):
        assert normalize_title("Senior Software Engineer") == "senior software engineer"

    def test_collapses_whitespace(self):
        assert normalize_title("  ML / AI   Engineer  ") == "ml / ai engineer"

    def test_replaces_underscores(self):
        assert normalize_title("software_engineer") == "software engineer"

    def test_empty_input(self):
        assert normalize_title("") == ""
        assert normalize_title(None) == ""

    def test_real_world_title_variants(self):
        """Known title variants from production should converge."""
        v1 = normalize_title("Software Engineer II (Full Stack, Backend-leaning)")
        v2 = normalize_title("Software Engineer II (Full-Stack, Backend-leaning)")
        assert v1 == v2
