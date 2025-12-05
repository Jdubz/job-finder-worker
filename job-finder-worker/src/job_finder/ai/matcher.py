"""AI-powered job matching and intake data generation.

This module focuses on AI-powered analysis for:
- Skill matching and gap analysis
- Experience matching
- Resume intake data generation

Scoring is now handled by the deterministic ScoringEngine, not this module.
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from typing import TYPE_CHECKING

from job_finder.ai.prompts import JobMatchPrompts
from job_finder.ai.response_parser import extract_json_from_response
from job_finder.exceptions import AIProviderError
from job_finder.profile.schema import Profile
from job_finder.settings import get_text_limits

if TYPE_CHECKING:
    from job_finder.ai.agent_manager import AgentManager

logger = logging.getLogger(__name__)


class ScoreBreakdown(BaseModel):
    """Breakdown of how the match score was calculated."""

    base_score: int = Field(..., description="Initial score from AI analysis")
    final_score: int = Field(..., description="Final score after adjustments")
    adjustments: List[str] = Field(
        default_factory=list, description="List of score adjustments applied"
    )


class JobMatchResult(BaseModel):
    """Result of AI job matching analysis."""

    # Job Info
    job_title: str
    job_company: str
    job_url: str
    location: Optional[str] = None
    salary_range: Optional[str] = None
    company_info: Optional[str] = None

    # Match Analysis
    match_score: int = Field(..., ge=0, le=100, description="Overall match score (0-100)")
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    experience_match: str = ""
    key_strengths: List[str] = Field(default_factory=list)
    match_reasons: List[str] = Field(default_factory=list)
    potential_concerns: List[str] = Field(default_factory=list)

    # Score breakdown showing the math behind the final score
    score_breakdown: Optional[ScoreBreakdown] = None

    # Customization Guidance
    customization_recommendations: Dict[str, Any] = Field(default_factory=dict)

    # Resume Intake Data (for resume generator)
    resume_intake_data: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return self.model_dump()


class AIJobMatcher:
    """AI-powered job matcher that analyzes jobs and generates resume intake data."""

    DEFAULT_COMPANY_WEIGHTS: Dict[str, Any] = {
        "bonuses": {"remoteFirst": 15, "aiMlFocus": 10},
        "sizeAdjustments": {
            "largeCompanyBonus": 10,
            "smallCompanyPenalty": -5,
            "largeCompanyThreshold": 10000,
            "smallCompanyThreshold": 100,
        },
        "timezoneAdjustments": {
            "sameTimezone": 5,
            "diff1to2hr": -2,
            "diff3to4hr": -5,
            "diff5to8hr": -10,
            "diff9plusHr": -15,
        },
        "priorityThresholds": {"high": 85, "medium": 70},
    }

    def __init__(
        self,
        agent_manager: "AgentManager",
        profile: Profile,
        min_match_score: int = 50,
        generate_intake: bool = True,
        company_weights: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize AI job matcher.

        The matcher handles AI-powered analysis for skills, experience, and intake data.
        Scoring is handled by the deterministic ScoringEngine (see scoring/engine.py).

        Args:
            agent_manager: AgentManager for executing AI tasks.
            profile: User profile for matching context.
            min_match_score: Minimum score threshold (from deterministic scoring).
            generate_intake: Whether to generate resume intake data.
            company_weights: Weights for priority thresholds only.
        """
        self.agent_manager = agent_manager
        self.profile = profile
        self.min_match_score = min_match_score
        self.generate_intake = generate_intake
        self.company_weights = company_weights or self.DEFAULT_COMPANY_WEIGHTS
        self.prompts = JobMatchPrompts()

    def analyze_job(
        self,
        job: Dict[str, Any],
        return_below_threshold: bool = False,
    ) -> Optional[JobMatchResult]:
        """
        Analyze a single job posting against the profile.

        Args:
            job: Job posting dictionary with keys: title, company, location, description, url.
                 Must include 'deterministic_score' from ScoringEngine.
            return_below_threshold: If True, return results even if below min score.

        Returns:
            JobMatchResult if successful, None if analysis fails.
        """
        # Dev/CI shortcut: allow stubbed match results without hitting external AI.
        if os.environ.get("DISABLE_AI_MATCHER") == "1":
            return JobMatchResult(
                job_title=job.get("title", "Unknown"),
                job_company=job.get("company", "Unknown"),
                job_url=job.get("url", ""),
                match_score=max(self.min_match_score, 90),
                matched_skills=job.get("skills", []) or ["python", "queueing"],
                missing_skills=[],
                experience_match="auto-stub",
                key_strengths=["stubbed matcher"],
                match_reasons=["DISABLE_AI_MATCHER=1"],
                potential_concerns=[],
                customization_recommendations={},
            )

        try:
            # Step 1: Analyze job match with AI (for reasoning, skills, concerns)
            logger.info(f"Analyzing job: {job.get('title')} at {job.get('company')}")
            match_analysis = self._analyze_match(job)

            if not match_analysis:
                logger.warning(f"Failed to analyze job: {job.get('title')}")
                return None

            # Step 2: Get deterministic score (required - no legacy fallback)
            deterministic_score = job.get("deterministic_score")
            if deterministic_score is None:
                raise ValueError(
                    f"Job '{job.get('title')}' missing required 'deterministic_score'. "
                    "All jobs must be scored by ScoringEngine before AI analysis."
                )
            match_score = int(deterministic_score)

            # Build score breakdown
            score_breakdown = ScoreBreakdown(
                base_score=match_score,
                final_score=match_score,
                adjustments=["Score from deterministic scoring engine"],
            )

            # Step 3: Check if score meets minimum threshold
            below_threshold = match_score < self.min_match_score
            if below_threshold and not return_below_threshold:
                logger.info(
                    f"Job {job.get('title')} scored {match_score}, "
                    f"below threshold {self.min_match_score}"
                )
                return None

            # Step 4: Generate resume intake data if enabled
            intake_data = None
            if self.generate_intake and (not below_threshold or return_below_threshold):
                intake_data = self._generate_intake_data(job, match_analysis)

            # Step 5: Build and return result
            result = self._build_match_result(
                job, match_analysis, match_score, intake_data, score_breakdown
            )

            logger.info(f"Successfully analyzed {job.get('title')} - Score: {match_score}")
            return result

        except Exception as e:
            logger.error(f"Error analyzing job {job.get('title', 'unknown')}: {str(e)}")
            raise

    def _build_match_result(
        self,
        job: Dict[str, Any],
        match_analysis: Dict[str, Any],
        match_score: int,
        intake_data: Optional[Dict[str, Any]],
        score_breakdown: Optional[ScoreBreakdown] = None,
    ) -> JobMatchResult:
        """
        Build JobMatchResult from job data and analysis.

        Args:
            job: Job posting dictionary
            match_analysis: Match analysis from AI
            match_score: Adjusted match score
            intake_data: Resume intake data (optional)
            score_breakdown: Breakdown of score calculation (optional)

        Returns:
            JobMatchResult object
        """
        # Normalize skills arrays - AI may return dicts like {"skill": "Python", "proficiency": "Advanced"}
        matched_skills = self._normalize_skills_array(match_analysis.get("matched_skills", []))
        missing_skills = self._normalize_skills_array(match_analysis.get("missing_skills", []))

        return JobMatchResult(
            job_title=job.get("title", ""),
            job_company=job.get("company", ""),
            job_url=job.get("url", ""),
            location=job.get("location"),
            salary_range=job.get("salary") or job.get("salary_range"),
            company_info=job.get("company_info"),
            match_score=match_score,
            matched_skills=matched_skills,
            missing_skills=missing_skills,
            experience_match=match_analysis.get("experience_match", ""),
            key_strengths=match_analysis.get("key_strengths", []),
            match_reasons=match_analysis.get("match_reasons", []),
            potential_concerns=match_analysis.get("potential_concerns", []),
            score_breakdown=score_breakdown,
            customization_recommendations=match_analysis.get("customization_recommendations", {}),
            resume_intake_data=intake_data,
        )

    @staticmethod
    def _normalize_skills_array(skills: List[Any]) -> List[str]:
        """
        Normalize a skills array to a list of strings.

        AI may return skills as objects like {"skill": "Python", "proficiency": "Advanced"}
        instead of simple strings. This method extracts just the skill names.

        Args:
            skills: List of skills (strings or dicts), or None

        Returns:
            List of skill name strings
        """
        if not skills or not isinstance(skills, list):
            return []

        result = []
        for item in skills:
            if isinstance(item, str):
                result.append(item)
            elif isinstance(item, dict):
                # Extract skill name from common dict formats
                skill_name = item.get("skill") or item.get("name") or item.get("technology")
                if skill_name and isinstance(skill_name, str):
                    result.append(skill_name)
        return result

    def analyze_jobs(self, jobs: List[Dict[str, Any]]) -> List[JobMatchResult]:
        """
        Analyze multiple job postings.

        Args:
            jobs: List of job posting dictionaries.

        Returns:
            List of JobMatchResult objects for jobs that meet the threshold.
        """
        results = []

        for job in jobs:
            result = self.analyze_job(job)
            if result:
                results.append(result)

        logger.info(
            f"Analyzed {len(jobs)} jobs, {len(results)} met threshold of {self.min_match_score}"
        )
        return results

    def _analyze_match(self, job: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Internal method to analyze job match using AI.

        Args:
            job: Job posting dictionary.

        Returns:
            Dictionary with match analysis, or None if failed.
        """
        response = None
        try:
            prompt = self.prompts.analyze_job_match(self.profile, job)

            # Use AgentManager for AI execution (analysis task type)
            result = self.agent_manager.execute(
                task_type="analysis",
                prompt=prompt,
                max_tokens=4096,
                temperature=0.3,
            )
            response = result.text

            # Parse JSON response (handles markdown code blocks)
            json_str = extract_json_from_response(response)
            analysis = self._safe_parse_json(json_str)

            # Validate required fields
            # NOTE: match_score and application_priority are NOT required from AI
            # Scoring is deterministic; priority is derived from score
            required_fields = [
                "matched_skills",
                "missing_skills",
            ]
            missing_fields = [field for field in required_fields if field not in analysis]
            if missing_fields:
                logger.error(f"AI response missing required fields: {missing_fields}")
                logger.debug(f"Response was: {response[:500]}...")
                return None

            return analysis

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {str(e)}")
            logger.error(
                f"Raw response (first 500 chars): {response[:500] if response else 'None'}..."
            )
            return None
        except Exception as e:
            # Re-raise AIProviderError so infrastructure failures bubble up
            # and cause the task to FAIL (not be silently skipped)
            if isinstance(e, AIProviderError):
                logger.error(f"AI provider error during match analysis: {str(e)}")
                raise  # Let caller handle - this should FAIL the task
            # For other unexpected errors, log and return None
            logger.error(f"Error during match analysis: {str(e)}", exc_info=True)
            return None

    def _safe_parse_json(self, text: str) -> Dict[str, Any]:
        """Parse JSON with a fallback that strips non-JSON pre/postamble."""
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Fallback: try to extract the first {...} block
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(text[start : end + 1])
                except json.JSONDecodeError:
                    pass
            raise

    def _generate_intake_data(
        self, job: Dict[str, Any], match_analysis: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Internal method to generate resume intake data using AI.

        Args:
            job: Job posting dictionary.
            match_analysis: Previous match analysis results.

        Returns:
            Dictionary with resume intake data, or None if failed.
        """
        response = None
        try:
            prompt = self.prompts.generate_resume_intake_data(self.profile, job, match_analysis)

            # Use AgentManager for AI execution (analysis task type)
            result = self.agent_manager.execute(
                task_type="analysis",
                prompt=prompt,
                max_tokens=4096,
                temperature=0.4,  # Slightly higher for creative intake data
            )
            response = result.text

            # Parse JSON response (handles markdown code blocks)
            json_str = extract_json_from_response(response)
            intake_data = self._safe_parse_json(json_str)

            # Validate required fields
            required_fields = [
                "job_id",
                "job_title",
                "target_summary",
                "skills_priority",
                "ats_keywords",
            ]
            missing_fields = [field for field in required_fields if field not in intake_data]
            if missing_fields:
                logger.warning(f"Intake data missing optional fields: {missing_fields}")

            # Intelligently reduce field sizes if they're too large
            intake_data = self._optimize_intake_data_size(intake_data)

            logger.info(f"Generated intake data for {job.get('title')}")
            return intake_data

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse intake data response as JSON: {str(e)}")
            logger.error(
                f"Raw response (first 500 chars): {response[:500] if response else 'None'}..."
            )
            return None
        except Exception as e:
            # Re-raise AIProviderError so infrastructure failures bubble up
            if isinstance(e, AIProviderError):
                logger.error(f"AI provider error generating intake data: {str(e)}")
                raise  # Let caller handle - this should FAIL the task
            logger.error(f"Error generating intake data: {str(e)}", exc_info=True)
            return None

    def _optimize_intake_data_size(self, intake_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Intelligently reduce the size of intake data fields by removing unnecessary
        information and consolidating content. Applies to ALL large fields generically.

        Args:
            intake_data: Resume intake data dictionary

        Returns:
            Optimized intake data with reduced field sizes
        """
        import re

        # Get text limits from config
        text_limits = get_text_limits()
        max_intake_text = text_limits.get("maxIntakeTextLength", 500)
        max_intake_desc = text_limits.get("maxIntakeDescriptionLength", 2000)
        max_intake_field = text_limits.get("maxIntakeFieldLength", 400)
        max_text_optimization = 100  # Only optimize strings longer than this

        def clean_text(text: str, max_length: int = max_intake_text) -> str:
            """Clean and truncate text intelligently."""
            if not text or len(text) <= max_length:
                return text

            # Remove excessive whitespace
            text = re.sub(r"\s+", " ", text).strip()

            # Remove redundant phrases
            redundant_phrases = [
                r"\b(please|kindly|simply|just|really|very|quite|rather)\b",
                r"\b(note that|it is important to|make sure to)\b",
            ]
            for phrase in redundant_phrases:
                text = re.sub(phrase, "", text, flags=re.IGNORECASE)

            # Clean up extra spaces after removal
            text = re.sub(r"\s+", " ", text).strip()

            # If still too long, truncate at sentence boundary
            if len(text) > max_length:
                # Try to cut at last complete sentence
                truncated = text[:max_length]
                last_period = truncated.rfind(".")
                last_semicolon = truncated.rfind(";")
                cut_point = max(last_period, last_semicolon)

                if cut_point > max_length * 0.7:  # At least 70% of target length
                    text = text[: cut_point + 1].strip()
                else:
                    text = truncated.strip() + "..."

            return text

        def trim_list(
            items: List[str], max_items: int = 20, max_item_length: int = 100
        ) -> List[str]:
            """Trim list to reasonable size and clean each item."""
            if not items:
                return items

            # Take only first max_items
            trimmed = items[:max_items]

            # Clean each item
            cleaned = []
            for item in trimmed:
                if isinstance(item, str):
                    # Remove excess whitespace
                    item = re.sub(r"\s+", " ", item).strip()
                    # Truncate very long items
                    if len(item) > max_item_length:
                        item = item[:max_item_length].strip() + "..."
                    cleaned.append(item)
                else:
                    cleaned.append(item)

            return cleaned

        def optimize_value(value: Any, key: str) -> Any:
            """Recursively optimize any value based on its type and size."""
            if isinstance(value, str):
                # Apply different limits based on field purpose
                if (
                    len(value) > max_text_optimization
                ):  # Only optimize strings that are actually large
                    if "description" in key.lower():
                        return clean_text(
                            value, max_length=max_intake_desc
                        )  # Descriptions can be longer
                    elif "summary" in key.lower():
                        return clean_text(value, max_length=max_intake_field)
                    else:
                        return clean_text(value, max_length=max_intake_text)
                return value

            elif isinstance(value, list):
                # Determine limits based on field name
                if "keyword" in key.lower() or "skill" in key.lower():
                    return trim_list(value, max_items=25, max_item_length=100)
                elif "highlight" in key.lower() or "achievement" in key.lower():
                    return trim_list(value, max_items=10, max_item_length=200)
                elif "project" in key.lower():
                    return trim_list(value, max_items=5, max_item_length=150)
                else:
                    return trim_list(value, max_items=15, max_item_length=100)

            elif isinstance(value, dict):
                # Recursively optimize nested dictionaries
                return {k: optimize_value(v, k) for k, v in value.items()}

            else:
                # Return non-text types as-is (numbers, booleans, None, etc.)
                return value

        # Recursively optimize all fields in the intake data
        optimized_data = {}
        for key, value in intake_data.items():
            optimized_data[key] = optimize_value(value, key)

        return optimized_data
