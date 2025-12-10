# Match Analysis UX & Calculation Plan

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-10

## Goals
- Make match scoring transparent: show base vs. adjusted score and every adjustment applied.
- Replace raw JSON blobs in job listing details with structured, readable UI.
- Ensure all config knobs (timezone penalties, company weights, freshness, etc.) are actually applied server-side and surfaced client-side.
- Give match details more space (wider modal or full-page takeover) and render long text without cramped scroll boxes.

## Current state
- Worker: deterministic scoring provides `ScoreBreakdown` (base/final/adjustments); AI matcher returns `JobMatchResult` with `potential_concerns`, reasons, strengths, matched/missing skills.
- FE: `MatchBreakdown` component (`job-finder-FE/src/pages/job-listings/components/MatchBreakdown.tsx`) shows base vs final scores, adjustments list, concerns, reasons/strengths, matched/missing skills, and a raw JSON toggle. This is rendered in listings detail UI.
- Config: per-hour/hard timezone penalties and company weights are surfaced in match policy forms; worker uses user timezone diffs.

## Decisions
- Keep computations in worker (not in agent); rely on agent only for base score and extracted fields.
- Surface worker adjustments to FE via a typed shape rather than raw JSON.
- Present match details in a richer “Match Breakdown” UI with room to breathe.

## Remaining tweaks
1) Layout: consider widening the details surface (modal/full-page) for long analyses; current component is readable but still in a card.
2) Tests: add FE snapshot/E2E coverage specifically for `MatchBreakdown` rendering adjustments/concerns (if missing).
3) Optional: add numeric score visualization using `score_breakdown` when available.

## Open questions
- Should we store base vs. final score separately in persistence, or derive on the fly? (Default: include both in match result.)
- Do we want an “explainability” tab in Queue/Applications pages too? (Likely yes; reuse component.)
