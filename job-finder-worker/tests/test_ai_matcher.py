"""Tests for AI job matcher."""

from unittest.mock import Mock, patch

import pytest

from job_finder.ai.matcher import AIJobMatcher, JobMatchResult


@pytest.fixture
def mock_inference_client():
    """Create a mock InferenceClient."""
    client = Mock()
    client.execute.return_value = Mock(
        text='{"matched_skills": ["Python"], "missing_skills": ["Go"]}'
    )
    client.generate = client.execute  # alias for legacy tests
    return client


@pytest.fixture
def mock_provider(mock_inference_client):
    """Backward-compatible alias for inference client-based provider."""
    return mock_inference_client


# mock_profile and sample_job fixtures now provided by tests/conftest.py


class TestAIJobMatcherInit:
    """Test AI matcher initialization."""

    def test_init_stores_config(self, mock_inference_client, mock_profile):
        """Test matcher stores configuration."""
        matcher = AIJobMatcher(
            agent_manager=mock_inference_client,
            profile=mock_profile,
            min_match_score=80,
        )

        assert matcher.agent_manager == mock_inference_client
        assert matcher.profile == mock_profile
        assert matcher.min_match_score == 80

    def test_init_with_defaults(self, mock_inference_client, mock_profile):
        """Test matcher initialization with default values."""
        matcher = AIJobMatcher(agent_manager=mock_inference_client, profile=mock_profile)

        assert matcher.min_match_score == 50


# NOTE: TestCalculateAdjustedScore removed during hybrid scoring migration.
# Scoring is now handled by ScoringEngine, not matcher._calculate_adjusted_score.
# See tests/scoring/test_engine.py for scoring tests.


class TestBuildMatchResult:
    """Test building match results."""

    def test_build_match_result(self, mock_inference_client, mock_profile, sample_job):
        """Test building match result from analysis."""
        match_analysis = {
            "matched_skills": ["Python", "AWS"],
            "missing_skills": ["Go"],
            "experience_match": "Good fit",
            "key_strengths": ["Backend experience"],
            "potential_concerns": ["No Go experience"],
            "customization_recommendations": {"focus": "backend"},
        }
        intake_data = {"job_id": "123", "target_summary": "Test summary"}

        matcher = AIJobMatcher(agent_manager=mock_inference_client, profile=mock_profile)
        result = matcher._build_match_result(sample_job, match_analysis, 90, intake_data)

        assert isinstance(result, JobMatchResult)
        assert result.job_title == "Senior Software Engineer"
        assert result.job_company == "Test Company"
        assert result.job_url == "https://test.com/job/123"
        assert result.match_score == 90
        assert result.matched_skills == ["Python", "AWS"]
        assert result.missing_skills == ["Go"]
        assert result.resume_intake_data == intake_data


class TestAnalyzeMatch:
    """Test AI match analysis."""

    def test_analyze_match_success(self, mock_inference_client, mock_profile, sample_job):
        """Test successful match analysis."""
        mock_inference_client.execute.return_value = Mock(text="""
            {
                "matched_skills": ["Python", "AWS"],
                "missing_skills": ["Go"]
            }
            """)

        matcher = AIJobMatcher(agent_manager=mock_inference_client, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        assert analysis is not None
        assert "Python" in analysis["matched_skills"]
        mock_inference_client.execute.assert_called_once()

    def test_analyze_match_propagates_ai_provider_error(
        self, mock_inference_client, mock_profile, sample_job
    ):
        """Test that AIProviderError is re-raised instead of being caught.

        CRITICAL: AI infrastructure failures must bubble up to cause task FAILURE,
        not be silently swallowed and cause task to be SKIPPED.
        """
        from job_finder.exceptions import AIProviderError

        mock_inference_client.execute.side_effect = AIProviderError("Claude CLI failed")

        matcher = AIJobMatcher(agent_manager=mock_inference_client, profile=mock_profile)

        # Should raise AIProviderError, not return None
        with pytest.raises(AIProviderError, match="Claude CLI failed"):
            matcher._analyze_match(sample_job)

    def test_analyze_match_extracts_from_markdown(
        self, mock_inference_client, mock_profile, sample_job
    ):
        """Test JSON extraction from markdown code blocks."""
        mock_inference_client.execute.return_value = Mock(text="""
            Here's the analysis:
            ```json
            {
                "matched_skills": ["Python"],
                "missing_skills": []
            }
            ```
            """)

        matcher = AIJobMatcher(agent_manager=mock_inference_client, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        assert analysis is not None
        assert "Python" in analysis["matched_skills"]

    def test_analyze_match_handles_invalid_json(
        self, mock_inference_client, mock_profile, sample_job
    ):
        """Test handling of invalid JSON response."""
        mock_inference_client.execute.return_value = Mock(text="This is not valid JSON")

        matcher = AIJobMatcher(agent_manager=mock_inference_client, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        assert analysis is None

    def test_analyze_match_corrects_shape_on_missing_fields(
        self, mock_inference_client, mock_profile, sample_job
    ):
        """Test that missing required fields trigger a shape correction call."""
        # First call returns wrong keys, second call (correction) returns right keys
        mock_inference_client.execute.side_effect = [
            Mock(text='{"match_score": 85, "skills_matched": ["Python"], "skills_gaps": ["Go"]}'),
            Mock(text='{"matched_skills": ["Python"], "missing_skills": ["Go"]}'),
        ]

        matcher = AIJobMatcher(agent_manager=mock_inference_client, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        assert analysis is not None
        assert analysis["matched_skills"] == ["Python"]
        assert analysis["missing_skills"] == ["Go"]
        assert mock_inference_client.execute.call_count == 2


class TestAnalyzeJob:
    """Test complete job analysis flow.

    Note: Scoring is handled by the deterministic ScoringEngine.
    The matcher REQUIRES 'deterministic_score' from the job dict - no fallback.
    """

    def test_analyze_job_uses_deterministic_score(self, mock_provider, mock_profile, sample_job):
        """Test that analyze_job uses deterministic_score and returns single-call result."""
        mock_provider.execute.return_value = Mock(
            text='{"match_score": 60, "matched_skills": ["Python"], "missing_skills": []}'
        )

        matcher = AIJobMatcher(
            agent_manager=mock_provider,
            profile=mock_profile,
            min_match_score=80,
        )

        # Provide deterministic score that's above threshold
        job_with_score = {**sample_job, "deterministic_score": 90}
        result = matcher.analyze_job(job_with_score)

        assert result is not None
        assert result.match_score == 90
        assert result.resume_intake_data is None

    def test_analyze_job_requires_deterministic_score(
        self, mock_provider, mock_profile, sample_job
    ):
        """Test that analyze_job raises ValueError when deterministic_score is missing."""
        mock_provider.execute.return_value = Mock(
            text='{"match_score": 85, "matched_skills": ["Python"], "missing_skills": []}'
        )

        matcher = AIJobMatcher(
            agent_manager=mock_provider,
            profile=mock_profile,
            min_match_score=80,
        )

        # No deterministic_score provided - should raise ValueError
        with pytest.raises(ValueError, match="missing required 'deterministic_score'"):
            matcher.analyze_job(sample_job)

    def test_analyze_job_below_threshold(self, mock_provider, mock_profile, sample_job):
        """Test job below threshold returns None."""
        mock_provider.execute.return_value = Mock(text="""
            {
                "match_score": 50,
                "matched_skills": ["Python"],
                "missing_skills": ["Go"]
            }
            """)

        matcher = AIJobMatcher(
            agent_manager=mock_provider, profile=mock_profile, min_match_score=80
        )

        # Deterministic score is below threshold
        job_with_score = {**sample_job, "deterministic_score": 50}
        result = matcher.analyze_job(job_with_score)

        assert result is None

    def test_analyze_job_single_call_pipeline(self, mock_provider, mock_profile, sample_job):
        """Analysis should issue exactly one AI call and no intake call."""
        mock_provider.execute.return_value = Mock(
            text='{"matched_skills": ["Python"], "missing_skills": []}'
        )

        matcher = AIJobMatcher(
            agent_manager=mock_provider,
            profile=mock_profile,
            min_match_score=70,
        )

        job_with_score = {**sample_job, "deterministic_score": 75}
        result = matcher.analyze_job(job_with_score)

        assert result is not None
        mock_provider.execute.assert_called_once()

    def test_analyze_job_handles_analysis_failure(self, mock_provider, mock_profile, sample_job):
        """Test handling of analysis failure returns None."""
        mock_provider.generate.return_value = "Invalid JSON"

        matcher = AIJobMatcher(agent_manager=mock_provider, profile=mock_profile)
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

        matcher = AIJobMatcher(
            agent_manager=mock_provider, profile=mock_profile, min_match_score=80
        )

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

    def test_validates_score_range(self):
        """Test score validation (0-100)."""
        with pytest.raises(Exception):  # Pydantic validation error
            JobMatchResult(
                job_title="Engineer",
                job_company="Test Co",
                job_url="https://test.com/job",
                match_score=150,  # Invalid: > 100
            )
