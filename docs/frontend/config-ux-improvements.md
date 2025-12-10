# Configuration UX & Timezone Refactor Plan
> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-10

## Goals
- Clarify match-policy and pre-filter settings by grouping related inputs, adding contextual help, and tightening layouts (tables for tech ranks, compact numeric inputs).
- Provide consistent shadcn-styled info tooltips describing how each field affects scoring/strikes.
- Replace Portland-specific location allowlists with timezone-distance logic driven by the user's configured timezone.
- Render match analysis data (structured JSON from the worker) in user-friendly UI components instead of raw blobs; widen modal layouts for breathing room.
- Standardize reusable entity modals for companies, listings, matches, sources, and queue items.

## Completed
- Grouped dealbreakers, scoring, company weighting, and tech preferences in Match Policy UI with concise descriptions and info icons.
- Restructured Prefilter Policy UI: strike engine, remote policy, tech ranks, and meta fields now use compact inputs, tables, and tooltips.
- Implemented reusable entity modal system; pages now open entity-specific modals with wider layouts.
- Normalized match analysis rendering (badges, lists, raw JSON toggle) and added accessibility attributes.
- Extended timezone handling in worker and strike filter to use user timezone deltas instead of Portland allowlists; added configurable per-hour and hard penalties.

## Completed
- Modal manager is wired globally (`EntityModalProvider` in `src/App.tsx`), and queue/listing/company/source pages open entity modals via `useEntityModal`.
- Match breakdown UI shows base/final scores, adjustments by category (color-coded), concerns, reasons/strengths, and skills; raw JSON toggle remains for debugging.
- Timezone penalties are exposed in match/prefilter policy forms and applied in worker scoring using user timezone deltas.

## Notes / Examples
- **Timezone penalties**: In `match-policy.location`, set `perHourPenalty` (e.g., `-2`) and `hardRejectHours` (e.g., `9`) to control diff-based scoring. In `prefilter-policy.workArrangement`, set `allowRemote`, `allowHybrid`, `allowOnsite`, and `willRelocate` for prefilter behavior.
- **Tech ranks & strikes**: `prefilter-policy` strike weights map directly to `StrikeFilterEngine`; `match-policy.skillMatch` controls scoring weights.

## Future tweaks (optional)
- Consider widening long-form analysis layouts further if user feedback shows crowding.
