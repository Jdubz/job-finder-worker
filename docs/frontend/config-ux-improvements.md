# Configuration UX & Timezone Refactor Plan
> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-12-01

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

## In Progress / Next
1) Ensure every frontend reference to entities uses the modal manager; add deep-linking between modals as needed.
2) Further tune match-breakdown UI to highlight how each config dimension contributed (weights, strikes, timezone penalties).
3) Add docs/examples for configuring timezone penalties in both prefilter and match policies.
4) Validate end-to-end after next merge: run worker unit tests + frontend build to catch regressions.
