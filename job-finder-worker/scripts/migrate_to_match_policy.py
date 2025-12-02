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
                "preferredBonus": 15,
                "acceptablePenalty": 0,
                "rejectedPenalty": -100,
            },
        ),
        "location": scoring_config.get(
            "location",
            {
                "allowRemote": True,
                "allowHybrid": True,
                "allowOnsite": False,
                "userTimezone": -8,
                "maxTimezoneDiffHours": 4,
                "perHourPenalty": 3,
                "hybridSameCityBonus": 10,
            },
        ),
        "technology": scoring_config.get(
            "technology",
            {
                "required": ["typescript", "react"],
                "preferred": ["node", "python"],
                "disliked": ["angular"],
                "rejected": ["wordpress", "php"],
                "requiredBonus": 10,
                "preferredBonus": 5,
                "dislikedPenalty": -5,
            },
        ),
        "salary": scoring_config.get(
            "salary",
            {
                "minimum": 150000,
                "target": 200000,
                "belowTargetPenalty": 2,
            },
        ),
        "experience": scoring_config.get(
            "experience",
            {
                "userYears": 12,
                "maxRequired": 15,
                "overqualifiedPenalty": 5,
            },
        ),
        # NEW: Freshness config (from prefilter-policy.strikeEngine.ageStrike)
        "freshness": {
            "freshBonusDays": 2,
            "freshBonus": 10,
            "staleThresholdDays": age_strike.get("strikeDays", 3),
            "stalePenalty": -10,
            "veryStaleDays": age_strike.get("rejectDays", 12),
            "veryStalePenalty": -20,
            "repostPenalty": -5,
        },
        # NEW: Role fit config
        "roleFit": {
            "backendBonus": 5,
            "mlAiBonus": 10,
            "devopsSreBonus": 5,
            "dataBonus": 5,
            "securityBonus": 3,
            "leadBonus": 3,
            "frontendPenalty": -5,
            "consultingPenalty": -10,
            "clearancePenalty": -100,
            "managementPenalty": -10,
        },
        # From old match-policy.companyWeights + jobMatch
        "company": {
            "preferredCityBonus": job_match.get("portlandOfficeBonus", 20),
            "preferredCity": "Portland",  # Extracted from Portland-specific bonus
            "remoteFirstBonus": company_weights.get("bonuses", {}).get("remoteFirst", 15),
            "aiMlFocusBonus": company_weights.get("bonuses", {}).get("aiMlFocus", 10),
            "largeCompanyBonus": company_weights.get("sizeAdjustments", {}).get(
                "largeCompanyBonus", 10
            ),
            "smallCompanyPenalty": company_weights.get("sizeAdjustments", {}).get(
                "smallCompanyPenalty", -5
            ),
            "largeCompanyThreshold": company_weights.get("sizeAdjustments", {}).get(
                "largeCompanyThreshold", 10000
            ),
            "smallCompanyThreshold": company_weights.get("sizeAdjustments", {}).get(
                "smallCompanyThreshold", 100
            ),
            "startupBonus": 0,
        },
        # From old match-policy.dealbreakers
        "dealbreakers": {
            "blockedLocations": dealbreakers.get(
                "blockedLocations",
                [
                    "india",
                    "bangalore",
                    "bengaluru",
                    "hyderabad",
                    "chennai",
                    "pune",
                    "philippines",
                    "manila",
                ],
            ),
            "locationPenalty": dealbreakers.get("locationPenaltyPoints", 60),
            "relocationPenalty": dealbreakers.get("relocationPenaltyPoints", 80),
            "ambiguousLocationPenalty": dealbreakers.get("ambiguousLocationPenaltyPoints", 40),
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
