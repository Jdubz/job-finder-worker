"""AI-powered job data extraction.

Extracts structured semantic data from job postings using AI.
This data is then used by the deterministic ScoringEngine.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional, cast, get_args

from job_finder.ai.extraction_prompts import build_extraction_prompt
from job_finder.ai.response_parser import extract_json_from_response
from job_finder.exceptions import ExtractionError

logger = logging.getLogger(__name__)

# Type checking import to avoid circular dependency
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from job_finder.ai.agent_manager import AgentManager

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
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "JobExtractionResult":
        """Create from dictionary (supports both snake_case and camelCase)."""
        return cls(
            seniority=_validate_seniority(data.get("seniority") or data.get("seniority_level")),
            work_arrangement=_validate_work_arrangement(
                data.get("workArrangement") or data.get("work_arrangement")
            ),
            timezone=_safe_float(data.get("timezone")),
            city=data.get("city"),
            salary_min=_safe_int(data.get("salaryMin") or data.get("salary_min")),
            salary_max=_safe_int(data.get("salaryMax") or data.get("salary_max")),
            experience_min=_safe_int(data.get("experienceMin") or data.get("experience_min")),
            experience_max=_safe_int(data.get("experienceMax") or data.get("experience_max")),
            technologies=data.get("technologies") or [],
            employment_type=_validate_employment_type(
                data.get("employmentType") or data.get("employment_type")
            ),
            # Freshness
            days_old=_safe_int(data.get("daysOld") or data.get("days_old")),
            is_repost=bool(data.get("isRepost") or data.get("is_repost")),
            # Location
            relocation_required=bool(
                data.get("relocationRequired") or data.get("relocation_required")
            ),
            # Compensation
            includes_equity=bool(data.get("includesEquity") or data.get("includes_equity")),
            is_contract=bool(data.get("isContract") or data.get("is_contract")),
            # Seniority
            is_management=bool(data.get("isManagement") or data.get("is_management")),
            is_lead=bool(data.get("isLead") or data.get("is_lead")),
            # Role types
            role_types=_parse_role_types(data),
        )


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


class JobExtractor:
    """
    Extract structured semantic data from job postings using AI.

    The extractor uses an AgentManager to parse job descriptions and extract:
    - Seniority level
    - Work arrangement (remote/hybrid/onsite)
    - Location/timezone
    - Salary range
    - Experience requirements
    - Technologies mentioned
    - Employment type
    """

    def __init__(self, agent_manager: "AgentManager"):
        """
        Initialize the extractor.

        Args:
            agent_manager: AgentManager for executing AI tasks
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
        """
        if not description or not title:
            raise ExtractionError("Empty title or description provided for extraction")

        prompt = build_extraction_prompt(
            title, description, location, posted_date,
            salary_range=salary_range, url=url,
        )
        result = self.agent_manager.execute(
            task_type="extraction",
            prompt=prompt,
            max_tokens=2048,
            temperature=0.1,  # Low temperature for consistent extraction
        )
        return self._parse_response(result.text)

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
        json_str = re.sub(r'"timezone"\s*:\s*\+(\d+(?:\.\d+)?)', r'"timezone": "+\1"', json_str)

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
