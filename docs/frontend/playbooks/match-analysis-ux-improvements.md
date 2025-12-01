# Match Analysis UX & Calculation Plan

> Status: Draft
> Owner: FE/Worker
> Last Updated: 2025-12-01

## Goals
- Make match scoring transparent: show base vs. adjusted score and every adjustment applied.
- Replace raw JSON blobs in job listing details with structured, readable UI.
- Ensure all config knobs (timezone penalties, company weights, freshness, etc.) are actually applied server-side and surfaced client-side.
- Give match details more space (wider modal or full-page takeover) and render long text without cramped scroll boxes.

## Current state (as of 2025-12-01)
- Worker (`job_finder/ai/matcher.py`) takes the LLM’s structured `match_analysis` with a base `match_score`, then applies:
  - Location/dealbreaker penalties (requireRemote/hybrid/onsite, maxTimezoneDiffHours, per-hour TZ penalty, hard TZ penalty).
  - Portland office bonus.
  - Company weights (remoteFirst, aiMlFocus, size, timezone buckets, priority thresholds).
  - Freshness adjustments and role preference adjustments.
  - Builds an `adjustments` array of human-readable strings; clamps 0–100; sets `application_priority`.
- FE (`JobListingsPage`) currently renders `analysisResult` as raw JSON in a small `<pre>` with a cramped description area.
- Config forms now expose per-hour/hard TZ penalties and still rely on user timezone for diff calculations.

## Decisions
- Keep computations in worker (not in agent); rely on agent only for base score and extracted fields.
- Surface worker adjustments to FE via a typed shape rather than raw JSON.
- Present match details in a richer “Match Breakdown” UI with room to breathe.

## Plan
### 1) Data & contracts
- Ensure `JobMatchResult` returned by worker/API includes:
  - `match_score` (final), `base_match_score` (from agent), `application_priority`.
  - `adjustments` (list of strings), `potential_concerns` (list of strings).
  - Optional `score_breakdown` for future numeric visualization.
- Update shared types to reflect the above shape (FE typings + BE contracts).

### 2) Worker updates
- If not already returned, add `adjustments`, `base_match_score`, `application_priority` to the match result payload.
- Keep penalties tied to the user’s timezone (no Pacific hardcode); ensure per-hour and hard penalties are logged in adjustments.

### 3) FE UI updates (Job Listings detail)
- Replace JSON blob with a `MatchBreakdown` component:
  - Base vs. Final score pill, priority tag.
  - List of adjustments with icons (dealbreakers highlighted).
  - “Concerns” list from `potential_concerns`.
  - Collapsible “View raw JSON” for debugging.
- Layout: widen the details modal to `max-w-5xl` or provide a full-page view option. Let description/content flow (no tiny scroll boxes).

### 4) Testing
- FE: snapshot/component test for `MatchBreakdown` rendering adjustments/concerns; e2e check that match details render without JSON blob.
- Worker: unit test that `JobMatchResult` includes adjustments and base/final scores when returned.

### 5) Rollout
- Ship behind no flag (UI only improves readability); verify on staging list/detail pages.
- Communicate to ops that blocked locations are gone; timezone penalties and max diff control location gating.

## Open questions
- Should we store base vs. final score separately in persistence, or derive on the fly? (Default: include both in match result.)
- Do we want an “explainability” tab in Queue/Applications pages too? (Likely yes; reuse component.)
