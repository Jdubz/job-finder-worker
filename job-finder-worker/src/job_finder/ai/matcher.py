"""AI-powered job matching and intake data generation."""

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from job_finder.ai.prompts import JobMatchPrompts
from job_finder.ai.providers import AIProvider
from job_finder.exceptions import AIProviderError
from job_finder.profile.schema import Profile
from job_finder.settings import get_text_limits
from job_finder.utils.company_size_utils import detect_company_size
from job_finder.utils.date_utils import calculate_freshness_adjustment, parse_job_date
from job_finder.utils.role_preference_utils import calculate_role_preference_adjustment
from job_finder.utils.timezone_utils import detect_timezone_for_job

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
    application_priority: str = "Medium"  # High/Medium/Low

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
        provider: AIProvider,
        profile: Profile,
        min_match_score: int = 50,
        generate_intake: bool = True,
        portland_office_bonus: int = 15,
        user_timezone: float = -8,
        prefer_large_companies: bool = True,
        config: Optional[Dict[str, Any]] = None,
        company_weights: Optional[Dict[str, Any]] = None,
        dealbreakers: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize AI job matcher.

        Args:
            provider: AI provider instance.
            profile: User profile for matching.
            min_match_score: Minimum score threshold for a job to be considered a match.
            generate_intake: Whether to generate resume intake data for matched jobs.
            portland_office_bonus: Bonus points to add for Portland, OR offices.
            user_timezone: User's timezone offset from UTC (default: -8).
            prefer_large_companies: Prefer large companies (default: True).
            config: Optional AI configuration dictionary (for model-specific settings).
        """
        self.provider = provider
        self.profile = profile
        self.min_match_score = min_match_score
        self.generate_intake = generate_intake
        self.portland_office_bonus = portland_office_bonus
        self.user_timezone = user_timezone
        self.prefer_large_companies = prefer_large_companies
        self.config = config or {}
        self.company_weights = company_weights or self.DEFAULT_COMPANY_WEIGHTS
        self.dealbreakers = dealbreakers or {
            "maxTimezoneDiffHours": 8,
            "perHourTimezonePenalty": 5,
            "hardTimezonePenalty": 60,
            "baseTimezoneOffset": -8,
            "requireRemote": False,
            "allowHybridInTimezone": True,
            "allowedOnsiteLocations": [],
            "allowedHybridLocations": [],
            "locationPenaltyPoints": 60,
            "relocationPenaltyPoints": 80,
            "ambiguousLocationPenaltyPoints": 40,
            "timezonePenaltyPoints": 40,
            "timezoneHardPenaltyPoints": 60,
        }
        self.prompts = JobMatchPrompts()

    def analyze_job(
        self,
        job: Dict[str, Any],
        has_portland_office: bool = False,
        return_below_threshold: bool = False,
    ) -> Optional[JobMatchResult]:
        """
        Analyze a single job posting against the profile.

        Args:
            job: Job posting dictionary with keys: title, company, location, description, url.
            has_portland_office: Whether the company has a Portland, OR office.

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
                application_priority="High",
                customization_recommendations={},
            )

        try:
            # Step 1: Analyze job match
            logger.info(f"Analyzing job: {job.get('title')} at {job.get('company')}")
            match_analysis = self._analyze_match(job)

            if not match_analysis:
                logger.warning(f"Failed to analyze job: {job.get('title')}")
                return None

            # Step 2: Apply score adjustments (location policy, Portland bonus, freshness, etc.)
            match_score, score_breakdown = self._calculate_adjusted_score(
                match_analysis, has_portland_office, job
            )

            # Step 3: Check if adjusted score meets minimum threshold
            below_threshold = match_score < self.min_match_score
            if below_threshold and not return_below_threshold:
                logger.info(
                    f"Job {job.get('title')} scored {match_score}, "
                    f"below threshold {self.min_match_score}"
                )
                return None

            # Step 4: Generate resume intake data if enabled (and worth keeping)
            intake_data = None
            if self.generate_intake and (not below_threshold or return_below_threshold):
                intake_data = self._generate_intake_data(job, match_analysis)

            # Step 5: Build and return result
            result = self._build_match_result(
                job, match_analysis, match_score, intake_data, score_breakdown
            )

            # If below threshold but caller wants data, downgrade priority to Low
            if below_threshold:
                result.application_priority = "Low"

            logger.info(
                f"Successfully analyzed {job.get('title')} - "
                f"Score: {match_score}, Priority: {result.application_priority}"
            )
            return result

        except Exception as e:
            logger.error(f"Error analyzing job {job.get('title', 'unknown')}: {str(e)}")
            raise

    def _detect_work_arrangement(self, description: str, location: str) -> Dict[str, bool]:
        """Infer remote/hybrid/onsite and relocation cues from text."""

        combined = f"{description} {location}".lower()

        is_remote = any(
            token in combined
            for token in (
                "fully remote",
                "100% remote",
                "remote position",
                "remote role",
                "remote job",
                "remote opportunity",
                "remote work",
                "remote only",
                "remote-only",
                "work from home",
                "work from anywhere",
                "wfh",
                "remote-first",
                "remote friendly",
                "remote-friendly",
                "remotely",
                "hiring remote",
            )
        ) or bool(re.search(r"\bremote\b", location, re.IGNORECASE))

        # Enforce precedence: remote > hybrid > onsite
        is_hybrid = False
        is_onsite = False

        if not is_remote:
            is_hybrid = any(
                token in combined for token in ("hybrid", "days in office", "office/remote")
            )
            if not is_hybrid:
                is_onsite = any(
                    token in combined
                    for token in ("on-site", "onsite", "in-office", "office-based")
                )

            # Concrete location with no explicit remote/hybrid cues -> assume onsite expectation
            if not is_onsite and location.strip():
                is_onsite = True

        relocation_required = any(
            token in combined
            for token in (
                "relocate",
                "relocation",
                "must be on-site",
                "must be onsite",
                "office in",
                "based in",
                "nyc-based",
                "sf-based",
            )
        )

        return {
            "remote": is_remote,
            "hybrid": is_hybrid,
            "onsite": is_onsite,
            "relocation_required": relocation_required,
        }

    def _calculate_adjusted_score(
        self, match_analysis: Dict[str, Any], has_portland_office: bool, job: Dict[str, Any]
    ) -> tuple[int, ScoreBreakdown]:
        """
        Calculate adjusted match score with bonuses and adjustments applied.

        Args:
            match_analysis: Raw match analysis from AI
            has_portland_office: Whether company has Portland, OR office
            job: Job dictionary with posted_date and other fields

        Returns:
            Tuple of (adjusted_score, ScoreBreakdown)
        """
        base_score = match_analysis.get("match_score", 0)
        match_score = base_score
        adjustments = []

        company_data = job.get("company_data") or {}
        weights = self.company_weights or {}
        bonuses = weights.get("bonuses", {})
        size_weights = weights.get("sizeAdjustments", {})
        tz_weights = weights.get("timezoneAdjustments", {})
        priority_thresholds = weights.get("priorityThresholds", {})

        # Apply location penalties/bonuses before other adjustments
        location_penalty, penalty_reason = self._calculate_location_penalty(job)
        if location_penalty != 0:
            match_score += location_penalty
            adjustments.append(penalty_reason)

        # Apply Portland office bonus
        if has_portland_office and self.portland_office_bonus > 0:
            match_score += self.portland_office_bonus
            adjustments.append(f"🏙️ Portland office: +{self.portland_office_bonus}")

        # Remote-first / AI/ML focus bonuses
        if company_data.get("isRemoteFirst"):
            bonus = bonuses.get("remoteFirst", 0)
            match_score += bonus
            if bonus:
                adjustments.append(f"🌐 Remote-first company: +{bonus}")

        if company_data.get("aiMlFocus"):
            bonus = bonuses.get("aiMlFocus", 0)
            match_score += bonus
            if bonus:
                adjustments.append(f"🤖 AI/ML focus: +{bonus}")

        # Apply freshness adjustment
        posted_date_str = job.get("posted_date", "")
        if posted_date_str:
            posted_date = parse_job_date(posted_date_str)
            freshness_adj = calculate_freshness_adjustment(posted_date)
            match_score += freshness_adj
            if freshness_adj > 0:
                adjustments.append(f"🆕 Fresh job: +{freshness_adj}")
            elif freshness_adj < 0:
                adjustments.append(f"📅 Job age: {freshness_adj}")
        else:
            # No date info penalty
            freshness_adj = calculate_freshness_adjustment(None)
            match_score += freshness_adj
            adjustments.append(f"❓ No date info: {freshness_adj}")

        # Detect company size
        company_name = job.get("company", "")
        company_info = job.get("company_info", "")
        job_description = job.get("description", "")
        employee_count = company_data.get("employeeCount")
        company_size = detect_company_size(company_name, company_info, job_description)

        # Apply timezone adjustment with smart detection
        job_location = job.get("location", "")
        headquarters_location = company_data.get("headquartersLocation", "")
        timezone_offset = company_data.get("timezoneOffset")
        if timezone_offset is None:
            job_timezone = detect_timezone_for_job(
                job_location=job_location,
                job_description=job_description,
                company_size=company_size,
                headquarters_location=headquarters_location,
                company_name=company_name,
                company_info=company_info,
            )
        else:
            # Ensure timezone_offset is numeric (may be stored as string in DB)
            try:
                job_timezone = float(timezone_offset)
            except (ValueError, TypeError):
                logger.warning(
                    f"Invalid timezoneOffset value: {timezone_offset}, falling back to detection"
                )
                job_timezone = detect_timezone_for_job(
                    job_location=job_location,
                    job_description=job_description,
                    company_size=company_size,
                    headquarters_location=headquarters_location,
                    company_name=company_name,
                    company_info=company_info,
                )

        if job_timezone is not None:
            hour_diff = abs(job_timezone - self.user_timezone)
            if hour_diff == 0:
                tz_adj = tz_weights.get("sameTimezone", 0)
                desc = "Same timezone"
            elif hour_diff <= 2:
                tz_adj = tz_weights.get("diff1to2hr", 0)
                desc = f"{hour_diff}h timezone difference"
            elif hour_diff <= 4:
                tz_adj = tz_weights.get("diff3to4hr", 0)
                desc = f"{hour_diff}h timezone difference"
            elif hour_diff <= 8:
                tz_adj = tz_weights.get("diff5to8hr", 0)
                desc = f"{hour_diff}h timezone difference"
            else:
                tz_adj = tz_weights.get("diff9plusHr", 0)
                desc = f"{hour_diff}h timezone difference"

            if tz_adj != 0:
                match_score += tz_adj
                adjustments.append(f"⏰ {desc} {tz_adj:+}")

            # Config-driven dealbreakers
            db = self.dealbreakers or {}
            max_diff = db.get("maxTimezoneDiffHours", 8)
            tz_hard_penalty = -abs(db.get("hardTimezonePenalty", db.get("timezoneHardPenaltyPoints", 60)))
            require_remote = bool(db.get("requireRemote", False))
            allow_hybrid = bool(db.get("allowHybridInTimezone", True))
            base_tz = db.get("baseTimezoneOffset", -8)
            per_hour_penalty = -abs(db.get("perHourTimezonePenalty", 5))

            applied_tz_penalty = False

            if require_remote:
                location_lower = (job_location or "").lower()
                if "onsite" in location_lower or ("hybrid" in location_lower and not allow_hybrid):
                    mismatch_penalty = -25
                    match_score += mismatch_penalty
                    adjustments.append("🚫 Dealbreaker: onsite requirement")
                    concerns = match_analysis.setdefault("potential_concerns", [])
                    concerns.append("Role requires onsite/hybrid but policy requires remote-only.")
                    match_analysis["application_priority"] = "Low"

            # Apply configurable Pacific-based penalty per hour difference
            pacific_diff = abs((job_timezone or 0) - base_tz)
            if pacific_diff > 0:
                penalty = int(round(per_hour_penalty * pacific_diff))
                if penalty != 0:
                    match_score += penalty
                    adjustments.append(f"⏰ Pacific offset {pacific_diff}h: {penalty}")

            if pacific_diff > max_diff and not applied_tz_penalty:
                mismatch_penalty = tz_hard_penalty
                match_score += mismatch_penalty
                adjustments.append(
                    f"🚫 Timezone/relocation dealbreaker ({desc or 'unknown location'}): {mismatch_penalty}"
                )
                concerns = match_analysis.setdefault("potential_concerns", [])
                concerns.append(
                    "Timezone mismatch: role appears far outside Pacific working window and candidate will not relocate."
                )
                match_analysis["application_priority"] = "Low"

        # Apply company size adjustment using weights
        size_adj = 0
        size_desc = ""
        large_bonus = size_weights.get("largeCompanyBonus", 0)
        small_penalty = size_weights.get("smallCompanyPenalty", 0)
        large_threshold = size_weights.get("largeCompanyThreshold", 10000)
        small_threshold = size_weights.get("smallCompanyThreshold", 100)

        if employee_count is not None:
            if employee_count >= large_threshold:
                size_adj = large_bonus
                size_desc = f"Large company (>= {large_threshold})"
            elif employee_count <= small_threshold:
                size_adj = small_penalty
                size_desc = f"Small company (<= {small_threshold})"
        else:
            # Fallback to detected size with preference toggle
            if company_size == "large":
                size_adj = large_bonus
                size_desc = "Large company"
            elif company_size == "small":
                size_adj = small_penalty
                size_desc = "Small company"
            # If prefer_large_companies flag is still relevant, apply neutral otherwise
            elif self.prefer_large_companies and company_size == "medium":
                size_adj = 0

        if size_adj != 0 and size_desc:
            match_score += size_adj
            adjustments.append(f"🏢 {size_desc} {size_adj:+}")

        # Apply role preference adjustment
        role_adj, role_desc = calculate_role_preference_adjustment(job.get("title", ""))
        if role_adj != 0:
            match_score += role_adj
            if role_adj > 0:
                adjustments.append(f"💻 {role_desc}")
            else:
                adjustments.append(f"👔 {role_desc}")

        # Clamp score to valid range (0-100)
        match_score = max(0, min(100, match_score))

        # Log adjustments if any were made
        if adjustments:
            logger.info(
                f"  Score adjustments: {', '.join(adjustments)} "
                f"(Base: {base_score} → Final: {match_score})"
            )

        # Recalculate priority tier based on adjusted score
        high_threshold = priority_thresholds.get("high", 75)
        med_threshold = priority_thresholds.get("medium", 50)
        if match_score >= high_threshold:
            priority = "High"
        elif match_score >= med_threshold:
            priority = "Medium"
        else:
            priority = "Low"

        # Override AI's priority with our calculated one (if score changed)
        if base_score != match_score:
            match_analysis["application_priority"] = priority

        breakdown = ScoreBreakdown(
            base_score=base_score,
            final_score=match_score,
            adjustments=adjustments,
        )

        return match_score, breakdown

    def _calculate_location_penalty(self, job: Dict[str, Any]) -> tuple[int, str]:
        """Return (penalty, reason) for location/onsite preference violations."""

        description = (job.get("description") or "").lower()
        location_raw = job.get("location") or ""
        location = location_raw.lower()
        arrangement = self._detect_work_arrangement(description, location)

        # Allowed local options for onsite/hybrid work
        allowed_onsite = [
            loc.lower() for loc in self.dealbreakers.get("allowedOnsiteLocations", [])
        ]
        allowed_hybrid = [
            loc.lower() for loc in self.dealbreakers.get("allowedHybridLocations", [])
        ] or allowed_onsite

        require_remote = bool(self.dealbreakers.get("requireRemote", False))
        base_penalty = -abs(self.dealbreakers.get("locationPenaltyPoints", 60))
        relocation_penalty = -abs(self.dealbreakers.get("relocationPenaltyPoints", 80))
        ambiguous_penalty = -abs(self.dealbreakers.get("ambiguousLocationPenaltyPoints", 40))

        def _matches(loc_value: str, allowlist: list[str]) -> bool:
            loc_value = (loc_value or "").lower()
            return any(re.search(rf"\b{re.escape(allowed)}\b", loc_value) for allowed in allowlist)

        # Remote and no relocation requirement: no penalty
        if arrangement["remote"] and not arrangement["relocation_required"]:
            return 0, ""

        # Relocation demand without clear allowed city (takes precedence)
        if arrangement["relocation_required"] and not _matches(location, allowed_onsite):
            return (
                relocation_penalty,
                f"🧳 Relocation required away from Portland: {relocation_penalty}",
            )

        # Hybrid handling
        if arrangement["hybrid"]:
            if require_remote:
                return base_penalty, "🏠 Remote required; hybrid not allowed"
            if not _matches(location, allowed_hybrid):
                return base_penalty, f"🏢 Hybrid outside Portland allowance: {base_penalty}"
            return 0, ""

        # Onsite handling
        if arrangement["onsite"]:
            if require_remote:
                return base_penalty, "🏠 Remote required; onsite role"
            if not _matches(location, allowed_onsite):
                return base_penalty, f"🏢 Onsite outside Portland allowance: {base_penalty}"
            return 0, ""

        # Ambiguous arrangement: penalize only if remote is mandatory
        if require_remote:
            return ambiguous_penalty, f"❓ Ambiguous remote support: {ambiguous_penalty}"

        return 0, ""

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
        return JobMatchResult(
            job_title=job.get("title", ""),
            job_company=job.get("company", ""),
            job_url=job.get("url", ""),
            location=job.get("location"),
            salary_range=job.get("salary") or job.get("salary_range"),
            company_info=job.get("company_info"),
            match_score=match_score,
            matched_skills=match_analysis.get("matched_skills", []),
            missing_skills=match_analysis.get("missing_skills", []),
            experience_match=match_analysis.get("experience_match", ""),
            key_strengths=match_analysis.get("key_strengths", []),
            match_reasons=match_analysis.get("match_reasons", []),
            potential_concerns=match_analysis.get("potential_concerns", []),
            application_priority=match_analysis.get("application_priority", "Medium"),
            score_breakdown=score_breakdown,
            customization_recommendations=match_analysis.get("customization_recommendations", {}),
            resume_intake_data=intake_data,
        )

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
        try:
            prompt = self.prompts.analyze_job_match(self.profile, job)

            # Get model-specific settings or use fallback
            model_name = self.config.get("model", "")
            models_config = self.config.get("models", {})
            model_settings = models_config.get(model_name, {})

            # Use model-specific settings or fallback to top-level config
            max_tokens = model_settings.get("max_tokens", self.config.get("max_tokens", 4096))
            temperature = model_settings.get("temperature", self.config.get("temperature", 0.3))

            response = self.provider.generate(
                prompt, max_tokens=max_tokens, temperature=temperature
            )

            # Parse JSON response
            # Try to extract JSON from response (in case there's extra text)
            response_clean = response.strip()
            if "```json" in response_clean:
                # Extract JSON from markdown code block
                start = response_clean.find("```json") + 7
                end = response_clean.find("```", start)
                response_clean = response_clean[start:end].strip()
            elif "```" in response_clean:
                start = response_clean.find("```") + 3
                end = response_clean.find("```", start)
                response_clean = response_clean[start:end].strip()

            analysis = self._safe_parse_json(response_clean)

            # Validate required fields
            required_fields = [
                "match_score",
                "matched_skills",
                "missing_skills",
                "application_priority",
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
        try:
            prompt = self.prompts.generate_resume_intake_data(self.profile, job, match_analysis)

            # Get model-specific settings or use fallback
            model_name = self.config.get("model", "")
            models_config = self.config.get("models", {})
            model_settings = models_config.get(model_name, {})

            # Use model-specific settings or fallback to top-level config
            max_tokens = model_settings.get("max_tokens", self.config.get("max_tokens", 4096))
            # Use slightly higher temperature for creative intake data generation
            temperature = (
                model_settings.get("temperature", self.config.get("temperature", 0.3)) + 0.1
            )

            response = self.provider.generate(
                prompt, max_tokens=max_tokens, temperature=temperature
            )

            # Parse JSON response
            response_clean = response.strip()
            if "```json" in response_clean:
                start = response_clean.find("```json") + 7
                end = response_clean.find("```", start)
                response_clean = response_clean[start:end].strip()
            elif "```" in response_clean:
                start = response_clean.find("```") + 3
                end = response_clean.find("```", start)
                response_clean = response_clean[start:end].strip()

            intake_data = self._safe_parse_json(response_clean)

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
