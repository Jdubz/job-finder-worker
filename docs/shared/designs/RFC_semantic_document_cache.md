> Status: Draft
> Owner: @jdubz
> Last Updated: 2026-02-26

# RFC: Semantic Caching for Document Generation

Reduce AI generation cost and latency for resumes and cover letters by caching at multiple tiers: exact match, semantic similarity (sqlite-vec), and LLM prompt prefix caching via LiteLLM.

## Problem

Every document generation is a cold start. `GeneratorWorkflowService` (backend, TypeScript) rebuilds the full prompt (~4-8K tokens) from scratch, sends it as a single `user` message through `InferenceClient` → LiteLLM → Claude, and receives zero context reuse across calls. ~60-70% of the prompt is identical across all generations (personal info, work experience, skills, projects, templates, JSON schema, output rules). When a user generates resumes for similar roles (e.g., "Senior Full-Stack Engineer" at different companies), the AI produces nearly identical output each time.

Current cost per generation: 1 full AI call (resume) + 0-1 refit/expand calls + 1 optional cover letter call = 2-3 AI calls per application. All calls route through `InferenceClient` → LiteLLM (`claude-document` model) → `anthropic/claude-sonnet-4-20250514`.

## Solution

Three-tier caching architecture that progressively reduces AI calls:

```
Request arrives
     |
     v
+---------------------------+
| TIER 1: Exact Match       |  Hash(role + sorted_tech_stack + content_items_hash)
| (SQLite index lookup)     |  -> instant hit, 0 AI cost
+----------+----------------+
           | miss
           v
+---------------------------+
| TIER 2: Semantic Match    |  sqlite-vec similarity search on JD embedding
| (vector search, ~50ms)    |  >= 0.88 -> full cache hit (skip AI)
|                           |  >= 0.75 -> partial hit (lightweight adapt pass)
+----------+----------------+
           | miss or partial
           v
+---------------------------+
| TIER 3: AI Generation     |  LiteLLM with system/user message split
| (with prompt caching)     |  Stable prefix as system msg -> auto prefix cache
|                           |  Result stored back into Tier 1+2 cache
+---------------------------+
```

### Tier 1: Exact Fingerprint Match

A deterministic hash of normalized role title, sorted tech stack, and content items hash. Catches re-runs and near-duplicate postings (same company re-listing the same role). Free lookup via SQLite index.

### Tier 2: Semantic Similarity via sqlite-vec

Uses the same pattern proven in `../imagingeer`: `sqlite-vec` virtual tables with 384D embeddings from `all-MiniLM-L6-v2` (sentence-transformers). The job description text is embedded and compared against previously cached generations.

- **Full hit (similarity >= 0.88):** Return cached `ResumeContent`/`CoverLetterContent` directly. No AI call needed.
- **Partial hit (similarity >= 0.75):** Use cached content as a starting point. Run a lightweight "adapt" prompt that only adjusts company-specific details (summary, ATS keywords, bullet emphasis). ~3x cheaper than full generation.
- **Miss (similarity < 0.75):** Fall through to Tier 3 for full AI generation.

Thresholds are configurable — see Metrics section for tuning approach.

### Tier 3: LiteLLM with Prompt Prefix Caching

The current `InferenceClient.execute()` sends the entire prompt as a single `user` message, which defeats Claude's automatic prompt caching. By splitting the prompt into a `system` message (stable prefix) and `user` message (variable job-specific content), Claude will automatically cache the system prompt prefix across calls (for prompts >1024 tokens on supported models).

This requires two changes:

1. **Prompt restructuring** — Split `buildResumePrompt()` / `buildCoverLetterPrompt()` into stable prefix + variable suffix (see Prompt Restructuring section).
2. **InferenceClient system message support** — Add a `systemPrompt` parameter to `InferenceClient.execute()` so the stable prefix goes in a `system` message and the variable content goes in the `user` message.

The backend `InferenceClient` already supports system messages in `streamChat()` — `execute()` needs the same treatment. The worker `InferenceClient` needs a similar change for any worker-side generation.

```typescript
// Backend InferenceClient — updated execute() signature
async execute(
  taskType: string,
  prompt: string,
  modelOverride?: string,
  options: { max_tokens?: number; temperature?: number; systemPrompt?: string } = {}
): Promise<AgentExecutionResult> {
  const model = modelOverride || getModelForTask(taskType)
  const messages = [
    ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
    { role: 'user', content: prompt },
  ]
  // ... rest of fetch to LiteLLM
}
```

LiteLLM passes system messages through to Claude, which applies automatic prompt caching. No SDK changes needed — this is built into the Claude API for prompts exceeding the minimum token threshold.

## Schema

```sql
-- Migration: create semantic document cache tables

-- 384D text embeddings (all-MiniLM-L6-v2) via sqlite-vec
CREATE VIRTUAL TABLE job_cache_embeddings USING vec0(
    embedding FLOAT[384]
);

-- Cached document content with metadata
CREATE TABLE document_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    embedding_rowid INTEGER NOT NULL,
    job_fingerprint_hash TEXT NOT NULL,
    role_normalized TEXT NOT NULL,
    tech_stack_json TEXT,
    resume_content_json TEXT,
    cover_letter_content_json TEXT,
    job_description_text TEXT,
    company_name TEXT,
    hit_count INTEGER DEFAULT 0,
    model_version TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    content_items_hash TEXT NOT NULL
);

CREATE INDEX idx_document_cache_fingerprint ON document_cache(job_fingerprint_hash);
CREATE INDEX idx_document_cache_embedding ON document_cache(embedding_rowid);
CREATE INDEX idx_document_cache_content_hash ON document_cache(content_items_hash);
```

Cache is bounded to 500 entries max. Eviction is LRU based on `hit_count` (ascending) then `created_at` (oldest first). Each row is estimated at ~10-50KB (embeddings + serialized document JSON + JD text).

## Content Items Hash Specification

The `content_items_hash` is a SHA-256 digest of the normalized content that feeds into prompts. It determines whether cached generations are still valid for the current user profile.

**Fields included:**
- Personal info: `name`, `email`, `location`, `phone`, `website`, `linkedin`, `github`
- All content items: `id`, `aiContext`, `title`, `role`, `description`, `skills`, `startDate`, `endDate`, `location`, `website`, `parentId`
- Prompt template versions (from `PromptsRepository`)

**Normalization rules:**
1. Sort content items by `id` (stable ordering)
2. For each item, serialize included fields as a JSON object with keys in sorted order
3. Trim whitespace, lowercase strings where order-insensitive (skills)
4. Concatenate: `JSON.stringify([personalInfoNormalized, ...sortedItemsNormalized, promptTemplateVersion])`
5. Hash with SHA-256, hex-encode

**Implementation:** Add `computeContentHash()` to a shared utility, called by the cache service before lookup and after content item mutations.

## Prompt Restructuring

The current `buildResumePrompt()` and `buildCoverLetterPrompt()` in `prompts.ts` concatenate template + data block + guidance + JSON schema into a single string. To maximize prompt cache hits, this is split into two parts:

```
STABLE PREFIX (system message, cached by Claude across calls):
+--------------------------------------------------+
| Template instructions (from DB prompts config)   |
| JSON schema + output format rules                |
| Content budget guidance                          |
| Personal info (name, location, links)            |
| Work experience (all entries, formatted)         |
| Education (formatted)                            |
| Projects (formatted with [DOMAIN] tags)          |
| Skills categories                                |
| Background/narrative                             |
+--------------------------------------------------+

VARIABLE SUFFIX (user message, changes each generation):
+--------------------------------------------------+
| Target role + company name                       |
| Job description text                             |
| Job location, company website                    |
| Matched skills, key strengths, ATS keywords      |
| Project guidance (from resumeIntakeData)         |
| Additional instructions / preferences            |
+--------------------------------------------------+
```

New functions in `prompts.ts`:

- `buildResumeStablePrefix(personalInfo, contentItems)` → system message (cacheable)
- `buildResumeJobPrompt(payload, jobMatch)` → user message (variable)
- `buildCoverLetterStablePrefix(personalInfo, contentItems)` → system message (cacheable)
- `buildCoverLetterJobPrompt(payload, jobMatch)` → user message (variable)

The existing `buildResumePrompt()` / `buildCoverLetterPrompt()` are refactored to call these internally for backward compatibility.

## Cache Invalidation

| Trigger | Action |
|---------|--------|
| Content items modified (work, education, projects, skills) | Recompute `content_items_hash`; cache entries with old hash become stale |
| Personal info modified | Same as above (hash includes personal info) |
| Prompt templates modified in DB | Invalidate all cache entries (rare event) |
| TTL expiry (30 days) | Prune old entries on a schedule |
| Max entries exceeded (500) | Evict lowest `hit_count`, oldest `created_at` first |
| Model version change | Entries tagged with `model_version`; old entries deprioritized but not deleted |

## Dependencies

### New backend (TypeScript) dependencies

```
sqlite-vec           # SQLite vector search extension (native addon or WASM)
```

Embedding generation uses a lightweight approach — see Options below.

### Embedding strategy options

| Option | Size | Speed | Notes |
|--------|------|-------|-------|
| `onnxruntime` + `all-MiniLM-L6-v2` ONNX | ~80MB | ~50ms/embed | No PyTorch dependency; proven in imagingeer |
| LiteLLM embedding endpoint | 0 (remote) | ~200ms/embed | Route through existing proxy; no local model |
| `@xenova/transformers` (WASM) | ~80MB | ~100ms/embed | Pure JS, runs in Node; no native deps |

Recommendation: Start with LiteLLM embedding endpoint (zero new deps, uses existing infra). If latency matters, migrate to ONNX or WASM later.

### sqlite-vec extension loading

Same pattern as imagingeer — load on every SQLite connection. For the TypeScript backend, use the `sqlite-vec` npm package with `better-sqlite3`:

```typescript
import * as sqliteVec from 'sqlite-vec'

function loadVecExtension(db: BetterSqlite3.Database): void {
  sqliteVec.load(db)
}
```

### Existing (no changes)

```
LiteLLM proxy         # Already handles Claude routing, fallbacks, retries
openai (Python SDK)   # Worker inference client (unchanged)
```

## Implementation Phases

### Phase 1: Semantic Cache Layer

**Scope:** Add Tier 1 + Tier 2 caching to the backend document generation pipeline.

**Where:** `job-finder-BE` — this is where `GeneratorWorkflowService`, `InferenceClient`, and `prompts.ts` live.

- Add `sqlite-vec` to backend dependencies
- Create backend migration for `job_cache_embeddings` + `document_cache` tables
- Implement `SemanticDocumentCache` service (embed, store, lookup, invalidate)
- Implement `computeContentHash()` utility with the spec above
- Wire cache lookup into `GeneratorWorkflowService.buildResumeContent()` before the `agentManager.execute()` call
- Wire cache write after successful generation + validation + grounding
- Add configurable similarity thresholds (default 0.88 full / 0.75 partial)
- Add dry-run logging mode: log similarity scores + cached vs. fresh output for threshold tuning

### Phase 2: Prompt Restructuring + Prefix Caching via LiteLLM

**Scope:** Split prompts into system/user messages so Claude's automatic prompt caching kicks in. All calls still route through LiteLLM.

- Add `systemPrompt` option to backend `InferenceClient.execute()`
- Refactor `prompts.ts`: extract `buildResumeStablePrefix()` + `buildResumeJobPrompt()` (and cover letter equivalents)
- Update `GeneratorWorkflowService.buildResumeContent()` and `buildCoverLetterContent()` to pass system prompt separately
- Verify via LiteLLM logs that `cache_creation_input_tokens` / `cache_read_input_tokens` appear in responses
- Also update `buildRefitPrompt()` and `buildExpandPrompt()` to use system/user split where applicable

### Phase 3: Adaptation Pass for Partial Hits

**Scope:** When Tier 2 returns a partial match (similarity 0.75-0.88), run a lightweight adaptation prompt instead of full generation.

- Implement `buildAdaptPrompt()` in `prompts.ts` that takes cached content + new JD delta
- Add adaptation step to `GeneratorWorkflowService` workflow (cheaper than full generation)
- Track cache hit/miss/adapt metrics for tuning thresholds

## Metrics

Track to validate effectiveness:

- Cache hit rate by tier (exact, semantic full, semantic partial, miss)
- Average generation latency with/without cache
- AI calls saved per day/week
- Cache size growth rate
- Similarity threshold accuracy (are 0.88+ hits actually good enough?)
- Prompt cache token stats (`cache_creation_input_tokens` vs `cache_read_input_tokens` from Claude responses via LiteLLM)

**Threshold tuning:** Phase 1 includes a dry-run mode that logs what the cache _would_ return alongside fresh AI output. Review these logs after ~20-30 generations to validate/adjust the 0.88 and 0.75 thresholds before trusting cache hits.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Anthropic API rate limits / costs | Tier 1+2 caching reduces AI calls significantly; LiteLLM tracks usage via budget settings |
| Semantic cache returns content that's subtly wrong for the job | Conservative threshold (0.88); user review step still exists; partial hits get adaptation pass; dry-run logging for tuning |
| Embedding model size (~80MB for local ONNX) | Start with LiteLLM embedding endpoint (zero local model); migrate to local only if latency is a problem |
| `content_items_hash` invalidation too aggressive | Hash only fields that affect prompt output; version the hash algorithm |
| sqlite-vec availability in Node.js | npm `sqlite-vec` package exists and works with `better-sqlite3`; fallback: WASM build |
| Cache grows unbounded | 500-entry cap with LRU eviction; 30-day TTL pruning |

## References

- [Prompt Caching — Claude API Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [LiteLLM Prompt Caching Passthrough](https://docs.litellm.ai/docs/completion/prompt_caching)
- [sqlite-vec documentation](https://alexgarcia.xyz/sqlite-vec/)
- `../imagingeer` — SQLite vector search implementation (migrations 068, 074; `lora_semantic_search.py`)
- `job-finder-BE/server/src/modules/generator/workflow/prompts.ts` — current prompt builders
- `job-finder-BE/server/src/modules/generator/ai/inference-client.ts` — current LiteLLM client
- `infra/litellm-config.yaml` — model routing config
