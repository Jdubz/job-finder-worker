"""Tests for AI job matcher."""

from unittest.mock import Mock, patch

import pytest

from job_finder.ai.matcher import AIJobMatcher, JobMatchResult


@pytest.fixture(autouse=True)
def patch_text_limits(monkeypatch, tmp_path):
    """Provide default text limits without needing SQLITE_DB_PATH in tests."""
    monkeypatch.setattr(
        "job_finder.ai.matcher.get_text_limits",
        lambda: {"intakeTextLimit": 4000, "intakeFieldLimit": 500},
    )


@pytest.fixture
def mock_agent_manager():
    """Create a mock AgentManager."""
    manager = Mock()
    manager.execute.return_value = Mock(
        text='{"matched_skills": ["Python"], "missing_skills": ["Go"]}'
    )
    manager.generate = manager.execute  # alias for legacy tests
    return manager

@pytest.fixture
def mock_provider(mock_agent_manager):
    """Backward-compatible alias for agent manager-based provider."""
    return mock_agent_manager


# mock_profile and sample_job fixtures now provided by tests/conftest.py


class TestAIJobMatcherInit:
    """Test AI matcher initialization."""

    def test_init_stores_config(self, mock_agent_manager, mock_profile):
        """Test matcher stores configuration."""
        matcher = AIJobMatcher(
            agent_manager=mock_agent_manager,
            profile=mock_profile,
            min_match_score=80,
            generate_intake=True,
        )

        assert matcher.agent_manager == mock_agent_manager
        assert matcher.profile == mock_profile
        assert matcher.min_match_score == 80
        assert matcher.generate_intake is True

    def test_init_with_defaults(self, mock_agent_manager, mock_profile):
        """Test matcher initialization with default values."""
        matcher = AIJobMatcher(agent_manager=mock_agent_manager, profile=mock_profile)

        assert matcher.min_match_score == 50
        assert matcher.generate_intake is True


# NOTE: TestCalculateAdjustedScore removed during hybrid scoring migration.
# Scoring is now handled by ScoringEngine, not matcher._calculate_adjusted_score.
# See tests/scoring/test_engine.py for scoring tests.


class TestBuildMatchResult:
    """Test building match results."""

    def test_build_match_result(self, mock_agent_manager, mock_profile, sample_job):
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

        matcher = AIJobMatcher(agent_manager=mock_agent_manager, profile=mock_profile)
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

    def test_analyze_match_success(self, mock_agent_manager, mock_profile, sample_job):
        """Test successful match analysis."""
        mock_agent_manager.execute.return_value = Mock(
            text="""
            {
                "matched_skills": ["Python", "AWS"],
                "missing_skills": ["Go"]
            }
            """
        )

        matcher = AIJobMatcher(agent_manager=mock_agent_manager, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        assert analysis is not None
        assert "Python" in analysis["matched_skills"]
        mock_agent_manager.execute.assert_called_once()

    def test_analyze_match_propagates_ai_provider_error(
        self, mock_agent_manager, mock_profile, sample_job
    ):
        """Test that AIProviderError is re-raised instead of being caught.

        CRITICAL: AI infrastructure failures must bubble up to cause task FAILURE,
        not be silently swallowed and cause task to be SKIPPED.
        """
        from job_finder.exceptions import AIProviderError

        mock_agent_manager.execute.side_effect = AIProviderError("Codex CLI failed")

        matcher = AIJobMatcher(agent_manager=mock_agent_manager, profile=mock_profile)

        # Should raise AIProviderError, not return None
        with pytest.raises(AIProviderError, match="Codex CLI failed"):
            matcher._analyze_match(sample_job)

    def test_analyze_match_extracts_from_markdown(self, mock_agent_manager, mock_profile, sample_job):
        """Test JSON extraction from markdown code blocks."""
        mock_agent_manager.execute.return_value = Mock(
            text="""
            Here's the analysis:
            ```json
            {
                "matched_skills": ["Python"],
                "missing_skills": []
            }
            ```
            """
        )

        matcher = AIJobMatcher(agent_manager=mock_agent_manager, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        assert analysis is not None
        assert "Python" in analysis["matched_skills"]

    def test_analyze_match_handles_invalid_json(self, mock_agent_manager, mock_profile, sample_job):
        """Test handling of invalid JSON response."""
        mock_agent_manager.execute.return_value = Mock(text="This is not valid JSON")

        matcher = AIJobMatcher(agent_manager=mock_agent_manager, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        assert analysis is None

    def test_analyze_match_validates_required_fields(self, mock_agent_manager, mock_profile, sample_job):
        """Test validation of required fields in response."""
        mock_agent_manager.execute.return_value = Mock(
            text="""
            {
                "match_score": 85,
                "matched_skills": ["Python"]
            }
            """
        )

        matcher = AIJobMatcher(agent_manager=mock_agent_manager, profile=mock_profile)
        analysis = matcher._analyze_match(sample_job)

        # Missing required field (missing_skills)
        assert analysis is None


class TestGenerateIntakeData:
    """Test resume intake data generation."""

    def test_generate_intake_data_success(self, mock_agent_manager, mock_profile, sample_job):
        """Test successful intake data generation."""
        match_analysis = {"match_score": 85, "matched_skills": ["Python"]}
        mock_agent_manager.execute.return_value = Mock(
            text="""
            {
                "job_id": "123",
                "job_title": "Senior Engineer",
                "target_summary": "Experienced Python developer",
                "skills_priority": ["Python", "AWS"],
                "ats_keywords": ["Python", "Senior"]
            }
            """
        )

        matcher = AIJobMatcher(agent_manager=mock_agent_manager, profile=mock_profile)
        intake_data = matcher._generate_intake_data(sample_job, match_analysis)

        assert intake_data is not None
        assert intake_data["job_id"] == "123"
        assert "Python" in intake_data["skills_priority"]

    def test_generate_intake_data_propagates_ai_provider_error(
        self, mock_agent_manager, mock_profile, sample_job
    ):
        """Test that AIProviderError is re-raised instead of being caught.

        CRITICAL: AI infrastructure failures must bubble up to cause task FAILURE.
        """
        from job_finder.exceptions import AIProviderError

        match_analysis = {"match_score": 85, "matched_skills": ["Python"]}
        mock_agent_manager.execute.side_effect = AIProviderError("Codex CLI timed out")

        matcher = AIJobMatcher(agent_manager=mock_agent_manager, profile=mock_profile)

        # Should raise AIProviderError, not return None
        with pytest.raises(AIProviderError, match="Codex CLI timed out"):
            matcher._generate_intake_data(sample_job, match_analysis)

    def test_generate_intake_data_optimizes_size(self, mock_agent_manager, mock_profile, sample_job):
        """Test intake data size optimization is called."""
        match_analysis = {"match_score": 85}
        mock_agent_manager.execute.return_value = Mock(
            text="""
            {
                "job_id": "123",
                "job_title": "Engineer",
                "target_summary": "Test",
                "skills_priority": ["Python"],
                "ats_keywords": ["Python"]
            }
            """
        )

        matcher = AIJobMatcher(agent_manager=mock_agent_manager, profile=mock_profile)

        with patch.object(matcher, "_optimize_intake_data_size") as mock_optimize:
            mock_optimize.return_value = {"optimized": True}
            matcher._generate_intake_data(sample_job, match_analysis)

            mock_optimize.assert_called_once()


class TestOptimizeIntakeDataSize:
    """Test intake data size optimization."""

    def test_optimize_trims_long_strings(self, mock_provider, mock_profile):
        """Test long strings are trimmed."""
        matcher = AIJobMatcher(agent_manager=mock_provider, profile=mock_profile)

        long_text = "This is a very long string. " * 100
        intake_data = {"description": long_text}

        optimized = matcher._optimize_intake_data_size(intake_data)

        assert len(optimized["description"]) < len(long_text)

    def test_optimize_trims_long_lists(self, mock_provider, mock_profile):
        """Test long lists are trimmed."""
        matcher = AIJobMatcher(agent_manager=mock_provider, profile=mock_profile)

        long_list = [f"Skill {i}" for i in range(50)]
        intake_data = {"skills": long_list}

        optimized = matcher._optimize_intake_data_size(intake_data)

        assert len(optimized["skills"]) < len(long_list)

    def test_optimize_handles_nested_dicts(self, mock_provider, mock_profile):
        """Test optimization handles nested dictionaries."""
        matcher = AIJobMatcher(agent_manager=mock_provider, profile=mock_profile)

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
        mock_provider.execute.side_effect = [
            # First call: match analysis
            Mock(text='{"match_score": 60, "matched_skills": ["Python"], "missing_skills": []}'),
            # Second call: intake data
            Mock(
                text='{"job_id": "123", "job_title": "Engineer", '
                '"target_summary": "Test", "skills_priority": ["Python"], '
                '"ats_keywords": ["Python"]}'
            ),
        ]

        matcher = AIJobMatcher(
            agent_manager=mock_provider,
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
        mock_provider.execute.return_value = Mock(
            text='{"match_score": 85, "matched_skills": ["Python"], "missing_skills": []}'
        )

        matcher = AIJobMatcher(
            agent_manager=mock_provider,
            profile=mock_profile,
            min_match_score=80,
            generate_intake=True,
        )

        # No deterministic_score provided - should raise ValueError
        with pytest.raises(ValueError, match="missing required 'deterministic_score'"):
            matcher.analyze_job(sample_job)

    def test_analyze_job_below_threshold(self, mock_provider, mock_profile, sample_job):
        """Test job below threshold returns None."""
        mock_provider.execute.return_value = Mock(
            text="""
            {
                "match_score": 50,
                "matched_skills": ["Python"],
                "missing_skills": ["Go"]
            }
            """
        )

        matcher = AIJobMatcher(agent_manager=mock_provider, profile=mock_profile, min_match_score=80)

        # Deterministic score is below threshold
        job_with_score = {**sample_job, "deterministic_score": 50}
        result = matcher.analyze_job(job_with_score)

        assert result is None

    def test_analyze_job_without_intake_generation(self, mock_provider, mock_profile, sample_job):
        """Test job analysis without intake data generation."""
        mock_provider.execute.return_value = Mock(
            text="""
            {
                "match_score": 85,
                "matched_skills": ["Python"],
                "missing_skills": []
            }
            """
        )

        matcher = AIJobMatcher(
            agent_manager=mock_provider,
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

        matcher = AIJobMatcher(agent_manager=mock_provider, profile=mock_profile, min_match_score=80)

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
