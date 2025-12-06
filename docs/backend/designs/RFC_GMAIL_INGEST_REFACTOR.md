> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-12-06

# RFC: Gmail Ingest Refactor (Job-First, Allowlist-Free)

## Goal
Make Gmail ingest capture all job-related opportunities (not just known domains), surface multiple listings per email, and hand off rich payloads to existing scraping logic with minimal knobs for admins.

## Scope
- Backend API ingest path only (no worker scaling changes required).
- Frontend Config tab inputs and ingest status endpoints.
- Reuse worker/job parsing where possible; low-volume assumption (few emails/day).

## Current Issues
- Domain allowlist drops unknown/new sources and multi-link digests.
- Users must know Gmail query syntax.
- Parsed jobs lose key fields (salary/location) despite being present in email.

## Proposed Changes

### Config (human-friendly)
- `maxAgeDays` (number slider/input) → builds `newer_than:<N>d` query.
- `maxMessages` (number) → Gmail page size per run.
- Optional `label` (dropdown of user labels, or free text).
- Remove `allowedDomains/allowedSenders/label/query` from UI/schema.

### Message Selection
- Fetch full messages within maxAge and optional label.
- Heuristics to mark “job-related”: subject/body keywords (job/role/opening/hiring/opportunity/application/offer/rejection/interview), ATS domains (ashbyhq/lever/greenhouse/workday), recruiter phrases, and presence of multiple outbound links.

### Link Harvest (allowlist-free)
- Extract all HTTP(S) links from text + HTML anchors.
- Drop only obvious non-job links by anchor text or href keywords (`unsubscribe`, `privacy`, `settings`, image/gif extensions).
- Resolve 1–2 redirects with small per-run budget (timeout & host concurrency guard) to capture final URL + title/status.

### Extraction Pipeline
- Build a “prepared payload” per message:
  - headers (subject/from/date/messageId/threadId), snippet
  - plain text and cleaned HTML→text
  - resolved links list (original + final URL, title, status, reasons dropped)
  - inline heuristics: salary range strings, location strings, job title/company from subject/body
- Pass payload to a new internal parser entrypoint that reuses worker scraping logic:
  - Call shared job parser on each candidate URL (or batch) to extract title/company/location/description.
  - Merge email-derived fields (subject salary/location/title) when page lacks data.
- Enqueue jobs with metadata: gmail ids, from, subject, score, redirect chain, email salary/location, source="email".

### State & Idempotency
- Keep `email_ingest_state`; message processed if any links extracted, regardless of job count, to avoid reprocessing spam.

### Observability
- Per-run stats: messages scanned, job-marked, links harvested, links resolved, jobs enqueued, top drop reasons.
- Optional debug endpoint to list last 50 candidate links with scores.

## Data Flow
Gmail → messages (maxAge/label) → job-related heuristic → link harvest + redirect resolve → prepared payload → parser (shared/worker logic) → job_queue entries → state recorded.

## Risks / Mitigations
- Redirect resolving could be slow → strict timeout/budget, small volume.
- False positives from marketing emails → scoring threshold and unsubscribe-anchor filter.
- Page fetch failures → fall back to email-derived title/company/description.

## Action Items
1) Update config schema/UI to use `maxAgeDays`, `maxMessages`, optional `label`; remove allowlist fields.
2) Replace allowlist filter with anchor-keyword filtering and redirect-aware link harvest.
3) Add job-related heuristic scorer (subject/body + ATS domains + link count).
4) Implement “prepared payload” parser entrypoint that calls shared worker job parsing; merge email-derived fields.
5) Expose ingest run metrics and candidate debug endpoint.
6) Re-run ingest against prod mailbox in dev, verify multiple-listing emails (Indeed, JobLeads, Ashby) enqueue structured jobs with URLs and salary/location when present.
