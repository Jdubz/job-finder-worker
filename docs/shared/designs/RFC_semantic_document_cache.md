> Status: Draft
> Owner: @jdubz
> Last Updated: 2026-02-26

# RFC: Semantic Caching for Document Generation

Reduce AI generation cost and latency for resumes and cover letters by caching at multiple tiers: exact match, semantic similarity (sqlite-vec), and LLM KV prefix reuse (claude-agent-sdk).

## Problem

Every document generation is a cold start. The system rebuilds the full prompt (~4-8K tokens) from scratch and sends it to Claude CLI via `subprocess.run` with zero context reuse. ~60-70% of the prompt is identical across all generations (personal info, work experience, skills, projects, templates). When a user generates resumes for similar roles (e.g., "Senior Full-Stack Engineer" at different companies), the AI produces nearly identical output each time.

Current cost per generation: 1 full AI call (resume) + 0-1 refit/expand calls + 1 optional cover letter call = 2-3 AI calls per application.

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
| TIER 3: AI Generation     |  claude-agent-sdk with persistent session
| (with KV prefix caching)  |  ~92% prefix reuse -> faster TTFT
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

### Tier 3: claude-agent-sdk with Session Persistence

Replace `subprocess.run(["claude", "--print", prompt])` with `claude-agent-sdk`'s `ClaudeSDKClient`. This wraps the Claude Code CLI and inherits the Max subscription auth via `CLAUDE_CODE_OAUTH_TOKEN` — no API key billing.

The SDK provides:
- **Session persistence:** Load stable context (personal info, experience, skills, projects, templates) once. Send only job-specific data per generation.
- **Automatic KV prefix caching:** Claude Code applies `cache_control: ephemeral` to system prompt blocks server-side, achieving ~92% prefix reuse across requests in the same session.
- **Session forking:** `fork_session=True` branches from a base session without losing cached context.

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions

async with ClaudeSDKClient(options=ClaudeAgentOptions(
    system_prompt=stable_prefix,  # personal info, experience, skills, templates, JSON schema
    model="sonnet",
    permission_mode="bypassPermissions",
    tools=[],  # JSON generation only, no tools needed
)) as client:
    # Session loaded once — KV cache primed with stable prefix

    # Generation 1: only sends job-specific delta
    await client.query(job_specific_prompt_for_company_A)
    async for msg in client.receive_response(): ...

    # Generation 2: stable prefix already cached server-side
    await client.query(job_specific_prompt_for_company_B)
    async for msg in client.receive_response(): ...
```

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

## Prompt Restructuring

Current prompt structure mixes stable and variable content throughout. To maximize KV cache hits, the prompt must be restructured so all stable content is a contiguous prefix:

```
STABLE PREFIX (loaded into system_prompt, cached across sessions):
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

VARIABLE SUFFIX (sent per query, changes each generation):
+--------------------------------------------------+
| Target role + company name                       |
| Job description text                             |
| Job location, company website                    |
| Matched skills, key strengths, ATS keywords      |
| Project guidance (from resumeIntakeData)         |
| Additional instructions / preferences            |
+--------------------------------------------------+
```

The `buildResumePrompt()` and `buildCoverLetterPrompt()` functions in `prompts.ts` will be split into `buildStablePrefix()` (called once per session) and `buildJobSpecificPrompt()` (called per generation).

## Cache Invalidation

| Trigger | Action |
|---------|--------|
| Content items modified (work, education, projects, skills) | Recompute `content_items_hash`, all cache entries with old hash become stale |
| Personal info modified | Same as above (hash includes personal info) |
| Prompt templates modified in DB | Invalidate all cache entries (rare event) |
| TTL expiry (30 days) | Prune old entries on a schedule |
| Model version change | Entries tagged with `model_version`; old entries deprioritized but not deleted |

## Dependencies

### New Python dependencies (worker)

```
claude-agent-sdk>=0.1.0    # Claude Code SDK with session persistence
sqlite-vec>=0.1.0          # SQLite vector search extension
sentence-transformers>=2.2.0  # Text embedding generation (all-MiniLM-L6-v2, 80MB)
```

### Existing (no changes)

```
google-genai>=1.0.0        # Gemini fallback (unchanged)
```

### sqlite-vec extension loading

Same pattern as imagingeer — load on every SQLite connection:

```python
import sqlite_vec

def _load_vec_extension(dbapi_connection):
    dbapi_connection.enable_load_extension(True)
    sqlite_vec.load(dbapi_connection)
```

## Implementation Phases

### Phase 1: Semantic Cache Layer (sqlite-vec)

**Scope:** Add Tier 1 + Tier 2 caching to the document generation pipeline.

- Add `sqlite-vec` and `sentence-transformers` to worker dependencies
- Create migration for `job_cache_embeddings` + `document_cache` tables
- Implement `SemanticDocumentCache` service (embed, store, lookup, invalidate)
- Wire cache lookup into `GeneratorWorkflowService` before AI generation steps
- Wire cache write after successful generation
- Add `content_items_hash` computation to `ContentItemRepository`

### Phase 2: Agent SDK Integration

**Scope:** Replace `ClaudeCLIProvider` subprocess approach with `claude-agent-sdk` session-based generation.

- Add `claude-agent-sdk` to worker dependencies
- Implement `ClaudeAgentProvider` using `ClaudeSDKClient` with session persistence
- Restructure prompts: split into stable prefix + variable suffix
- Update `AgentManager` to support the new provider alongside existing fallback chain
- Manage session lifecycle (create on first generation, reuse within batch, cleanup)

### Phase 3: Adaptation Pass for Partial Hits

**Scope:** When Tier 2 returns a partial match (similarity 0.75-0.88), run a lightweight adaptation prompt instead of full generation.

- Implement `buildAdaptPrompt()` that takes cached content + new JD delta
- Add adaptation step to workflow (cheaper than full generation)
- Track cache hit/miss/adapt metrics for tuning thresholds

### Phase 4: Backend Integration

**Scope:** Extend caching to the TypeScript backend's generation pipeline.

- Add sqlite-vec loading to backend's SQLite connection setup
- Port cache lookup/write logic to TypeScript (or call worker service)
- Consider shared cache database between worker and backend

## Metrics

Track to validate effectiveness:

- Cache hit rate by tier (exact, semantic full, semantic partial, miss)
- Average generation latency with/without cache
- AI calls saved per day/week
- Cache size growth rate
- Similarity threshold accuracy (are 0.88+ hits actually good enough?)

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Max subscription rate limits shared with Claude web/Code usage | Tier 1+2 caching reduces AI calls significantly; monitor daily usage |
| Semantic cache returns content that's subtly wrong for the job | Conservative threshold (0.88); user review step still exists; partial hits get adaptation pass |
| `sentence-transformers` model size (80MB) | One-time download; singleton loading pattern (imagingeer proven); runs on CPU in ~50ms |
| `content_items_hash` invalidation too aggressive | Hash only fields that affect prompt output; version the hash algorithm |
| Session lifecycle complexity | Start simple: one session per batch of generations; clean up on idle timeout |
| Anthropic TOS on subscription usage | This is a personal/internal tool, not a third-party product; monitor Anthropic policy updates |

## References

- [Claude Agent SDK — Python Reference](https://platform.claude.com/docs/en/agent-sdk/python)
- [Claude Agent SDK — Session Management](https://platform.claude.com/docs/en/agent-sdk/sessions)
- [Prompt Caching — Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Context Engineering & Reuse Patterns in Claude Code](https://blog.lmcache.ai/en/2025/12/23/context-engineering-reuse-pattern-under-the-hood-of-claude-code/)
- [sqlite-vec documentation](https://alexgarcia.xyz/sqlite-vec/)
- `../imagingeer` — SQLite vector search implementation (migrations 068, 074; `lora_semantic_search.py`)
