#!/usr/bin/env python3
"""Benchmark local Ollama models against ground truth extraction data.

For each model:
1. Pull the model via Ollama API
2. Run all 100 sample listings through extraction
3. Compare results field-by-field against ground truth
4. Report accuracy metrics

Usage:
    python run_benchmark.py                    # Run all models
    python run_benchmark.py qwen3:8b           # Run specific model
    python run_benchmark.py --report-only      # Just regenerate report from saved results

Models are run one at a time.  Each model is loaded, benchmarked, then unloaded
before the next one starts.

Output:
    results/<model_name>.jsonl  — per-job extraction results
    results/report.txt          — comparison table
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any, Optional

try:
    from openai import OpenAI
except ImportError:
    sys.exit("pip install openai")

BENCHMARK_DIR = Path(__file__).parent
SAMPLE_FILE = BENCHMARK_DIR / "sample_listings.jsonl"
GROUND_TRUTH_FILE = BENCHMARK_DIR / "ground_truth.jsonl"
RESULTS_DIR = BENCHMARK_DIR / "results"

# Ollama endpoint — defaults to localhost but production Ollama is only
# accessible inside the Docker network.  Use --ollama-url or set OLLAMA_URL.
# For production: temporarily expose via
#   docker run --rm --network jobfinder_jobfinder -p 11434:11434 alpine/socat TCP-LISTEN:11434,fork TCP:ollama:11434
# Or just:
#   docker compose -f /srv/job-finder/docker-compose.yml exec -d ollama sh -c 'sleep infinity'
#   and use docker exec for ollama commands
DEFAULT_OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_URL = DEFAULT_OLLAMA_URL

# Models to benchmark (must fit in 10 GB VRAM without CPU offload)
CANDIDATE_MODELS = [
    "llama3.1:8b",  # Current baseline
    "qwen3:8b",  # Top candidate
    "qwen2.5:7b",  # Proven structured extraction
    "gemma3:12b",  # Stretch fit (tight on 10GB)
    "granite3.3:8b",  # IBM, strong instruction following
    "mistral:latest",  # Lightweight 7B
    "phi4-mini",  # Tiny 3.8B
]

TODAY = date.today().isoformat()


def build_system_prompt() -> str:
    """Same extraction system prompt as production and ground truth generator."""
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
   a) If the Location field contains "Remote" anywhere, classify as "remote". This overrides ALL other signals.
   b) If the Location field says "Distributed" or contains only a country name without a city, classify as "remote".
   c) If the description says "remotely in the United States", "remote-eligible", "can be held remotely", "work from anywhere", "fully remote", or "100% remote", classify as "remote".
   d) "hybrid", "2-3 days in office", "in-office with flexibility" -> "hybrid"
   e) "on-site", "in-office required", "must be local", "must relocate" -> "onsite"
   f) If ambiguous, use "unknown"

3. Parse salary as annual USD amounts (convert hourly/monthly if needed). If no salary info, use null.

4. Extract technologies/skills: programming languages, frameworks, tools, platforms. Lowercase all entries.

5. For timezone, return UTC offset as float based on location. If unknown, null.

6. For daysOld, calculate days between posted date and today ({TODAY}). If unknown, null.

7. roleTypes - include ALL that apply: "backend", "frontend", "fullstack", "devops", "ml-ai", "data", "security", "clearance-required", "consulting", "mobile", "embedded", "qa", "non-software"

8. relocationRequired: ONLY true if explicitly requires relocation.

9. timezoneFlexible: true only if explicitly no timezone requirement.

10. employmentType: infer from benefits, contract language, URL params. Default isContract to false.

Return ONLY the JSON object, no explanation or markdown."""


def build_user_prompt(job: dict) -> str:
    """Build user prompt from a sample listing."""
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


def extract_json_from_response(text: str) -> Optional[dict]:
    """Parse JSON from model response, handling common formatting issues."""
    text = text.strip()

    # Strip markdown code fences
    if "```" in text:
        # Find content between code fences
        match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
        if match:
            text = match.group(1).strip()

    # Fix common JSON issues from local models
    # Positive timezone values: "timezone": +1 -> "timezone": 1
    text = re.sub(r'"timezone"\s*:\s*\+(\d+(?:\.\d+)?)', r'"timezone": \1', text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON object in response
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
    return None


# ── Ollama management ──────────────────────────────────────────────────────


USE_DOCKER = False  # Set via --docker flag


def ollama_cmd(args: list[str], timeout: int = 600) -> subprocess.CompletedProcess:
    """Run an ollama CLI command, either directly or via docker exec."""
    if USE_DOCKER:
        return subprocess.run(
            ["docker", "exec", "job-finder-ollama", "ollama"] + args,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    try:
        return subprocess.run(
            ["ollama"] + args,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError:
        return subprocess.run(
            ["docker", "exec", "job-finder-ollama", "ollama"] + args,
            capture_output=True,
            text=True,
            timeout=timeout,
        )


def pull_model(model: str) -> bool:
    """Pull a model if not already available."""
    print(f"  Pulling {model}...")
    result = ollama_cmd(["pull", model], timeout=1800)
    if result.returncode != 0:
        print(f"  ERROR pulling {model}: {result.stderr}")
        return False
    print(f"  Pull complete.")
    return True


def unload_model(model: str):
    """Unload a model from VRAM using keep_alive=0."""
    try:
        client = OpenAI(base_url=f"{OLLAMA_URL}/v1", api_key="none")
        client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
            extra_body={"keep_alive": 0},
        )
    except Exception:
        pass  # Best effort
    time.sleep(2)


def list_loaded_models() -> str:
    """List currently loaded models."""
    result = ollama_cmd(["ps"])
    return result.stdout if result.returncode == 0 else ""


# ── Scoring ────────────────────────────────────────────────────────────────

# Fields scored by exact match
EXACT_FIELDS = [
    "seniority",
    "workArrangement",
    "employmentType",
    "isRepost",
    "relocationRequired",
    "includesEquity",
    "isContract",
    "isManagement",
    "isLead",
    "timezoneFlexible",
]

# Fields scored by numeric proximity
NUMERIC_FIELDS = [
    "salaryMin",
    "salaryMax",
    "experienceMin",
    "experienceMax",
    "timezone",
]

# Fields scored by set overlap (F1)
SET_FIELDS = [
    "technologies",
    "roleTypes",
]


def score_exact(predicted: Any, truth: Any) -> float:
    """Score exact match fields. Returns 1.0 for match, 0.0 for mismatch."""
    if predicted is None and truth is None:
        return 1.0
    if predicted is None or truth is None:
        return 0.0
    # Normalize strings
    if isinstance(predicted, str) and isinstance(truth, str):
        return 1.0 if predicted.lower().strip() == truth.lower().strip() else 0.0
    return 1.0 if predicted == truth else 0.0


def score_numeric(predicted: Any, truth: Any, tolerance: float = 0.1) -> float:
    """Score numeric fields with tolerance.

    Returns 1.0 for exact match, partial credit for close values, 0.0 for far off.
    Both null = 1.0, one null = 0.0.
    """
    if predicted is None and truth is None:
        return 1.0
    if predicted is None or truth is None:
        return 0.0
    try:
        p, t = float(predicted), float(truth)
    except (ValueError, TypeError):
        return 0.0
    if t == 0:
        return 1.0 if p == 0 else 0.0
    error = abs(p - t) / max(abs(t), 1)
    if error <= tolerance:
        return 1.0
    elif error <= tolerance * 3:
        return 0.5
    return 0.0


def score_set_f1(predicted: Any, truth: Any) -> float:
    """Score set fields using F1 score.

    Normalizes to lowercase and computes precision/recall/F1.
    """
    if not predicted and not truth:
        return 1.0
    if not predicted or not truth:
        return 0.0

    pred_set = {str(x).lower().strip() for x in predicted if x}
    truth_set = {str(x).lower().strip() for x in truth if x}

    if not pred_set and not truth_set:
        return 1.0
    if not pred_set or not truth_set:
        return 0.0

    intersection = pred_set & truth_set
    precision = len(intersection) / len(pred_set) if pred_set else 0
    recall = len(intersection) / len(truth_set) if truth_set else 0

    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def score_extraction(predicted: dict, truth: dict) -> dict:
    """Score a single extraction against ground truth.

    Returns per-field scores and an overall weighted score.
    """
    scores = {}

    for field in EXACT_FIELDS:
        scores[field] = score_exact(predicted.get(field), truth.get(field))

    for field in NUMERIC_FIELDS:
        tol = 0.1 if field == "timezone" else 0.15
        scores[field] = score_numeric(predicted.get(field), truth.get(field), tol)

    for field in SET_FIELDS:
        scores[field] = score_set_f1(predicted.get(field), truth.get(field))

    # Weighted overall score — critical fields weighted higher
    weights = {
        # High impact on scoring engine
        "seniority": 3.0,
        "workArrangement": 3.0,
        "technologies": 3.0,
        "roleTypes": 2.0,
        "salaryMin": 2.0,
        "salaryMax": 2.0,
        "includesEquity": 1.5,
        "isContract": 1.5,
        "employmentType": 1.5,
        # Medium impact
        "timezone": 1.0,
        "timezoneFlexible": 1.0,
        "experienceMin": 1.0,
        "experienceMax": 1.0,
        "relocationRequired": 1.0,
        # Low impact
        "isRepost": 0.5,
        "isManagement": 0.5,
        "isLead": 0.5,
    }

    weighted_sum = sum(scores.get(f, 0) * weights.get(f, 1.0) for f in scores)
    total_weight = sum(weights.get(f, 1.0) for f in scores)
    scores["_overall"] = weighted_sum / total_weight if total_weight else 0

    return scores


# ── Benchmark execution ───────────────────────────────────────────────────


def run_model_benchmark(model: str, listings: list[dict], ground_truth: dict[str, dict]):
    """Run all listings through a single model and save results."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = model.replace(":", "_").replace("/", "_")
    result_file = RESULTS_DIR / f"{safe_name}.jsonl"

    # Resume support
    done_ids: set[str] = set()
    if result_file.exists():
        with open(result_file) as f:
            for line in f:
                obj = json.loads(line)
                done_ids.add(obj["id"])

    remaining = [item for item in listings if item["id"] not in done_ids]
    if not remaining:
        print(f"  All {len(listings)} jobs already processed for {model}")
        return

    print(f"  Processing {len(remaining)} jobs with {model}...")

    client = OpenAI(base_url=f"{OLLAMA_URL}/v1", api_key="none")
    system_prompt = build_system_prompt()

    errors = 0
    total_time = 0.0

    with open(result_file, "a") as out:
        for i, job in enumerate(remaining):
            user_prompt = build_user_prompt(job)
            t0 = time.time()

            try:
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    max_tokens=2048,
                    temperature=0.1,
                    response_format={"type": "json_object"},
                )
                elapsed = time.time() - t0
                total_time += elapsed

                text = response.choices[0].message.content or ""
                extraction = extract_json_from_response(text)

                if extraction is None:
                    errors += 1
                    extraction = {"_error": "JSON parse failed", "_raw": text[:500]}
                else:
                    # Normalize technologies
                    if "technologies" in extraction:
                        extraction["technologies"] = [
                            str(t).lower().strip() for t in extraction["technologies"] if t
                        ]

                record = {
                    "id": job["id"],
                    "title": job["title"],
                    "company_name": job["company_name"],
                    "extraction": extraction,
                    "elapsed_s": round(elapsed, 2),
                }
                out.write(json.dumps(record) + "\n")
                out.flush()

                status = "OK" if "_error" not in extraction else "FAIL"
                print(
                    f"    [{i+1}/{len(remaining)}] {status} {elapsed:.1f}s "
                    f"— {job['company_name']}: {job['title'][:40]}"
                )

            except Exception as e:
                elapsed = time.time() - t0
                errors += 1
                record = {
                    "id": job["id"],
                    "title": job["title"],
                    "company_name": job["company_name"],
                    "extraction": {"_error": str(e)},
                    "elapsed_s": round(elapsed, 2),
                }
                with open(result_file, "a") as out2:
                    out2.write(json.dumps(record) + "\n")
                print(f"    [{i+1}/{len(remaining)}] ERROR {elapsed:.1f}s — {e}")

    avg_time = total_time / max(len(remaining) - errors, 1)
    print(f"  Done: {len(remaining) - errors} OK, {errors} errors, {avg_time:.1f}s avg")


def generate_report(ground_truth: dict[str, dict]):
    """Generate comparison report from all saved results."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    result_files = sorted(RESULTS_DIR.glob("*.jsonl"))

    if not result_files:
        print("No result files found. Run benchmarks first.")
        return

    all_field_names = EXACT_FIELDS + NUMERIC_FIELDS + SET_FIELDS
    model_scores: dict[str, dict] = {}

    for rf in result_files:
        model_name = rf.stem
        per_job_scores: list[dict] = []
        total = 0
        errors = 0
        total_time = 0.0

        with open(rf) as f:
            for line in f:
                record = json.loads(line)
                total += 1
                total_time += record.get("elapsed_s", 0)

                extraction = record.get("extraction", {})
                if "_error" in extraction:
                    errors += 1
                    continue

                truth = ground_truth.get(record["id"], {}).get("extraction")
                if not truth:
                    continue

                scores = score_extraction(extraction, truth)
                per_job_scores.append(scores)

        if not per_job_scores:
            continue

        # Aggregate scores
        avg_scores = {}
        for field in all_field_names + ["_overall"]:
            vals = [s[field] for s in per_job_scores if field in s]
            avg_scores[field] = sum(vals) / len(vals) if vals else 0.0

        avg_scores["_errors"] = errors
        avg_scores["_total"] = total
        avg_scores["_avg_time"] = total_time / max(total, 1)
        model_scores[model_name] = avg_scores

    # Generate report
    report_lines = []
    report_lines.append("=" * 100)
    report_lines.append("EXTRACTION MODEL BENCHMARK REPORT")
    report_lines.append(f"Date: {TODAY}")
    report_lines.append(f"Ground truth: {len(ground_truth)} jobs (Claude Sonnet)")
    report_lines.append("=" * 100)
    report_lines.append("")

    # Overall ranking
    ranked = sorted(model_scores.items(), key=lambda x: x[1]["_overall"], reverse=True)

    report_lines.append("OVERALL RANKING")
    report_lines.append("-" * 80)
    report_lines.append(
        f"{'Model':<25} {'Overall':>8} {'Errors':>7} {'Avg Time':>9} "
        f"{'Seniority':>10} {'WorkArr':>8} {'Techs':>8} {'Roles':>8} {'Salary':>8}"
    )
    report_lines.append("-" * 80)

    for model_name, scores in ranked:
        sal_score = (scores.get("salaryMin", 0) + scores.get("salaryMax", 0)) / 2
        report_lines.append(
            f"{model_name:<25} {scores['_overall']:>7.1%} "
            f"{scores['_errors']:>6}  {scores['_avg_time']:>7.1f}s "
            f"{scores.get('seniority', 0):>9.1%} "
            f"{scores.get('workArrangement', 0):>7.1%} "
            f"{scores.get('technologies', 0):>7.1%} "
            f"{scores.get('roleTypes', 0):>7.1%} "
            f"{sal_score:>7.1%}"
        )

    report_lines.append("")
    report_lines.append("")

    # Detailed per-field breakdown
    report_lines.append("DETAILED FIELD ACCURACY")
    report_lines.append("-" * 100)

    header = f"{'Field':<22}"
    for model_name, _ in ranked:
        header += f" {model_name[:15]:>15}"
    report_lines.append(header)
    report_lines.append("-" * 100)

    for field in all_field_names:
        row = f"{field:<22}"
        for model_name, scores in ranked:
            val = scores.get(field, 0)
            row += f" {val:>14.1%}"
        report_lines.append(row)

    report_lines.append("-" * 100)
    row = f"{'OVERALL (weighted)':<22}"
    for model_name, scores in ranked:
        row += f" {scores['_overall']:>14.1%}"
    report_lines.append(row)

    report_lines.append("")

    report_text = "\n".join(report_lines)

    # Save and print
    report_file = RESULTS_DIR / "report.txt"
    report_file.write_text(report_text)
    print(report_text)
    print(f"\nReport saved to {report_file}")


# ── Main ──────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Benchmark extraction models")
    parser.add_argument("models", nargs="*", help="Specific models to test (default: all)")
    parser.add_argument("--report-only", action="store_true", help="Only regenerate report")
    parser.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL, help="Ollama API URL")
    parser.add_argument(
        "--docker",
        action="store_true",
        help="Use 'docker exec job-finder-ollama' for ollama commands",
    )
    args = parser.parse_args()

    global OLLAMA_URL, USE_DOCKER  # noqa: PLW0603
    OLLAMA_URL = args.ollama_url
    USE_DOCKER = args.docker

    # Load ground truth
    if not GROUND_TRUTH_FILE.exists():
        sys.exit(
            f"Ground truth not found: {GROUND_TRUTH_FILE}\nRun generate_ground_truth.py first."
        )

    ground_truth: dict[str, dict] = {}
    with open(GROUND_TRUTH_FILE) as f:
        for line in f:
            obj = json.loads(line)
            ground_truth[obj["id"]] = obj

    print(f"Loaded {len(ground_truth)} ground truth records")

    if args.report_only:
        generate_report(ground_truth)
        return

    # Load sample listings
    listings = []
    with open(SAMPLE_FILE) as f:
        for line in f:
            listings.append(json.loads(line))

    # Only test listings that have ground truth
    listings = [item for item in listings if item["id"] in ground_truth]
    print(f"Testing against {len(listings)} listings with ground truth")

    models = args.models or CANDIDATE_MODELS

    for model in models:
        print(f"\n{'='*60}")
        print(f"BENCHMARKING: {model}")
        print(f"{'='*60}")

        # Pull model
        if not pull_model(model):
            print(f"  Skipping {model} (pull failed)")
            continue

        # Run benchmark
        run_model_benchmark(model, listings, ground_truth)

        # Unload model to free VRAM for next one
        print(f"  Unloading {model}...")
        unload_model(model)

    # Generate report
    print(f"\n{'='*60}")
    print("GENERATING REPORT")
    print(f"{'='*60}\n")
    generate_report(ground_truth)


if __name__ == "__main__":
    main()
