> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-11-29

# Web Search Prefetch for Company Discovery

Purpose: give the worker a deterministic, quota-aware way to pre-populate company records with public facts (website, description, HQ, socials, size band) using a browserless search API, reducing reliance on live agent search and keeping us within free tiers.

## Goals
- Preload structured snippets for each new company so agents extract instead of searching live.
- Keep daily search requests below chosen provider free-tier limits (Tavily/Brave).
- Make usage observable (per-day counters, failures, latency).

## Non-Goals
- Full scraping/crawling of target sites.
- UI changes.

## Provider Choice (initial)
- Primary: Tavily (LLM-friendly JSON, 1k/mo free).
- Fallback: Brave (independent index, 2k/mo free). Abstract behind interface to swap/disable.

## High-Level Design
1) **Trigger**: when a `company` queue item is created and fields `website` or `about` are empty.
2) **Search Call**: call `SearchClient.search(query=company name + "official site", max_results=5)`; capture snippets + URLs.
3) **Storage**: persist response JSON to `company.source_discovery` (new column) or `metadata` on queue item; mark `search_provider`, `request_id`, `result_count`.
4) **Extraction Step**: run deterministic parser to fill fields (website, headquarters_location, company_size_category, description, socials) with confidence flags; only overwrite empty fields.
5) **Quota Guard**: per-day counter in Redis/SQLite; if over threshold, skip search and tag queue item `search_skipped:quota`.
6) **Telemetry**: log structured event `company_search` with latency, result_count, success/error, provider.

## Storage Strategy (DB vs in-memory)
- **Default (MVP): in-memory only.** Keep search responses in task scope and apply extracted fields immediately; nothing is persisted once the company item finishes. This avoids DB churn and aligns with “only save if future value.”
- **Optional future value: new `company_searches` table.** If we later need auditability, replay, or offline evaluation, create a dedicated table with: `id`, `company_id`, `provider`, `query`, `response_json`, `result_count`, `latency_ms`, `created_at`. This keeps search data separate from `companies` and can be pruned by TTL.
- **Avoid storing raw payloads on `companies`.** Limit `companies` writes to derived fields plus confidence scores (if we add them). If we stay in-memory, confidence stays transient as well.

## Implementation Steps (MVP)
1) Add `SearchClient` interface + providers (`tavily`, `brave`) in worker code; config via env `SEARCH_PROVIDER`, `SEARCH_API_KEY`, `SEARCH_DAILY_CAP`.
2) Add queue middleware for `company` items to check cap, call search, persist payload, and log `company_search`.
3) Implement parser that prefers official domains (.com/.io) and geocodes HQ from snippet text when present; emit confidence scores.
4) Update company-upsert to apply extracted fields only when target columns are null/empty.
5) Add counter + cap: increment per successful API call; skip when `today_count >= cap`.
6) Tests: unit (SearchClient), parser cases, cap behavior; integration that runs a fake provider and verifies company fields populate.

## Rollout & Ops
- Default `SEARCH_PROVIDER` unset (feature off). Enable in staging, then prod with `SEARCH_DAILY_CAP=100`.
- Add dashboard/log-based alert: if `company_search.error_rate > 10%` or latency p95 > 5s.
- Document runbook entry for rotating API keys and changing caps.

## Risks / Mitigations
- **Quota blow-up**: enforce per-day cap + one-call-per-company guard.
- **Bad data overwrite**: only fill empty fields; store confidence for auditing.
- **Provider outage**: graceful skip with `search_skipped:provider_down`.

## Open Questions
- Do we also prefetch for existing companies older than 7 days? (suggest batch backfill behind cap).
- Should we geocode HQ via a maps API for higher accuracy? (out of scope MVP).
