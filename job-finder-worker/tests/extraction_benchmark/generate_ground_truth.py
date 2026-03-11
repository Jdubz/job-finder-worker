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

# Import the production prompt builder to stay in sync.
sys.path.insert(0, str(BENCHMARK_DIR.parent.parent / "src"))

from job_finder.ai.extraction_prompts import build_extraction_prompt  # noqa: E402


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

            system_prompt, user_prompt = build_extraction_prompt(
                title=job["title"],
                description=job["description"] or "",
                location=job.get("location"),
                posted_date=job.get("posted_date"),
                salary_range=job.get("salary_range"),
                url=job.get("url"),
            )

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
