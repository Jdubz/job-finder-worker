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
from typing import Any, Dict, List, Optional, Tuple

from job_finder.utils.date_utils import parse_job_date
from job_finder.utils.timezone_utils import get_timezone_diff_hours
from job_finder.exceptions import InitializationError

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

    # Default keywords that indicate remote work (used if not configured)
    DEFAULT_REMOTE_KEYWORDS = ["remote", "distributed", "anywhere", "worldwide"]

    # LinkedIn job-wrapping tags that signal work arrangement inside descriptions
    LI_WORK_ARRANGEMENT_PATTERN = re.compile(r"#\s*li[-_ ]?(remote|hybrid|onsite)\b", re.IGNORECASE)

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
        required_work_keys = [
            "allowRemote",
            "allowHybrid",
            "allowOnsite",
            "willRelocate",
            "userLocation",
        ]
        missing_work = [k for k in required_work_keys if k not in work_config]
        if missing_work:
            raise InitializationError(
                f"workArrangement missing required keys: {missing_work}. Update prefilter-policy."
            )

        self.allow_remote = work_config["allowRemote"]
        self.allow_hybrid = work_config["allowHybrid"]
        self.allow_onsite = work_config["allowOnsite"]
        self.will_relocate = work_config["willRelocate"]
        self.user_location = work_config["userLocation"]

        # New optional config fields for improved work arrangement detection
        # Keywords that indicate remote work (checked in location, offices, metadata)
        remote_kw = work_config.get("remoteKeywords")
        if remote_kw is not None and isinstance(remote_kw, list):
            self.remote_keywords = [
                k.lower().strip() for k in remote_kw if isinstance(k, str) and k.strip()
            ]
        else:
            self.remote_keywords = self.DEFAULT_REMOTE_KEYWORDS

        # If true, treat unknown work arrangement as potentially onsite and apply location filter
        self.treat_unknown_as_onsite = work_config.get("treatUnknownAsOnsite", False)

        # Optional timezone guard for remote/hybrid roles (uses city-based comparison)
        self.max_timezone_diff_hours = work_config.get("maxTimezoneDiffHours")

        bool_keys = [
            ("allow_remote", self.allow_remote),
            ("allow_hybrid", self.allow_hybrid),
            ("allow_onsite", self.allow_onsite),
            ("will_relocate", self.will_relocate),
        ]
        if not all(isinstance(val, bool) for _, val in bool_keys):
            raise InitializationError(
                "allowRemote, allowHybrid, allowOnsite, and willRelocate must be booleans in workArrangement"
            )
        if not isinstance(self.user_location, str):
            raise InitializationError("userLocation must be a string in workArrangement")
        if not self.will_relocate and not self.user_location.strip():
            raise InitializationError(
                "userLocation must be a non-empty string in workArrangement when willRelocate is False"
            )

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
            f"relocate={self.will_relocate}, userLocation={self.user_location}, "
            f"remoteKeywords={self.remote_keywords}, treatUnknownAsOnsite={self.treat_unknown_as_onsite}, "
            f"emp=FT{self.allow_full_time}/PT{self.allow_part_time}/C{self.allow_contract}, "
            f"minSalary={self.min_salary}, "
            f"rejectedTech={len(self.rejected_tech)}"
        )

    def filter(self, job_data: Dict[str, Any], is_remote_source: bool = False) -> PreFilterResult:
        """
        Filter a job using available structured data.

        Args:
            job_data: Scraped job data dictionary with available fields
            is_remote_source: If True, source is a remote-only job board (e.g., Remotive)
                             All jobs from such sources are treated as remote.

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
        work_arrangement = self._infer_work_arrangement(job_data, is_remote_source)
        if work_arrangement:
            checks_performed.append("workArrangement")
            result = self._check_work_arrangement(work_arrangement, job_data)
            if not result.passed:
                return PreFilterResult(
                    passed=False,
                    reason=result.reason,
                    checks_performed=checks_performed,
                    checks_skipped=checks_skipped,
                )
        elif self.treat_unknown_as_onsite and not self.will_relocate and self.user_location:
            # Unknown work arrangement but treatUnknownAsOnsite is enabled
            # Apply location check as if it were onsite
            checks_performed.append("workArrangement")
            in_user_city = self._is_in_user_location(job_data, self.user_location)
            if in_user_city is False:
                return PreFilterResult(
                    passed=False,
                    reason=f"Unknown work arrangement with location outside {self.user_location}",
                    checks_performed=checks_performed,
                    checks_skipped=checks_skipped,
                )
            # in_user_city is True or None (missing data) - allow
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

    def _infer_work_arrangement(
        self, job_data: Dict[str, Any], is_remote_source: bool = False
    ) -> Optional[str]:
        """
        Infer work arrangement from available data.

        Args:
            job_data: Scraped job data dictionary
            is_remote_source: If True, source is a remote-only job board

        Returns: "remote", "hybrid", "onsite", or None if unknown
        """
        # Source-level override: remote-only job boards (Remotive, RemoteOK, etc.)
        if is_remote_source:
            return "remote"

        # Direct is_remote boolean (Ashby)
        is_remote = job_data.get("is_remote")
        if is_remote is True:
            return "remote"

        # Check metadata for work arrangement (Greenhouse "Location Type" field)
        metadata = job_data.get("metadata", {})
        if isinstance(metadata, dict):
            location_type = metadata.get("Location Type", "")
            if isinstance(location_type, str) and location_type:
                lt_lower = location_type.lower()
                if any(kw in lt_lower for kw in self.remote_keywords):
                    return "remote"
                if "hybrid" in lt_lower:
                    return "hybrid"
                if "onsite" in lt_lower or "on-site" in lt_lower or "office" in lt_lower:
                    return "onsite"

        # LinkedIn job-wrapping hashtags often live only in the description
        description = job_data.get("description", "")
        if isinstance(description, str) and description:
            match = self.LI_WORK_ARRANGEMENT_PATTERN.search(description)
            if match:
                arrangement = match.group(1).lower()
                return arrangement

        # Check offices array for remote indicators (Greenhouse)
        offices = job_data.get("offices", [])
        if isinstance(offices, list):
            for office in offices:
                office_name = ""
                if isinstance(office, dict):
                    office_name = office.get("name", "")
                elif isinstance(office, str):
                    office_name = office
                if isinstance(office_name, str) and office_name:
                    office_lower = office_name.lower()
                    if any(kw in office_lower for kw in self.remote_keywords):
                        return "remote"

        # Check location string for hints
        location = job_data.get("location", "")
        if isinstance(location, str):
            loc_lower = location.lower()
            if any(kw in loc_lower for kw in self.remote_keywords):
                return "remote"
            if "hybrid" in loc_lower:
                return "hybrid"

        # Can't determine - return None (will be skipped or treated as onsite if configured)
        return None

    def _check_work_arrangement(
        self, arrangement: str, job_data: Dict[str, Any]
    ) -> PreFilterResult:
        """Check if work arrangement is allowed, honoring user location/relocation preferences."""
        if arrangement == "remote" and not self.allow_remote:
            return PreFilterResult(
                passed=False,
                reason="Remote positions not allowed",
            )

        if arrangement in ("hybrid", "onsite"):
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

            if not self.will_relocate and self.user_location:
                in_user_city = self._is_in_user_location(job_data, self.user_location)
                if in_user_city is False:
                    return PreFilterResult(
                        passed=False,
                        reason=f"{arrangement.capitalize()} roles must be in {self.user_location}",
                    )
                # Missing/ambiguous location data returns None -> allow (missing data = pass)

        # Optional timezone check for remote/hybrid roles using city-based comparison
        if (
            self.max_timezone_diff_hours is not None
            and self.user_location
            and arrangement in ("remote", "hybrid")
        ):
            job_location = self._extract_job_location(job_data)
            if job_location:
                tz_diff = get_timezone_diff_hours(self.user_location, job_location)
                if tz_diff is not None and tz_diff > self.max_timezone_diff_hours:
                    return PreFilterResult(
                        passed=False,
                        reason=f"Timezone diff {tz_diff:.1f}h > {self.max_timezone_diff_hours}h ({self.user_location} vs {job_location})",
                    )

        return PreFilterResult(passed=True)

    def _extract_job_location(self, job_data: Dict[str, Any]) -> Optional[str]:
        """Extract a location string from job data for timezone lookup.

        Returns the first viable location string found, prioritizing structured fields.
        Returns None if no location data is available.
        """
        # Try city + country first (most useful for timezone lookup)
        city = job_data.get("city")
        country = job_data.get("country")
        if city and country:
            return f"{city}, {country}"
        if city:
            state = job_data.get("state") or job_data.get("state_code")
            if state:
                return f"{city}, {state}"
            return str(city)

        # Try location string
        location = job_data.get("location")
        if isinstance(location, str) and location.strip():
            # Skip generic "Remote" locations
            loc_lower = location.lower()
            if loc_lower not in ("remote", "worldwide", "anywhere", "global"):
                return location.strip()

        # Try metadata fields
        metadata = job_data.get("metadata", {})
        if isinstance(metadata, dict):
            for key in ("Location", "location", "Office Location", "Office", "headquarters"):
                value = metadata.get(key)
                if isinstance(value, str) and value.strip():
                    val_lower = value.lower()
                    if val_lower not in ("remote", "worldwide", "anywhere", "global"):
                        return value.strip()

        # Try offices array
        offices = job_data.get("offices", [])
        if isinstance(offices, list) and offices:
            for office in offices:
                office_name = ""
                if isinstance(office, dict):
                    office_name = office.get("name", "") or office.get("location", "")
                elif isinstance(office, str):
                    office_name = office
                if isinstance(office_name, str) and office_name.strip():
                    name_lower = office_name.lower()
                    if name_lower not in ("remote", "worldwide", "anywhere", "global"):
                        return office_name.strip()

        return None

    def _is_in_user_location(self, job_data: Dict[str, Any], user_location: str) -> Optional[bool]:
        """Determine whether job location matches the configured user location.

        Returns True if a location string clearly matches; False if data exists and clearly differs;
        None if insufficient data to decide (missing/empty fields). A None result intentionally
        lets the job pass because missing data should not block a candidate.
        """

        if not user_location:
            return None

        location_candidates: List[str] = []

        location = job_data.get("location")
        if isinstance(location, str) and location.strip():
            location_candidates.append(location)

        metadata = job_data.get("metadata")
        if isinstance(metadata, dict):
            for key in ("Location", "location", "Office Location", "Office"):
                value = metadata.get(key)
                if isinstance(value, str) and value.strip():
                    location_candidates.append(value)

        city = job_data.get("city")
        state = job_data.get("state") or job_data.get("state_code")
        country = job_data.get("country")
        if city or state:
            pieces = [str(city or "").strip(), str(state or "").strip(), str(country or "").strip()]
            combined = ", ".join(p for p in pieces if p)
            if combined:
                location_candidates.append(combined)

        city_token, state_token = self._split_user_location(user_location)

        def _state_matches(loc_state: Optional[str], loc_lower: str) -> bool:
            if not state_token:
                return True
            if loc_state:
                if state_token == loc_state:
                    return True
                if len(state_token) == 2 and loc_state.startswith(state_token):
                    return True
            return bool(re.search(rf"\\b{re.escape(state_token)}\\b", loc_lower))

        for loc in location_candidates:
            loc_lower = loc.lower()
            # Quick substring match ignoring commas to handle common city/state strings
            if user_location.replace(",", "").lower() in loc_lower.replace(",", ""):
                return True

            loc_city, loc_state = self._split_user_location(loc)

            if city_token and not re.search(rf"\\b{re.escape(city_token)}\\b", loc_lower):
                continue
            if not _state_matches(loc_state, loc_lower):
                continue

            return True

        if location_candidates:
            return False

        return None

    @staticmethod
    def _split_user_location(user_location: str) -> Tuple[Optional[str], Optional[str]]:
        """Split a user location string into lowercase city/state tokens for loose matching."""
        if not user_location:
            return None, None

        lower = user_location.lower()
        if "," in lower:
            city, state = [part.strip() for part in lower.split(",", 1)]
            return city or None, state or None

        parts = lower.split()
        if len(parts) >= 2:
            return " ".join(parts[:-1]), parts[-1]

        return lower.strip() or None, None

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
