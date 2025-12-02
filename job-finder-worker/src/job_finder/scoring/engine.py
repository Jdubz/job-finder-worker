"""Deterministic scoring engine - no AI, pure config-driven scoring.

Calculates job match scores based on extracted job data and user-configured
preferences. All scoring logic is deterministic and transparent.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from job_finder.ai.extraction import JobExtractionResult

logger = logging.getLogger(__name__)


@dataclass
class ScoreBreakdown:
    """Detailed breakdown of score calculation."""

    base_score: int
    final_score: int
    adjustments: List[str] = field(default_factory=list)
    passed: bool = True
    rejection_reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "baseScore": self.base_score,
            "finalScore": self.final_score,
            "adjustments": self.adjustments,
            "passed": self.passed,
            "rejectionReason": self.rejection_reason,
        }


class ScoringEngine:
    """
    Calculate job match scores deterministically from config.

    The engine evaluates jobs based on:
    - Seniority alignment
    - Location/remote preferences
    - Technology stack match
    - Salary requirements
    - Experience level fit
    - Skill keyword matching

    All scoring is transparent and config-driven with no AI involved.
    """

    def __init__(self, config: Dict[str, Any], user_skills: Optional[List[str]] = None):
        """
        Initialize the scoring engine.

        Args:
            config: ScoringConfig dictionary from config loader
            user_skills: Optional list of user's skills for matching
        """
        self.config = config
        self.min_score = config.get("minScore", 60)
        self.weights = config.get("weights", {})
        self.seniority_config = config.get("seniority", {})
        self.location_config = config.get("location", {})
        self.tech_config = config.get("technology", {})
        self.salary_config = config.get("salary", {})
        self.experience_config = config.get("experience", {})

        # Normalize user skills to lowercase for matching
        self.user_skills: Set[str] = set()
        if user_skills:
            self.user_skills = {s.lower().strip() for s in user_skills if s}

        # Pre-process technology lists for efficient lookup
        self._required_tech = {t.lower() for t in self.tech_config.get("required", [])}
        self._preferred_tech = {t.lower() for t in self.tech_config.get("preferred", [])}
        self._disliked_tech = {t.lower() for t in self.tech_config.get("disliked", [])}
        self._rejected_tech = {t.lower() for t in self.tech_config.get("rejected", [])}

        # Pre-process seniority lists
        self._preferred_seniority = {s.lower() for s in self.seniority_config.get("preferred", [])}
        self._acceptable_seniority = {
            s.lower() for s in self.seniority_config.get("acceptable", [])
        }
        self._rejected_seniority = {s.lower() for s in self.seniority_config.get("rejected", [])}

    def score(
        self,
        extraction: JobExtractionResult,
        job_title: str,
        job_description: str,
    ) -> ScoreBreakdown:
        """
        Calculate match score from extracted data and config.

        Args:
            extraction: AI-extracted job data
            job_title: Original job title
            job_description: Original job description

        Returns:
            ScoreBreakdown with final score and adjustment details
        """
        adjustments: List[str] = []
        score = 50  # Start at neutral baseline

        # 1. Seniority scoring
        seniority_result = self._score_seniority(extraction.seniority)
        score += seniority_result["points"]
        if seniority_result.get("reason"):
            adjustments.append(seniority_result["reason"])

        # Hard reject on seniority
        if seniority_result.get("hard_reject"):
            return ScoreBreakdown(
                base_score=50,
                final_score=0,
                adjustments=adjustments,
                passed=False,
                rejection_reason=f"Rejected seniority level: {extraction.seniority}",
            )

        # 2. Location/work arrangement scoring
        location_result = self._score_location(extraction)
        score += location_result["points"]
        if location_result.get("reason"):
            adjustments.append(location_result["reason"])

        # Hard reject on location
        if location_result.get("hard_reject"):
            return ScoreBreakdown(
                base_score=50,
                final_score=0,
                adjustments=adjustments,
                passed=False,
                rejection_reason=location_result.get(
                    "rejection_reason", "Location requirements not met"
                ),
            )

        # 3. Technology scoring
        tech_result = self._score_technology(extraction.technologies)
        score += tech_result["points"]
        adjustments.extend(tech_result.get("reasons", []))

        # Hard reject on technology
        if tech_result.get("hard_reject"):
            return ScoreBreakdown(
                base_score=50,
                final_score=0,
                adjustments=adjustments,
                passed=False,
                rejection_reason=f"Rejected technology detected: {tech_result.get('rejected_tech')}",
            )

        # 4. Salary scoring
        salary_result = self._score_salary(extraction.salary_min, extraction.salary_max)
        score += salary_result["points"]
        if salary_result.get("reason"):
            adjustments.append(salary_result["reason"])

        # Hard reject on salary
        if salary_result.get("hard_reject"):
            return ScoreBreakdown(
                base_score=50,
                final_score=0,
                adjustments=adjustments,
                passed=False,
                rejection_reason=f"Salary below minimum: ${extraction.salary_max or extraction.salary_min}",
            )

        # 5. Experience scoring
        exp_result = self._score_experience(extraction.experience_min, extraction.experience_max)
        score += exp_result["points"]
        if exp_result.get("reason"):
            adjustments.append(exp_result["reason"])

        # 6. Skill match scoring (from description text matching)
        skill_result = self._score_skills(job_description)
        score += skill_result["points"]
        if skill_result.get("reason"):
            adjustments.append(skill_result["reason"])

        # Clamp to 0-100
        final_score = max(0, min(100, score))
        passed = final_score >= self.min_score

        return ScoreBreakdown(
            base_score=50,
            final_score=final_score,
            adjustments=adjustments,
            passed=passed,
            rejection_reason=(
                None if passed else f"Score {final_score} below threshold {self.min_score}"
            ),
        )

    def _score_seniority(self, seniority: Optional[str]) -> Dict[str, Any]:
        """Score based on seniority match."""
        if not seniority or seniority == "unknown":
            return {"points": 0, "reason": None}

        seniority_lower = seniority.lower()

        # Check rejected seniority (hard reject)
        if seniority_lower in self._rejected_seniority:
            penalty = self.seniority_config.get("rejectedPenalty", -100)
            return {
                "points": penalty,
                "reason": f"Rejected seniority '{seniority}' ({penalty:+d})",
                "hard_reject": True,
            }

        # Check preferred seniority (bonus)
        if seniority_lower in self._preferred_seniority:
            bonus = self.seniority_config.get("preferredBonus", 15)
            return {
                "points": bonus,
                "reason": f"Preferred seniority '{seniority}' ({bonus:+d})",
            }

        # Check acceptable seniority (neutral or small penalty)
        if seniority_lower in self._acceptable_seniority or "" in self._acceptable_seniority:
            penalty = self.seniority_config.get("acceptablePenalty", 0)
            if penalty != 0:
                return {
                    "points": penalty,
                    "reason": f"Acceptable seniority '{seniority}' ({penalty:+d})",
                }
            return {"points": 0, "reason": None}

        # Unknown seniority - no adjustment
        return {"points": 0, "reason": None}

    def _score_location(self, extraction: JobExtractionResult) -> Dict[str, Any]:
        """Score based on location/remote/timezone."""
        work_arrangement = extraction.work_arrangement
        allow_remote = self.location_config.get("allowRemote", True)
        allow_hybrid = self.location_config.get("allowHybrid", True)
        allow_onsite = self.location_config.get("allowOnsite", False)

        # Check work arrangement compatibility
        if work_arrangement == "remote":
            if not allow_remote:
                return {
                    "points": 0,
                    "hard_reject": True,
                    "rejection_reason": "Remote work not allowed per config",
                }
            # Remote is allowed - bonus for remote-friendly
            return {"points": 5, "reason": "Remote position (+5)"}

        if work_arrangement == "hybrid":
            if not allow_hybrid:
                return {
                    "points": 0,
                    "hard_reject": True,
                    "rejection_reason": "Hybrid work not allowed per config",
                }
            # Check timezone for hybrid
            return self._score_timezone(extraction, is_hybrid=True)

        if work_arrangement == "onsite":
            if not allow_onsite:
                return {
                    "points": 0,
                    "hard_reject": True,
                    "rejection_reason": "Onsite work not allowed per config",
                }
            # Check timezone for onsite
            return self._score_timezone(extraction, is_hybrid=False)

        # Unknown work arrangement - neutral
        return {"points": 0, "reason": None}

    def _score_timezone(self, extraction: JobExtractionResult, is_hybrid: bool) -> Dict[str, Any]:
        """Score based on timezone difference for hybrid/onsite roles."""
        job_tz = extraction.timezone
        user_tz = self.location_config.get("userTimezone", -8)
        max_diff = self.location_config.get("maxTimezoneDiffHours", 4)
        per_hour_penalty = self.location_config.get("perHourPenalty", 3)

        if job_tz is None:
            # Unknown timezone - small penalty for uncertainty
            return {"points": -5, "reason": "Unknown timezone (-5)"}

        tz_diff = abs(job_tz - user_tz)

        # Check if within acceptable range
        if tz_diff > max_diff:
            return {
                "points": 0,
                "hard_reject": True,
                "rejection_reason": f"Timezone difference {tz_diff}h exceeds max {max_diff}h",
            }

        # Apply per-hour penalty
        penalty = -int(tz_diff * per_hour_penalty)

        # Bonus for hybrid in same city
        if is_hybrid and extraction.city:
            user_city = self.location_config.get("userCity", "").lower()
            if user_city and extraction.city.lower() == user_city:
                bonus = self.location_config.get("hybridSameCityBonus", 10)
                return {
                    "points": penalty + bonus,
                    "reason": f"Hybrid in same city ({bonus:+d}, tz: {penalty:+d})",
                }

        if penalty != 0:
            return {"points": penalty, "reason": f"Timezone diff {tz_diff}h ({penalty:+d})"}
        return {"points": 0, "reason": None}

    def _score_technology(self, technologies: List[str]) -> Dict[str, Any]:
        """Score based on technology match."""
        if not technologies:
            return {"points": 0, "reasons": []}

        tech_set = {t.lower() for t in technologies}
        points = 0
        reasons: List[str] = []

        # Check for rejected technologies (hard reject)
        rejected_found = tech_set & self._rejected_tech
        if rejected_found:
            return {
                "points": 0,
                "reasons": [f"Rejected tech: {', '.join(rejected_found)}"],
                "hard_reject": True,
                "rejected_tech": ", ".join(rejected_found),
            }

        # Check required technologies
        required_found = tech_set & self._required_tech
        if required_found:
            bonus = len(required_found) * self.tech_config.get("requiredBonus", 10)
            points += bonus
            reasons.append(f"Required tech matched: {', '.join(required_found)} ({bonus:+d})")
        elif self._required_tech:
            # None of the required tech found - significant penalty
            points -= 15
            reasons.append(f"Missing required tech: {', '.join(self._required_tech)} (-15)")

        # Check preferred technologies
        preferred_found = tech_set & self._preferred_tech
        if preferred_found:
            bonus = len(preferred_found) * self.tech_config.get("preferredBonus", 5)
            points += bonus
            reasons.append(f"Preferred tech: {', '.join(preferred_found)} ({bonus:+d})")

        # Check disliked technologies
        disliked_found = tech_set & self._disliked_tech
        if disliked_found:
            penalty = len(disliked_found) * self.tech_config.get("dislikedPenalty", -5)
            points += penalty
            reasons.append(f"Disliked tech: {', '.join(disliked_found)} ({penalty:+d})")

        return {"points": points, "reasons": reasons}

    def _score_salary(self, min_salary: Optional[int], max_salary: Optional[int]) -> Dict[str, Any]:
        """Score based on salary range."""
        config_min = self.salary_config.get("minimum")
        config_target = self.salary_config.get("target")
        below_target_penalty = self.salary_config.get("belowTargetPenalty", 2)

        # Use max salary if available, otherwise min
        job_salary = max_salary or min_salary

        if job_salary is None:
            # No salary info - small penalty for uncertainty
            return {"points": -5, "reason": "No salary info (-5)"}

        # Check minimum salary floor (hard reject)
        if config_min and job_salary < config_min:
            return {
                "points": 0,
                "hard_reject": True,
                "reason": f"Salary ${job_salary:,} below minimum ${config_min:,}",
            }

        # Check against target salary
        if config_target and job_salary < config_target:
            diff = config_target - job_salary
            penalty_units = diff // 10000  # Per $10k below target
            penalty = -int(penalty_units * below_target_penalty)
            return {
                "points": max(penalty, -20),  # Cap penalty at -20
                "reason": f"Salary ${job_salary:,} below target ${config_target:,} ({penalty:+d})",
            }

        # At or above target - bonus
        if config_target and job_salary >= config_target:
            return {"points": 5, "reason": f"Salary ${job_salary:,} meets target (+5)"}

        return {"points": 0, "reason": None}

    def _score_experience(self, min_exp: Optional[int], max_exp: Optional[int]) -> Dict[str, Any]:
        """Score based on experience requirements."""
        user_years = self.experience_config.get("userYears", 0)
        max_required = self.experience_config.get("maxRequired", 15)
        overqualified_penalty = self.experience_config.get("overqualifiedPenalty", 5)

        if min_exp is None and max_exp is None:
            return {"points": 0, "reason": None}

        job_min = min_exp or 0
        job_max = max_exp or job_min

        # Check if user is underqualified
        if job_min > user_years:
            diff = job_min - user_years
            if diff > 3:
                # Significantly underqualified - hard reject
                return {
                    "points": -30,
                    "reason": f"Requires {job_min}+ years, user has {user_years} (-30)",
                }
            return {
                "points": -diff * 5,
                "reason": f"Requires {job_min}+ years, user has {user_years} ({-diff * 5:+d})",
            }

        # Check if job requires too much experience (unrealistic)
        if job_min > max_required:
            return {
                "points": -10,
                "reason": f"Requires {job_min}+ years (exceeds {max_required} threshold) (-10)",
            }

        # Check if user is overqualified
        if job_max and user_years > job_max + 3:
            over_years = user_years - job_max
            penalty = -min(over_years * overqualified_penalty, 15)
            return {
                "points": penalty,
                "reason": f"User overqualified ({user_years}y vs {job_max}y max) ({penalty:+d})",
            }

        # Good experience match
        return {"points": 5, "reason": f"Experience match ({job_min}-{job_max}y required) (+5)"}

    def _score_skills(self, description: str) -> Dict[str, Any]:
        """Score based on skill keywords in description."""
        if not self.user_skills or not description:
            return {"points": 0, "reason": None}

        desc_lower = description.lower()
        matched_skills = [skill for skill in self.user_skills if skill in desc_lower]

        if not matched_skills:
            return {"points": 0, "reason": None}

        # Bonus based on number of matched skills
        match_count = len(matched_skills)
        bonus = min(match_count * 2, 15)  # Cap at +15

        return {
            "points": bonus,
            "reason": f"Matched {match_count} user skills ({bonus:+d})",
        }
