"""Prompt templates for job data extraction."""

from typing import Optional


def build_extraction_prompt(
    title: str,
    description: str,
    location: Optional[str] = None,
    posted_date: Optional[str] = None,
) -> str:
    """
    Build prompt for extracting structured data from a job posting.

    AI extracts DATA ONLY - no scoring or match calculations.

    Args:
        title: Job title
        description: Job description text
        location: Optional location string from job posting
        posted_date: Optional posted date string

    Returns:
        Formatted prompt string for AI extraction
    """
    location_section = f"\nLocation: {location}" if location else ""
    posted_section = f"\nPosted: {posted_date}" if posted_date else ""

    return f"""Extract structured information from this job posting. Return ONLY a valid JSON object.

Job Title: {title}{location_section}{posted_section}

Job Description:
{description[:4000]}

Extract and return this exact JSON structure (use null for unknown values, false for unknown booleans):
{{
  "seniority": "<junior|mid|senior|staff|lead|principal|unknown>",
  "workArrangement": "<remote|hybrid|onsite|unknown>",
  "timezone": <UTC offset number or null>,
  "city": "<city name or null>",
  "salaryMin": <minimum annual salary as integer or null>,
  "salaryMax": <maximum annual salary as integer or null>,
  "experienceMin": <minimum years required as integer or null>,
  "experienceMax": <maximum years required as integer or null>,
  "technologies": ["<tech1>", "<tech2>", ...],
  "employmentType": "<full-time|part-time|contract|unknown>",
  "daysOld": <number of days since posting or null>,
  "isRepost": <true if this appears to be a reposted job, false otherwise>,
  "relocationRequired": <true if explicitly requires relocation, false otherwise>,
  "includesEquity": <true if compensation includes equity/stock, false otherwise>,
  "isContract": <true if contract/temporary position, false otherwise>,
  "isManagement": <true if people management responsibilities, false otherwise>,
  "isLead": <true if technical lead role, false otherwise>,
  "isBackend": <true if backend/server-side focus, false otherwise>,
  "isFrontend": <true if frontend/UI focus, false otherwise>,
  "isFullstack": <true if full-stack role, false otherwise>,
  "isDevopsSre": <true if DevOps/SRE/platform focus, false otherwise>,
  "isMlAi": <true if ML/AI/data science focus, false otherwise>,
  "isData": <true if data engineering focus, false otherwise>,
  "isSecurity": <true if security engineering focus, false otherwise>,
  "requiresClearance": <true if security clearance required, false otherwise>,
  "isConsulting": <true if consulting/agency role, false otherwise>
}}

Rules:
1. Infer seniority from title and description:
   - "junior", "entry", "associate", "I", "1" -> "junior"
   - "mid", "intermediate", "II", "2" -> "mid"
   - "senior", "sr", "III", "3" -> "senior"
   - "staff", "IV", "4" -> "staff"
   - "lead", "principal", "architect", "distinguished", "V", "5+" -> "lead" or "principal"
   - If unclear, use "unknown"

2. Detect work arrangement from description keywords:
   - "fully remote", "100% remote", "work from anywhere" -> "remote"
   - "hybrid", "flexible", "2-3 days in office" -> "hybrid"
   - "on-site", "in-office", "must be local" -> "onsite"
   - If ambiguous, use "unknown"

3. Parse salary as annual USD amounts (convert hourly/monthly if needed)
   - "$150,000 - $200,000" -> salaryMin: 150000, salaryMax: 200000
   - "$75/hour" -> convert to annual (~156000)
   - If range not specified, set both to the same value
   - If no salary info, use null for both

4. Extract technologies/skills mentioned:
   - Include programming languages, frameworks, tools, platforms
   - Normalize names (e.g., "React.js" -> "react", "Node" -> "node")
   - Lowercase all entries

5. For timezone (based on location):
   - US cities: "PST/Pacific" -> -8, "MST/Mountain" -> -7, "CST/Central" -> -6, "EST/Eastern" -> -5
   - India -> +5.5
   - UK/London -> 0
   - Europe (Paris, Berlin, etc.) -> +1 or +2
   - If no location/timezone info, use null

6. Role fit signals - set true ONLY if clearly indicated:
   - isBackend: server-side, API, database focus
   - isFrontend: UI, React, CSS, user interface focus
   - isFullstack: explicitly "full-stack" or both frontend and backend
   - isDevopsSre: DevOps, SRE, infrastructure, platform engineering
   - isMlAi: machine learning, AI, data science, ML engineer
   - isData: data engineering, ETL, data pipelines
   - isSecurity: security engineer, appsec, infosec
   - requiresClearance: mentions security clearance, TS/SCI, secret clearance
   - isConsulting: consulting firm, agency, client-facing delivery

7. relocationRequired: ONLY true if explicitly states relocation is required. Generic phrases like "headquartered in SF" are NOT requirements.

Return ONLY the JSON object, no explanation or markdown."""


def build_simple_extraction_prompt(title: str, description: str) -> str:
    """
    Build a simpler extraction prompt for faster/cheaper models.

    Args:
        title: Job title
        description: Job description (will be truncated)

    Returns:
        Shorter prompt for quick extraction
    """
    # Truncate description more aggressively for simple extraction
    desc_truncated = description[:2000] if len(description) > 2000 else description

    return f"""Extract from this job posting. Return JSON only.

Title: {title}
Description: {desc_truncated}

Return:
{{"seniority":"<junior|mid|senior|staff|lead|principal|unknown>","workArrangement":"<remote|hybrid|onsite|unknown>","timezone":<float or null>,"city":"<string or null>","salaryMin":<int or null>,"salaryMax":<int or null>,"experienceMin":<int or null>,"experienceMax":<int or null>,"technologies":["<tech>"],"employmentType":"<full-time|part-time|contract|unknown>","daysOld":<int or null>,"isRepost":false,"relocationRequired":false,"includesEquity":false,"isContract":false,"isManagement":false,"isLead":false,"isBackend":false,"isFrontend":false,"isFullstack":false,"isDevopsSre":false,"isMlAi":false,"isData":false,"isSecurity":false,"requiresClearance":false,"isConsulting":false}}"""
