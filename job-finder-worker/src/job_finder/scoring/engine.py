"""Deterministic scoring engine - no AI, pure config-driven scoring.

Calculates job match scores based on extracted job data and user-configured
preferences. All scoring logic is deterministic and transparent.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from job_finder.ai.extraction import JobExtractionResult

logger = logging.getLogger(__name__)


@dataclass
class ScoreAdjustment:
    """A single score adjustment with category, reason, and points."""

    category: str
    reason: str
    points: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "category": self.category,
            "reason": self.reason,
            "points": self.points,
        }

    def __str__(self) -> str:
        """String representation for logging/debugging."""
        sign = "+" if self.points >= 0 else ""
        return f"[{self.category}] {self.reason} ({sign}{self.points:.1f})"


@dataclass
class ScoreBreakdown:
    """Detailed breakdown of score calculation."""

    base_score: int
    final_score: int
    adjustments: List[ScoreAdjustment] = field(default_factory=list)
    passed: bool = True
    rejection_reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "baseScore": self.base_score,
            "finalScore": self.final_score,
            "adjustments": [adj.to_dict() for adj in self.adjustments],
            "passed": self.passed,
            "rejectionReason": self.rejection_reason,
        }


class ScoringEngine:
    """
    Calculate job match scores deterministically from config.

    The engine evaluates jobs based on:
    - Seniority alignment
    - Location/remote preferences
    - Skill/technology overlap with experience weighting
    - Salary requirements
    - Experience level fit
    - Skill keyword matching

    All scoring is transparent and config-driven with no AI involved.
    """

    def __init__(
        self,
        config: Dict[str, Any],
        skill_years: Optional[Dict[str, float]] = None,
        user_experience_years: float = 0.0,
        skill_analogs: Optional[Dict[str, Set[str]]] = None,
    ):
        """
        Initialize the scoring engine.

        Args:
            config: MatchPolicy dictionary from config loader (required, no defaults)
            skill_years: Derived mapping of skill -> years of experience
            user_experience_years: Total years of experience
            skill_analogs: Map of skill -> set of equivalent skills

        Raises:
            KeyError: If required config sections are missing
        """
        self.config = config

        # Required top-level config - fail loudly if missing
        self.min_score = config["minScore"]
        self.seniority_config = config["seniority"]
        self.location_config = config["location"]
        self.skill_match_config = config["skillMatch"]
        self.salary_config = config["salary"]
        self.experience_config = config["experience"]
        self.freshness_config = config["freshness"]
        self.role_fit_config = config["roleFit"]
        self.company_config = config["company"]

        # Derived profile
        self.skill_years = skill_years or {}
        self.user_skills: Set[str] = {s.lower().strip() for s in self.skill_years.keys()}
        self.user_experience_years = user_experience_years
        self.skill_analogs = skill_analogs or {}

        # Pre-process seniority lists (required fields)
        self._preferred_seniority = {s.lower() for s in self.seniority_config["preferred"]}
        self._acceptable_seniority = {s.lower() for s in self.seniority_config["acceptable"]}
        self._rejected_seniority = {s.lower() for s in self.seniority_config["rejected"]}

        # Pre-process role fit lists (required fields)
        self._preferred_roles = {r.lower() for r in self.role_fit_config["preferred"]}
        self._acceptable_roles = {r.lower() for r in self.role_fit_config["acceptable"]}
        self._penalized_roles = {r.lower() for r in self.role_fit_config["penalized"]}
        self._rejected_roles = {r.lower() for r in self.role_fit_config["rejected"]}

    def score(
        self,
        extraction: JobExtractionResult,
        job_title: str,
        job_description: str,
        company_data: Optional[Dict[str, Any]] = None,
    ) -> ScoreBreakdown:
        """
        Calculate match score from extracted data and config.

        Args:
            extraction: AI-extracted job data
            job_title: Original job title
            job_description: Original job description
            company_data: Optional company data for company signal scoring

        Returns:
            ScoreBreakdown with final score and adjustment details
        """
        adjustments: List[ScoreAdjustment] = []
        score = 50  # Start at neutral baseline

        # 1. Seniority scoring
        seniority_result = self._score_seniority(extraction.seniority)
        score += seniority_result["points"]
        adjustments.extend(seniority_result.get("adjustments", []))

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
        adjustments.extend(location_result.get("adjustments", []))

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

        # 3. Skill match scoring (experience-weighted)
        skill_match_result = self._score_skill_match(extraction.technologies)
        score += skill_match_result["points"]
        adjustments.extend(skill_match_result.get("adjustments", []))

        # 4. Salary scoring (including equity and contract status)
        salary_result = self._score_salary(
            extraction.salary_min,
            extraction.salary_max,
            includes_equity=extraction.includes_equity,
            is_contract=extraction.is_contract,
        )
        score += salary_result["points"]
        adjustments.extend(salary_result.get("adjustments", []))

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
        adjustments.extend(exp_result.get("adjustments", []))

        # Track technologies already scored to avoid double-counting in keyword scan
        scored_tech_set = {t.lower() for t in extraction.technologies}

        # 6. Skill match scoring (from description text matching)
        skill_result = self._score_skills(job_description, scored_tech_set)
        score += skill_result["points"]
        adjustments.extend(skill_result.get("adjustments", []))

        # 7. Freshness scoring (from extracted days_old)
        freshness_result = self._score_freshness(extraction)
        score += freshness_result["points"]
        adjustments.extend(freshness_result.get("adjustments", []))

        # 8. Role fit scoring (from extracted role signals)
        role_fit_result = self._score_role_fit(extraction)
        score += role_fit_result["points"]
        adjustments.extend(role_fit_result.get("adjustments", []))

        # Hard reject on role fit (clearance required)
        if role_fit_result.get("hard_reject"):
            return ScoreBreakdown(
                base_score=50,
                final_score=0,
                adjustments=adjustments,
                passed=False,
                rejection_reason=role_fit_result.get(
                    "rejection_reason", "Role fit requirements not met"
                ),
            )

        # 9. Company signals scoring (from company data)
        if company_data:
            company_result = self._score_company_signals(company_data)
            score += company_result["points"]
            adjustments.extend(company_result.get("adjustments", []))

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
            return {"points": 0, "adjustments": []}

        seniority_lower = seniority.lower()

        # Check rejected seniority (hard reject)
        if seniority_lower in self._rejected_seniority:
            score = self.seniority_config.get("rejectedScore", -100)
            return {
                "points": score,
                "adjustments": [
                    ScoreAdjustment(
                        category="seniority",
                        reason=f"Rejected seniority '{seniority}'",
                        points=score,
                    )
                ],
                "hard_reject": True,
            }

        # Check preferred seniority (bonus)
        if seniority_lower in self._preferred_seniority:
            score = self.seniority_config.get("preferredScore", 15)
            return {
                "points": score,
                "adjustments": [
                    ScoreAdjustment(
                        category="seniority",
                        reason=f"Preferred seniority '{seniority}'",
                        points=score,
                    )
                ],
            }

        # Check acceptable seniority (neutral or adjustment)
        if seniority_lower in self._acceptable_seniority or "" in self._acceptable_seniority:
            score = self.seniority_config.get("acceptableScore", 0)
            if score != 0:
                return {
                    "points": score,
                    "adjustments": [
                        ScoreAdjustment(
                            category="seniority",
                            reason=f"Acceptable seniority '{seniority}'",
                            points=score,
                        )
                    ],
                }
            return {"points": 0, "adjustments": []}

        # Unknown seniority - no adjustment
        return {"points": 0, "adjustments": []}

    def _score_location(self, extraction: JobExtractionResult) -> Dict[str, Any]:
        """Score based on location/remote/timezone/relocation."""
        work_arrangement = extraction.work_arrangement
        allow_remote = self.location_config.get("allowRemote", True)
        allow_hybrid = self.location_config.get("allowHybrid", True)
        allow_onsite = self.location_config.get("allowOnsite", False)
        relocation_score = self.location_config.get("relocationScore", -50)

        # Check relocation requirement first
        if extraction.relocation_required:
            # Relocation required - apply adjustment or hard reject
            if relocation_score <= -100:
                return {
                    "points": relocation_score,
                    "hard_reject": True,
                    "rejection_reason": "Relocation required",
                }
            # Apply relocation adjustment and continue with timezone scoring
            is_hybrid = work_arrangement == "hybrid"
            base_result = self._score_timezone(extraction, is_hybrid=is_hybrid)
            adjustments = list(base_result.get("adjustments", []))
            adjustments.append(
                ScoreAdjustment(
                    category="location",
                    reason="Relocation required",
                    points=relocation_score,
                )
            )
            return {
                "points": base_result.get("points", 0) + relocation_score,
                "adjustments": adjustments,
            }

        # Check work arrangement compatibility
        if work_arrangement == "remote":
            if not allow_remote:
                return {
                    "points": 0,
                    "hard_reject": True,
                    "rejection_reason": "Remote work not allowed per config",
                }
            # Remote is allowed - bonus for remote-friendly
            remote_score = self.location_config.get("remoteScore", 5)
            return {
                "points": remote_score,
                "adjustments": [
                    ScoreAdjustment(
                        category="location",
                        reason="Remote position",
                        points=remote_score,
                    )
                ],
            }

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
        return {"points": 0, "adjustments": []}

    def _score_timezone(self, extraction: JobExtractionResult, is_hybrid: bool) -> Dict[str, Any]:
        """Score based on timezone difference for hybrid/onsite roles."""
        job_tz = extraction.timezone
        user_tz = self.location_config.get("userTimezone", -8)
        max_diff = self.location_config.get("maxTimezoneDiffHours", 4)
        per_hour_score = self.location_config.get("perHourScore", -3)
        unknown_tz_score = self.location_config.get("unknownTimezoneScore", -5)

        # Handle None or invalid timezone types
        if job_tz is None or not isinstance(job_tz, (int, float)):
            # Unknown/invalid timezone - configurable adjustment for uncertainty
            return {
                "points": unknown_tz_score,
                "adjustments": [
                    ScoreAdjustment(
                        category="location",
                        reason="Unknown timezone",
                        points=unknown_tz_score,
                    )
                ],
            }

        tz_diff = abs(job_tz - user_tz)

        # Check if within acceptable range
        if tz_diff > max_diff:
            return {
                "points": 0,
                "hard_reject": True,
                "rejection_reason": f"Timezone difference {tz_diff}h exceeds max {max_diff}h",
            }

        # Apply per-hour score adjustment (should be negative)
        tz_adjustment = int(tz_diff * per_hour_score)
        adjustments: List[ScoreAdjustment] = []

        # For hybrid roles, check if in user's city
        if is_hybrid and extraction.city:
            user_city = self.location_config.get("userCity", "").lower()
            job_city = extraction.city.lower()
            if user_city and job_city == user_city:
                # Bonus for hybrid in same city
                same_city_score = self.location_config.get("hybridSameCityScore", 10)
                adjustments.append(
                    ScoreAdjustment(
                        category="location",
                        reason="Hybrid in same city",
                        points=same_city_score,
                    )
                )
                if tz_adjustment != 0:
                    adjustments.append(
                        ScoreAdjustment(
                            category="location",
                            reason=f"Timezone diff {tz_diff}h",
                            points=tz_adjustment,
                        )
                    )
                return {"points": tz_adjustment + same_city_score, "adjustments": adjustments}
            elif user_city:
                # Hybrid in different city - requires relocation
                # Apply same penalty as onsite roles requiring relocation
                relocation_score = self.location_config.get("relocationScore", -80)
                adjustments.append(
                    ScoreAdjustment(
                        category="location",
                        reason=f"Hybrid requires presence in {extraction.city} (not {user_city.title()})",
                        points=relocation_score,
                    )
                )
                if tz_adjustment != 0:
                    adjustments.append(
                        ScoreAdjustment(
                            category="location",
                            reason=f"Timezone diff {tz_diff}h",
                            points=tz_adjustment,
                        )
                    )
                return {"points": tz_adjustment + relocation_score, "adjustments": adjustments}

        if tz_adjustment != 0:
            return {
                "points": tz_adjustment,
                "adjustments": [
                    ScoreAdjustment(
                        category="location",
                        reason=f"Timezone diff {tz_diff}h",
                        points=tz_adjustment,
                    )
                ],
            }
        return {"points": 0, "adjustments": []}

    def _score_skill_match(self, job_technologies: List[str]) -> Dict[str, Any]:
        """Experience-weighted skill matching with analog support."""
        if not job_technologies:
            return {"points": 0, "adjustments": []}

        base_score = self.skill_match_config["baseMatchScore"]
        years_mult = self.skill_match_config["yearsMultiplier"]
        max_years = self.skill_match_config["maxYearsBonus"]
        missing_score = self.skill_match_config["missingScore"]
        analog_score = self.skill_match_config["analogScore"]
        max_bonus = self.skill_match_config["maxBonus"]
        max_penalty = self.skill_match_config["maxPenalty"]

        matched: List[tuple[str, float, float]] = []
        analogs: List[tuple[str, str]] = []
        missing: List[str] = []
        total_bonus = 0.0

        for skill in job_technologies:
            skill_lower = skill.lower()
            if skill_lower in self.user_skills:
                years = self.skill_years.get(skill_lower, 0.0)
                capped_years = min(years, max_years)
                points = base_score + (capped_years * years_mult)
                matched.append((skill, years, points))
                total_bonus += points
            elif self._has_analog(skill_lower):
                analog = self._get_analog(skill_lower)
                analogs.append((skill, analog))
            else:
                missing.append(skill)

        bonus = min(total_bonus, max_bonus)
        analog_points = len(analogs) * analog_score
        penalty = max(len(missing) * missing_score, max_penalty)

        adjustments: List[ScoreAdjustment] = []
        if matched:
            details = [f"{s} ({y:.1f}y → +{p:.1f})" for s, y, p in matched]
            adjustments.append(
                ScoreAdjustment(
                    category="skills",
                    reason=f"Matched: {', '.join(details)}",
                    points=bonus,
                )
            )
        if analogs:
            details = [f"{s}→{a}" for s, a in analogs]
            adjustments.append(
                ScoreAdjustment(
                    category="skills",
                    reason=f"Analog: {', '.join(details)}",
                    points=analog_points,
                )
            )
        if missing:
            adjustments.append(
                ScoreAdjustment(
                    category="skills",
                    reason=f"Missing: {', '.join(missing)}",
                    points=penalty,
                )
            )

        return {"points": bonus + analog_points + penalty, "adjustments": adjustments}

    def _has_analog(self, skill: str) -> bool:
        analogs = self.skill_analogs.get(skill, set())
        return bool(analogs & self.user_skills)

    def _get_analog(self, skill: str) -> str:
        analogs = self.skill_analogs.get(skill, set())
        match = analogs & self.user_skills
        return next(iter(match)) if match else ""

    def _score_salary(
        self,
        min_salary: Optional[int],
        max_salary: Optional[int],
        includes_equity: bool = False,
        is_contract: bool = False,
    ) -> Dict[str, Any]:
        """Score based on salary range, equity, and contract status."""
        config_min = self.salary_config.get("minimum")
        config_target = self.salary_config.get("target")
        below_target_score = self.salary_config.get("belowTargetScore", -2)
        equity_score = self.salary_config.get("equityScore", 5)
        contract_score = self.salary_config.get("contractScore", -15)
        missing_salary_score = self.salary_config.get("missingSalaryScore", -5)
        meets_target_score = self.salary_config.get("meetsTargetScore", 5)

        points = 0
        adjustments: List[ScoreAdjustment] = []

        # Use max salary if available, otherwise min
        job_salary = max_salary or min_salary

        if job_salary is None:
            # No salary info - configurable adjustment for uncertainty
            points += missing_salary_score
            adjustments.append(
                ScoreAdjustment(
                    category="salary",
                    reason="No salary info",
                    points=missing_salary_score,
                )
            )
        else:
            # Check minimum salary floor (hard reject)
            if config_min and job_salary < config_min:
                return {
                    "points": 0,
                    "hard_reject": True,
                    "adjustments": [
                        ScoreAdjustment(
                            category="salary",
                            reason=f"Salary ${job_salary:,} below minimum ${config_min:,}",
                            points=0,
                        )
                    ],
                }

            # Check against target salary
            if config_target and job_salary < config_target:
                diff = config_target - job_salary
                units = diff // 10000  # Per $10k below target
                # below_target_score should already be negative
                adjustment = int(units * below_target_score)
                adjustment = max(adjustment, -20)  # Cap at -20
                points += adjustment
                adjustments.append(
                    ScoreAdjustment(
                        category="salary",
                        reason=f"Salary ${job_salary:,} below target ${config_target:,}",
                        points=adjustment,
                    )
                )
            elif config_target:
                # At or above target - configurable adjustment
                points += meets_target_score
                adjustments.append(
                    ScoreAdjustment(
                        category="salary",
                        reason=f"Salary ${job_salary:,} meets target",
                        points=meets_target_score,
                    )
                )

        # Equity score adjustment
        if includes_equity and equity_score:
            points += equity_score
            adjustments.append(
                ScoreAdjustment(
                    category="salary",
                    reason="Includes equity",
                    points=equity_score,
                )
            )

        # Contract score adjustment
        if is_contract and contract_score:
            points += contract_score
            adjustments.append(
                ScoreAdjustment(
                    category="salary",
                    reason="Contract position",
                    points=contract_score,
                )
            )

        return {"points": points, "adjustments": adjustments}

    def _score_experience(self, min_exp: Optional[int], max_exp: Optional[int]) -> Dict[str, Any]:
        """Score based on experience requirements."""
        user_years = self.user_experience_years
        max_required = self.experience_config.get("maxRequired", 15)
        overqualified_score = self.experience_config.get("overqualifiedScore", -5)

        if min_exp is None and max_exp is None:
            return {"points": 0, "adjustments": []}

        job_min = min_exp if min_exp is not None else 0
        job_max = max_exp if max_exp is not None else job_min

        # Check if user is underqualified
        if job_min > user_years:
            diff = job_min - user_years
            if diff > 3:
                # Significantly underqualified - hard reject
                return {
                    "points": -30,
                    "adjustments": [
                        ScoreAdjustment(
                            category="experience",
                            reason=f"Requires {job_min}+ years, user has {user_years}",
                            points=-30,
                        )
                    ],
                }
            penalty = -diff * 5
            return {
                "points": penalty,
                "adjustments": [
                    ScoreAdjustment(
                        category="experience",
                        reason=f"Requires {job_min}+ years, user has {user_years}",
                        points=penalty,
                    )
                ],
            }

        # Check if job requires too much experience (unrealistic)
        if job_min > max_required:
            return {
                "points": -10,
                "adjustments": [
                    ScoreAdjustment(
                        category="experience",
                        reason=f"Requires {job_min}+ years (exceeds {max_required} threshold)",
                        points=-10,
                    )
                ],
            }

        # Check if user is overqualified
        if job_max and user_years > job_max + 3:
            over_years = user_years - job_max
            # overqualified_score should already be negative
            adjustment = max(over_years * overqualified_score, -15)
            return {
                "points": adjustment,
                "adjustments": [
                    ScoreAdjustment(
                        category="experience",
                        reason=f"User overqualified ({user_years}y vs {job_max}y max)",
                        points=adjustment,
                    )
                ],
            }

        # Good experience match
        return {
            "points": 5,
            "adjustments": [
                ScoreAdjustment(
                    category="experience",
                    reason=f"Experience match ({job_min}-{job_max}y required)",
                    points=5,
                )
            ],
        }

    def _score_skills(
        self, description: str, scored_technologies: Optional[Set[str]] = None
    ) -> Dict[str, Any]:
        """Score based on skill keywords in description using word-boundary matching.

        Technologies already counted in skill matching are excluded to avoid double-counting.
        """
        if not self.user_skills or not description:
            return {"points": 0, "adjustments": []}

        desc_lower = description.lower()

        skills_to_check = set(self.user_skills)
        if scored_technologies:
            skills_to_check -= scored_technologies

        # Use word boundary matching to avoid false positives
        # e.g., "go" shouldn't match "going", "good", etc.
        matched_skills = [
            skill for skill in skills_to_check if re.search(rf"\b{re.escape(skill)}\b", desc_lower)
        ]

        if not matched_skills:
            return {"points": 0, "adjustments": []}

        # Bonus based on number of matched skills (configurable)
        bonus_per_skill = self.config.get("skills", {}).get("bonusPerSkill", 2)
        max_skill_bonus = self.config.get("skills", {}).get("maxSkillBonus", 15)
        match_count = len(matched_skills)
        bonus = min(match_count * bonus_per_skill, max_skill_bonus)

        return {
            "points": bonus,
            "adjustments": [
                ScoreAdjustment(
                    category="skills",
                    reason=f"Matched {match_count} user skills",
                    points=bonus,
                )
            ],
        }

    def _score_freshness(self, extraction: JobExtractionResult) -> Dict[str, Any]:
        """
        Score based on job freshness (days since posting).

        Uses match-policy.freshness config (all fields required):
        - freshDays: Days threshold for fresh score
        - freshScore: Points adjustment for fresh jobs (positive)
        - staleDays: Days threshold for stale score
        - staleScore: Points adjustment for stale jobs (negative)
        - veryStaleDays: Days threshold for very stale score
        - veryStaleScore: Points adjustment for very stale jobs (negative)
        - repostScore: Points adjustment for reposts (negative)
        """
        # Use pre-loaded config (required fields, no defaults)
        fresh_days = self.freshness_config["freshDays"]
        fresh_score = self.freshness_config["freshScore"]
        stale_days = self.freshness_config["staleDays"]
        stale_score = self.freshness_config["staleScore"]
        very_stale_days = self.freshness_config["veryStaleDays"]
        very_stale_score = self.freshness_config["veryStaleScore"]
        repost_score = self.freshness_config["repostScore"]

        days_old = extraction.days_old
        is_repost = extraction.is_repost

        if days_old is None:
            # No freshness info - neutral
            return {"points": 0, "adjustments": []}

        points = 0
        adjustments: List[ScoreAdjustment] = []

        if days_old <= fresh_days:
            points = fresh_score
            adjustments.append(
                ScoreAdjustment(
                    category="freshness",
                    reason=f"Fresh job ({days_old}d old)",
                    points=fresh_score,
                )
            )
        elif days_old >= very_stale_days:
            points = very_stale_score
            adjustments.append(
                ScoreAdjustment(
                    category="freshness",
                    reason=f"Very stale job ({days_old}d old)",
                    points=very_stale_score,
                )
            )
        elif days_old >= stale_days:
            points = stale_score
            adjustments.append(
                ScoreAdjustment(
                    category="freshness",
                    reason=f"Stale job ({days_old}d old)",
                    points=stale_score,
                )
            )

        # Additional adjustment for reposts
        if is_repost:
            points += repost_score
            adjustments.append(
                ScoreAdjustment(
                    category="freshness",
                    reason="Reposted job",
                    points=repost_score,
                )
            )

        return {"points": points, "adjustments": adjustments}

    def _score_role_fit(self, extraction: JobExtractionResult) -> Dict[str, Any]:
        """
        Score based on role types (backend, ML/AI, DevOps, etc.).

        Uses match-policy.roleFit config (all fields required):
        - preferred: List of role types that get preferredScore
        - acceptable: List of role types that are neutral
        - penalized: List of role types that get penalizedScore
        - rejected: List of role types that cause hard rejection
        - preferredScore: Points adjustment per matched preferred role (positive)
        - penalizedScore: Points adjustment per matched penalized role (negative)
        """
        if not extraction.role_types:
            return {"points": 0, "adjustments": []}

        role_set = {r.lower() for r in extraction.role_types}
        points = 0
        adjustments: List[ScoreAdjustment] = []

        # Check for rejected roles (hard reject)
        rejected_found = role_set & self._rejected_roles
        if rejected_found:
            return {
                "points": 0,
                "adjustments": [
                    ScoreAdjustment(
                        category="role_fit",
                        reason=f"Rejected role type: {', '.join(rejected_found)}",
                        points=0,
                    )
                ],
                "hard_reject": True,
                "rejection_reason": f"Rejected role type: {', '.join(rejected_found)}",
            }

        # Check preferred roles (positive adjustment)
        preferred_score = self.role_fit_config["preferredScore"]
        preferred_found = role_set & self._preferred_roles
        if preferred_found:
            score = len(preferred_found) * preferred_score
            points += score
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason=f"Preferred role: {', '.join(preferred_found)}",
                    points=score,
                )
            )

        # Check penalized roles (negative adjustment)
        penalized_score = self.role_fit_config["penalizedScore"]
        penalized_found = role_set & self._penalized_roles
        if penalized_found:
            score = len(penalized_found) * penalized_score
            points += score
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason=f"Penalized role: {', '.join(penalized_found)}",
                    points=score,
                )
            )

        # Acceptable roles are neutral - no adjustment needed

        return {"points": points, "adjustments": adjustments}

    def _score_company_signals(self, company_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Score based on company signals from enriched company data.

        Uses match-policy.company config (all fields required):
        - preferredCityScore: Adjustment for companies with office in preferred city (positive)
        - preferredCity: User's preferred city for office bonus
        - remoteFirstScore: Adjustment for remote-first companies (positive)
        - aiMlFocusScore: Adjustment for AI/ML focused companies (positive)
        - largeCompanyScore: Adjustment for large companies (positive)
        - smallCompanyScore: Adjustment for small companies (negative)
        - largeCompanyThreshold: Employee count for "large"
        - smallCompanyThreshold: Employee count for "small"
        - startupScore: Alternative adjustment for startups (positive or 0)
        """
        points = 0
        adjustments: List[ScoreAdjustment] = []

        # Extract relevant company fields
        description = (company_data.get("description") or "").lower()
        headquarters = (company_data.get("headquarters") or "").lower()
        locations = company_data.get("locations") or []
        tech_stack = company_data.get("tech_stack") or []
        employee_count = company_data.get("employee_count")
        is_remote_first = company_data.get("is_remote_first", False)

        # Normalize locations to lowercase strings
        locations_lower = [str(loc).lower() for loc in locations if loc]

        # 1. Preferred city office score (required field)
        preferred_city_score = self.company_config["preferredCityScore"]
        preferred_city = self.company_config.get("preferredCity", "").lower()
        if preferred_city_score and preferred_city:
            has_preferred_city = (
                any(preferred_city in loc for loc in locations_lower)
                or preferred_city in headquarters
            )
            if has_preferred_city:
                points += preferred_city_score
                adjustments.append(
                    ScoreAdjustment(
                        category="company",
                        reason=f"{preferred_city.title()} office",
                        points=preferred_city_score,
                    )
                )

        # 2. Remote-first score (required field)
        remote_first_score = self.company_config["remoteFirstScore"]
        if remote_first_score and is_remote_first:
            points += remote_first_score
            adjustments.append(
                ScoreAdjustment(
                    category="company",
                    reason="Remote-first company",
                    points=remote_first_score,
                )
            )

        # 3. AI/ML focus score (required field)
        ai_ml_score = self.company_config["aiMlFocusScore"]
        if ai_ml_score:
            ai_keywords = [
                "machine learning",
                "artificial intelligence",
                "ai",
                "ml",
                "deep learning",
                "llm",
                "generative ai",
            ]
            has_ai_focus = any(kw in description for kw in ai_keywords) or any(
                any(kw in str(t).lower() for kw in ["pytorch", "tensorflow", "ml", "ai"])
                for t in tech_stack
            )
            if has_ai_focus:
                points += ai_ml_score
                adjustments.append(
                    ScoreAdjustment(
                        category="company",
                        reason="AI/ML focus",
                        points=ai_ml_score,
                    )
                )

        # 4. Company size scoring (all fields required)
        large_company_score = self.company_config["largeCompanyScore"]
        small_company_score = self.company_config["smallCompanyScore"]
        large_threshold = self.company_config["largeCompanyThreshold"]
        small_threshold = self.company_config["smallCompanyThreshold"]
        startup_score = self.company_config["startupScore"]

        if employee_count and isinstance(employee_count, (int, float)):
            if employee_count >= large_threshold and large_company_score:
                points += large_company_score
                adjustments.append(
                    ScoreAdjustment(
                        category="company",
                        reason="Large company",
                        points=large_company_score,
                    )
                )
            elif employee_count <= small_threshold:
                if startup_score:
                    points += startup_score
                    adjustments.append(
                        ScoreAdjustment(
                            category="company",
                            reason="Startup",
                            points=startup_score,
                        )
                    )
                elif small_company_score:
                    points += small_company_score
                    adjustments.append(
                        ScoreAdjustment(
                            category="company",
                            reason="Small company",
                            points=small_company_score,
                        )
                    )

        return {"points": points, "adjustments": adjustments}
