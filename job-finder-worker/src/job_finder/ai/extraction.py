"""AI-powered job data extraction.

Extracts structured semantic data from job postings using AI.
This data is then used by the deterministic ScoringEngine.

Post-extraction validation guards catch common hallucinations:
- Salary: nulled when description has no salary-related text
- Equity: nulled when description has no compensation-equity text
- Technologies: entries >35 chars or >4 words are dropped
- Short descriptions (<200 chars): raise ExtractionError
"""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, cast, get_args

from job_finder.ai.extraction_prompts import build_extraction_prompt, build_repair_prompt
from job_finder.ai.response_parser import extract_json_from_response
from job_finder.exceptions import ExtractionError

logger = logging.getLogger(__name__)

# ── Post-extraction validation constants ────────────────────────────────────

# Minimum description length to attempt extraction.  Descriptions shorter than
# this are broken scrapes (requisition IDs, stubs) that produce garbage.
MIN_DESCRIPTION_LENGTH = 200

# Maximum length / word count for a single technology entry.
_MAX_TECH_LENGTH = 35
_MAX_TECH_WORDS = 4

# Keywords whose presence in the description indicates salary info exists.
# Checked case-insensitively.
_SALARY_KEYWORDS = (
    "$",
    "salary",
    "compensation",
    "per year",
    "per annum",
    "annually",
    "usd ",
    "usd,",
    "pay range",
    "base pay",
    "hourly rate",
    "wage",
    "total comp",
    "on-target earnings",
    "ote",
)

# Keywords indicating genuine compensation-equity (not DEI "equity").
_EQUITY_KEYWORDS = (
    "stock",
    "rsu",
    "rsus",
    "vest",
    "vesting",
    "shares",
    "options",
    "equity compensation",
    "equity grant",
    "equity package",
    "equity award",
)

# Type checking import to avoid circular dependency
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from job_finder.ai.inference_client import InferenceClient

# Type aliases matching TypeScript definitions
SeniorityLevel = Literal["junior", "mid", "senior", "staff", "lead", "principal", "unknown"]
WorkArrangement = Literal["remote", "hybrid", "onsite", "unknown"]
EmploymentType = Literal["full-time", "part-time", "contract", "unknown"]


@dataclass
class JobExtractionResult:
    """
    Extracted semantic data from a job posting.

    Mirrors the TypeScript JobExtractionResult interface in shared/config.types.ts.
    AI extracts DATA ONLY - no scoring or match calculations.
    """

    # Core fields
    seniority: SeniorityLevel = "unknown"
    work_arrangement: WorkArrangement = "unknown"
    timezone: Optional[float] = None
    city: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    experience_min: Optional[int] = None
    experience_max: Optional[int] = None
    technologies: List[str] = field(default_factory=list)
    employment_type: EmploymentType = "unknown"

    # Freshness fields (for freshness scoring)
    days_old: Optional[int] = None
    is_repost: bool = False

    # Location fields (for location scoring)
    relocation_required: bool = False

    # Compensation fields (for compensation scoring)
    includes_equity: bool = False
    is_contract: bool = False

    # Seniority fields (for seniority scoring)
    is_management: bool = False
    is_lead: bool = False

    # Role types (for role fit scoring)
    # Dynamic list of role type strings, e.g. ["backend", "ml-ai", "devops"]
    role_types: List[str] = field(default_factory=list)

    # Extraction quality signal
    confidence: float = 0.0

    # Timezone flexibility for remote jobs
    timezone_flexible: bool = False

    # Which model performed the extraction
    extraction_model: Optional[str] = None

    # Key fields used for confidence scoring
    CONFIDENCE_FIELDS = (
        "seniority",
        "work_arrangement",
        "timezone",
        "salary_min",
        "employment_type",
        "technologies",
    )

    def compute_confidence(self) -> float:
        """Compute confidence as fraction of key fields that are non-null/non-unknown."""
        filled = 0
        total = len(self.CONFIDENCE_FIELDS)
        for field_name in self.CONFIDENCE_FIELDS:
            value = getattr(self, field_name)
            if field_name in ("seniority", "work_arrangement", "employment_type"):
                if value is not None and value != "unknown":
                    filled += 1
            elif field_name == "technologies":
                if value:  # non-empty list
                    filled += 1
            else:
                if value is not None:
                    filled += 1
        return filled / total if total > 0 else 0.0

    def missing_fields(self) -> List[str]:
        """Return list of key field names that are null/unknown."""
        missing = []
        for field_name in self.CONFIDENCE_FIELDS:
            value = getattr(self, field_name)
            if field_name in ("seniority", "work_arrangement", "employment_type"):
                if value is None or value == "unknown":
                    missing.append(field_name)
            elif field_name == "technologies":
                if not value:
                    missing.append(field_name)
            else:
                if value is None:
                    missing.append(field_name)
        return missing

    def merge(self, repair_data: "JobExtractionResult") -> None:
        """Merge non-null/non-unknown values from repair_data into self."""
        for field_name in self.CONFIDENCE_FIELDS:
            repair_value = getattr(repair_data, field_name)
            current_value = getattr(self, field_name)
            if field_name in ("seniority", "work_arrangement", "employment_type"):
                if (
                    repair_value is not None
                    and repair_value != "unknown"
                    and (current_value is None or current_value == "unknown")
                ):
                    setattr(self, field_name, repair_value)
            elif field_name == "technologies":
                if repair_value and not current_value:
                    setattr(self, field_name, repair_value)
            else:
                if repair_value is not None and current_value is None:
                    setattr(self, field_name, repair_value)
        # Also merge timezone_flexible if repair found it
        if repair_data.timezone_flexible and not self.timezone_flexible:
            self.timezone_flexible = True

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "seniority": self.seniority,
            "workArrangement": self.work_arrangement,
            "timezone": self.timezone,
            "city": self.city,
            "salaryMin": self.salary_min,
            "salaryMax": self.salary_max,
            "experienceMin": self.experience_min,
            "experienceMax": self.experience_max,
            "technologies": self.technologies,
            "employmentType": self.employment_type,
            # Freshness
            "daysOld": self.days_old,
            "isRepost": self.is_repost,
            # Location
            "relocationRequired": self.relocation_required,
            # Compensation
            "includesEquity": self.includes_equity,
            "isContract": self.is_contract,
            # Seniority
            "isManagement": self.is_management,
            "isLead": self.is_lead,
            # Role types
            "roleTypes": self.role_types,
            # Extraction quality
            "confidence": self.confidence,
            # Timezone flexibility
            "timezoneFlexible": self.timezone_flexible,
            # Model tracking
            "extractionModel": self.extraction_model,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "JobExtractionResult":
        """Create from dictionary (supports both snake_case and camelCase)."""

        def _get(camel: str, snake: str, default=None):
            """Get field preferring camelCase key, falling back to snake_case."""
            v = data.get(camel)
            if v is not None:
                return v
            v = data.get(snake)
            if v is not None:
                return v
            return default

        result = cls(
            seniority=_validate_seniority(_get("seniority", "seniority_level")),
            work_arrangement=_validate_work_arrangement(
                _get("workArrangement", "work_arrangement")
            ),
            timezone=_safe_float(data.get("timezone")),
            city=data.get("city"),
            salary_min=_safe_int(_get("salaryMin", "salary_min")),
            salary_max=_safe_int(_get("salaryMax", "salary_max")),
            experience_min=_safe_int(_get("experienceMin", "experience_min")),
            experience_max=_safe_int(_get("experienceMax", "experience_max")),
            technologies=data.get("technologies") or [],
            employment_type=_validate_employment_type(_get("employmentType", "employment_type")),
            # Freshness — clamp absurd values to None (epoch-zero, bad AI math, etc.)
            days_old=_safe_days_old(_get("daysOld", "days_old")),
            is_repost=bool(_get("isRepost", "is_repost", False)),
            # Location
            relocation_required=bool(_get("relocationRequired", "relocation_required", False)),
            # Compensation
            includes_equity=bool(_get("includesEquity", "includes_equity", False)),
            is_contract=bool(_get("isContract", "is_contract", False)),
            # Seniority
            is_management=bool(_get("isManagement", "is_management", False)),
            is_lead=bool(_get("isLead", "is_lead", False)),
            # Role types
            role_types=_parse_role_types(data),
            # Timezone flexibility
            timezone_flexible=bool(_get("timezoneFlexible", "timezone_flexible", False)),
        )
        result.confidence = result.compute_confidence()
        return result


def _parse_role_types(data: Dict[str, Any]) -> List[str]:
    """
    Parse role types from extraction data.

    Supports:
    - New format: roleTypes/role_types as array of strings
    - Legacy format: boolean fields (isBackend, isFrontend, etc.) for backward compatibility
    """
    # Check for new array format first
    role_types = data.get("roleTypes") or data.get("role_types")
    if role_types and isinstance(role_types, list):
        return [str(rt).lower().strip() for rt in role_types if rt]

    # Fall back to legacy boolean fields for backward compatibility
    roles: List[str] = []
    legacy_mappings = [
        ("isBackend", "is_backend", "backend"),
        ("isFrontend", "is_frontend", "frontend"),
        ("isFullstack", "is_fullstack", "fullstack"),
        ("isDevopsSre", "is_devops_sre", "devops"),
        ("isMlAi", "is_ml_ai", "ml-ai"),
        ("isData", "is_data", "data"),
        ("isSecurity", "is_security", "security"),
        ("requiresClearance", "requires_clearance", "clearance-required"),
        ("isConsulting", "is_consulting", "consulting"),
    ]
    for camel, snake, role_name in legacy_mappings:
        if data.get(camel) or data.get(snake):
            roles.append(role_name)
    return roles


def _validate_seniority(value: Optional[str]) -> SeniorityLevel:
    """Validate and normalize seniority level."""
    if not value:
        return "unknown"
    normalized = value.lower().strip()
    valid_values = get_args(SeniorityLevel)
    if normalized in valid_values:
        return cast(SeniorityLevel, normalized)
    return "unknown"


def _validate_work_arrangement(value: Optional[str]) -> WorkArrangement:
    """Validate and normalize work arrangement."""
    if not value:
        return "unknown"
    normalized = value.lower().strip()
    valid_values = get_args(WorkArrangement)
    if normalized in valid_values:
        return cast(WorkArrangement, normalized)
    return "unknown"


def _validate_employment_type(value: Optional[str]) -> EmploymentType:
    """Validate and normalize employment type."""
    if not value:
        return "unknown"
    normalized = value.lower().strip().replace("_", "-")
    valid_values = get_args(EmploymentType)
    if normalized in valid_values:
        return cast(EmploymentType, normalized)
    return "unknown"


def _safe_int(value: Any) -> Optional[int]:
    """Safely convert to int."""
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _safe_float(value: Any) -> Optional[float]:
    """Safely convert to float."""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


# Maximum plausible job age in days (~1 year).  Anything beyond this is
# almost certainly a date-parsing artefact (epoch-zero, bad AI math, etc.)
# and should be treated as "unknown" rather than incurring a stale penalty.
_MAX_PLAUSIBLE_DAYS_OLD = 365


def _safe_days_old(value: Any) -> Optional[int]:
    """Safely convert daysOld, rejecting negative or implausibly large values."""
    n = _safe_int(value)
    if n is not None and 0 <= n <= _MAX_PLAUSIBLE_DAYS_OLD:
        return n
    return None


# ── Post-extraction validation helpers ──────────────────────────────────────


def _sanitize_technologies(result: "JobExtractionResult") -> None:
    """Remove garbage technology entries that are clearly not tech names.

    Rules (validated against 12,102 production entries):
    - Drop entries longer than 35 chars (0.5% of entries, all garbage)
    - Drop entries with more than 4 words (catches phrases like
      "diagnosing and resolving technical issues")
    - Deduplicate
    """
    if not result.technologies:
        return

    seen: set[str] = set()
    cleaned: list[str] = []
    for tech in result.technologies:
        t = tech.strip()
        if not t or len(t) > _MAX_TECH_LENGTH:
            continue
        if len(t.split()) > _MAX_TECH_WORDS:
            continue
        key = t.lower()
        if key not in seen:
            seen.add(key)
            cleaned.append(t)

    if len(cleaned) != len(result.technologies):
        dropped = len(result.technologies) - len(cleaned)
        logger.debug("Sanitized technologies: dropped %d entries", dropped)
    result.technologies = cleaned


def _guard_salary(
    result: "JobExtractionResult",
    description: str,
    salary_range: Optional[str],
) -> None:
    """Null out AI-extracted salary when the description has no salary text.

    If the scraper already provided a salary_range, the AI salary is kept
    (it was likely parsed from that structured data).  Otherwise, the
    description must contain at least one salary keyword for the AI value
    to be trusted.

    Validated: catches ~115 hallucinated salaries while preserving 651
    legitimate extractions (15% false-positive rate in production).
    """
    if result.salary_min is None and result.salary_max is None:
        return  # nothing to guard

    # Scraped salary exists — AI likely parsed from structured data, keep it
    if salary_range:
        return

    desc_lower = description.lower()
    for kw in _SALARY_KEYWORDS:
        if kw in desc_lower:
            return  # description mentions salary, trust the extraction

    logger.info(
        "Salary guard: nulling hallucinated salary %s-%s (no salary text in description)",
        result.salary_min,
        result.salary_max,
    )
    result.salary_min = None
    result.salary_max = None


def _guard_equity(result: "JobExtractionResult", description: str) -> None:
    """Set includesEquity to false when description has no equity-compensation text.

    Distinguishes compensation equity (stock, RSU, vesting) from DEI equity
    (diversity, equity, inclusion).

    Validated: catches ~98 hallucinated equity flags.  30% of "equity"
    mentions in production are DEI context, not compensation.
    """
    if not result.includes_equity:
        return  # nothing to guard

    desc_lower = description.lower()

    for kw in _EQUITY_KEYWORDS:
        if kw in desc_lower:
            return  # genuine compensation-equity mention

    # Check for standalone "equity" NOT in DEI context
    # Look for "equity" that is NOT preceded/followed by diversity/inclusion
    if "equity" in desc_lower:
        # Find all occurrences and check context
        for match in re.finditer(r"equity", desc_lower):
            start = max(0, match.start() - 40)
            end = min(len(desc_lower), match.end() + 40)
            context = desc_lower[start:end]
            # If "diversity" or "inclusion" appear nearby, it's DEI
            if "diversity" not in context and "inclusion" not in context:
                return  # standalone equity mention — trust it

    logger.info("Equity guard: clearing hallucinated includesEquity flag")
    result.includes_equity = False


class JobExtractor:
    """
    Extract structured semantic data from job postings using AI.

    The extractor uses an InferenceClient to parse job descriptions and extract:
    - Seniority level
    - Work arrangement (remote/hybrid/onsite)
    - Location/timezone
    - Salary range
    - Experience requirements
    - Technologies mentioned
    - Employment type
    """

    def __init__(self, agent_manager: "InferenceClient"):
        """
        Initialize the extractor.

        Args:
            agent_manager: InferenceClient for executing AI tasks
        """
        self.agent_manager = agent_manager

    def extract(
        self,
        title: str,
        description: str,
        location: Optional[str] = None,
        posted_date: Optional[str] = None,
        salary_range: Optional[str] = None,
        url: Optional[str] = None,
    ) -> JobExtractionResult:
        """
        Extract structured data from a job posting.

        Args:
            title: Job title
            description: Full job description
            location: Optional location string from posting
            posted_date: Optional posted date string from posting
            salary_range: Optional pre-extracted salary range from ATS API
            url: Optional job listing URL (may contain metadata)

        Returns:
            JobExtractionResult with extracted data

        Raises:
            ExtractionError: If title/description empty or description too short
        """
        if not description or not title:
            raise ExtractionError("Empty title or description provided for extraction")

        if len(description) < MIN_DESCRIPTION_LENGTH:
            raise ExtractionError(
                f"Description too short for reliable extraction "
                f"({len(description)} chars < {MIN_DESCRIPTION_LENGTH})"
            )

        system_prompt, user_prompt = build_extraction_prompt(
            title,
            description,
            location,
            posted_date,
            salary_range=salary_range,
            url=url,
        )
        result = self.agent_manager.execute(
            task_type="extraction",
            prompt=user_prompt,
            system_prompt=system_prompt,
            response_format="json",
            max_tokens=2048,
            temperature=0.1,  # Low temperature for consistent extraction
        )
        extraction = self._parse_response(result.text)
        extraction.extraction_model = result.model

        # Post-extraction validation guards
        _sanitize_technologies(extraction)
        _guard_salary(extraction, description, salary_range)
        _guard_equity(extraction, description)

        return extraction

    def _parse_response(self, response: str) -> JobExtractionResult:
        """
        Parse AI response into JobExtractionResult.

        Args:
            response: Raw AI response text

        Returns:
            Parsed JobExtractionResult

        Raises:
            ExtractionError: If response cannot be parsed as valid JSON
        """
        if not response or not response.strip():
            raise ExtractionError("AI returned empty response")

        # Use response_parser to handle markdown code blocks, envelope objects, etc.
        json_str = extract_json_from_response(response)
        if not json_str:
            raise ExtractionError(
                f"No JSON found in AI response. Response preview: {response[:200]}"
            )

        # Sanitize JSON - fix common AI model formatting issues
        # Issue: Gemini returns "timezone": +1 which is invalid JSON (numbers can't start with +)
        # Fix: Replace "+<digit>" with quoted strings for timezone field only
        json_str = re.sub(r'"timezone"\s*:\s*\+(\d+(?:\.\d+)?)', r'"timezone": \1', json_str)

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ExtractionError(
                f"Failed to parse AI response as JSON: {e}. JSON preview: {json_str[:200]}"
            ) from e

        # Normalize technologies to lowercase
        if "technologies" in data and isinstance(data["technologies"], list):
            data["technologies"] = [
                t.lower().strip() for t in data["technologies"] if isinstance(t, str)
            ]

        return JobExtractionResult.from_dict(data)

    def extract_with_repair(
        self,
        title: str,
        description: str,
        location: Optional[str] = None,
        posted_date: Optional[str] = None,
        salary_range: Optional[str] = None,
        url: Optional[str] = None,
        confidence_threshold: float = 0.7,
    ) -> JobExtractionResult:
        """Extract with a single repair pass if confidence is below threshold.

        Args:
            title: Job title
            description: Full job description
            location: Optional location string
            posted_date: Optional posted date string
            salary_range: Optional pre-extracted salary range
            url: Optional job listing URL
            confidence_threshold: Minimum confidence to skip repair (default 0.7)

        Returns:
            JobExtractionResult, potentially repaired
        """
        result = self.extract(
            title,
            description,
            location,
            posted_date,
            salary_range=salary_range,
            url=url,
        )
        initial_confidence = result.confidence
        if result.confidence >= confidence_threshold:
            logger.debug(
                "Extraction confidence %.2f >= %.2f, skipping repair",
                result.confidence,
                confidence_threshold,
            )
            return result

        missing = result.missing_fields()
        logger.info(
            "Extraction confidence %.2f < %.2f, attempting repair for: %s",
            result.confidence,
            confidence_threshold,
            missing,
        )

        try:
            repair_system, repair_user = build_repair_prompt(
                title,
                description,
                missing,
                location,
                posted_date,
            )
            repair_response = self.agent_manager.execute(
                task_type="extraction",
                prompt=repair_user,
                system_prompt=repair_system,
                response_format="json",
                max_tokens=1024,
                temperature=0.1,
            )
            repair_result = self._parse_response(repair_response.text)
            result.merge(repair_result)
            result.confidence = result.compute_confidence()
            logger.info(
                "Repair complete: confidence %.2f -> %.2f",
                initial_confidence,
                result.confidence,
            )
        except Exception as e:
            logger.warning("Extraction repair failed, keeping original: %s", e, exc_info=True)

        return result
