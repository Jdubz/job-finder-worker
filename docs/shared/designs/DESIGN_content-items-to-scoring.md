> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-04

# Derive Scoring Profile from Content-Items

Scope: Replace manual technology/experience config with data derived from content-items.

## Problem Statement

Currently, users must manually configure:
- `technology.required`: ["typescript", "react", "javascript", "node", "nodejs"]
- `technology.preferred`: ["nextjs", "graphql", "gcp"]
- `experience.userYears`: 10

This duplicates data already in content-items:

| Content-Item | ai_context | skills |
|--------------|------------|--------|
| Fulfil Solutions | work | Angular, Node.js (TypeScript), MySQL, Redis, MongoDB, BullMQ, Pub/Sub, Kubernetes, GCP, Firebase |
| Opna Development | work | Node.js, React, Firebase, GCP |
| Front End | skills | Angular, React, Mobx, tailwind, shadcn |
| Back End | skills | nodejs, express, apollo, python, Flask |
| Platform | skills | GCP, Linux, Docker, Kubernetes |

**Result:** Manual maintenance burden and risk of config/resume drift.

## Proposed Change

Derive scoring inputs from content-items:
1. **Skills list** → aggregated from all content-items with skills arrays
2. **Experience years** → calculated from work item date ranges
3. **Keep manual config for:** rejected/disliked tech (negative signals only)

## Content-Items Structure (Production Data)

```
ai_context=work (with dates):
├── fulfil-solutions: 2021-12 to 2025-03 (3.3 years)
├── meow-wolf: 2021-03 to 2021-07 (0.3 years)
├── opna-development: 2017-06 to 2021-12 (4.5 years)
├── software-engineer-2015: 2015-08 to 2017-06 (1.8 years)
├── britelite-immersive: 2013-02 to 2015-09 (2.6 years)
└── interactive-developer-2012: 2012-09 to 2013-02 (0.4 years)

ai_context=skills (categorized skill lists):
├── Front End: Angular, React, Mobx, tailwind, shadcn
├── Back End: nodejs, express, apollo, python, Flask
├── Platform: GCP, Linux, Docker, Kubernetes
└── Integrations: Doordash, Uber Eats, Stripe, Taxjar

ai_context=highlight (project skills within work):
├── fulfil-amazon-fresh: Pub/Sub, Event driven architecture
├── fulfil-order-management: Ionic, Angular, Firebase, Node.js
└── opna-dialogflow-jll: Dialogflow, GCP, GraphQL, Apollo, React
```

## Implementation Plan

### Phase 1: Create Profile Reducer

**File:** `job-finder-worker/src/job_finder/profile/reducer.py` (new)

```python
"""Reduce content-items into quantified scoring profile."""

from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Set, Optional
import json

@dataclass
class ScoringProfile:
    """Derived profile for scoring engine."""
    skills: Set[str]                    # All unique skills (lowercase, normalized)
    skill_years: Dict[str, float]       # Skill -> years of experience
    total_experience_years: float       # Total years from work items

def parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse YYYY-MM or YYYY-MM-DD format."""
    if not date_str:
        return None
    try:
        if len(date_str) == 7:  # YYYY-MM
            return datetime.strptime(date_str, "%Y-%m")
        return datetime.strptime(date_str[:10], "%Y-%m-%d")
    except ValueError:
        return None

def calculate_experience_years(work_items: List[dict]) -> float:
    """Calculate total experience years from work items with dates."""
    total_months = 0
    for item in work_items:
        start = parse_date(item.get("start_date"))
        end = parse_date(item.get("end_date")) or datetime.now()
        if start:
            months = (end.year - start.year) * 12 + (end.month - start.month)
            total_months += max(0, months)
    return round(total_months / 12, 1)

def extract_skills(items: List[dict]) -> Set[str]:
    """Extract and normalize all skills from content-items."""
    skills = set()
    for item in items:
        skills_json = item.get("skills")
        if skills_json:
            try:
                parsed = json.loads(skills_json) if isinstance(skills_json, str) else skills_json
                for skill in parsed:
                    # Normalize: lowercase, strip whitespace
                    normalized = skill.lower().strip()
                    if normalized:
                        skills.add(normalized)
            except (json.JSONDecodeError, TypeError):
                pass
    return skills

def calculate_skill_years(work_items: List[dict]) -> Dict[str, float]:
    """Calculate years of experience per skill from work items."""
    skill_years: Dict[str, float] = {}

    for item in work_items:
        start = parse_date(item.get("start_date"))
        end = parse_date(item.get("end_date")) or datetime.now()
        if not start:
            continue

        months = max(0, (end.year - start.year) * 12 + (end.month - start.month))
        years = months / 12

        # Get skills from this work item
        skills_json = item.get("skills")
        if skills_json:
            try:
                parsed = json.loads(skills_json) if isinstance(skills_json, str) else skills_json
                for skill in parsed:
                    normalized = skill.lower().strip()
                    if normalized:
                        # Accumulate years across multiple jobs using same skill
                        skill_years[normalized] = skill_years.get(normalized, 0) + years
            except (json.JSONDecodeError, TypeError):
                pass

    return skill_years

def reduce_content_items(items: List[dict]) -> ScoringProfile:
    """Reduce content-items into scoring profile."""
    work_items = [i for i in items if i.get("ai_context") == "work"]

    # Calculate years per skill from work items
    skill_years = calculate_skill_years(work_items)

    # All items with skills contribute to skill set (including non-work items)
    all_skills = extract_skills(items)

    # Skills from non-work items get 0 years (known but no professional experience)
    for skill in all_skills:
        if skill not in skill_years:
            skill_years[skill] = 0

    # Calculate total experience years
    total_years = calculate_experience_years(work_items)

    return ScoringProfile(
        skills=all_skills,
        skill_years=skill_years,
        total_experience_years=total_years,
    )
```

**Example output from production data:**
```python
skill_years = {
    "react": 7.8,      # Fulfil (3.3y) + Opna (4.5y)
    "node.js": 7.8,    # Fulfil (3.3y) + Opna (4.5y)
    "gcp": 7.8,        # Fulfil (3.3y) + Opna (4.5y)
    "python": 5.6,     # Opna game servers + Britelite + Madrone
    "angular": 3.3,    # Fulfil only
    "docker": 3.6,     # Fulfil (3.3y) + Meow Wolf (0.3y)
    "kubernetes": 3.3, # Fulfil only
    "graphql": 0,      # In skills section but no work item dates
    ...
}
```

### Phase 2: Load Profile in JobProcessor

**File:** `job-finder-worker/src/job_finder/job_queue/processors/job_processor.py`

Add to imports:
```python
from job_finder.profile.reducer import reduce_content_items, ScoringProfile
from job_finder.storage.sqlite_client import sqlite_connection
```

Add method:
```python
def _load_scoring_profile(self) -> ScoringProfile:
    """Load and reduce content-items into scoring profile."""
    with sqlite_connection() as conn:
        rows = conn.execute(
            "SELECT id, ai_context, start_date, end_date, skills FROM content_items"
        ).fetchall()
    items = [dict(row) for row in rows]
    return reduce_content_items(items)
```

Modify `__init__` and `_refresh_runtime_config`:
```python
# Load derived profile from content-items
profile = self._load_scoring_profile()

# Build analog map from config
analog_groups = match_policy.get("skillMatch", {}).get("analogGroups", [])
skill_analogs = build_analog_map(analog_groups)

# Pass derived values to scoring engine
self.scoring_engine = ScoringEngine(
    match_policy,
    skill_years=profile.skill_years,
    user_experience_years=profile.total_experience_years,
    skill_analogs=skill_analogs,
)
```

### Phase 3: Remove Redundant Config Fields

Remove fields that will be derived from content-items:

**File:** `shared/src/config.types.ts`

Replace `TechnologyConfig` with `SkillMatchConfig`:
```typescript
export interface SkillMatchConfig {
  // All lists removed - derived from content-items
  // No hard rejects - just scoring

  // Experience-weighted matching
  baseMatchScore: number          // Base points per matched skill (e.g., 1)
  yearsMultiplier: number         // Additional points per year of experience (e.g., 0.5)
  maxYearsBonus: number           // Cap years counted per skill (e.g., 5 = max 5 years worth)

  missingScore: number            // Penalty per unmatched job skill (negative)
  analogScore: number             // Points when have analog (usually 0)
  maxBonus: number                // Cap on total skill matching bonus
  maxPenalty: number              // Cap on missing skill penalty (negative)
  analogGroups: string[][]        // Equivalent skill groups
}

// Example scoring:
// Job wants "react" - I have 7.8 years
// Score = baseMatchScore + min(years, maxYearsBonus) * yearsMultiplier
//       = 1 + min(7.8, 5) * 0.5
//       = 1 + 2.5 = 3.5 points

// Job wants "kubernetes" - I have 3.3 years
// Score = 1 + min(3.3, 5) * 0.5 = 1 + 1.65 = 2.65 points

// Job wants "graphql" - I have it but 0 work years
// Score = 1 + 0 = 1 point (base only)
```

Update `ExperienceConfig`:
```typescript
export interface ExperienceConfig {
  // REMOVE: userYears: number  // Now calculated from content-items
  maxRequired: number
  overqualifiedScore: number
}
```

**File:** `job-finder-FE/src/pages/job-finder-config/components/tabs/ScoringConfigTab.tsx`

Remove entire Technology section (replaced by Skill Matching):
- `technology.required`
- `technology.preferred`
- `technology.disliked`
- `technology.rejected`
- All score fields

Add new Skill Matching section:
- `skillMatch.matchScore` NumericField
- `skillMatch.missingScore` NumericField
- `skillMatch.analogScore` NumericField
- `skillMatch.maxBonus` NumericField
- `skillMatch.maxPenalty` NumericField
- `skillMatch.analogGroups` (UI for equivalent skill groups)

Remove from Experience section:
- `experience.userYears` NumericField

Add info text: "Skills and experience years are derived from your content items."

### Phase 4: Implement Skill Matching with Analogs

**Scoring Logic:**

```
For each skill mentioned in job listing:
  1. If skill in user_skills → +skillMatchScore
  2. Else if skill has analog in user_skills → 0 (neutral)
  3. Else → +missingSkillScore (negative)

Cap total at maxSkillBonus (positive) and maxSkillPenalty (negative)
```

**File:** `job-finder-worker/src/job_finder/scoring/engine.py`

Change constructor signature:
```python
def __init__(
    self,
    config: Dict[str, Any],
    skill_years: Dict[str, float],              # skill -> years of experience
    user_experience_years: float,               # total years
    skill_analogs: Dict[str, Set[str]],         # skill -> set of equivalents
):
    self.skill_years = skill_years
    self.user_skills = set(skill_years.keys())  # derive from skill_years
    self.user_experience_years = user_experience_years
    self.skill_analogs = skill_analogs
    self.skill_match_config = config["skillMatch"]  # required section
```

New `_score_skill_match()` method:
```python
def _score_skill_match(self, job_technologies: List[str]) -> Dict[str, Any]:
    """Score based on skill overlap with experience weighting."""
    # Required config - fail loud if missing
    base_score = self.skill_match_config["baseMatchScore"]
    years_mult = self.skill_match_config["yearsMultiplier"]
    max_years = self.skill_match_config["maxYearsBonus"]
    missing_score = self.skill_match_config["missingScore"]
    analog_score = self.skill_match_config["analogScore"]
    max_bonus = self.skill_match_config["maxBonus"]
    max_penalty = self.skill_match_config["maxPenalty"]

    matched = []      # (skill, years, points)
    has_analog = []   # (skill, analog_skill)
    missing = []      # skill

    total_bonus = 0
    for skill in job_technologies:
        skill_lower = skill.lower()
        if skill_lower in self.user_skills:
            years = self.skill_years[skill_lower]
            capped_years = min(years, max_years)
            points = base_score + (capped_years * years_mult)
            matched.append((skill, years, points))
            total_bonus += points
        elif self._has_analog(skill_lower):
            analog = self._get_analog(skill_lower)
            has_analog.append((skill, analog))
        else:
            missing.append(skill)

    bonus = min(total_bonus, max_bonus)
    analog_pts = len(has_analog) * analog_score
    penalty = max(len(missing) * missing_score, max_penalty)

    adjustments = []
    if matched:
        details = [f"{s} ({y:.1f}y → +{p:.1f})" for s, y, p in matched]
        adjustments.append(ScoreAdjustment("skills", f"Matched: {', '.join(details)}", bonus))
    if has_analog:
        details = [f"{s}→{a}" for s, a in has_analog]
        adjustments.append(ScoreAdjustment("skills", f"Analog: {', '.join(details)}", analog_pts))
    if missing:
        adjustments.append(ScoreAdjustment("skills", f"Missing: {', '.join(missing)}", penalty))

    return {"points": bonus + analog_pts + penalty, "adjustments": adjustments}

def _has_analog(self, skill: str) -> bool:
    """Check if user has an equivalent skill."""
    analogs = self.skill_analogs.get(skill, set())
    return bool(analogs & self.user_skills)

def _get_analog(self, skill: str) -> str:
    """Get the user's equivalent skill."""
    analogs = self.skill_analogs.get(skill, set())
    match = analogs & self.user_skills
    return next(iter(match)) if match else ""
```

Remove `_score_technology()` entirely - no more tech-based scoring/rejection.

### Phase 5: Build Analog Map from Config

**File:** `job-finder-worker/src/job_finder/profile/reducer.py`

Add function to build analog lookup:
```python
def build_analog_map(analog_groups: List[List[str]]) -> Dict[str, Set[str]]:
    """Build skill -> equivalents map from analog groups."""
    analog_map: Dict[str, Set[str]] = {}
    for group in analog_groups:
        group_set = {s.lower() for s in group}
        for skill in group_set:
            # Each skill maps to all others in its group
            analog_map[skill] = group_set - {skill}
    return analog_map
```

### Phase 6: Config Migration

**File:** `infra/sqlite/migrations/XXX_skill_match_config.sql`

Migrate existing `match-policy` config to new structure:

```sql
-- This is handled in code, not SQL, since it's JSON manipulation
```

**File:** `scripts/migrate-skill-match-config.ts` (or Python)

```typescript
// 1. Read existing match-policy
// 2. Remove: technology.required, preferred, disliked, rejected, requiredScore, preferredScore, dislikedScore
// 3. Remove: experience.userYears
// 4. Add: skillMatch section with required fields
// 5. Write updated config

const newSkillMatch = {
  baseMatchScore: 1,
  yearsMultiplier: 0.5,
  maxYearsBonus: 5,
  missingScore: -1,
  analogScore: 0,
  maxBonus: 25,
  maxPenalty: -15,
  analogGroups: [
    ["aws", "gcp", "azure", "google cloud", "amazon web services"],
    ["react", "angular", "vue", "svelte"],
    ["postgres", "postgresql", "mysql", "sql server", "mariadb"],
    ["kubernetes", "k8s", "docker swarm", "ecs"],
    ["nodejs", "node.js", "node"],
    ["typescript", "javascript", "js", "ts"],
    ["python", "python3"],
    ["redis", "memcached"],
    ["rabbitmq", "kafka", "sqs", "pub/sub", "bullmq"],
    ["graphql", "rest", "restful"],
    ["jenkins", "github actions", "gitlab ci", "circle ci", "travis"],
  ]
}
```

## Calculated Values from Production Data

**Skills (82 unique):**
```
angular, react, mobx, sentry, tailwind, shadcn, bootstrap, themeui,
materialui, styled components, nodejs, express, apollo, python, flask,
c++, restful, graphql, gcp, linux, docker, kubernetes, doordash,
uber eats, stripe, taxjar, contentful, twilio, sendgrid, pagerduty,
slack, bullmq, rabbitmq, pub/sub, lighthouse, prometheus, github actions,
circle ci, travis, firebase, mysql, redis, mongodb, typescript,
node.js, ionic, dialogflow, app engine, java, hipaa, salesforce,
postgres, raspberry pi, arduino, glsl, touch designer, javascript,
openai, gemini, ed-tech, event driven architecture, grafana/loki, elastic...
```

**Experience Years:**
- Work items from 2012-09 to 2025-03 = **12.5 years** (calculated)
- Current config: 10 years (manual, outdated)

## Verification Checklist

### Phase 1-2: Profile Reducer
- [ ] `reduce_content_items()` extracts skills from all ai_context types
- [ ] `calculate_experience_years()` sums work item date ranges
- [ ] `JobProcessor` loads profile and passes to ScoringEngine
- [ ] Worker starts without error when content_items empty

### Phase 3: Config Schema Changes
- [ ] `TechnologyConfig` removed from types
- [ ] `SkillMatchConfig` added with required fields
- [ ] `experience.userYears` removed from types
- [ ] Shared package builds

### Phase 4: Engine Updates
- [ ] ScoringEngine accepts `user_experience_years` and `skill_analogs`
- [ ] `_score_skill_match()` implements new matching logic
- [ ] `_score_technology()` removed entirely
- [ ] `_score_experience()` uses derived years
- [ ] Missing config fields throw errors (no defaults)

### Phase 5: Analog Map
- [ ] `build_analog_map()` creates lookup from config
- [ ] Analog matching works correctly

### Phase 6: Migration
- [ ] Migration script transforms existing config
- [ ] All required fields populated
- [ ] Old fields removed

### UI Updates
- [ ] Technology section replaced with Skill Matching section
- [ ] `experience.userYears` field removed
- [ ] Info text shows derived values
- [ ] FE builds

## Files to Modify

| File | Change |
|------|--------|
| `job-finder-worker/src/job_finder/profile/reducer.py` | New: reduce content-items + build analog map |
| `job-finder-worker/src/job_finder/job_queue/processors/job_processor.py` | Load profile, pass skills + years + analogs |
| `job-finder-worker/src/job_finder/scoring/engine.py` | New skill matching, remove tech scoring |
| `shared/src/config.types.ts` | Replace TechnologyConfig with SkillMatchConfig |
| `job-finder-FE/.../ScoringConfigTab.tsx` | Replace Technology with Skill Matching UI |
| `scripts/migrate-skill-match-config.ts` | New: config migration script |

## Success Criteria

1. Skills derived from content-items with years per skill (e.g., react: 7.8y)
2. Match score weighted by experience (7.8y React > 1y React)
3. Total experience years calculated from work item dates (12.5 years)
4. Analog skills (AWS↔GCP) score neutral (not penalized)
5. Missing skills penalize, matched skills bonus
6. Config only contains scoring weights and analog groups
7. No defaults in code - missing config throws errors
