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

Uses the same pattern proven in `../imagingeer`: `sqlite-vec` virtual tables with 768D embeddings from `nomic-embed-text` via Ollama. The job description text is embedded and compared against previously cached generations.

`nomic-embed-text` is chosen over `all-MiniLM-L6-v2` (384D, 512-token context) for three reasons: 8192-token context handles full job descriptions without truncation (JDs regularly exceed 512 tokens), higher MTEB retrieval scores (53.0 vs 41.0), and Matryoshka embedding support allows dimensionality reduction to 384D or 256D if storage becomes a concern. It runs on the existing Ollama instance alongside the extraction model at ~0.3 GB VRAM.

- **Full hit (similarity >= 0.88):** Return cached `ResumeContent`/`CoverLetterContent` directly. No AI call needed.
- **Partial hit (similarity >= 0.75):** Use cached content as a starting point. Run a lightweight "adapt" prompt that only adjusts company-specific details (summary, ATS keywords, bullet emphasis). ~3x cheaper than full generation.
- **Miss (similarity < 0.75):** Fall through to Tier 3 for full AI generation.

Thresholds are configurable — see Metrics section for tuning approach.

### Tier 3: LiteLLM with Prompt Prefix Caching

The current `InferenceClient.execute()` sends the entire prompt as a single `user` message, which defeats Claude's automatic prompt caching. By splitting the prompt into a `system` message (stable prefix) and `user` message (variable job-specific content), Claude will automatically cache the system prompt prefix across calls (minimum 2048 tokens for Sonnet, 1024 for Haiku). The stable prefix (~4-8K tokens for a full user profile) comfortably exceeds the 2048-token threshold.

This requires two changes:

1. **Prompt restructuring** — Split `buildResumePrompt()` / `buildCoverLetterPrompt()` into stable prefix + variable suffix (see Prompt Restructuring section).
2. **InferenceClient system message support** — Add a `systemPrompt` parameter to `InferenceClient.execute()` so the stable prefix goes in a `system` message and the variable content goes in the `user` message.

The current `execute()` signature has no system message support — it hardcodes `[{ role: 'user', content: prompt }]`. The `streamChat()` method already accepts a `systemPrompt` parameter, so `execute()` needs the same treatment. The worker `InferenceClient` needs a similar change for any worker-side generation.

```typescript
// Backend InferenceClient — PROPOSED change to execute() signature
// Current: options only has { max_tokens?, temperature? }
// New: add systemPrompt to options
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

-- 768D text embeddings (nomic-embed-text via Ollama) via sqlite-vec
CREATE VIRTUAL TABLE job_cache_embeddings USING vec0(
    embedding FLOAT[768]
);

-- Cached document content with metadata
-- Each row is one document type (resume OR cover letter) for one job+profile combo.
CREATE TABLE document_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    embedding_rowid INTEGER NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('resume', 'cover_letter')),
    job_fingerprint_hash TEXT NOT NULL,
    content_items_hash TEXT NOT NULL,
    role_normalized TEXT NOT NULL,
    tech_stack_json TEXT,
    document_content_json TEXT NOT NULL,
    job_description_text TEXT,
    company_name TEXT,
    hit_count INTEGER DEFAULT 0,
    last_hit_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    model_version TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tier 1 exact match: lookup by fingerprint + content hash + document type
CREATE INDEX idx_document_cache_fingerprint ON document_cache(job_fingerprint_hash, content_items_hash, document_type);
CREATE INDEX idx_document_cache_embedding ON document_cache(embedding_rowid);
-- Eviction query: ORDER BY last_hit_at ASC, hit_count ASC LIMIT n
CREATE INDEX idx_document_cache_eviction ON document_cache(last_hit_at, hit_count);
```

**Tier 1 lookup query:**

```sql
SELECT document_content_json FROM document_cache
WHERE job_fingerprint_hash = ?
  AND content_items_hash = ?
  AND document_type = ?
LIMIT 1;
```

Both `job_fingerprint_hash` and `content_items_hash` must match — the fingerprint identifies the job, the content hash validates the result is still current for the user's profile.

Resume and cover letter are stored as separate rows (`document_type` discriminator) so each can be cached, invalidated, and hit independently.

Cache is bounded to 500 entries max. Eviction is LRU based on `last_hit_at` (oldest first) then `hit_count` (ascending) as tiebreaker. Using `last_hit_at` instead of `hit_count` alone ensures recently-accessed entries are preserved even if they have fewer total hits. Each row is estimated at ~10-50KB (serialized document JSON + JD text); embeddings are stored separately in the `vec0` virtual table (~3KB per 768D vector).

## Content Items Hash Specification

The `content_items_hash` is a SHA-256 digest of the normalized content that feeds into prompts. It determines whether cached generations are still valid for the current user profile.

**Fields included:**
- Personal info: `name`, `email`, `location`, `phone`, `website`, `linkedin`, `github`
- All content items: `id`, `aiContext`, `title`, `role`, `description`, `skills`, `startDate`, `endDate`, `location`, `website`, `parentId`
- Prompt template strings for `resumeGeneration` and `coverLetterGeneration` only (from `PromptsRepository` via `ConfigRepository` key `"ai-prompts"`). Do NOT hash the entire prompts config — changes to unrelated templates (e.g., extraction prompts) should not invalidate the document cache.

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
| `resumeGeneration` or `coverLetterGeneration` prompt templates modified in DB | Invalidate all cache entries for that document type (rare event) |
| TTL expiry (30 days) | Prune old entries on a schedule |
| Max entries exceeded (500) | Evict by `last_hit_at` ascending (least recently used), then `hit_count` ascending as tiebreaker |
| Model version change | Entries tagged with `model_version`; old entries deprioritized but not deleted |

## Dependencies

### New backend (TypeScript) dependencies

```
sqlite-vec           # SQLite vector search extension (native addon or WASM)
```

### Embedding via Ollama (nomic-embed-text)

Embeddings are generated by calling `nomic-embed-text` through LiteLLM → Ollama — the same infrastructure used for extraction. Zero new backend dependencies for embedding generation.

| Model | Dims | VRAM | Context | MTEB Retrieval | Notes |
|-------|------|------|---------|----------------|-------|
| **nomic-embed-text** (chosen) | 768 | ~0.3 GB | 8192 | 53.0 | Handles full JDs; Matryoshka support; runs on Ollama |
| all-MiniLM-L6-v2 | 384 | ~0.1 GB | 512 | 41.0 | Too short context for JDs; lower quality |
| mxbai-embed-large | 1024 | ~0.6 GB | 512 | 64.7 | Better quality but short context |
| snowflake-arctic-embed-m | 768 | ~0.2 GB | 512 | ~54.0 | Comparable to nomic, shorter context |

LiteLLM config addition:

```yaml
- model_name: local-embed
  litellm_params:
    model: ollama/nomic-embed-text
    api_base: http://ollama:11434
    api_key: none
```

Backend calls `InferenceClient` or LiteLLM's `/embeddings` endpoint with `model: "local-embed"`. The 768D vector is stored directly in the `vec0` virtual table.

**Future option:** If embedding latency becomes a bottleneck, the backend can load `nomic-embed-text` directly via `@xenova/transformers` (WASM, ~80MB) or `onnxruntime` to skip the network hop to Ollama.

### sqlite-vec extension loading

Same pattern as imagingeer — load on every SQLite connection. For the TypeScript backend, use the `sqlite-vec` npm package with `better-sqlite3` (already a production dependency at `^11.7.0`):

```typescript
import * as sqliteVec from 'sqlite-vec'

function loadVecExtension(db: BetterSqlite3.Database): void {
  sqliteVec.load(db)
}
```

### Existing (no changes needed)

```
LiteLLM proxy         # Already handles Claude routing, fallbacks, retries
better-sqlite3        # Already a production dependency (^11.7.0)
openai (Python SDK)   # Worker inference client (unchanged)
```

## Implementation Phases

### Phase 0: Ollama GPU Passthrough + Model Setup

**Scope:** Enable GPU inference for Ollama and pull the embedding model. This is a prerequisite for Phase 1 — without GPU passthrough, Ollama runs CPU-only and embedding latency would be unacceptable.

**Where:** `infra/docker-compose.prod.yml`, `infra/litellm-config.yaml`

- Add NVIDIA GPU reservation to the Ollama service in `docker-compose.prod.yml`:
  ```yaml
  ollama:
    # ... existing config ...
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      OLLAMA_MAX_LOADED_MODELS: "2"  # extraction + embedding concurrently
  ```
- Add `local-embed` model to `litellm-config.yaml`:
  ```yaml
  - model_name: local-embed
    litellm_params:
      model: ollama/nomic-embed-text
      api_base: http://ollama:11434
      api_key: none
  ```
- Pull `nomic-embed-text` on the server: `docker exec job-finder-ollama ollama pull nomic-embed-text`
- Verify GPU is being used: `docker exec job-finder-ollama ollama ps` should show VRAM allocation
- Optionally upgrade extraction model from `llama3.1:8b` to `qwen3:8b` for better JSON extraction accuracy (~88 tok/s on RTX 3080, superior structured output). VRAM budget: ~5.0 GB (qwen3:8b Q4_K_M) + ~0.3 GB (nomic-embed-text) = ~5.3 GB of 10 GB

### Phase 1: Semantic Cache Layer

**Scope:** Add Tier 1 + Tier 2 caching to the backend document generation pipeline.

**Where:** `job-finder-BE` — this is where `GeneratorWorkflowService`, `InferenceClient`, and `prompts.ts` live.

- Add `sqlite-vec` to backend dependencies
- Create backend migration (`051_semantic_document_cache.sql`) for `job_cache_embeddings` + `document_cache` tables
- Implement `SemanticDocumentCache` service (embed via LiteLLM `local-embed`, store, lookup, invalidate)
- Implement `computeContentHash()` utility with the spec above
- Wire cache lookup into `GeneratorWorkflowService.buildResumeContent()` before the `agentManager.execute()` call
- Wire cache write after successful generation + validation + grounding
- Add `skipCache` boolean to `GenerateDocumentPayload` — when true, bypass Tier 1+2 lookup (user wants a fresh generation). Still write result to cache afterward.
- Add configurable similarity thresholds (default 0.88 full / 0.75 partial)
- Add dry-run logging mode: log similarity scores + cached vs. fresh output for threshold tuning

### Phase 2: Prompt Restructuring + Prefix Caching via LiteLLM

**Scope:** Split prompts into system/user messages so Claude's automatic prompt caching kicks in. All calls still route through LiteLLM.

- Add `systemPrompt` option to backend `InferenceClient.execute()` (matching the existing `streamChat()` pattern)
- Refactor `prompts.ts`: extract `buildResumeStablePrefix()` + `buildResumeJobPrompt()` (and cover letter equivalents)
- Update `GeneratorWorkflowService.buildResumeContent()` and `buildCoverLetterContent()` to pass system prompt separately
- Verify via LiteLLM logs that `cache_creation_input_tokens` / `cache_read_input_tokens` appear in responses
- Also update `buildRefitPrompt()` and `buildExpandPrompt()` to use system/user split where applicable

### Phase 3: Adaptation Pass for Partial Hits

**Scope:** When Tier 2 returns a partial match (similarity 0.75-0.88), run a lightweight adaptation prompt instead of full generation.

- Implement `buildAdaptPrompt()` in `prompts.ts` that takes cached content + new JD delta
- Add adaptation step to `GeneratorWorkflowService` workflow (cheaper than full generation)
- Run adapted output through the same validation/grounding pipeline as full generations (FitEstimate, JSON schema validation) — adaptation can still produce invalid or hallucinated content
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
| Semantic cache returns content that's subtly wrong for the job | Conservative threshold (0.88); user review step still exists; partial hits get adaptation pass with validation; dry-run logging for tuning |
| Ollama GPU passthrough not configured | Phase 0 prerequisite; without GPU, embedding latency is unacceptable. Docker compose change is straightforward (add `deploy.resources.reservations.devices`) |
| VRAM exhaustion (10 GB RTX 3080) | nomic-embed-text (~0.3 GB) + extraction model (~5 GB) = ~5.3 GB total; well within budget. Ollama's scheduler handles model loading/eviction automatically |
| `content_items_hash` invalidation too aggressive | Hash only resume/cover letter prompt templates (not all prompts); hash only fields that affect prompt output; version the hash algorithm |
| sqlite-vec availability in Node.js | npm `sqlite-vec` package exists and works with `better-sqlite3` (already a prod dependency); fallback: WASM build |
| Cache grows unbounded | 500-entry cap with LRU eviction (`last_hit_at`); 30-day TTL pruning |
| Embedding dimension mismatch | Schema hardcodes `FLOAT[768]` for nomic-embed-text. If the embedding model changes, a migration is needed to recreate the `vec0` table. Matryoshka support in nomic allows 384D/256D output if needed |

## References

- [Prompt Caching — Claude API Docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [LiteLLM Prompt Caching Passthrough](https://docs.litellm.ai/docs/completion/prompt_caching)
- [sqlite-vec documentation](https://alexgarcia.xyz/sqlite-vec/)
- [nomic-embed-text — Ollama](https://ollama.com/library/nomic-embed-text) — 768D, 8192 context, Matryoshka support
- [Ollama GPU Hardware Support](https://docs.ollama.com/gpu)
- [Qwen3 8B — structured output and reasoning model](https://qwenlm.github.io/blog/qwen3/) — recommended extraction model upgrade
- `../imagingeer` — SQLite vector search implementation (migrations 068, 074; `lora_semantic_search.py`)
- `job-finder-BE/server/src/modules/generator/workflow/prompts.ts` — current prompt builders
- `job-finder-BE/server/src/modules/generator/ai/inference-client.ts` — current LiteLLM client (`execute()` lacks system message support; `streamChat()` has it)
- `infra/litellm-config.yaml` — model routing config
- `infra/docker-compose.prod.yml` — Ollama service (currently CPU-only, needs GPU passthrough)
