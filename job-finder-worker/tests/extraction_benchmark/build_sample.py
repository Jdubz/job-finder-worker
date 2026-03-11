#!/usr/bin/env python3
"""
Build a stratified sample of ~100 job listings from the production database
for use as an extraction benchmark dataset.

Strata:
  1. 15 from top tech companies
  2. 15 from consulting/staffing firms
  3. 10 with scraped salary_range (non-null)
  4. 10 with very long descriptions (>6000 chars)
  5. 10 with medium descriptions (1000-3000 chars)
  6. 10 with short descriptions (200-500 chars)
  7. 10 that are clearly non-remote (hybrid/onsite)
  8. 10 that mention ML/AI/data in the title
  9. 10 random from remaining
"""

import json
import sqlite3
from pathlib import Path

DB_PATH = "/srv/job-finder/data/jobfinder.db"
OUTPUT_PATH = Path(__file__).parent / "sample_listings.jsonl"

FIELDS = [
    "id",
    "title",
    "company_name",
    "location",
    "description",
    "salary_range",
    "url",
    "posted_date",
]

BASE_WHERE = "LENGTH(description) >= 200 AND filter_result IS NOT NULL"

TOP_TECH = [
    "Stripe",
    "Coinbase",
    "GitHub",
    "Reddit",
    "Pinterest",
    "MongoDB",
    "Databricks",
    "Airbnb",
    "Dropbox",
    "Twilio",
    "Okta, Inc.",
    "Confluent",
    "Temporal Technologies",
    "Flock Safety",
    "Axon",
    "instacart",
    "whatnot",
    "Red Hat",
    "Microsoft",
]

CONSULTING = [
    "Truelogic",
    "ClearBridge Technology Group",
    "CI&T",
    "GD Information Technology, Inc.",
    "Nagarro",
    "Jobgether",
    "Speechify",
    "Hinge-Health",
    "Stord, Inc.",
]


def placeholders(items):
    return ", ".join("?" for _ in items)


def fetch_stratum(cur, extra_where: str, params: tuple, limit: int, exclude_ids: set) -> list[dict]:
    """Fetch rows matching extra criteria, excluding already-selected IDs."""
    exclude_clause = ""
    all_params = list(params)
    if exclude_ids:
        exclude_clause = f" AND id NOT IN ({placeholders(exclude_ids)})"
        all_params.extend(exclude_ids)

    query = f"""
        SELECT {', '.join(FIELDS)}
        FROM job_listings
        WHERE {BASE_WHERE}
          {f'AND {extra_where}' if extra_where else ''}
          {exclude_clause}
        ORDER BY RANDOM()
        LIMIT ?
    """
    all_params.append(limit)
    cur.execute(query, all_params)
    columns = [col[0] for col in cur.description]
    return [dict(zip(columns, row)) for row in cur.fetchall()]


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Check total pool
    cur.execute(f"SELECT COUNT(*) FROM job_listings WHERE {BASE_WHERE}")
    total_pool = cur.fetchone()[0]
    print(f"Total eligible listings: {total_pool}")

    selected_ids: set[str] = set()
    all_rows: list[dict] = []
    strata_counts: dict[str, int] = {}

    def add_stratum(name: str, extra_where: str, params: tuple, limit: int):
        rows = fetch_stratum(cur, extra_where, params, limit, selected_ids)
        for r in rows:
            selected_ids.add(r["id"])
            all_rows.append(r)
        strata_counts[name] = len(rows)
        print(f"  {name}: {len(rows)} jobs")

    print("\nSampling strata:")

    # 1. Top tech companies (15)
    tech_where = f"company_name IN ({placeholders(TOP_TECH)})"
    add_stratum("top_tech", tech_where, tuple(TOP_TECH), 15)

    # 2. Consulting/staffing firms (15)
    consult_where = f"company_name IN ({placeholders(CONSULTING)})"
    add_stratum("consulting", consult_where, tuple(CONSULTING), 15)

    # 3. Salary range present (10)
    add_stratum("has_salary", "salary_range IS NOT NULL AND salary_range != ''", (), 10)

    # 4. Very long descriptions >6000 chars (10)
    add_stratum("long_desc", "LENGTH(description) > 6000", (), 10)

    # 5. Medium descriptions 1000-3000 chars (10)
    add_stratum("medium_desc", "LENGTH(description) BETWEEN 1000 AND 3000", (), 10)

    # 6. Short descriptions 200-500 chars (10)
    add_stratum("short_desc", "LENGTH(description) BETWEEN 200 AND 500", (), 10)

    # 7. Non-remote (hybrid/onsite) (10)
    add_stratum(
        "non_remote",
        "json_extract(filter_result, '$.extraction.workArrangement') IN ('hybrid', 'onsite', 'office')",
        (),
        10,
    )

    # 8. ML/AI/Data in title (10)
    add_stratum(
        "ml_ai_data",
        "(title LIKE '%ML%' OR title LIKE '%AI %' OR title LIKE '% AI%' "
        "OR title LIKE '%Machine Learning%' OR title LIKE '%Data %' "
        "OR title LIKE '%GenAI%' OR title LIKE '%LLM%')",
        (),
        10,
    )

    # 9. Random from remaining (10)
    add_stratum("random_remaining", "", (), 10)

    # Write JSONL
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        for row in all_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    # Summary stats
    total = len(all_rows)
    companies = set(r["company_name"] for r in all_rows)
    desc_lengths = [len(r["description"]) for r in all_rows]
    has_salary = sum(1 for r in all_rows if r.get("salary_range"))
    has_location = sum(1 for r in all_rows if r.get("location"))

    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Total jobs written:      {total}")
    print(f"Unique companies:        {len(companies)}")
    print(f"Description length range: {min(desc_lengths)} - {max(desc_lengths)} chars")
    print(f"Mean description length:  {sum(desc_lengths)/len(desc_lengths):.0f} chars")
    print(f"Jobs with salary_range:  {has_salary}")
    print(f"Jobs with location:      {has_location}")
    print(f"Output file:             {OUTPUT_PATH}")
    print(f"File size:               {OUTPUT_PATH.stat().st_size / 1024:.1f} KB")

    print(f"\nStrata breakdown:")
    for name, count in strata_counts.items():
        print(f"  {name:25s} {count:3d}")

    conn.close()


if __name__ == "__main__":
    main()
