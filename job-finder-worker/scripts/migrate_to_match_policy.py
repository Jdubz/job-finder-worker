#!/usr/bin/env python3
"""
Migrate scoring-config and match-policy to unified match-policy structure.

This script:
1. Reads existing scoring-config (seniority, location, technology, salary, experience)
2. Reads existing match-policy (company signals, dealbreakers)
3. Combines them into new unified match-policy structure
4. Adds missing freshness, roleFit sections with reasonable values
5. Saves the new match-policy
"""

import json
import sqlite3


def get_config(db_path: str, config_id: str) -> dict:
    """Get a config record by ID."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT payload_json FROM job_finder_config WHERE id = ?", (config_id,)
    ).fetchone()
    conn.close()
    if not row:
        return {}
    return json.loads(row["payload_json"])


def save_config(db_path: str, config_id: str, payload: dict) -> None:
    """Save a config record."""
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        INSERT INTO job_finder_config (id, payload_json, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
        """,
        (config_id, json.dumps(payload)),
    )
    conn.commit()
    conn.close()
    print(f"Saved {config_id}")


def migrate(db_path: str, dry_run: bool = True) -> dict:
    """
    Migrate to unified match-policy structure.

    Args:
        db_path: Path to SQLite database
        dry_run: If True, only print what would be done

    Returns:
        The new match-policy dict
    """
    # Read existing configs
    scoring_config = get_config(db_path, "scoring-config")
    old_match_policy = get_config(db_path, "match-policy")
    prefilter_policy = get_config(db_path, "prefilter-policy")

    print("=== Existing scoring-config ===")
    print(json.dumps(scoring_config, indent=2))
    print()
    print("=== Existing match-policy ===")
    print(json.dumps(old_match_policy, indent=2))
    print()

    # Extract company settings from old match-policy
    job_match = old_match_policy.get("jobMatch", {})
    company_weights = old_match_policy.get("companyWeights", {})
    dealbreakers = old_match_policy.get("dealbreakers", {})

    # Extract freshness from prefilter-policy
    age_strike = prefilter_policy.get("strikeEngine", {}).get("ageStrike", {})

    # Build new unified match-policy
    new_match_policy = {
        # From scoring-config
        "minScore": scoring_config.get("minScore", 60),
        "weights": scoring_config.get(
            "weights",
            {
                "skillMatch": 40,
                "experienceMatch": 30,
                "seniorityMatch": 30,
            },
        ),
        "seniority": scoring_config.get(
            "seniority",
            {
                "preferred": ["senior", "staff", "lead", "principal"],
                "acceptable": ["mid"],
                "rejected": ["junior", "intern", "entry", "associate"],
                "preferredScore": 15,
                "acceptableScore": 0,
                "rejectedScore": -100,
            },
        ),
        "location": {
            **scoring_config.get(
                "location",
                {
                    "allowRemote": True,
                    "allowHybrid": True,
                    "allowOnsite": False,
                    "userTimezone": -8,
                    "maxTimezoneDiffHours": 4,
                    "perHourScore": -3,
                    "hybridSameCityScore": 10,
                },
            ),
            "relocationScore": -dealbreakers.get("relocationPenaltyPoints", 80),
        },
        "technology": scoring_config.get(
            "technology",
            {
                "required": ["typescript", "react"],
                "preferred": ["node", "python"],
                "disliked": ["angular"],
                "rejected": ["wordpress", "php"],
                "requiredScore": 10,
                "preferredScore": 5,
                "dislikedScore": -5,
            },
        ),
        "salary": scoring_config.get(
            "salary",
            {
                "minimum": 150000,
                "target": 200000,
                "belowTargetScore": -2,
            },
        ),
        "experience": scoring_config.get(
            "experience",
            {
                "userYears": 12,
                "maxRequired": 15,
                "overqualifiedScore": -5,
            },
        ),
        # NEW: Freshness config (from prefilter-policy.strikeEngine.ageStrike)
        "freshness": {
            "freshDays": 2,
            "freshScore": 10,
            "staleDays": age_strike.get("strikeDays", 3),
            "staleScore": -10,
            "veryStaleDays": age_strike.get("rejectDays", 12),
            "veryStaleScore": -20,
            "repostScore": -5,
        },
        # NEW: Role fit config (dynamic lists)
        "roleFit": {
            "preferred": ["backend", "ml-ai", "devops", "data", "security"],
            "acceptable": ["fullstack"],
            "penalized": ["frontend", "consulting"],
            "rejected": ["clearance-required", "management"],
            "preferredScore": 5,
            "penalizedScore": -5,
        },
        # From old match-policy.companyWeights + jobMatch
        "company": {
            "preferredCityScore": job_match.get("portlandOfficeBonus", 20),
            "preferredCity": "Portland",  # Extracted from Portland-specific bonus
            "remoteFirstScore": company_weights.get("bonuses", {}).get("remoteFirst", 15),
            "aiMlFocusScore": company_weights.get("bonuses", {}).get("aiMlFocus", 10),
            "largeCompanyScore": company_weights.get("sizeAdjustments", {}).get(
                "largeCompanyBonus", 10
            ),
            "smallCompanyScore": company_weights.get("sizeAdjustments", {}).get(
                "smallCompanyPenalty", -5
            ),
            "largeCompanyThreshold": company_weights.get("sizeAdjustments", {}).get(
                "largeCompanyThreshold", 10000
            ),
            "smallCompanyThreshold": company_weights.get("sizeAdjustments", {}).get(
                "smallCompanyThreshold", 100
            ),
            "startupScore": 0,
        },
    }

    print("=== New match-policy ===")
    print(json.dumps(new_match_policy, indent=2))
    print()

    if dry_run:
        print("DRY RUN - not saving. Run with --apply to save.")
    else:
        save_config(db_path, "match-policy", new_match_policy)
        print("Migration complete!")

    return new_match_policy


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Migrate to unified match-policy")
    parser.add_argument(
        "--db-path",
        default="/srv/job-finder/data/jobfinder.db",
        help="Path to SQLite database",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually apply the migration (default is dry run)",
    )

    args = parser.parse_args()
    migrate(args.db_path, dry_run=not args.apply)
