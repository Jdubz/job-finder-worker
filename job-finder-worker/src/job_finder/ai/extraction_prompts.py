"""Prompt templates for job data extraction."""

from typing import Optional


def build_extraction_prompt(
    title: str,
    description: str,
    location: Optional[str] = None,
) -> str:
    """
    Build prompt for extracting structured data from a job posting.

    Args:
        title: Job title
        description: Job description text
        location: Optional location string from job posting

    Returns:
        Formatted prompt string for AI extraction
    """
    location_section = f"\nLocation: {location}" if location else ""

    return f"""Extract structured information from this job posting. Return ONLY a valid JSON object.

Job Title: {title}{location_section}

Job Description:
{description[:4000]}

Extract and return this exact JSON structure (use null for unknown values):
{{
  "seniority": "<junior|mid|senior|staff|lead|principal|unknown>",
  "workArrangement": "<remote|hybrid|onsite|unknown>",
  "timezone": <UTC offset number or null>,
  "city": "<city name or null>",
  "salaryMin": <minimum salary as integer or null>,
  "salaryMax": <maximum salary as integer or null>,
  "experienceMin": <minimum years required as integer or null>,
  "experienceMax": <maximum years required as integer or null>,
  "technologies": ["<tech1>", "<tech2>", ...],
  "employmentType": "<full-time|part-time|contract|unknown>"
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

5. For timezone:
   - "PST", "Pacific" -> -8
   - "EST", "Eastern" -> -5
   - "CST", "Central" -> -6
   - "MST", "Mountain" -> -7
   - "GMT", "UTC" -> 0
   - If no timezone info, use null

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
{{"seniority":"<junior|mid|senior|staff|lead|principal|unknown>","workArrangement":"<remote|hybrid|onsite|unknown>","timezone":<int or null>,"city":"<string or null>","salaryMin":<int or null>,"salaryMax":<int or null>,"experienceMin":<int or null>,"experienceMax":<int or null>,"technologies":["<tech>"],"employmentType":"<full-time|part-time|contract|unknown>"}}"""
