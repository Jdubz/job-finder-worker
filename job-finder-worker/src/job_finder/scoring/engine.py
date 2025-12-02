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
    points: int

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "category": self.category,
            "reason": self.reason,
            "points": self.points,
        }

    def __str__(self) -> str:
        """String representation for logging/debugging."""
        return f"[{self.category}] {self.reason} ({self.points:+d})"


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
            config: MatchPolicy dictionary from config loader (required, no defaults)
            user_skills: Optional list of user's skills for matching

        Raises:
            KeyError: If required config sections are missing
        """
        self.config = config

        # Required top-level config - fail loudly if missing
        self.min_score = config["minScore"]
        self.weights = config["weights"]
        self.seniority_config = config["seniority"]
        self.location_config = config["location"]
        self.tech_config = config["technology"]
        self.salary_config = config["salary"]
        self.experience_config = config["experience"]
        self.freshness_config = config["freshness"]
        self.role_fit_config = config["roleFit"]
        self.company_config = config["company"]
        self.dealbreakers_config = config["dealbreakers"]

        # Normalize user skills to lowercase for matching
        self.user_skills: Set[str] = set()
        if user_skills:
            self.user_skills = {s.lower().strip() for s in user_skills if s}

        # Pre-process technology lists for efficient lookup (required fields)
        self._required_tech = {t.lower() for t in self.tech_config["required"]}
        self._preferred_tech = {t.lower() for t in self.tech_config["preferred"]}
        self._disliked_tech = {t.lower() for t in self.tech_config["disliked"]}
        self._rejected_tech = {t.lower() for t in self.tech_config["rejected"]}

        # Pre-process seniority lists (required fields)
        self._preferred_seniority = {s.lower() for s in self.seniority_config["preferred"]}
        self._acceptable_seniority = {s.lower() for s in self.seniority_config["acceptable"]}
        self._rejected_seniority = {s.lower() for s in self.seniority_config["rejected"]}

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

        # 3. Technology scoring
        tech_result = self._score_technology(extraction.technologies)
        score += tech_result["points"]
        adjustments.extend(tech_result.get("adjustments", []))

        # Hard reject on technology
        if tech_result.get("hard_reject"):
            return ScoreBreakdown(
                base_score=50,
                final_score=0,
                adjustments=adjustments,
                passed=False,
                rejection_reason=f"Rejected technology detected: {tech_result.get('rejected_tech')}",
            )

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

        # 6. Skill match scoring (from description text matching)
        skill_result = self._score_skills(job_description)
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
                rejection_reason=role_fit_result.get("rejection_reason", "Role fit requirements not met"),
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
            penalty = self.seniority_config.get("rejectedPenalty", -100)
            return {
                "points": penalty,
                "adjustments": [
                    ScoreAdjustment(
                        category="seniority",
                        reason=f"Rejected seniority '{seniority}'",
                        points=penalty,
                    )
                ],
                "hard_reject": True,
            }

        # Check preferred seniority (bonus)
        if seniority_lower in self._preferred_seniority:
            bonus = self.seniority_config.get("preferredBonus", 15)
            return {
                "points": bonus,
                "adjustments": [
                    ScoreAdjustment(
                        category="seniority",
                        reason=f"Preferred seniority '{seniority}'",
                        points=bonus,
                    )
                ],
            }

        # Check acceptable seniority (neutral or small penalty)
        if seniority_lower in self._acceptable_seniority or "" in self._acceptable_seniority:
            penalty = self.seniority_config.get("acceptablePenalty", 0)
            if penalty != 0:
                return {
                    "points": penalty,
                    "adjustments": [
                        ScoreAdjustment(
                            category="seniority",
                            reason=f"Acceptable seniority '{seniority}'",
                            points=penalty,
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
        relocation_penalty = self.location_config.get("relocationPenalty", -50)

        # Check relocation requirement first
        if extraction.relocation_required:
            # Relocation required - apply penalty or hard reject
            if relocation_penalty <= -100:
                return {
                    "points": 0,
                    "hard_reject": True,
                    "rejection_reason": "Relocation required",
                }
            # Apply relocation penalty and continue with timezone scoring
            base_result = self._score_timezone(extraction, is_hybrid=False)
            adjustments = list(base_result.get("adjustments", []))
            adjustments.append(
                ScoreAdjustment(
                    category="location",
                    reason="Relocation required",
                    points=relocation_penalty,
                )
            )
            return {
                "points": base_result.get("points", 0) + relocation_penalty,
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
            remote_bonus = self.location_config.get("remoteBonus", 5)
            return {
                "points": remote_bonus,
                "adjustments": [
                    ScoreAdjustment(
                        category="location",
                        reason="Remote position",
                        points=remote_bonus,
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
        per_hour_penalty = self.location_config.get("perHourPenalty", 3)

        # Handle None or invalid timezone types
        if job_tz is None or not isinstance(job_tz, (int, float)):
            # Unknown/invalid timezone - small penalty for uncertainty
            return {
                "points": -5,
                "adjustments": [
                    ScoreAdjustment(
                        category="location",
                        reason="Unknown timezone",
                        points=-5,
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

        # Apply per-hour penalty
        penalty = -int(tz_diff * per_hour_penalty)
        adjustments: List[ScoreAdjustment] = []

        # Bonus for hybrid in same city
        if is_hybrid and extraction.city:
            user_city = self.location_config.get("userCity", "").lower()
            if user_city and extraction.city.lower() == user_city:
                bonus = self.location_config.get("hybridSameCityBonus", 10)
                adjustments.append(
                    ScoreAdjustment(
                        category="location",
                        reason="Hybrid in same city",
                        points=bonus,
                    )
                )
                if penalty != 0:
                    adjustments.append(
                        ScoreAdjustment(
                            category="location",
                            reason=f"Timezone diff {tz_diff}h",
                            points=penalty,
                        )
                    )
                return {"points": penalty + bonus, "adjustments": adjustments}

        if penalty != 0:
            return {
                "points": penalty,
                "adjustments": [
                    ScoreAdjustment(
                        category="location",
                        reason=f"Timezone diff {tz_diff}h",
                        points=penalty,
                    )
                ],
            }
        return {"points": 0, "adjustments": []}

    def _score_technology(self, technologies: List[str]) -> Dict[str, Any]:
        """Score based on technology match."""
        if not technologies:
            return {"points": 0, "adjustments": []}

        tech_set = {t.lower() for t in technologies}
        points = 0
        adjustments: List[ScoreAdjustment] = []

        # Check for rejected technologies (hard reject)
        rejected_found = tech_set & self._rejected_tech
        if rejected_found:
            return {
                "points": 0,
                "adjustments": [
                    ScoreAdjustment(
                        category="technology",
                        reason=f"Rejected tech: {', '.join(rejected_found)}",
                        points=0,
                    )
                ],
                "hard_reject": True,
                "rejected_tech": ", ".join(rejected_found),
            }

        # Check required technologies
        required_found = tech_set & self._required_tech
        if required_found:
            bonus = len(required_found) * self.tech_config.get("requiredBonus", 10)
            points += bonus
            adjustments.append(
                ScoreAdjustment(
                    category="technology",
                    reason=f"Required tech matched: {', '.join(required_found)}",
                    points=bonus,
                )
            )
        elif self._required_tech:
            # None of the required tech found - significant penalty
            points -= 15
            adjustments.append(
                ScoreAdjustment(
                    category="technology",
                    reason=f"Missing required tech: {', '.join(self._required_tech)}",
                    points=-15,
                )
            )

        # Check preferred technologies
        preferred_found = tech_set & self._preferred_tech
        if preferred_found:
            bonus = len(preferred_found) * self.tech_config.get("preferredBonus", 5)
            points += bonus
            adjustments.append(
                ScoreAdjustment(
                    category="technology",
                    reason=f"Preferred tech: {', '.join(preferred_found)}",
                    points=bonus,
                )
            )

        # Check disliked technologies
        disliked_found = tech_set & self._disliked_tech
        if disliked_found:
            penalty = len(disliked_found) * self.tech_config.get("dislikedPenalty", -5)
            points += penalty
            adjustments.append(
                ScoreAdjustment(
                    category="technology",
                    reason=f"Disliked tech: {', '.join(disliked_found)}",
                    points=penalty,
                )
            )

        return {"points": points, "adjustments": adjustments}

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
        below_target_penalty = self.salary_config.get("belowTargetPenalty", 2)
        equity_bonus = self.salary_config.get("equityBonus", 5)
        contract_penalty = self.salary_config.get("contractPenalty", -15)

        points = 0
        adjustments: List[ScoreAdjustment] = []

        # Use max salary if available, otherwise min
        job_salary = max_salary or min_salary

        if job_salary is None:
            # No salary info - small penalty for uncertainty
            points -= 5
            adjustments.append(
                ScoreAdjustment(
                    category="salary",
                    reason="No salary info",
                    points=-5,
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
                penalty_units = diff // 10000  # Per $10k below target
                penalty = -int(penalty_units * below_target_penalty)
                penalty = max(penalty, -20)  # Cap penalty at -20
                points += penalty
                adjustments.append(
                    ScoreAdjustment(
                        category="salary",
                        reason=f"Salary ${job_salary:,} below target ${config_target:,}",
                        points=penalty,
                    )
                )
            elif config_target:
                # At or above target - bonus
                points += 5
                adjustments.append(
                    ScoreAdjustment(
                        category="salary",
                        reason=f"Salary ${job_salary:,} meets target",
                        points=5,
                    )
                )

        # Equity bonus
        if includes_equity and equity_bonus:
            points += equity_bonus
            adjustments.append(
                ScoreAdjustment(
                    category="salary",
                    reason="Includes equity",
                    points=equity_bonus,
                )
            )

        # Contract penalty
        if is_contract and contract_penalty:
            points += contract_penalty
            adjustments.append(
                ScoreAdjustment(
                    category="salary",
                    reason="Contract position",
                    points=contract_penalty,
                )
            )

        return {"points": points, "adjustments": adjustments}

    def _score_experience(self, min_exp: Optional[int], max_exp: Optional[int]) -> Dict[str, Any]:
        """Score based on experience requirements."""
        user_years = self.experience_config.get("userYears", 0)
        max_required = self.experience_config.get("maxRequired", 15)
        overqualified_penalty = self.experience_config.get("overqualifiedPenalty", 5)

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
            penalty = -min(over_years * overqualified_penalty, 15)
            return {
                "points": penalty,
                "adjustments": [
                    ScoreAdjustment(
                        category="experience",
                        reason=f"User overqualified ({user_years}y vs {job_max}y max)",
                        points=penalty,
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

    def _score_skills(self, description: str) -> Dict[str, Any]:
        """Score based on skill keywords in description using word-boundary matching."""
        if not self.user_skills or not description:
            return {"points": 0, "adjustments": []}

        desc_lower = description.lower()
        # Use word boundary matching to avoid false positives
        # e.g., "go" shouldn't match "going", "good", etc.
        matched_skills = [
            skill
            for skill in self.user_skills
            if re.search(rf"\b{re.escape(skill)}\b", desc_lower)
        ]

        if not matched_skills:
            return {"points": 0, "adjustments": []}

        # Bonus based on number of matched skills
        match_count = len(matched_skills)
        bonus = min(match_count * 2, 15)  # Cap at +15

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
        - freshBonusDays: Days threshold for fresh bonus
        - freshBonus: Points bonus for fresh jobs
        - staleThresholdDays: Days threshold for stale penalty
        - stalePenalty: Points penalty for stale jobs
        - veryStaleDays: Days threshold for very stale penalty
        - veryStalePenalty: Points penalty for very stale jobs
        - repostPenalty: Points penalty for reposts
        """
        # Use pre-loaded config (required fields, no defaults)
        fresh_bonus_days = self.freshness_config["freshBonusDays"]
        fresh_bonus = self.freshness_config["freshBonus"]
        stale_threshold_days = self.freshness_config["staleThresholdDays"]
        stale_penalty = self.freshness_config["stalePenalty"]
        very_stale_days = self.freshness_config["veryStaleDays"]
        very_stale_penalty = self.freshness_config["veryStalePenalty"]
        repost_penalty = self.freshness_config["repostPenalty"]

        days_old = extraction.days_old
        is_repost = extraction.is_repost

        if days_old is None:
            # No freshness info - neutral
            return {"points": 0, "adjustments": []}

        points = 0
        adjustments: List[ScoreAdjustment] = []

        if days_old <= fresh_bonus_days:
            points = fresh_bonus
            adjustments.append(
                ScoreAdjustment(
                    category="freshness",
                    reason=f"Fresh job ({days_old}d old)",
                    points=fresh_bonus,
                )
            )
        elif days_old >= very_stale_days:
            points = very_stale_penalty
            adjustments.append(
                ScoreAdjustment(
                    category="freshness",
                    reason=f"Very stale job ({days_old}d old)",
                    points=very_stale_penalty,
                )
            )
        elif days_old >= stale_threshold_days:
            points = stale_penalty
            adjustments.append(
                ScoreAdjustment(
                    category="freshness",
                    reason=f"Stale job ({days_old}d old)",
                    points=stale_penalty,
                )
            )

        # Additional penalty for reposts
        if is_repost:
            points += repost_penalty
            adjustments.append(
                ScoreAdjustment(
                    category="freshness",
                    reason="Reposted job",
                    points=repost_penalty,
                )
            )

        return {"points": points, "adjustments": adjustments}

    def _score_role_fit(self, extraction: JobExtractionResult) -> Dict[str, Any]:
        """
        Score based on role fit signals (backend, ML/AI, DevOps, etc.).

        Uses match-policy.roleFit config (all fields required):
        - backendBonus: Bonus for backend roles
        - mlAiBonus: Bonus for ML/AI roles
        - devopsSreBonus: Bonus for DevOps/SRE roles
        - dataBonus: Bonus for data engineering roles
        - securityBonus: Bonus for security roles
        - frontendPenalty: Penalty for frontend-only roles
        - consultingPenalty: Penalty for consulting roles
        - clearancePenalty: Penalty for clearance-required roles
        - managementPenalty: Penalty for management roles
        - leadBonus: Bonus for technical lead roles
        """
        # Use pre-loaded config (required fields, no defaults)
        backend_bonus = self.role_fit_config["backendBonus"]
        ml_ai_bonus = self.role_fit_config["mlAiBonus"]
        devops_sre_bonus = self.role_fit_config["devopsSreBonus"]
        data_bonus = self.role_fit_config["dataBonus"]
        security_bonus = self.role_fit_config["securityBonus"]
        frontend_penalty = self.role_fit_config["frontendPenalty"]
        consulting_penalty = self.role_fit_config["consultingPenalty"]
        clearance_penalty = self.role_fit_config["clearancePenalty"]
        management_penalty = self.role_fit_config["managementPenalty"]
        lead_bonus = self.role_fit_config["leadBonus"]

        points = 0
        adjustments: List[ScoreAdjustment] = []

        # Check for clearance requirement (potential hard reject)
        if extraction.requires_clearance:
            if clearance_penalty <= -100:
                return {
                    "points": clearance_penalty,
                    "adjustments": [
                        ScoreAdjustment(
                            category="role_fit",
                            reason="Security clearance required",
                            points=clearance_penalty,
                        )
                    ],
                    "hard_reject": True,
                    "rejection_reason": "Security clearance required",
                }
            points += clearance_penalty
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason="Clearance required",
                    points=clearance_penalty,
                )
            )

        # Role type bonuses
        if extraction.is_backend and backend_bonus:
            points += backend_bonus
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason="Backend role",
                    points=backend_bonus,
                )
            )

        if extraction.is_ml_ai and ml_ai_bonus:
            points += ml_ai_bonus
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason="ML/AI role",
                    points=ml_ai_bonus,
                )
            )

        if extraction.is_devops_sre and devops_sre_bonus:
            points += devops_sre_bonus
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason="DevOps/SRE role",
                    points=devops_sre_bonus,
                )
            )

        if extraction.is_data and data_bonus:
            points += data_bonus
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason="Data engineering role",
                    points=data_bonus,
                )
            )

        if extraction.is_security and security_bonus:
            points += security_bonus
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason="Security role",
                    points=security_bonus,
                )
            )

        if extraction.is_lead and lead_bonus:
            points += lead_bonus
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason="Technical lead role",
                    points=lead_bonus,
                )
            )

        # Penalties
        if extraction.is_frontend and not extraction.is_fullstack and frontend_penalty:
            points += frontend_penalty
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason="Frontend-only role",
                    points=frontend_penalty,
                )
            )

        if extraction.is_consulting and consulting_penalty:
            points += consulting_penalty
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason="Consulting role",
                    points=consulting_penalty,
                )
            )

        if extraction.is_management and management_penalty:
            points += management_penalty
            adjustments.append(
                ScoreAdjustment(
                    category="role_fit",
                    reason="Management role",
                    points=management_penalty,
                )
            )

        return {"points": points, "adjustments": adjustments}

    def _score_company_signals(self, company_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Score based on company signals from enriched company data.

        Uses match-policy.company config (all fields required):
        - preferredCityBonus: Bonus for companies with office in preferred city
        - preferredCity: User's preferred city for office bonus
        - remoteFirstBonus: Bonus for remote-first companies
        - aiMlFocusBonus: Bonus for AI/ML focused companies
        - largeCompanyBonus: Bonus for large companies
        - smallCompanyPenalty: Penalty for small companies
        - largeCompanyThreshold: Employee count for "large"
        - smallCompanyThreshold: Employee count for "small"
        - startupBonus: Alternative bonus for startups
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

        # 1. Preferred city office bonus (required field)
        preferred_city_bonus = self.company_config["preferredCityBonus"]
        preferred_city = self.company_config.get("preferredCity", "").lower()
        if preferred_city_bonus and preferred_city:
            has_preferred_city = any(
                preferred_city in loc for loc in locations_lower
            ) or preferred_city in headquarters
            if has_preferred_city:
                points += preferred_city_bonus
                adjustments.append(
                    ScoreAdjustment(
                        category="company",
                        reason=f"{preferred_city.title()} office",
                        points=preferred_city_bonus,
                    )
                )

        # 2. Remote-first bonus (required field)
        remote_first_bonus = self.company_config["remoteFirstBonus"]
        if remote_first_bonus and is_remote_first:
            points += remote_first_bonus
            adjustments.append(
                ScoreAdjustment(
                    category="company",
                    reason="Remote-first company",
                    points=remote_first_bonus,
                )
            )

        # 3. AI/ML focus bonus (required field)
        ai_ml_bonus = self.company_config["aiMlFocusBonus"]
        if ai_ml_bonus:
            ai_keywords = ["machine learning", "artificial intelligence", "ai", "ml", "deep learning", "llm", "generative ai"]
            has_ai_focus = any(kw in description for kw in ai_keywords) or any(
                any(kw in str(t).lower() for kw in ["pytorch", "tensorflow", "ml", "ai"])
                for t in tech_stack
            )
            if has_ai_focus:
                points += ai_ml_bonus
                adjustments.append(
                    ScoreAdjustment(
                        category="company",
                        reason="AI/ML focus",
                        points=ai_ml_bonus,
                    )
                )

        # 4. Company size scoring (all fields required)
        large_company_bonus = self.company_config["largeCompanyBonus"]
        small_company_penalty = self.company_config["smallCompanyPenalty"]
        large_threshold = self.company_config["largeCompanyThreshold"]
        small_threshold = self.company_config["smallCompanyThreshold"]
        startup_bonus = self.company_config["startupBonus"]

        if employee_count and isinstance(employee_count, (int, float)):
            if employee_count >= large_threshold and large_company_bonus:
                points += large_company_bonus
                adjustments.append(
                    ScoreAdjustment(
                        category="company",
                        reason="Large company",
                        points=large_company_bonus,
                    )
                )
            elif employee_count <= small_threshold:
                if startup_bonus:
                    points += startup_bonus
                    adjustments.append(
                        ScoreAdjustment(
                            category="company",
                            reason="Startup",
                            points=startup_bonus,
                        )
                    )
                elif small_company_penalty:
                    points += small_company_penalty
                    adjustments.append(
                        ScoreAdjustment(
                            category="company",
                            reason="Small company",
                            points=small_company_penalty,
                        )
                    )

        return {"points": points, "adjustments": adjustments}
