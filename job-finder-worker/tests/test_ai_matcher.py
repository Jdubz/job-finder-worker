"""Tests for AI job matcher."""

from unittest.mock import Mock, patch

import pytest

from job_finder.ai.matcher import AIJobMatcher, JobMatchResult


@pytest.fixture
def mock_provider():
    """Create a mock AI provider."""
    provider = Mock()
    provider.generate.return_value = (
        '{"match_score": 85, "matched_skills": ["Python"], '
        '"missing_skills": ["Go"], "application_priority": "High"}'
    )
    return provider


# mock_profile and sample_job fixtures now provided by tests/conftest.py


class TestAIJobMatcherInit:
    """Test AI matcher initialization."""

    def test_init_stores_config(self, mock_provider, mock_profile):
        """Test matcher stores configuration."""
        matcher = AIJobMatcher(
            provider=mock_provider,
            profile=mock_profile,
            min_match_score=80,
            generate_intake=True,
        )

        assert matcher.provider == mock_provider
        assert matcher.profile == mock_profile
        assert matcher.min_match_score == 80
        assert matcher.generate_intake is True

    def test_init_with_defaults(self, mock_provider, mock_profile):
        """Test matcher initialization with default values."""
        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)

        assert matcher.min_match_score == 50
        assert matcher.generate_intake is True


# NOTE: TestCalculateAdjustedScore removed during hybrid scoring migration.
# Scoring is now handled by ScoringEngine, not matcher._calculate_adjusted_score.
# See tests/scoring/test_engine.py for scoring tests.


class TestBuildMatchResult:
    """Test building match results."""

    def test_build_match_result(self, mock_provider, mock_profile, sample_job):
        """Test building match result from analysis."""
        match_analysis = {
            "match_score": 85,
            "matched_skills": ["Python", "AWS"],
            "missing_skills": ["Go"],
            "experience_match": "Good fit",
            "key_strengths": ["Backend experience"],
            "potential_concerns": ["No Go experience"],
            "application_priority": "High",
            "customization_recommendations": {"focus": "backend"},
        }
        intake_data = {"job_id": "123", "target_summary": "Test summary"}

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)
        result = matcher._build_match_result(sample_job, match_analysis, 90, intake_data)

        assert isinstance(result, JobMatchResult)
        assert result.job_title == "Senior Software Engineer"
        assert result.job_company == "Test Company"
        assert result.job_url == "https://test.com/job/123"
        assert result.match_score == 90
        assert result.matched_skills == ["Python", "AWS"]
        assert result.missing_skills == ["Go"]
        assert result.application_priority == "High"
        assert result.resume_intake_data == intake_data


class TestAnalyzeMatch:
    """Test AI match analysis."""

    def test_analyze_match_success(self, mock_provider, mock_profile, sample_job):
        """Test successful match analysis."""
        mock_provider.generate.return_value = """
        {
            "match_score": 85,
            "matched_skills": ["Python", "AWS"],
            "missing_skills": ["Go"],
            "application_priority": "High"
        }
        """

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        assert analysis is not None
        assert analysis["match_score"] == 85
        assert "Python" in analysis["matched_skills"]
        mock_provider.generate.assert_called_once()

    def test_analyze_match_propagates_ai_provider_error(
        self, mock_provider, mock_profile, sample_job
    ):
        """Test that AIProviderError is re-raised instead of being caught.

        CRITICAL: AI infrastructure failures must bubble up to cause task FAILURE,
        not be silently swallowed and cause task to be SKIPPED.
        """
        from job_finder.exceptions import AIProviderError

        mock_provider.generate.side_effect = AIProviderError("Codex CLI failed")

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)

        # Should raise AIProviderError, not return None
        with pytest.raises(AIProviderError, match="Codex CLI failed"):
            matcher._analyze_match(sample_job)

    def test_analyze_match_extracts_from_markdown(self, mock_provider, mock_profile, sample_job):
        """Test JSON extraction from markdown code blocks."""
        mock_provider.generate.return_value = """
        Here's the analysis:
        ```json
        {
            "match_score": 80,
            "matched_skills": ["Python"],
            "missing_skills": [],
            "application_priority": "High"
        }
        ```
        """

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        assert analysis is not None
        assert analysis["match_score"] == 80

    def test_analyze_match_handles_invalid_json(self, mock_provider, mock_profile, sample_job):
        """Test handling of invalid JSON response."""
        mock_provider.generate.return_value = "This is not valid JSON"

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        assert analysis is None

    def test_analyze_match_validates_required_fields(self, mock_provider, mock_profile, sample_job):
        """Test validation of required fields in response."""
        mock_provider.generate.return_value = """
        {
            "match_score": 85,
            "matched_skills": ["Python"]
        }
        """

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        # Missing required fields (missing_skills, application_priority)
        assert analysis is None


class TestGenerateIntakeData:
    """Test resume intake data generation."""

    def test_generate_intake_data_success(self, mock_provider, mock_profile, sample_job):
        """Test successful intake data generation."""
        match_analysis = {"match_score": 85, "matched_skills": ["Python"]}
        mock_provider.generate.return_value = """
        {
            "job_id": "123",
            "job_title": "Senior Engineer",
            "target_summary": "Experienced Python developer",
            "skills_priority": ["Python", "AWS"],
            "ats_keywords": ["Python", "Senior"]
        }
        """

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)
        intake_data = matcher._generate_intake_data(sample_job, match_analysis)

        assert intake_data is not None
        assert intake_data["job_id"] == "123"
        assert "Python" in intake_data["skills_priority"]

    def test_generate_intake_data_propagates_ai_provider_error(
        self, mock_provider, mock_profile, sample_job
    ):
        """Test that AIProviderError is re-raised instead of being caught.

        CRITICAL: AI infrastructure failures must bubble up to cause task FAILURE.
        """
        from job_finder.exceptions import AIProviderError

        match_analysis = {"match_score": 85, "matched_skills": ["Python"]}
        mock_provider.generate.side_effect = AIProviderError("Codex CLI timed out")

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)

        # Should raise AIProviderError, not return None
        with pytest.raises(AIProviderError, match="Codex CLI timed out"):
            matcher._generate_intake_data(sample_job, match_analysis)

    def test_generate_intake_data_optimizes_size(self, mock_provider, mock_profile, sample_job):
        """Test intake data size optimization is called."""
        match_analysis = {"match_score": 85}
        mock_provider.generate.return_value = """
        {
            "job_id": "123",
            "job_title": "Engineer",
            "target_summary": "Test",
            "skills_priority": ["Python"],
            "ats_keywords": ["Python"]
        }
        """

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)

        with patch.object(matcher, "_optimize_intake_data_size") as mock_optimize:
            mock_optimize.return_value = {"optimized": True}
            matcher._generate_intake_data(sample_job, match_analysis)

            mock_optimize.assert_called_once()


class TestOptimizeIntakeDataSize:
    """Test intake data size optimization."""

    def test_optimize_trims_long_strings(self, mock_provider, mock_profile):
        """Test long strings are trimmed."""
        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)

        long_text = "This is a very long string. " * 100
        intake_data = {"description": long_text}

        optimized = matcher._optimize_intake_data_size(intake_data)

        assert len(optimized["description"]) < len(long_text)

    def test_optimize_trims_long_lists(self, mock_provider, mock_profile):
        """Test long lists are trimmed."""
        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)

        long_list = [f"Skill {i}" for i in range(50)]
        intake_data = {"skills": long_list}

        optimized = matcher._optimize_intake_data_size(intake_data)

        assert len(optimized["skills"]) < len(long_list)

    def test_optimize_handles_nested_dicts(self, mock_provider, mock_profile):
        """Test optimization handles nested dictionaries."""
        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)

        intake_data = {
            "nested": {
                "description": "Short description",
                "keywords": ["A", "B", "C"],
            }
        }

        optimized = matcher._optimize_intake_data_size(intake_data)

        assert "nested" in optimized
        assert "description" in optimized["nested"]


class TestAnalyzeJob:
    """Test complete job analysis flow.

    Note: Scoring is handled by the deterministic ScoringEngine.
    The matcher REQUIRES 'deterministic_score' from the job dict - no fallback.
    """

    def test_analyze_job_uses_deterministic_score(self, mock_provider, mock_profile, sample_job):
        """Test that analyze_job uses deterministic_score."""
        mock_provider.generate.side_effect = [
            # First call: match analysis
            (
                '{"match_score": 60, "matched_skills": ["Python"], '
                '"missing_skills": [], "application_priority": "Medium"}'
            ),
            # Second call: intake data
            (
                '{"job_id": "123", "job_title": "Engineer", '
                '"target_summary": "Test", "skills_priority": ["Python"], '
                '"ats_keywords": ["Python"]}'
            ),
        ]

        matcher = AIJobMatcher(
            provider=mock_provider,
            profile=mock_profile,
            min_match_score=80,
            generate_intake=True,
        )

        # Provide deterministic score that's above threshold
        job_with_score = {**sample_job, "deterministic_score": 90}
        result = matcher.analyze_job(job_with_score)

        assert result is not None
        assert result.match_score == 90
        assert result.resume_intake_data is not None

    def test_analyze_job_requires_deterministic_score(
        self, mock_provider, mock_profile, sample_job
    ):
        """Test that analyze_job raises ValueError when deterministic_score is missing."""
        mock_provider.generate.return_value = (
            '{"match_score": 85, "matched_skills": ["Python"], '
            '"missing_skills": [], "application_priority": "High"}'
        )

        matcher = AIJobMatcher(
            provider=mock_provider,
            profile=mock_profile,
            min_match_score=80,
            generate_intake=True,
        )

        # No deterministic_score provided - should raise ValueError
        with pytest.raises(ValueError, match="missing required 'deterministic_score'"):
            matcher.analyze_job(sample_job)

    def test_analyze_job_below_threshold(self, mock_provider, mock_profile, sample_job):
        """Test job below threshold returns None."""
        mock_provider.generate.return_value = """
        {
            "match_score": 50,
            "matched_skills": ["Python"],
            "missing_skills": ["Go"],
            "application_priority": "Low"
        }
        """

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile, min_match_score=80)

        # Deterministic score is below threshold
        job_with_score = {**sample_job, "deterministic_score": 50}
        result = matcher.analyze_job(job_with_score)

        assert result is None

    def test_analyze_job_without_intake_generation(self, mock_provider, mock_profile, sample_job):
        """Test job analysis without intake data generation."""
        mock_provider.generate.return_value = """
        {
            "match_score": 85,
            "matched_skills": ["Python"],
            "missing_skills": [],
            "application_priority": "High"
        }
        """

        matcher = AIJobMatcher(
            provider=mock_provider,
            profile=mock_profile,
            min_match_score=80,
            generate_intake=False,
        )

        job_with_score = {**sample_job, "deterministic_score": 85}
        result = matcher.analyze_job(job_with_score)

        assert result is not None
        assert result.resume_intake_data is None

    def test_analyze_job_handles_analysis_failure(self, mock_provider, mock_profile, sample_job):
        """Test handling of analysis failure returns None."""
        mock_provider.generate.return_value = "Invalid JSON"

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile)
        job_with_score = {**sample_job, "deterministic_score": 85}
        result = matcher.analyze_job(job_with_score)

        assert result is None


class TestAnalyzeJobs:
    """Test batch job analysis."""

    def test_analyze_jobs_filters_by_threshold(self, mock_provider, mock_profile):
        """Test batch analysis filters jobs by threshold."""
        jobs = [
            {"title": "Job 1", "company": "A", "url": "url1", "description": "desc"},
            {"title": "Job 2", "company": "B", "url": "url2", "description": "desc"},
            {"title": "Job 3", "company": "C", "url": "url3", "description": "desc"},
        ]

        matcher = AIJobMatcher(provider=mock_provider, profile=mock_profile, min_match_score=80)

        # Mock analyze_job to return results for first two jobs only
        with patch.object(matcher, "analyze_job") as mock_analyze:
            mock_analyze.side_effect = [
                Mock(match_score=85),  # Pass
                None,  # Fail
                Mock(match_score=90),  # Pass
            ]

            results = matcher.analyze_jobs(jobs)

        assert len(results) == 2
        assert mock_analyze.call_count == 3


# NOTE: TestDetectWorkArrangement removed during hybrid scoring migration.
# Work arrangement detection is now handled by the AI extraction system.
# See tests/ai/test_extraction.py for extraction tests.


class TestJobMatchResultModel:
    """Test JobMatchResult Pydantic model."""

    def test_creates_with_required_fields(self):
        """Test creating result with required fields."""
        result = JobMatchResult(
            job_title="Engineer",
            job_company="Test Co",
            job_url="https://test.com/job",
            match_score=85,
        )

        assert result.job_title == "Engineer"
        assert result.match_score == 85
        assert result.matched_skills == []
        assert result.application_priority == "Medium"

    def test_validates_score_range(self):
        """Test score validation (0-100)."""
        with pytest.raises(Exception):  # Pydantic validation error
            JobMatchResult(
                job_title="Engineer",
                job_company="Test Co",
                job_url="https://test.com/job",
                match_score=150,  # Invalid: > 100
            )
