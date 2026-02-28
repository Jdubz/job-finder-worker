"""Prompt templates for job data extraction.

Each prompt function returns a PromptPair (system, user) to enable:
- Clear separation of general instructions (system) from per-request context (user)
- Prompt caching on providers that support it (system prompt is stable per day)
- Better instruction following on local models (clear system/user separation)
"""

from datetime import date
from typing import List, Optional, Tuple

# (system_prompt, user_prompt)
PromptPair = Tuple[str, str]


def _build_extraction_system_prompt() -> str:
    """Build the system prompt for extraction (stable per day, cacheable intra-day)."""
    today_str = date.today().isoformat()

    return f"""You are a job posting data extractor. Extract structured information and return ONLY a valid JSON object.

Today's date: {today_str}

Extract and return this exact JSON structure (use null for unknown values, false for unknown booleans):
{{
  "seniority": "<junior|mid|senior|staff|lead|principal|unknown>",
  "workArrangement": "<remote|hybrid|onsite|unknown>",
  "timezone": <UTC offset as float, e.g. -8 for PST, +5.5 for India, or null>,
  "city": "<city name or null>",
  "salaryMin": <minimum annual salary as integer or null>,
  "salaryMax": <maximum annual salary as integer or null>,
  "experienceMin": <minimum years required as integer or null>,
  "experienceMax": <maximum years required as integer or null>,
  "technologies": ["<tech1>", "<tech2>", ...],
  "daysOld": <number of days between posted date and today, or null if unknown>,
  "isRepost": <true if this appears to be a reposted job, false otherwise>,
  "relocationRequired": <true if explicitly requires relocation, false otherwise>,
  "includesEquity": <true if compensation includes equity/stock, false otherwise>,
  "isContract": <true if contract/temporary/freelance/hourly position, false otherwise>,
  "isManagement": <true if people management responsibilities, false otherwise>,
  "isLead": <true if technical lead role, false otherwise>,
  "roleTypes": ["<role-type-1>", "<role-type-2>", ...],
  "timezoneFlexible": <true if no timezone requirement, false otherwise>
}}

Rules:
1. Infer seniority from title and description:
   - "junior", "entry", "associate", "I", "1" -> "junior"
   - "mid", "intermediate", "II", "2" -> "mid"
   - "senior", "sr", "III", "3" -> "senior"
   - "staff", "IV", "4" -> "staff"
   - "lead", "principal", "architect", "distinguished", "V", "5+" -> "lead" or "principal"
   - If unclear, use "unknown"

2. Detect work arrangement — IMPORTANT: check in this exact priority order:
   a) If the Location field contains "Remote" anywhere (e.g. "Remote - US", "US Remote", "United States - Remote", "Remote (USA)", "or Remote in the United States"), classify as "remote". This overrides ALL other signals.
   b) If the Location field says "Distributed" or contains only a country name without a city (e.g. "United States"), classify as "remote".
   c) If the description says "remotely in the United States", "remote-eligible", "can be held remotely", "work from anywhere", "fully remote", or "100% remote", classify as "remote" even if office locations are also listed.
   d) "hybrid", "2-3 days in office", "in-office with flexibility" -> "hybrid"
   e) "on-site", "in-office required", "must be local", "must relocate" -> "onsite"
   f) If ambiguous, use "unknown"
   NOTE: Many companies list office locations alongside remote eligibility. A job listing offices does NOT mean it is hybrid — look for explicit remote language in the location field or description first.

3. Parse salary as annual USD amounts (convert hourly/monthly if needed):
   - If a salary range is provided in the structured data section, parse it into salaryMin/salaryMax. This data comes from the ATS API and is authoritative.
     - "USD 165000-220000" -> salaryMin: 165000, salaryMax: 220000
     - "$150,000 - $170,000" -> salaryMin: 150000, salaryMax: 170000
   - "$150,000 - $200,000" -> salaryMin: 150000, salaryMax: 200000
   - "$75/hour" -> convert to annual (~156000)
   - If range not specified, set both to the same value
   - If no salary info anywhere, use null for both

4. Extract technologies/skills mentioned:
   - Include programming languages, frameworks, tools, platforms
   - Normalize names (e.g., "React.js" -> "react", "Node" -> "node")
   - Lowercase all entries

5. For timezone (based on location), return UTC offset as float:
   - US Pacific (SF, LA, Seattle) -> -8
   - US Mountain (Denver) -> -7
   - US Central (Chicago, Austin) -> -6
   - US Eastern (NYC, Boston) -> -5
   - UK/London -> 0
   - Central Europe (Paris, Berlin) -> +1
   - Eastern Europe -> +2
   - India -> +5.5
   - If no location/timezone info, use null

6. For daysOld, calculate days between posted date and today ({today_str}):
   - "Posted 3 days ago" -> 3
   - "Posted December 1, 2025" with today {today_str} -> calculate difference
   - If no posted date or unclear, use null

7. roleTypes - array of role type strings that describe the position. Include ALL that apply:
   - "backend": server-side, API, database focus
   - "frontend": UI, React, CSS, user interface focus
   - "fullstack": explicitly "full-stack" or both frontend and backend
   - "devops": DevOps, SRE, infrastructure, platform engineering
   - "ml-ai": machine learning, AI, data science, ML engineer
   - "data": data engineering, ETL, data pipelines
   - "security": security engineer, appsec, infosec
   - "clearance-required": mentions security clearance, TS/SCI, secret clearance
   - "consulting": the COMPANY is a consulting firm, staffing agency, or IT services company (e.g. Accenture, Deloitte, Wipro). Do NOT use for product companies that happen to have client-facing roles
   - "mobile": iOS, Android, React Native, Flutter mobile development
   - "embedded": embedded systems, firmware, IoT
   - "qa": quality assurance, test engineering, SDET
   - "non-software": NOT a software/IT role — mechanical, electrical, civil, structural, chemical, industrial, manufacturing, field, environmental, biomedical, aerospace (non-software), nuclear, petroleum, or other non-software engineering disciplines
   - Use exact lowercase strings as shown above

8. relocationRequired: ONLY true if explicitly states relocation is required. Generic phrases like "headquartered in SF" are NOT requirements.

9. timezoneFlexible: Set to true if the role explicitly states no timezone requirements, "work from anywhere", "async-first", or "flexible hours". Otherwise false. This applies to remote roles that don't require overlap with a specific timezone.

10. Infer employment type (use the isContract field AND consider the overall posting):
   - URL params like "employmentType=FullTime" or structured data indicating full-time -> isContract: false
   - Benefits mentions (401k, PTO, health insurance, dental, equity) strongly signal full-time employment
   - "contract", "temporary", "freelance", "hourly", "C2C", "W2 contract" -> isContract: true
   - If no clear signal, default isContract to false

Return ONLY the JSON object, no explanation or markdown."""


def build_extraction_prompt(
    title: str,
    description: str,
    location: Optional[str] = None,
    posted_date: Optional[str] = None,
    salary_range: Optional[str] = None,
    url: Optional[str] = None,
) -> PromptPair:
    """
    Build prompt for extracting structured data from a job posting.

    AI extracts DATA ONLY - no scoring or match calculations.

    Args:
        title: Job title
        description: Job description text
        location: Optional location string from job posting
        posted_date: Optional posted date string
        salary_range: Optional pre-extracted salary range from ATS API
        url: Optional job listing URL (may contain metadata like employmentType)

    Returns:
        PromptPair of (system_prompt, user_prompt) for AI extraction
    """
    system = _build_extraction_system_prompt()

    location_section = f"\nLocation: {location}" if location else ""
    posted_section = f"\nPosted: {posted_date}" if posted_date else ""

    # Build structured data section from pre-extracted ATS data
    structured_lines = []
    if salary_range:
        structured_lines.append(f"Salary Range: {salary_range}")
    if url:
        structured_lines.append(f"URL: {url}")
    structured_section = ""
    if structured_lines:
        structured_section = (
            "\n\nPre-extracted structured data (from ATS API — authoritative):\n"
            + "\n".join(structured_lines)
        )

    user = f"""Job Title: {title}{location_section}{posted_section}{structured_section}

Job Description:
{description[:4000]}"""

    return (system, user)


def build_simple_extraction_prompt(
    title: str,
    description: str,
    salary_range: Optional[str] = None,
    url: Optional[str] = None,
) -> str:
    """
    Build a simpler extraction prompt for faster/cheaper models.

    Args:
        title: Job title
        description: Job description (will be truncated)
        salary_range: Optional pre-extracted salary range from ATS API
        url: Optional job listing URL (may contain metadata like employmentType)

    Returns:
        Shorter prompt for quick extraction
    """
    # Truncate description more aggressively for simple extraction
    desc_truncated = description[:2000] if len(description) > 2000 else description
    today_str = date.today().isoformat()

    structured_section = ""
    structured_lines = []
    if salary_range:
        structured_lines.append(f"Salary: {salary_range}")
    if url:
        structured_lines.append(f"URL: {url}")
    if structured_lines:
        structured_section = "\nStructured data (authoritative): " + " | ".join(structured_lines)

    return f"""Extract from this job posting. Today is {today_str}. Return JSON only.

Title: {title}{structured_section}
Description: {desc_truncated}

If salary is in structured data above, parse into salaryMin/salaryMax. If location contains "Remote", set workArrangement to "remote".

Return:
{{"seniority":"<junior|mid|senior|staff|lead|principal|unknown>","workArrangement":"<remote|hybrid|onsite|unknown>","timezone":<float or null>,"city":"<string or null>","salaryMin":<int or null>,"salaryMax":<int or null>,"experienceMin":<int or null>,"experienceMax":<int or null>,"technologies":["<tech>"],"daysOld":<int or null>,"isRepost":false,"relocationRequired":false,"includesEquity":false,"isContract":false,"isManagement":false,"isLead":false,"roleTypes":["backend","frontend","fullstack","devops","ml-ai","data","security","mobile","embedded","qa","consulting","clearance-required","non-software"],"timezoneFlexible":false}}"""


def build_repair_prompt(
    title: str,
    description: str,
    missing_fields: List[str],
    location: Optional[str] = None,
    posted_date: Optional[str] = None,
) -> PromptPair:
    """Build a targeted repair prompt for fields the initial extraction missed.

    Args:
        title: Job title
        description: Job description text
        missing_fields: List of field names that were null/unknown
        location: Optional location string
        posted_date: Optional posted date string

    Returns:
        PromptPair of (system_prompt, user_prompt) for repair extraction
    """
    today_str = date.today().isoformat()

    field_hints = {
        "seniority": "seniority (junior/mid/senior/staff/lead/principal) — infer from title, years of experience mentioned, or responsibility level",
        "work_arrangement": 'workArrangement (remote/hybrid/onsite) — look for "remote", "hybrid", "on-site", office mentions, or location field',
        "timezone": "timezone (UTC offset as float) — infer from city, state, country, or office location mentioned",
        "salary_min": "salaryMin/salaryMax (annual USD integers) — look for salary ranges, hourly rates (convert to annual), or compensation sections",
        "employment_type": "employmentType (full-time/part-time/contract) — look for benefits, contract language, or employment type mentions",
        "technologies": "technologies (array of lowercase strings) — programming languages, frameworks, tools, platforms mentioned in requirements",
    }

    field_descriptions = "\n".join(f"- {field_hints.get(f, f)}" for f in missing_fields)

    system = f"""You are a job posting data extractor performing a repair pass. The initial extraction returned null/unknown for several fields.

Today's date: {today_str}

Missing fields to fill:
{field_descriptions}

Re-examine the posting and try harder to infer these specific fields. Return ONLY a JSON object with the fields you can now fill. Use camelCase field names. For fields you still cannot determine, use null or "unknown" as appropriate. Do not include fields that were already successfully extracted.

Return ONLY the JSON object, no explanation or markdown."""

    location_section = f"\nLocation: {location}" if location else ""
    posted_section = f"\nPosted: {posted_date}" if posted_date else ""

    user = f"""Job Title: {title}{location_section}{posted_section}

Job Description:
{description[:4000]}"""

    return (system, user)
