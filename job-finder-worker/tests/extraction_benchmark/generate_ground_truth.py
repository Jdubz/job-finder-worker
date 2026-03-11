#!/usr/bin/env python3
"""Generate ground truth extraction data using Claude Sonnet.

Reads sample_listings.jsonl and sends each job through Claude with the exact
same extraction prompt used in production.  Claude's output is treated as
ground truth for benchmarking local models.

Usage:
    # Requires ANTHROPIC_API_KEY in env
    python generate_ground_truth.py

Output:
    ground_truth.jsonl  — one JSON object per line with:
        {id, title, company_name, extraction: {...}}
"""

import json
import os
import sys
import time
from pathlib import Path

try:
    from openai import OpenAI
except ImportError:
    sys.exit("pip install openai")

BENCHMARK_DIR = Path(__file__).parent
SAMPLE_FILE = BENCHMARK_DIR / "sample_listings.jsonl"
OUTPUT_FILE = BENCHMARK_DIR / "ground_truth.jsonl"

# Use the same prompt from production, but with today's date frozen for
# reproducibility. We import the prompt builder to stay in sync.
sys.path.insert(0, str(BENCHMARK_DIR.parent.parent / "src"))

# Build prompt inline to avoid import chain issues (sqlite3, etc.)
from datetime import date

TODAY = date.today().isoformat()


def build_system_prompt() -> str:
    """Identical to _build_extraction_system_prompt() in extraction_prompts.py."""
    return f"""You are a job posting data extractor. Extract structured information and return ONLY a valid JSON object.

Today's date: {TODAY}

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
  "employmentType": "<full-time|part-time|contract|unknown>",
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

6. For daysOld, calculate days between posted date and today ({TODAY}):
   - "Posted 3 days ago" -> 3
   - "Posted December 1, 2025" with today {TODAY} -> calculate difference
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


def build_user_prompt(job: dict) -> str:
    """Build the user prompt from a sample listing."""
    title = job["title"]
    description = job["description"] or ""
    location = job.get("location")
    posted_date = job.get("posted_date")
    salary_range = job.get("salary_range")
    url = job.get("url")

    location_section = f"\nLocation: {location}" if location else ""
    posted_section = f"\nPosted: {posted_date}" if posted_date else ""

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

    return f"""Job Title: {title}{location_section}{posted_section}{structured_section}

Job Description:
{description[:8000]}"""


def extract_json(text: str) -> dict:
    """Extract JSON from Claude's response."""
    text = text.strip()
    # Strip markdown code fences
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [ln for ln in lines if not ln.strip().startswith("```")]
        text = "\n".join(lines)
    return json.loads(text)


def main():
    # Use LiteLLM proxy (has all API keys configured) or direct Anthropic API
    litellm_url = os.environ.get("LITELLM_URL", "http://localhost:4000")
    litellm_key = os.environ.get("LITELLM_MASTER_KEY", "")
    model = os.environ.get("GROUND_TRUTH_MODEL", "claude-document")

    client = OpenAI(
        base_url=f"{litellm_url}/v1",
        api_key=litellm_key or "none",
    )
    system_prompt = build_system_prompt()
    print(f"Using LiteLLM at {litellm_url}, model={model}")

    # Load sample listings
    listings = []
    with open(SAMPLE_FILE) as f:
        for line in f:
            listings.append(json.loads(line))

    print(f"Loaded {len(listings)} sample listings")

    # Resume from existing output if interrupted
    done_ids: set[str] = set()
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE) as f:
            for line in f:
                obj = json.loads(line)
                done_ids.add(obj["id"])
        print(f"Resuming: {len(done_ids)} already completed")

    remaining = [item for item in listings if item["id"] not in done_ids]
    print(f"Processing {len(remaining)} remaining listings...")

    errors = 0
    with open(OUTPUT_FILE, "a") as out:
        for i, job in enumerate(remaining):
            job_id = job["id"]
            title = job["title"]
            company = job["company_name"]

            user_prompt = build_user_prompt(job)

            try:
                response = client.chat.completions.create(
                    model=model,
                    max_tokens=2048,
                    temperature=0.0,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                )
                text = response.choices[0].message.content or ""
                extraction = extract_json(text)

                # Normalize technologies to lowercase
                if "technologies" in extraction:
                    extraction["technologies"] = [
                        t.lower().strip() for t in extraction["technologies"] if isinstance(t, str)
                    ]

                record = {
                    "id": job_id,
                    "title": title,
                    "company_name": company,
                    "extraction": extraction,
                }
                out.write(json.dumps(record) + "\n")
                out.flush()

                print(
                    f"  [{i+1}/{len(remaining)}] {company} — {title[:50]}  "
                    f"({extraction.get('seniority', '?')}, "
                    f"{extraction.get('workArrangement', '?')}, "
                    f"{len(extraction.get('technologies', []))} techs)"
                )

            except Exception as e:
                errors += 1
                print(f"  [{i+1}/{len(remaining)}] ERROR: {company} — {title[:50]}: {e}")

            # Rate limit courtesy
            time.sleep(0.5)

    total = len(done_ids) + len(remaining) - errors
    print(f"\nDone. {total} ground truth records in {OUTPUT_FILE}")
    if errors:
        print(f"  {errors} errors — re-run to retry")


if __name__ == "__main__":
    main()
