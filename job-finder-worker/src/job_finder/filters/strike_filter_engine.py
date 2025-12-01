"""
Strike-based job filter engine.

Two-tier filtering system:
1. Hard Rejections - Immediate fail (sales jobs, too junior, etc.)
2. Strike System - Accumulate points, fail if >= threshold
"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from job_finder.filters.models import FilterResult
from job_finder.utils.date_utils import parse_job_date
from job_finder.utils.location_rules import LocationContext, evaluate_location_rules

logger = logging.getLogger(__name__)


class StrikeFilterEngine:
    """
    Strike-based filter engine with two-tier system.

    Tier 1: Hard rejections (immediate fail)
    Tier 2: Strike accumulation (fail if >= threshold)
    """

    def __init__(self, policy: dict, tech_ranks: Optional[dict] = None):
        """Initialize strike-based filter engine (new config shape only).

        tech_ranks kept for backward compatibility with tests that passed it separately.
        """

        self.policy = policy
        self.stop_list = policy.get("stopList", {})
        self.stop_companies = [c.lower() for c in self.stop_list.get("excludedCompanies", [])]
        self.stop_keywords = [k.lower() for k in self.stop_list.get("excludedKeywords", [])]
        self.stop_domains = [d.lower() for d in self.stop_list.get("excludedDomains", [])]
        config = policy.get("strikeEngine", {})
        self.tech_ranks = tech_ranks or policy.get("technologyRanks", {})
        self.enabled = config.get("enabled", True)
        self.strike_threshold = config.get("strikeThreshold", 5)

        # Hard Rejections
        unified_stop_list = policy.get("stopList", {})
        self.stop_companies = [c.lower() for c in unified_stop_list.get("excludedCompanies", [])]
        self.stop_keywords = [k.lower() for k in unified_stop_list.get("excludedKeywords", [])]
        self.stop_domains = [d.lower() for d in unified_stop_list.get("excludedDomains", [])]

        hard_rej = config.get("hardRejections", {})
        self.excluded_job_types = [t.lower() for t in hard_rej.get("excludedJobTypes", [])]
        self.excluded_seniority = [s.lower() for s in hard_rej.get("excludedSeniority", [])]
        self.required_title_keywords = [
            k.lower() for k in hard_rej.get("requiredTitleKeywords", [])
        ]
        self.min_salary_floor = hard_rej.get("minSalaryFloor", 100000)
        self.reject_commission_only = hard_rej.get("rejectCommissionOnly", True)

        # Remote Policy
        remote = config.get("remotePolicy", {})
        self.allow_remote = remote.get("allowRemote", True)
        self.allow_location_based_roles = remote.get("allowOnsite", False)
        self.allow_hybrid = remote.get("allowHybridInTimezone", True)
        self.max_timezone_diff_hours = remote.get("maxTimezoneDiffHours", 8)
        self.per_hour_timezone_penalty = abs(remote.get("perHourTimezonePenalty", 1))
        self.hard_timezone_penalty = abs(remote.get("hardTimezonePenalty", 3))
        self.user_timezone: Optional[float] = policy.get("userTimezone")

        # Location context for relocation rules
        self.user_city = policy.get("userCity") or None
        self.relocation_allowed = policy.get("relocationAllowed", False)
        self.relocation_penalty = policy.get("relocationPenaltyPoints", 80)
        self.location_penalty = policy.get("locationPenaltyPoints", 60)
        self.ambiguous_location_penalty = policy.get("ambiguousLocationPenaltyPoints", 40)

        # Strike: Salary
        salary_strike = config.get("salaryStrike", {})
        self.salary_strike_enabled = salary_strike.get("enabled", True)
        self.salary_strike_threshold = salary_strike.get("threshold", 150000)
        self.salary_strike_points = salary_strike.get("points", 2)

        # NOTE: Experience strike REMOVED - seniority filtering handles this.
        # 5+ years is standard for senior roles.

        # NOTE: Job-type strike REMOVED - let AI analysis handle this.
        # A software engineer at a sales company is still a good match.

        # Strike: Seniority
        self.seniority_strikes = config.get("seniorityStrikes", {})

        # Strike: Quality
        quality = config.get("qualityStrikes", {})
        self.min_description_length = quality.get("minDescriptionLength", 200)
        self.short_description_points = quality.get("shortDescriptionPoints", 1)
        self.buzzwords = [b.lower() for b in quality.get("buzzwords", [])]
        self.buzzword_points = quality.get("buzzwordPoints", 1)

        # Strike: Age
        age_strike = config.get("ageStrike", {})
        self.age_strike_enabled = age_strike.get("enabled", True)
        self.age_strike_days = age_strike.get("strikeDays", 1)  # > 1 day = strike
        self.age_reject_days = age_strike.get("rejectDays", 7)  # > 7 days = reject
        self.age_strike_points = age_strike.get("points", 1)

        # Technology ranks - only penalize for undesired tech, not missing tech info
        self.technologies = self.tech_ranks.get("technologies", {})

    def set_user_timezone(self, timezone_offset: Optional[float]) -> None:
        """Propagate the user's timezone offset into the filter after construction."""
        self.user_timezone = timezone_offset

    def empty_pass_result(self) -> FilterResult:
        """Return a pass result with zero strikes (used for bypass scenarios)."""
        return FilterResult(passed=True, total_strikes=0, strike_threshold=self.strike_threshold)

    def evaluate_job(self, job_data: dict) -> FilterResult:
        """
        Evaluate job with strike-based system.

        Args:
            job_data: Job data with title, description, salary, posted_date, etc.

        Returns:
            FilterResult with strikes and hard rejections
        """
        if not self.enabled:
            return FilterResult(passed=True, strike_threshold=self.strike_threshold)

        result = FilterResult(passed=True, strike_threshold=self.strike_threshold)

        # Extract fields
        title = job_data.get("title", "")
        company = job_data.get("company", "")
        description = job_data.get("description", "")
        location = job_data.get("location", "")
        salary = job_data.get("salary", "")
        posted_date_str = job_data.get("posted_date", "")

        # === PHASE 1: Hard Rejections (immediate fail) ===

        # Check required title keywords (now contributes strikes instead of hard reject)
        self._missing_required_title_keyword(title, result)

        # NOTE: Removed hard-reject job type check; job-type signals now handled as strikes

        # Check seniority
        if self._is_excluded_seniority(title, result):
            return result

        # Stop-list checks (companies/domains/keywords) as strikes first, not auto-fail
        self._check_stop_list(company, description, result)

        # Check salary floor
        if self._below_salary_floor(salary, result):
            return result

        # Check commission only
        if self._is_commission_only(description, result):
            return result

        # Check remote/location policy (uses strike-first for remote, hard fail for onsite/hybrid outside city)
        if self._violates_remote_policy(description, location, result):
            return result

        # Check age (hard reject if too old)
        if self._is_too_old(posted_date_str, result):
            return result

        # === PHASE 2: Strike Accumulation ===

        # Salary strike (< threshold)
        if self.salary_strike_enabled:
            self._check_salary_strike(salary, result)

        # NOTE: Job-type strike REMOVED - let AI analysis handle this.
        # A software engineer at a sales company is still a good match.

        # NOTE: Experience strike REMOVED - seniority filtering (intern, entry-level,
        # associate, etc.) handles this. 5+ years is standard for senior roles.

        # Seniority strikes (mid-level, principal, director)
        self._check_seniority_strikes(title, result)

        # Technology strikes
        self._check_technology_strikes(title, description, result)

        # Quality strikes
        self._check_quality_strikes(description, result)

        # Age strike (> 1 day old)
        if self.age_strike_enabled:
            self._check_age_strike(posted_date_str, result)

        # Log result
        if result.passed:
            logger.info(
                f"Job PASSED filters: {title} ({result.total_strikes}/{self.strike_threshold} strikes)"
            )
        else:
            hard_rejects = [r for r in result.rejections if r.severity == "hard_reject"]
            if hard_rejects:
                logger.info(f"Job HARD REJECTED: {title} - {hard_rejects[0].reason}")
            else:
                logger.info(
                    f"Job STRIKE FILTERED: {title} - {result.total_strikes}/{self.strike_threshold} strikes"
                )

        return result

    # === Hard Rejection Checks ===

    def _missing_required_title_keyword(self, title: str, result: FilterResult) -> None:
        """
        Check if job title is missing all required keywords (whitelist check).

        Job title MUST contain at least one of the required keywords to be considered.
        This is a pre-filter to ensure we only process relevant software/engineering jobs.
        """
        if not title:
            # If no title was provided (e.g., manual entry without scrape), don't hard reject here;
            # downstream analysis will make a determination.
            return
        # If no required keywords configured, skip this check
        if not self.required_title_keywords:
            return

        title_lower = title.lower()

        # Check if title contains at least one required keyword
        def is_match(keyword: str) -> bool:
            if " " in keyword:
                # Multi-word phrase (e.g., "full stack") - substring match
                return keyword in title_lower
            else:
                # Single word - use lookarounds to avoid partial matches
                # and handle non-alphanumeric keywords like c++, c#
                pattern = r"(?<!\w)" + re.escape(keyword) + r"(?!\w)"
                return bool(re.search(pattern, title_lower))

        if any(is_match(k) for k in self.required_title_keywords):
            return  # Found a match, no strike

        # No required keywords found – hard reject to enforce whitelist
        result.add_rejection(
            filter_category="hard_reject",
            filter_name="missing_required_title_keyword",
            reason="Title missing required keywords",
            detail=f"Title '{title}' does not contain any of: {', '.join(self.required_title_keywords)}",
            severity="hard_reject",
            points=0,
        )

    # NOTE: _check_job_type_strike REMOVED - let AI analysis determine job fit.
    # A software engineer at a sales company is still a good match.

    def _is_excluded_seniority(self, title: str, result: FilterResult) -> bool:
        """Check if seniority is too junior."""
        title_lower = title.lower()

        for seniority in self.excluded_seniority:
            # Use word boundary regex to match whole words only
            pattern = r"\b" + re.escape(seniority) + r"\b"
            if re.search(pattern, title_lower):
                result.add_rejection(
                    filter_category="hard_reject",
                    filter_name="excluded_seniority",
                    reason=f"Too junior: {seniority}",
                    detail=f"Title contains '{seniority}' which is below required level",
                    severity="hard_reject",
                    points=0,
                )
                return True
        return False

    def _is_excluded_company(self, company: str, result: FilterResult) -> bool:
        """Check if company is in exclusion list."""
        company_lower = company.lower()

        for excluded in self.excluded_companies:
            if excluded in company_lower:
                result.add_rejection(
                    filter_category="hard_reject",
                    filter_name="excluded_company",
                    reason=f"Excluded company: {excluded}",
                    detail=f"Company '{company}' is in exclusion list",
                    severity="hard_reject",
                    points=0,
                )
                return True
        return False

    def _has_excluded_keywords(self, description: str, result: FilterResult) -> bool:
        """Check for deal-breaker keywords (hard reject only from hardRejections)."""
        description_lower = description.lower()

        for keyword in self.excluded_keywords:
            if " " in keyword:
                if keyword in description_lower:
                    result.add_rejection(
                        filter_category="hard_reject",
                        filter_name="excluded_keyword",
                        reason=f"Deal-breaker keyword: {keyword}",
                        detail=f"Description contains '{keyword}'",
                        severity="hard_reject",
                        points=0,
                    )
                    return True
            else:
                pattern = r"\b" + re.escape(keyword) + r"\b"
                if re.search(pattern, description_lower):
                    result.add_rejection(
                        filter_category="hard_reject",
                        filter_name="excluded_keyword",
                        reason=f"Deal-breaker keyword: {keyword}",
                        detail=f"Description contains '{keyword}'",
                        severity="hard_reject",
                        points=0,
                    )
                    return True
        return False

    def _below_salary_floor(self, salary: str, result: FilterResult) -> bool:
        """Check if salary is below hard floor and add strikes (no hard reject)."""
        if not salary:
            return False

        max_salary = self._parse_salary(salary)
        if max_salary and max_salary < self.min_salary_floor:
            result.add_strike(
                filter_category="salary",
                filter_name="salary_floor",
                reason=f"Salary below ${self.min_salary_floor // 1000}k floor",
                detail=f"Max salary ${max_salary:,} is below minimum ${self.min_salary_floor:,}",
                points=3,
            )
            return False
        return False

    def _is_commission_only(self, description: str, result: FilterResult) -> bool:
        """Check for commission-only/MLM indicators."""
        if not self.reject_commission_only:
            return False

        description_lower = description.lower()
        indicators = [
            "commission only",
            "commission-only",
            "unlimited earning potential",
            "mlm",
            "multi-level marketing",
            "be your own boss",
        ]

        for indicator in indicators:
            if indicator in description_lower:
                result.add_rejection(
                    filter_category="hard_reject",
                    filter_name="commission_only",
                    reason="Commission-only or MLM position",
                    detail=f"Description contains '{indicator}'",
                    severity="hard_reject",
                    points=0,
                )
                return True
        return False

    def _violates_remote_policy(
        self, description: str, location: str, result: FilterResult
    ) -> bool:
        """Apply unified remote/hybrid/onsite + relocation + timezone rules."""
        description_lower = description.lower()
        location_lower = location.lower()
        combined = f"{description_lower} {location_lower}"

        is_remote = (
            any(
                ind in combined
                for ind in (
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
            )
            or "remote" in location_lower
        )

        is_hybrid = any(ind in combined for ind in ["hybrid", "days in office", "days remote"])
        is_onsite = any(
            ind in combined for ind in ["on-site", "onsite", "in-office", "office-based"]
        )

        if not is_remote and not is_hybrid and not is_onsite and location_lower.strip():
            is_onsite = True

        if not (is_remote or is_hybrid or is_onsite):
            return False

        from job_finder.utils.timezone_utils import detect_timezone_for_job

        job_tz = detect_timezone_for_job(
            job_location=location,
            job_description=description,
            company_size=None,
            headquarters_location=None,
            company_name=None,
            company_info=None,
        )

        ctx = LocationContext(
            user_city=self.user_city,
            user_timezone=self.user_timezone,
            relocation_allowed=self.relocation_allowed,
            relocation_penalty=self.relocation_penalty,
            location_penalty=self.location_penalty,
            ambiguous_location_penalty=self.ambiguous_location_penalty,
            max_timezone_diff_hours=self.max_timezone_diff_hours,
            per_hour_penalty=self.per_hour_timezone_penalty,
            hard_timezone_penalty=self.hard_timezone_penalty,
        )

        eval_result = evaluate_location_rules(
            job_city=location,
            job_timezone=job_tz,
            remote=is_remote,
            hybrid=is_hybrid,
            ctx=ctx,
        )

        if eval_result.hard_reject:
            result.add_rejection(
                filter_category="hard_reject",
                filter_name="location_policy",
                reason=eval_result.reason or "Location policy failure",
                detail=eval_result.reason or "Location policy failure",
                severity="hard_reject",
                points=0,
            )
            return True

        if eval_result.strikes:
            result.add_strike(
                filter_category="location",
                filter_name="timezone_penalty" if is_remote else "relocation_penalty",
                reason=eval_result.reason or "Location penalty",
                detail=eval_result.reason or "Location penalty",
                points=eval_result.strikes,
            )

        return False

    def _is_too_old(self, posted_date_str: str, result: FilterResult) -> bool:
        """Check if job is older than hard reject threshold (7 days)."""
        if not posted_date_str:
            return False  # No date = allow

        posted_date = parse_job_date(posted_date_str)
        if not posted_date:
            return False  # Can't parse = allow

        # Ensure timezone-aware
        if posted_date.tzinfo is None:
            posted_date = posted_date.replace(tzinfo=timezone.utc)

        age_days = (datetime.now(timezone.utc) - posted_date).days

        if age_days > self.age_reject_days:
            result.add_rejection(
                filter_category="hard_reject",
                filter_name="job_age",
                reason=f"Job too old (>{self.age_reject_days} days)",
                detail=f"Job posted {age_days} days ago",
                severity="hard_reject",
                points=0,
            )
            return True
        return False

    # === Strike Checks ===

    def _check_salary_strike(self, salary: str, result: FilterResult) -> None:
        """Add strike if salary < $150k."""
        if not salary:
            return  # No salary = no strike

        max_salary = self._parse_salary(salary)
        if max_salary and max_salary < self.salary_strike_threshold:
            result.add_strike(
                filter_category="salary",
                filter_name="low_salary",
                reason=f"Salary below ${self.salary_strike_threshold // 1000}k",
                detail=f"Max salary ${max_salary:,} is below preferred ${self.salary_strike_threshold:,}",
                points=self.salary_strike_points,
            )

    # NOTE: _check_experience_strike REMOVED - seniority filtering (intern, entry-level,
    # associate, etc.) handles this. 5+ years is standard for senior roles.

    def _check_seniority_strikes(self, title: str, result: FilterResult) -> None:
        """Add strikes for non-ideal seniority levels."""
        title_lower = title.lower()

        for seniority_pattern, points in self.seniority_strikes.items():
            if seniority_pattern.lower() in title_lower:
                result.add_strike(
                    filter_category="seniority",
                    filter_name=f"seniority_{seniority_pattern.replace(' ', '_')}",
                    reason=f"Seniority: {seniority_pattern}",
                    detail=f"Title contains '{seniority_pattern}' which is not ideal",
                    points=points,
                )
                return  # Only count first match

    def _check_technology_strikes(self, title: str, description: str, result: FilterResult) -> None:
        """Check technology stack and add strikes for undesired technologies.

        Only penalizes jobs that explicitly require technologies the user doesn't
        have experience with. Vague or unclear tech requirements are OK - we don't
        penalize for missing tech info, only for explicitly bad tech matches.

        Technology ranks:
        - "required": Tech user wants to work with (positive signal, no penalty if missing)
        - "preferred": Nice to have tech (no penalty)
        - "strike": Tech user doesn't have/want (adds strike points)
        - "fail": Absolute dealbreaker tech (hard reject)
        """
        combined = f"{title} {description}".lower()

        strikes_found = []
        fails_found = []

        for tech_name, tech_data in self.technologies.items():
            rank = tech_data.get("rank", "ok")
            points = tech_data.get("points", 0)

            # Word boundary search to avoid Java/JavaScript confusion
            pattern = r"\b" + re.escape(tech_name.lower()) + r"\b"
            if tech_name.lower() == "go":
                matches = list(re.finditer(pattern, combined))
                go_match = False
                for m in matches:
                    after = combined[m.end() : m.end() + 6]
                    # Skip verbs like "go to market" or "go-to-market"
                    if re.match(r"[\s-]*to\b", after):
                        continue
                    go_match = True
                    break
                if not go_match:
                    continue
                if rank == "strike":
                    strikes_found.append((tech_name, points))
                elif rank == "fail":
                    fails_found.append(tech_name)
                continue

            if re.search(pattern, combined):
                if rank == "strike":
                    strikes_found.append((tech_name, points))
                elif rank == "fail":
                    fails_found.append(tech_name)

        # Check for "fail" technologies (immediate rejection)
        for tech in fails_found:
            result.add_rejection(
                filter_category="hard_reject",
                filter_name="failed_tech",
                reason=f"Forbidden technology: {tech}",
                detail=f"Job requires {tech} which is not acceptable",
                severity="hard_reject",
                points=0,
            )

        # Add strikes for tech user doesn't have experience with
        for tech_name, points in strikes_found:
            result.add_strike(
                filter_category="tech_stack",
                filter_name="undesired_tech",
                reason=f"Undesired tech: {tech_name}",
                detail=f"Job requires {tech_name} which user lacks experience in",
                points=points,
            )

        # NOTE: We intentionally do NOT penalize for missing/vague tech requirements.
        # If a job is unclear about their tech stack, that's fine - AI analysis will
        # evaluate fit. We only penalize for explicitly bad tech matches.

    def _check_quality_strikes(self, description: str, result: FilterResult) -> None:
        """Check description quality and add strikes."""
        # Short description (only if we have a description)
        if description and len(description) < self.min_description_length:
            result.add_strike(
                filter_category="quality",
                filter_name="short_description",
                reason="Description too short",
                detail=f"Description is {len(description)} chars, prefer {self.min_description_length}+",
                points=self.short_description_points,
            )

        # Buzzwords
        description_lower = description.lower()
        for buzzword in self.buzzwords:
            if buzzword in description_lower:
                result.add_strike(
                    filter_category="quality",
                    filter_name="buzzword",
                    reason=f"Contains buzzword: {buzzword}",
                    detail=f"Description contains '{buzzword}'",
                    points=self.buzzword_points,
                )
                return  # Only count first buzzword

    def _check_age_strike(self, posted_date_str: str, result: FilterResult) -> None:
        """Add strike if job is > 1 day old."""
        if not posted_date_str:
            return

        posted_date = parse_job_date(posted_date_str)
        if not posted_date:
            return

        # Ensure timezone-aware
        if posted_date.tzinfo is None:
            posted_date = posted_date.replace(tzinfo=timezone.utc)

        age_days = (datetime.now(timezone.utc) - posted_date).days

        if age_days > self.age_strike_days:
            result.add_strike(
                filter_category="age",
                filter_name="job_age",
                reason=f"Job >{self.age_strike_days} day(s) old",
                detail=f"Job posted {age_days} days ago",
                points=self.age_strike_points,
            )

    # === Helpers ===

    def _parse_salary(self, salary: str) -> Optional[int]:
        """Parse salary string and return max value."""
        if not salary:
            return None

        # Remove common formatting
        salary_clean = salary.replace("$", "").replace(",", "").lower()

        # Find all numbers
        pattern = r"(\d+\.?\d*)\s*k?"
        matches = re.findall(pattern, salary_clean)

        if not matches:
            return None

        # Convert to actual numbers
        salaries = []
        for match in matches:
            num = float(match)
            # If it's in thousands notation (k), multiply by 1000
            if "k" in salary_clean:
                num *= 1000
            salaries.append(int(num))

        return max(salaries) if salaries else None
