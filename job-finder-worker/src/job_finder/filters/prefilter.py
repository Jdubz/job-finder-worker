"""Structured data pre-filter for jobs before AI extraction.

This filter runs AFTER scraping but BEFORE AI extraction to quickly reject
obviously unsuitable jobs using structured data from APIs.

CRITICAL DESIGN PRINCIPLE: Missing data = PASS
If a field is not available from the API, the job PASSES that check.
We only reject when we have EXPLICIT data that violates the filter.

PreFilter settings should be MORE PERMISSIVE than match-policy settings
to avoid false positives. It's better to waste an AI call than to reject
a potentially good match.
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from job_finder.utils.date_utils import parse_job_date

logger = logging.getLogger(__name__)


@dataclass
class PreFilterResult:
    """Result of pre-filtering a job."""

    passed: bool
    reason: Optional[str] = None
    # Track which checks were actually performed (had data available)
    checks_performed: List[str] = field(default_factory=list)
    # Track which checks were skipped (no data available)
    checks_skipped: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "passed": self.passed,
            "reason": self.reason,
            "checksPerformed": self.checks_performed,
            "checksSkipped": self.checks_skipped,
        }


class PreFilter:
    """
    Structured data pre-filter for early rejection of unsuitable jobs.

    This filter checks structured data from APIs before AI extraction.
    It is intentionally PERMISSIVE - missing data always passes.

    Supported checks:
    - Title keywords (required/excluded)
    - Job freshness (max age in days)
    - Work arrangement (remote/hybrid/onsite)
    - Employment type (full-time/part-time/contract)
    - Salary floor (minimum acceptable)
    - Technology rejection (from structured tags)
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the pre-filter.

        Args:
            config: PreFilterPolicy dictionary
        """
        self.config = config

        # Title config
        title_config = config.get("title", {})
        self.required_keywords = [
            k.lower().strip() for k in title_config.get("requiredKeywords", []) if k
        ]
        self.excluded_keywords = [
            k.lower().strip() for k in title_config.get("excludedKeywords", []) if k
        ]

        # Freshness config
        freshness_config = config.get("freshness", {})
        self.max_age_days = freshness_config.get("maxAgeDays", 0)

        # Work arrangement config
        work_config = config.get("workArrangement", {})
        self.allow_remote = work_config.get("allowRemote", True)
        self.allow_hybrid = work_config.get("allowHybrid", True)
        self.allow_onsite = work_config.get("allowOnsite", True)

        # Employment type config
        emp_config = config.get("employmentType", {})
        self.allow_full_time = emp_config.get("allowFullTime", True)
        self.allow_part_time = emp_config.get("allowPartTime", True)
        self.allow_contract = emp_config.get("allowContract", True)

        # Salary config
        salary_config = config.get("salary", {})
        self.min_salary = salary_config.get("minimum")

        # Technology config
        tech_config = config.get("technology", {})
        self.rejected_tech = {t.lower().strip() for t in tech_config.get("rejected", []) if t}

        logger.debug(
            f"PreFilter initialized: "
            f"title={len(self.required_keywords)}req/{len(self.excluded_keywords)}excl, "
            f"maxAge={self.max_age_days}d, "
            f"work=R{self.allow_remote}/H{self.allow_hybrid}/O{self.allow_onsite}, "
            f"emp=FT{self.allow_full_time}/PT{self.allow_part_time}/C{self.allow_contract}, "
            f"minSalary={self.min_salary}, "
            f"rejectedTech={len(self.rejected_tech)}"
        )

    def filter(self, job_data: Dict[str, Any]) -> PreFilterResult:
        """
        Filter a job using available structured data.

        Args:
            job_data: Scraped job data dictionary with available fields

        Returns:
            PreFilterResult with pass/fail status and details
        """
        checks_performed = []
        checks_skipped = []

        # 1. Title check (always available)
        title = job_data.get("title", "")
        if title:
            checks_performed.append("title")
            result = self._check_title(title)
            if not result.passed:
                return PreFilterResult(
                    passed=False,
                    reason=result.reason,
                    checks_performed=checks_performed,
                    checks_skipped=checks_skipped,
                )
        else:
            checks_skipped.append("title")

        # 2. Freshness check (if posted_date available and parseable)
        if self.max_age_days > 0:
            posted_date = job_data.get("posted_date")
            if posted_date:
                result, was_parseable = self._check_freshness(posted_date)
                if was_parseable:
                    checks_performed.append("freshness")
                    if not result.passed:
                        return PreFilterResult(
                            passed=False,
                            reason=result.reason,
                            checks_performed=checks_performed,
                            checks_skipped=checks_skipped,
                        )
                else:
                    # Date present but unparseable - treat as skipped
                    checks_skipped.append("freshness")
            else:
                checks_skipped.append("freshness")

        # 3. Work arrangement check (if is_remote or work_arrangement available)
        work_arrangement = self._infer_work_arrangement(job_data)
        if work_arrangement:
            checks_performed.append("workArrangement")
            result = self._check_work_arrangement(work_arrangement)
            if not result.passed:
                return PreFilterResult(
                    passed=False,
                    reason=result.reason,
                    checks_performed=checks_performed,
                    checks_skipped=checks_skipped,
                )
        else:
            checks_skipped.append("workArrangement")

        # 4. Employment type check (if employment_type or job_type available)
        employment_type = self._normalize_employment_type(job_data)
        if employment_type:
            checks_performed.append("employmentType")
            result = self._check_employment_type(employment_type)
            if not result.passed:
                return PreFilterResult(
                    passed=False,
                    reason=result.reason,
                    checks_performed=checks_performed,
                    checks_skipped=checks_skipped,
                )
        else:
            checks_skipped.append("employmentType")

        # 5. Salary check (if salary data available)
        if self.min_salary is not None:
            salary = self._extract_salary(job_data)
            if salary is not None:
                checks_performed.append("salary")
                result = self._check_salary(salary)
                if not result.passed:
                    return PreFilterResult(
                        passed=False,
                        reason=result.reason,
                        checks_performed=checks_performed,
                        checks_skipped=checks_skipped,
                    )
            else:
                checks_skipped.append("salary")

        # 6. Technology check (if tags available)
        if self.rejected_tech:
            tags = job_data.get("tags", [])
            if tags:
                checks_performed.append("technology")
                result = self._check_technologies(tags)
                if not result.passed:
                    return PreFilterResult(
                        passed=False,
                        reason=result.reason,
                        checks_performed=checks_performed,
                        checks_skipped=checks_skipped,
                    )
            else:
                checks_skipped.append("technology")

        # All checks passed (or were skipped due to missing data)
        return PreFilterResult(
            passed=True,
            checks_performed=checks_performed,
            checks_skipped=checks_skipped,
        )

    def _check_title(self, title: str) -> PreFilterResult:
        """Check title against required and excluded keywords."""
        title_lower = title.lower()

        # Check excluded keywords first (fast reject)
        for keyword in self.excluded_keywords:
            if keyword in title_lower:
                return PreFilterResult(
                    passed=False,
                    reason=f"Title contains excluded keyword: '{keyword}'",
                )

        # Check required keywords (must have at least one)
        if self.required_keywords:
            has_required = any(kw in title_lower for kw in self.required_keywords)
            if not has_required:
                return PreFilterResult(
                    passed=False,
                    reason=f"Title missing required keywords",
                )

        return PreFilterResult(passed=True)

    def _check_freshness(self, posted_date: Any) -> tuple[PreFilterResult, bool]:
        """
        Check if job is too old based on posted_date.

        Returns:
            Tuple of (PreFilterResult, was_parseable) where was_parseable indicates
            if the date could be parsed (True) or should be treated as skipped (False).
        """
        try:
            parsed = parse_job_date(str(posted_date))
            if parsed is None:
                # Can't parse date - treat as skipped
                return PreFilterResult(passed=True), False

            now = datetime.now(timezone.utc)
            # Ensure parsed date has timezone info
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)

            age_days = (now - parsed).days

            if age_days > self.max_age_days:
                return (
                    PreFilterResult(
                        passed=False,
                        reason=f"Job is {age_days} days old (max: {self.max_age_days})",
                    ),
                    True,
                )

            return PreFilterResult(passed=True), True

        except Exception as e:
            # Error parsing - treat as skipped, not performed
            logger.debug(f"Error parsing posted_date '{posted_date}': {e}")
            return PreFilterResult(passed=True), False

    def _infer_work_arrangement(self, job_data: Dict[str, Any]) -> Optional[str]:
        """
        Infer work arrangement from available data.

        Returns: "remote", "hybrid", "onsite", or None if unknown
        """
        # Direct is_remote boolean (Ashby)
        is_remote = job_data.get("is_remote")
        if is_remote is True:
            return "remote"

        # Check metadata for work arrangement (Greenhouse)
        metadata = job_data.get("metadata", {})
        if isinstance(metadata, dict):
            location_type = metadata.get("Location Type", "")
            if location_type:
                lt_lower = location_type.lower()
                if "remote" in lt_lower:
                    return "remote"
                if "hybrid" in lt_lower:
                    return "hybrid"
                if "onsite" in lt_lower or "on-site" in lt_lower or "office" in lt_lower:
                    return "onsite"

        # Check location string for hints
        location = job_data.get("location", "")
        if isinstance(location, str):
            loc_lower = location.lower()
            if "remote" in loc_lower:
                return "remote"
            if "hybrid" in loc_lower:
                return "hybrid"

        # Can't determine - return None (will be skipped)
        return None

    def _check_work_arrangement(self, arrangement: str) -> PreFilterResult:
        """Check if work arrangement is allowed."""
        if arrangement == "remote" and not self.allow_remote:
            return PreFilterResult(
                passed=False,
                reason="Remote positions not allowed",
            )
        if arrangement == "hybrid" and not self.allow_hybrid:
            return PreFilterResult(
                passed=False,
                reason="Hybrid positions not allowed",
            )
        if arrangement == "onsite" and not self.allow_onsite:
            return PreFilterResult(
                passed=False,
                reason="Onsite positions not allowed",
            )

        return PreFilterResult(passed=True)

    def _normalize_employment_type(self, job_data: Dict[str, Any]) -> Optional[str]:
        """
        Normalize employment type from various field names and formats.

        Returns: "full-time", "part-time", "contract", or None if unknown
        """
        # Try different field names
        emp_type = job_data.get("employment_type") or job_data.get("job_type") or ""

        if not emp_type:
            return None

        emp_lower = emp_type.lower().replace("_", "-").replace(" ", "-")

        if "full" in emp_lower:
            return "full-time"
        if "part" in emp_lower:
            return "part-time"
        if "contract" in emp_lower or "freelance" in emp_lower:
            return "contract"

        # Unknown format - return None
        return None

    def _check_employment_type(self, emp_type: str) -> PreFilterResult:
        """Check if employment type is allowed."""
        if emp_type == "full-time" and not self.allow_full_time:
            return PreFilterResult(
                passed=False,
                reason="Full-time positions not allowed",
            )
        if emp_type == "part-time" and not self.allow_part_time:
            return PreFilterResult(
                passed=False,
                reason="Part-time positions not allowed",
            )
        if emp_type == "contract" and not self.allow_contract:
            return PreFilterResult(
                passed=False,
                reason="Contract positions not allowed",
            )

        return PreFilterResult(passed=True)

    def _extract_salary(self, job_data: Dict[str, Any]) -> Optional[int]:
        """
        Extract salary value from job data.

        Uses max salary if available, otherwise min.
        Returns None if no salary data.
        """
        # Try structured salary fields first
        salary_max = job_data.get("salary_max")
        salary_min = job_data.get("salary_min")

        if salary_max is not None:
            try:
                return int(float(salary_max))
            except (ValueError, TypeError):
                pass

        if salary_min is not None:
            try:
                return int(float(salary_min))
            except (ValueError, TypeError):
                pass

        # Try salary string (Remotive format like "$100k - $150k")
        salary_str = job_data.get("salary", "")
        if salary_str and isinstance(salary_str, str):
            try:
                # Extract numbers with optional 'k' suffix (e.g., "100", "100,000", "150k")
                # The 'k' is optional to handle both "$150k" and "$150,000" formats
                numbers = re.findall(r"[\d,]+(?:k)?", salary_str.lower())
                if numbers:
                    # Parse the highest number as the max salary
                    parsed = []
                    for num in numbers:
                        has_k = "k" in num
                        has_comma = "," in num

                        if has_k and has_comma:
                            # Invalid mixed format like "120,000k", skip
                            continue
                        elif has_k:
                            # "100k" -> 100 * 1000 = 100000
                            clean = num.replace("k", "")
                            parsed.append(int(clean) * 1000)
                        else:
                            # "100,000" -> 100000
                            clean = num.replace(",", "")
                            parsed.append(int(clean))
                    if parsed:
                        return max(parsed)
            except (ValueError, TypeError):
                # Unparseable salary string format, fall through to return None
                pass

        return None

    def _check_salary(self, salary: int) -> PreFilterResult:
        """Check if salary meets minimum floor."""
        # Defensive check - caller should verify min_salary is not None
        if self.min_salary is None:
            return PreFilterResult(passed=True)

        if salary < self.min_salary:
            return PreFilterResult(
                passed=False,
                reason=f"Salary ${salary:,} below minimum ${self.min_salary:,}",
            )

        return PreFilterResult(passed=True)

    def _check_technologies(self, tags: List[str]) -> PreFilterResult:
        """Check if any rejected technologies are in the tags."""
        if not isinstance(tags, list):
            return PreFilterResult(passed=True)

        tags_lower = {str(t).lower().strip() for t in tags if t}
        rejected_found = tags_lower & self.rejected_tech

        if rejected_found:
            return PreFilterResult(
                passed=False,
                reason=f"Contains rejected technology: {', '.join(rejected_found)}",
            )

        return PreFilterResult(passed=True)
