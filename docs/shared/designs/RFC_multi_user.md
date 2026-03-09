> Status: Draft
> Owner: @jdubz
> Last Updated: 2026-03-08

# RFC: Multi-User System

Transform the single-user job finder into a multi-tenant system supporting ~100 concurrent users. Each user manages their own profile, resume versions, match preferences, and job analysis results. Job discovery (scraping, companies, sources) remains shared.

## Problem

The system works well for one user but can't serve others:

1. **No data isolation** — job_matches, content_items, resume_versions, generator_requests have no `user_id`; all queries return global results
2. **Single-user worker** — `SQLiteProfileLoader` loads one user profile at startup (`SELECT * FROM users LIMIT 1`); `ScoringEngine` and `AIJobMatcher` use one config for all jobs
3. **SQLite can't scale** — single-writer database blocks concurrent API + worker access; no connection pooling, no row-level locking
4. **System-global config** — match-policy, prefilter-policy, personal-info are stored once in `job_finder_config` rather than per user
5. **No registration** — only two seeded admin accounts; no self-service signup or onboarding
6. **Hardcoded personal identity** — `PersonalInfoStore` uses hardcoded ID `'personal-info'` everywhere: PDF rendering, chat widget system prompt, applicator profile endpoint, generator workflow
7. **Shared AI keys with no quotas** — single `ANTHROPIC_API_KEY` and `GEMINI_API_KEY` shared across all usage; no per-user budget tracking or throttling in LiteLLM
8. **Public artifact access** — generated PDFs served without auth via semi-secret URLs (`/api/generator/artifacts/:date/:run/:filename`); no per-user file storage isolation
9. **Job applicator assumes single user** — global state variables for active form fill context, single session token in electron-store, temp file directory shared across users
10. **OAuth is unrestricted** — any Google account can create an account (no invite codes, no domain allowlist); login handler auto-creates users with `viewer` role

## Solution

### Core concept

Row-level multi-tenancy: add `user_id` foreign key to per-user tables, keep shared reference tables global. Migrate from SQLite to PostgreSQL for concurrent access. Fan out job analysis to score each listing against every active user's profile.

### What changes

| Component | Before | After |
|-----------|--------|-------|
| Database | SQLite (single-writer) | PostgreSQL 16 + pgvector + PgBouncer |
| Data isolation | None — all queries global | `user_id` FK on 7 tables + RLS |
| User config | `job_finder_config` (system-wide) | `user_config` table (per-user) |
| Worker profile | Single profile at startup | Per-user profile loaded per queue item |
| Job matching | Score once against one user | Fan out: score each listing per user |
| Registration | Seeded admin accounts only | Self-service via Google OAuth + onboarding wizard |
| Rate limiting | In-memory (single-instance) | Redis-backed (multi-instance safe) |
| API scaling | Single Express instance | 2+ instances behind Nginx |
| Worker scaling | Single worker polling queue | 2+ workers with `FOR UPDATE SKIP LOCKED` |

### What stays the same

- **Google OAuth** — existing auth flow, session cookies, RBAC middleware
- **Shared job discovery** — companies, job_sources, job_listings, seen_urls, scrape_reports stay global
- **LiteLLM proxy** — model routing, fallbacks, retries unchanged
- **Ollama** — local extraction unchanged (queue absorbs per-user throughput)
- **PDF rendering** — Playwright pipeline unchanged
- **Shared types** — `@shared/types` package pattern unchanged
- **Repository pattern** — raw SQL with parameterized queries (just add `user_id` params)

---

## Single-User Assumptions Audit

Exhaustive list of every hardcoded single-user pattern found across the codebase.

### Backend — Hardcoded Singletons

| File | Pattern | Impact |
|------|---------|--------|
| `modules/generator/personal-info.store.ts` | `configRepo.get<PersonalInfo>('personal-info')` — hardcoded ID, single global entry | All users share one name/email/phone/contact |
| `modules/config/config.repository.ts` | `get(id)` returns one global entry per key; no user scoping | match-policy, prefilter-policy, personal-info are global singletons |
| `modules/content-items/content-item.repository.ts` | `list()` returns ALL content_items with no user filter | All users see all portfolio entries |
| `modules/resume-versions/resume-version.repository.ts` | `listVersions()` returns ALL resume versions globally | All users share 5 resume versions |
| `modules/resume-versions/resume-version.publish.ts` | Creates `PersonalInfoStore()`, calls `.get()` for global personal info | All resume PDFs contain same contact info |
| `modules/generator/workflow/generator.workflow.service.ts` | Constructor creates global `PersonalInfoStore()` + `ContentItemRepository()` | Document generation uses wrong person's data |
| `modules/generator/workflow/services/html-pdf.service.ts` | `renderResume()` falls back to content's embedded personalInfo (global) | PDFs contain wrong person's contact info |
| `modules/chat-widget/chat.prompts.ts` | `getChatContext()` calls `PersonalInfoStore().get()` + `contentRepo.list()` globally | Chat widget personality is shared — speaks as one person |
| `routes/applicator.routes.ts` | `configRepo.get('personal-info')` + `contentRepo.list()` with no user filter | Single profile endpoint returns one person's data |
| `middleware/firebase-auth.ts` | Localhost bypass returns hardcoded `{uid: 'localhost-desktop', roles: ['editor']}` | All desktop app actions attributed to fake user |

### Worker — LIMIT 1 User

| File | Pattern | Impact |
|------|---------|--------|
| `profile/sqlite_loader.py:96` | `SELECT * FROM users LIMIT 1` | Always loads first user regardless of queue item |
| `profile/sqlite_loader.py:200` | `WHERE ai_context = 'narrative' AND id = 'overview' LIMIT 1` | Hardcoded content item ID |
| `job_queue/config_loader.py` | Loads single `match-policy`, `prefilter-policy` from `job_finder_config` | One scoring config for all jobs |
| `flask_worker.py` | `initialize_components()` creates single ProcessorContext at startup | Same profile/config for entire worker lifecycle |

### Job Applicator — Single-Session Architecture

| File | Pattern | Impact |
|------|---------|--------|
| `auth-store.ts` | Single `auth` object in electron-store (encrypted) | Only one user can be logged in per app instance |
| `tool-executor.ts:320-395` | Global variables: `currentJobMatchId`, `userProfile`, `jobContext`, `documentPaths` | Only one form fill can be active at a time |
| `main.ts:112` | `TEMP_DOC_DIR = path.join(os.tmpdir(), 'job-applicator-docs')` | Shared temp dir — resume name collisions between users |
| `main.ts:1650` | `MCP_CONFIG_PATH` hardcoded to single file | Single MCP config for all sessions |
| `api-client.ts:35` | `getApiUrl()` returns single global API URL | All requests use same backend (fine, but no user context passed) |
| `form-fill-safety.ts` | `setUserProfile(profileText)` sets global variable | Profile not scoped to form fill session |

### Frontend — No User Awareness

| File | Pattern | Impact |
|------|---------|--------|
| `pages/resume-versions/ResumeVersionsPage.tsx` | Fetches all resume versions globally | All users see same resume list |
| `pages/content-items/ContentItemsPage.tsx` | Fetches all content items globally | All users see same portfolio |
| `pages/job-finder-config/JobFinderConfigPage.tsx` | Edits global config (match-policy, personal-info) | One user's changes affect all users |

### AI & LiteLLM — No Per-User Isolation

| File | Pattern | Impact |
|------|---------|--------|
| `infra/litellm-config.yaml` | Single `LITELLM_MASTER_KEY` for all requests | No per-user budget or rate tracking |
| `infra/litellm-config.yaml` | No `budget_config`, `team_budget`, or virtual keys | Can't limit AI spend per user |
| Backend `inference-client.ts` | Uses single Bearer token for all LiteLLM calls | No user attribution on AI requests |
| Worker `inference_client.py` | Uses single `LITELLM_MASTER_KEY` | Same — no per-user tracking |

### File Storage — No User Isolation

| File | Pattern | Impact |
|------|---------|--------|
| `workflow/services/storage.service.ts` | Artifacts stored in `{root}/YYYY-MM-DD/{run-id}/` — no user directory | All artifacts in shared namespace |
| `resume-version.publish.ts` | Resume PDFs at `{root}/resumes/{slug}.pdf` — no user prefix | All users overwrite same file per slug |
| `generator.artifacts.routes.ts` | Public route — no auth required, URL is only access control | Anyone with URL can download any user's PDF |
| `generator.assets.routes.ts` | Assets in `{root}/assets/YYYY-MM-DD/` — no user isolation | Shared asset directory |

---

## Architecture

### Target topology

```
                    ┌─────────────────────────┐
                    │   Cloudflare Tunnel      │
                    └────────┬────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │          Nginx LB           │
              └──────┬──────────────┬───────┘
                     │              │
            ┌────────┴───┐   ┌─────┴────────┐
            │  API (x2)  │   │  API (x2)    │
            └────────┬───┘   └─────┬────────┘
                     │              │
         ┌───────────┴──────────────┴───────────┐
         │                                       │
    ┌────┴─────┐  ┌──────────┐  ┌──────────────┐
    │ Postgres │  │  Redis   │  │   LiteLLM    │
    │ (primary)│  │ (cache/  │  │   (proxy)    │
    │          │  │  limits) │  │              │
    └──────────┘  └──────────┘  └──────┬───────┘
                                       │
                              ┌────────┴────────┐
                              │  Ollama (GPU)   │
                              └─────────────────┘
         ┌──────────────────────────────────────┐
         │         Worker Pool (x2+)            │
         │  ┌─────────┐  ┌─────────┐           │
         │  │Worker 1 │  │Worker 2 │           │
         │  └─────────┘  └─────────┘           │
         └──────────────────────────────────────┘
```

### Data classification

| Scope | Tables | Rationale |
|-------|--------|-----------|
| **Global** | companies, job_sources, job_listings, seen_urls, scrape_reports, schema_migrations, job_finder_config (system keys only) | Shared reference data; dedup benefits from global pool |
| **Per-user** | content_items, resume_versions, resume_items, job_matches, generator_requests, document_cache, user_config | User-specific content, analysis, and preferences |
| **Mixed** | job_queue, job_queue_archive | System tasks (scrape) have NULL user_id; user tasks (match) have user_id set |

---

## Database: SQLite → PostgreSQL

### Why PostgreSQL

| SQLite limitation | PostgreSQL solution |
|-------------------|-------------------|
| Single writer (WAL helps reads, writes serialize) | MVCC: concurrent reads and writes |
| No connection pooling | PgBouncer: 200 client connections → 20 backend connections |
| File-level locks (can't skip locked rows) | `SELECT FOR UPDATE SKIP LOCKED` for worker scaling |
| sqlite-vec (alpha, limited tooling) | pgvector (mature, IVFFlat/HNSW indexes) |
| No row-level security | RLS policies enforce tenant isolation at DB level |
| 231MB single file backup | pg_dump, streaming replication, point-in-time recovery |

### Migration approach

Fresh PostgreSQL schema (recommended over converting 62 SQLite migrations) + one-time data migration script.

### Schema translation rules

```
SQLite                        →  PostgreSQL
─────────────────────────────────────────────────
TEXT PRIMARY KEY (UUID string) →  UUID PRIMARY KEY DEFAULT gen_random_uuid()
INTEGER PRIMARY KEY            →  SERIAL / BIGSERIAL
TEXT (JSON blobs)              →  JSONB
TEXT (timestamps)              →  TIMESTAMPTZ
? parameter placeholders       →  $1, $2, ... numbered params
IFNULL()                       →  COALESCE()
GLOB                           →  LIKE / ILIKE
sqlite-vec virtual table       →  pgvector extension
GROUP_CONCAT                   →  STRING_AGG
datetime('now')                →  NOW()
```

### Vector search migration

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Replaces sqlite-vec virtual table + document_cache.embedding_rowid FK
ALTER TABLE document_cache ADD COLUMN embedding vector(768);

CREATE INDEX idx_document_cache_embedding
  ON document_cache USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### Driver choice

| Service | Current | Target |
|---------|---------|--------|
| Backend (TypeScript) | better-sqlite3 (sync) | `postgres` (postgres.js) — tagged template queries, pipeline mode |
| Worker (Python) | sqlite3 (stdlib) | `psycopg[pool]` (psycopg3) — async-ready, connection pool |

Both keep raw SQL (consistent with current approach, no ORM migration overhead).

### Files to modify

| File | Change |
|------|--------|
| `job-finder-BE/server/src/config/env.ts` | Add `DATABASE_URL`, remove `DATABASE_PATH` |
| `job-finder-BE/server/src/db.ts` (new) | PostgreSQL connection pool |
| All `*.repository.ts` (12 files) | Replace better-sqlite3 calls with postgres.js queries |
| `job-finder-worker/src/job_finder/storage/sqlite_client.py` | Replace with psycopg pool |
| All worker `storage/*.py` (5 files) | Update SQL syntax |
| `infra/docker-compose.prod.yml` | Add postgres, pgbouncer services |
| `job-finder-BE/server/package.json` | Remove better-sqlite3, sqlite-vec; add postgres |
| `job-finder-worker/requirements.txt` | Add psycopg[pool] |

---

## Multi-Tenant Data Model

### New tables

#### `user_profiles`

Explicit user profile (replaces implicit loading from content_items + users table).

```sql
CREATE TABLE user_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  headline          TEXT,                  -- "Senior Full-Stack Engineer"
  summary           TEXT,                  -- professional summary paragraph
  location          TEXT,                  -- "Portland, OR"
  years_experience  INTEGER,
  skill_years       JSONB DEFAULT '{}',    -- {"react": 6, "python": 8}
  work_arrangement  TEXT[] DEFAULT '{}',   -- ['remote', 'hybrid']
  salary_min        INTEGER,
  salary_max        INTEGER,
  target_roles      TEXT[] DEFAULT '{}',   -- ["Staff Engineer", "Tech Lead"]
  target_industries TEXT[] DEFAULT '{}',
  timezone_offset   INTEGER,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `user_config`

Per-user configuration (match-policy, prefilter-policy, personal-info).

```sql
CREATE TABLE user_config (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  config_key TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, config_key)
);
```

Config key classification:

| Key | Scope | Table |
|-----|-------|-------|
| `match-policy` | Per-user | `user_config` |
| `prefilter-policy` | Per-user | `user_config` |
| `personal-info` | Per-user | `user_config` |
| `ai-prompts` | System | `job_finder_config` (unchanged) |
| `worker-settings` | System | `job_finder_config` (unchanged) |
| `cron-config` | System | `job_finder_config` (unchanged) |

### user_id FK additions

Add `user_id UUID NOT NULL REFERENCES users(id)` to:

```sql
ALTER TABLE content_items      ADD COLUMN user_id UUID NOT NULL REFERENCES users(id);
ALTER TABLE resume_versions    ADD COLUMN user_id UUID NOT NULL REFERENCES users(id);
ALTER TABLE resume_items       ADD COLUMN user_id UUID NOT NULL REFERENCES users(id);
ALTER TABLE job_matches        ADD COLUMN user_id UUID NOT NULL REFERENCES users(id);
ALTER TABLE generator_requests ADD COLUMN user_id UUID NOT NULL REFERENCES users(id);
ALTER TABLE document_cache     ADD COLUMN user_id UUID NOT NULL REFERENCES users(id);
ALTER TABLE job_queue          ADD COLUMN user_id UUID REFERENCES users(id);  -- nullable: system tasks have no user
```

### Indexes

```sql
-- Every per-user table needs a user_id index
CREATE INDEX idx_content_items_user      ON content_items(user_id);
CREATE INDEX idx_resume_versions_user    ON resume_versions(user_id);
CREATE INDEX idx_job_matches_user        ON job_matches(user_id);
CREATE INDEX idx_generator_requests_user ON generator_requests(user_id);
CREATE INDEX idx_document_cache_user     ON document_cache(user_id);
CREATE INDEX idx_user_config_user_key    ON user_config(user_id, config_key);

-- Composite indexes for common per-user queries
CREATE INDEX idx_job_matches_user_status ON job_matches(user_id, status);
CREATE INDEX idx_job_matches_user_score  ON job_matches(user_id, match_score DESC);
CREATE INDEX idx_content_items_user_ctx  ON content_items(user_id, ai_context);
CREATE INDEX idx_job_queue_user_status   ON job_queue(user_id, status) WHERE user_id IS NOT NULL;
```

### Row-level security

Defense-in-depth: even if app code omits a WHERE clause, data doesn't leak.

```sql
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_matches_isolation ON job_matches
  USING (user_id = current_setting('app.current_user_id')::uuid);

ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_items_isolation ON content_items
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- Repeat for: resume_versions, resume_items, generator_requests, document_cache
-- job_queue gets a permissive policy (system tasks have NULL user_id)
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_queue_isolation ON job_queue
  USING (user_id IS NULL OR user_id = current_setting('app.current_user_id')::uuid);
```

Set per-request in backend middleware:

```typescript
// After auth middleware resolves the user
await sql`SELECT set_config('app.current_user_id', ${req.user.uid}, true)`;
```

---

## Shared Types

### `shared/src/user-profile.types.ts`

```typescript
export interface UserProfile {
  userId: string
  displayName: string
  headline: string | null
  summary: string | null
  location: string | null
  yearsExperience: number | null
  skillYears: Record<string, number>
  workArrangement: string[]
  salaryMin: number | null
  salaryMax: number | null
  targetRoles: string[]
  targetIndustries: string[]
  timezoneOffset: number | null
  onboardingComplete: boolean
  createdAt: string
  updatedAt: string
}

export type UpdateProfileData = Partial<Omit<UserProfile, 'userId' | 'createdAt' | 'updatedAt'>>
```

### `shared/src/api/user-profile.types.ts`

```typescript
import type { UserProfile, UpdateProfileData } from '../user-profile.types'

export interface GetProfileResponse {
  profile: UserProfile
}

export interface UpdateProfileRequest {
  profileData: UpdateProfileData
}

export interface UpdateProfileResponse {
  profile: UserProfile
  message: string
}

export interface GetUserConfigResponse {
  configKey: string
  payload: Record<string, unknown>
}

export interface UpdateUserConfigRequest {
  payload: Record<string, unknown>
}

export interface DeleteAccountResponse {
  deleted: boolean
  message: string
}
```

Export from `shared/src/index.ts`.

---

## Backend API

### New routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users/me/profile` | Authenticated | Get own profile |
| PUT | `/api/users/me/profile` | Authenticated | Update own profile |
| GET | `/api/users/me/config/:key` | Authenticated | Get user-specific config |
| PUT | `/api/users/me/config/:key` | Authenticated | Update user-specific config |
| POST | `/api/users/me/onboarding` | Authenticated | Mark onboarding step complete |
| DELETE | `/api/users/me` | Authenticated | Delete account + all data (CASCADE) |

### New files

```
job-finder-BE/server/src/
├── db.ts                                          # PostgreSQL connection pool
├── modules/
│   ├── user-profile/
│   │   ├── user-profile.repository.ts             # CRUD for user_profiles
│   │   └── user-profile.routes.ts                 # Profile API endpoints
│   └── user-config/
│       ├── user-config.repository.ts              # Per-user config storage
│       └── user-config.routes.ts                  # Config API endpoints
```

### Repository pattern changes

Every per-user repository method gains a `userId` parameter:

```typescript
// BEFORE
class JobMatchRepository {
  list(options: ListOptions) {
    return this.db.prepare(`SELECT * FROM job_matches WHERE status = ?`).all(options.status);
  }
}

// AFTER
class JobMatchRepository {
  async list(userId: string, options: ListOptions) {
    return sql`SELECT * FROM job_matches WHERE user_id = ${userId} AND status = ${options.status}`;
  }
}
```

Repositories requiring `userId` param on all methods:

| Repository | Notes |
|-----------|-------|
| `JobMatchRepository` | Filter all queries by user_id |
| `ContentItemRepository` | Scope tree traversal to user |
| `ResumeVersionRepository` | Each user owns their own versions |
| `GeneratorWorkflowService` | user_id on request creation + artifact queries |
| `ConfigRepository` | Split: system config (admin) vs user config (per-user) |
| `DocumentCacheService` | user_id in cache keys |

Repositories that stay global (no `userId`):

| Repository | Notes |
|-----------|-------|
| `JobListingRepository` | Shared job pool |
| `CompanyRepository` | Shared company data |
| `JobSourceRepository` | Admin-managed sources |

### Route handler changes

```typescript
// BEFORE
router.get('/job-matches', async (req, res) => {
  const result = await repo.list(req.query);
  return apiSuccess(res, result);
});

// AFTER
router.get('/job-matches', verifyFirebaseAuth, async (req, res) => {
  const result = await repo.list(req.user.uid, req.query);
  return apiSuccess(res, result);
});
```

### Registration flow

Auto-create user on first Google OAuth login (modify existing `POST /api/auth/login`):

```typescript
// In auth login handler, after Google credential verification:
let user = await userRepo.findByEmail(payload.email);
if (!user) {
  user = await userRepo.create({
    email: payload.email,
    displayName: payload.name,
    avatarUrl: payload.picture,
    roles: 'viewer',
  });
  await profileRepo.create(user.id);  // empty profile, onboarding_complete = false
}
```

### SSE/WebSocket scoping

Queue events broadcast only to the user who initiated the task:

```typescript
// SSE connections tagged with userId
sseClients.set(clientId, { response, userId: req.user.uid });

// Broadcast filters by userId
function broadcastQueueEvent(event: QueueEvent) {
  for (const [id, client] of sseClients) {
    if (event.userId === null || client.userId === event.userId) {
      client.response.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  }
}
```

### Config endpoint split

```
// System config (admin only, unchanged)
GET/PUT /api/config/ai-prompts
GET/PUT /api/config/worker-settings
GET/PUT /api/config/cron-config

// User config (per-user, new endpoints)
GET/PUT /api/users/me/config/match-policy
GET/PUT /api/users/me/config/prefilter-policy
GET/PUT /api/users/me/config/personal-info
```

---

## Worker Multi-Tenancy

### Current single-user flow

```
startup → SQLiteProfileLoader.load()  → single user profile
        → ConfigLoader.load()          → single match-policy, prefilter-policy
        → ScoringEngine(config)        → single scoring config
        → AIJobMatcher(profile)        → single user context

queue_poll → get ALL pending items → process with single context
```

### Multi-user flow

```
queue_poll → get pending items (each has user_id)
  → for each item:
    → ProfileLoader.load(item.user_id)   → per-user profile
    → ConfigLoader.load(item.user_id)    → per-user config
    → ScoringEngine(user_config)         → per-user scoring
    → AIJobMatcher(user_profile)         → per-user context
    → process item
```

### ProcessorContext per user

```python
# BEFORE: single context at startup
context = ProcessorContext(profile=profile, scoring_config=config, matcher=matcher)

# AFTER: context built per queue item
def build_user_context(user_id: str) -> ProcessorContext:
    profile = profile_cache.get_or_load(user_id)
    config = config_cache.get_or_load(user_id)
    scoring = ScoringEngine(config.match_policy)
    matcher = AIJobMatcher(profile, inference_client)
    return ProcessorContext(user_id=user_id, profile=profile, scoring=scoring, matcher=matcher)
```

### Profile caching

Loading profile + config per queue item is expensive. Cache with 5-minute TTL:

```python
class ProfileCache:
    def __init__(self, ttl_seconds=300):
        self._cache: dict[str, tuple[UserProfile, float]] = {}

    def get_or_load(self, user_id: str) -> UserProfile:
        entry = self._cache.get(user_id)
        if entry and time.time() - entry[1] < self._ttl:
            return entry[0]
        profile = self._db_load(user_id)
        self._cache[user_id] = (profile, time.time())
        return profile
```

### Job matching fan-out

When a job listing is scraped, create one match queue item per active user:

```python
def fan_out_to_users(job_listing_id: str, extracted_data: dict):
    """Create one queue item per active user whose prefilter this listing passes."""
    active_users = db.execute("""
        SELECT user_id FROM user_profiles WHERE onboarding_complete = TRUE
    """)
    for user in active_users:
        user_config = config_cache.get_or_load(user.user_id)
        if passes_prefilter(extracted_data, user_config.prefilter):
            queue_manager.add_item({
                'type': 'job_match',
                'user_id': user.user_id,
                'input': {'job_listing_id': job_listing_id},
            })
```

This means one scraped job listing can produce N job_matches (one per interested user). At 100 users this is manageable; at 1000+ users, switch to batch scoring.

### Pipeline changes

| Queue type | user_id | Change |
|-----------|---------|--------|
| `scrape` | NULL | Unchanged — system task |
| `scrape_source` | NULL | Unchanged — system task |
| `source_discovery` | NULL | Unchanged — system task |
| `company` | NULL | Unchanged — shared company data |
| `job` | NULL → per-user | Split: scrape/extract stays global; scoring/analysis fans out per user |
| `job_match` | **NEW** per-user | New type: score + analyze one listing for one user |

### Worker scaling

Multiple workers with row-level locking (requires PostgreSQL):

```python
def get_pending_items(self, limit=10):
    return db.execute("""
        SELECT * FROM job_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT %s
        FOR UPDATE SKIP LOCKED
    """, [limit])
```

### Files to modify

| File | Change |
|------|--------|
| `profile/sqlite_loader.py` → `profile/profile_loader.py` | Load by user_id, add caching |
| `job_queue/config_loader.py` | Load per-user config from user_config table |
| `job_queue/processor.py` | Build ProcessorContext per item's user_id |
| `job_queue/processors/job_processor.py` | Split: extract globally, score/analyze per user |
| `job_queue/scraper_intake.py` | Add fan-out after extraction |
| `job_queue/manager.py` | user_id on items, FOR UPDATE SKIP LOCKED |
| `scoring/engine.py` | Already parameterized — just receives per-user config |
| `ai/matcher.py` | Already parameterized — just receives per-user profile |
| `storage/*.py` (all 5) | Switch to psycopg, update SQL syntax |
| `flask_worker.py` | Remove single-profile startup, support multi-worker ID |

---

## Frontend

### New pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard` | Personal overview: match stats, recent activity |
| Profile | `/profile` | Edit profile fields (skills, experience, preferences) |
| Settings | `/settings` | Match preferences (match-policy, prefilter-policy) |

### Onboarding wizard

Post-registration multi-step flow at `/register`:

1. **Basic info** — name, location, headline
2. **Experience** — years, target seniority
3. **Skills** — searchable skill picker with years per skill
4. **Preferences** — work arrangement, salary range, industries
5. **Review** — summary, start matching

### New components

| Component | Purpose |
|-----------|---------|
| `OnboardingWizard` | Multi-step profile setup |
| `ProfileEditor` | Edit profile (skills, experience, preferences) |
| `SkillPicker` | Searchable skill selection with years |
| `UserMenu` | Avatar dropdown: profile, settings, sign out |
| `DashboardStats` | Match statistics, recent activity |

### AuthContext changes

```typescript
interface AuthContextType {
  user: AuthUser | null
  profile: UserProfile | null       // NEW
  loading: boolean
  isOwner: boolean
  isOnboarded: boolean              // NEW: profile.onboardingComplete
  signOut: () => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  refreshProfile: () => Promise<void>  // NEW
}
```

### Navigation changes

```
// Current (admin sees everything)
Home | How It Works | Experience | Resumes | [Admin tools] | [AuthIcon]

// Multi-user
Home | How It Works | Dashboard | Matches | Resumes | [Admin: Queue, Config, Health] | [UserAvatar ▾]
                                                                                        ├─ Profile
                                                                                        ├─ Settings
                                                                                        └─ Sign Out
```

### Route changes

```typescript
// New public
{ path: '/register', element: <OnboardingWizard /> }

// New authenticated
{ path: '/dashboard', element: <DashboardPage /> }
{ path: '/profile', element: <ProfilePage /> }
{ path: '/settings', element: <SettingsPage /> }

// Home redirect: / → /dashboard (if authenticated) or /how-it-works (if not)
```

### API client

```typescript
// api/user-profile-client.ts
export const userProfileClient = {
  getProfile: () => get<GetProfileResponse>('/users/me/profile'),
  updateProfile: (data: UpdateProfileData) => put<UpdateProfileResponse>('/users/me/profile', { profileData: data }),
  getConfig: (key: string) => get<GetUserConfigResponse>(`/users/me/config/${key}`),
  updateConfig: (key: string, payload: Record<string, unknown>) => put(`/users/me/config/${key}`, { payload }),
  deleteAccount: () => del<DeleteAccountResponse>('/users/me'),
};
```

### Existing page changes

| Page | Change |
|------|--------|
| `JobApplicationsPage` | No code change needed — backend scopes by user_id |
| `ResumeVersionsPage` | Each user manages their own versions (not shared global 5) |
| `ContentItemsPage` | Scoped to current user's content_items |
| `JobFinderConfigPage` | Admin section only shows system config; personal preferences move to Settings |

---

## Job Applicator

The Electron app (`job-applicator/`) has deep single-user assumptions that need addressing.

### Current architecture

```
Electron main process
  ├── auth-manager.ts    → Google OAuth popup, stores ONE session token
  ├── auth-store.ts      → electron-store encrypted storage (single auth object)
  ├── api-client.ts      → all API calls use getAuthHeaders() from single token
  ├── tool-executor.ts   → GLOBAL state: userProfile, jobContext, documentPaths
  ├── tool-server.ts     → local HTTP server (:19524) for MCP tool execution
  └── main.ts            → fill-form handler, document download, Claude CLI spawn
```

### Single-user problems

1. **One login at a time** — `auth-store.ts` stores a single `{encryptedToken}` object; no multi-account support
2. **Global form fill state** — `tool-executor.ts` has module-level variables (`currentJobMatchId`, `userProfile`, `jobContext`, `documentPaths`); only one fill can be active
3. **Shared temp directory** — `os.tmpdir()/job-applicator-docs/` used for all downloaded documents; filename collisions if two users download `resume.pdf`
4. **`fillFormInProgress` flag** — boolean gate preventing concurrent form fills entirely
5. **MCP tools have no user context** — `get_user_profile` and `get_resume_versions` tools return data from global state, not parameterized per user

### Multi-user approach

**Recommended: One app instance per user** (simplest path)

The Electron app is a local desktop tool. Multiple users means multiple machines (not multiple users on one machine). The backend already scopes data by session cookie, so:

- Each user installs the app and logs in with their own Google account
- Session cookie scopes all API responses to that user
- No code changes needed for the single-instance-per-user model

**If multi-account support is wanted later:**

| Change | Detail |
|--------|--------|
| `auth-store.ts` | Change from single `auth` object to `Map<email, encryptedToken>` |
| `tool-executor.ts` | Replace globals with `Map<fillId, FillFormContext>` |
| Temp directory | Scope to user: `os.tmpdir()/job-applicator-${userId}/` |
| UI | Add user switcher dropdown showing logged-in accounts |

### Files to modify (if multi-account)

| File | Change |
|------|--------|
| `job-applicator/src/auth-store.ts` | Multi-account store |
| `job-applicator/src/auth-manager.ts` | Account switching |
| `job-applicator/src/tool-executor.ts` | Per-fill context objects |
| `job-applicator/src/main.ts` | Scoped temp dirs, concurrent fill support |
| `job-applicator/src/renderer/app.ts` | User indicator in toolbar |

---

## AI Provider Keys & Quota Management

### Current state

All AI requests flow through LiteLLM proxy with **shared credentials**:

```
Backend/Worker → (LITELLM_MASTER_KEY) → LiteLLM Proxy → (ANTHROPIC_API_KEY) → Claude
                                                       → (GEMINI_API_KEY)    → Gemini
                                                       → (no key needed)     → Ollama
```

- **One master key** authenticates all services to LiteLLM
- **One Anthropic key** shared across all Claude calls
- **One Gemini key** shared across all Gemini calls
- **No per-user budget**, quota, or rate tracking
- **No cost calculation** — response types have optional `costUsd` field but it's never populated
- When provider returns HTTP 429, queue item goes to `BLOCKED` status (manual unblock required)

### What needs to change

#### Option A: LiteLLM Virtual Keys (Recommended)

LiteLLM supports [virtual keys](https://docs.litellm.ai/docs/proxy/virtual_keys) with per-key budget tracking:

```yaml
# litellm-config.yaml additions
general_settings:
  database_url: postgresql://jobfinder:${POSTGRES_PASSWORD}@pgbouncer:6432/jobfinder
  master_key: ${LITELLM_MASTER_KEY}
  store_model_in_db: true
```

Backend creates a virtual key per user on registration:

```typescript
// POST to LiteLLM /key/generate
const response = await fetch('http://litellm:4000/key/generate', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${LITELLM_MASTER_KEY}` },
  body: JSON.stringify({
    user_id: userId,
    max_budget: 5.00,           // $5/month per user
    budget_duration: '1mo',
    models: ['claude-document', 'gemini-general', 'local-extract'],
    metadata: { email: userEmail },
  }),
});
const { key } = await response.json();
// Store key in user_config table
```

Worker sends per-user virtual key with each request:

```python
# Per-user LiteLLM key from user_config
response = client.chat.completions.create(
    model=model,
    messages=messages,
    extra_headers={"Authorization": f"Bearer {user_litellm_key}"},
)
```

#### Option B: Application-Level Quota Tracking (Simpler)

Track AI usage in a new table without LiteLLM virtual keys:

```sql
CREATE TABLE user_ai_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  model      TEXT NOT NULL,
  requests   INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, date, model)
);
```

Worker checks quota before processing:

```python
def check_quota(user_id: str) -> bool:
    usage = db.execute("""
        SELECT SUM(requests) FROM user_ai_usage
        WHERE user_id = %s AND date = CURRENT_DATE
    """, [user_id])
    return usage[0][0] < DAILY_LIMIT  # e.g., 50 jobs/day
```

### Recommendation

Start with **Option B** (simpler, no LiteLLM reconfiguration). Add Option A later if granular cost tracking per model is needed.

### Files to modify

| File | Change |
|------|--------|
| `infra/litellm-config.yaml` | (Option A) Add database_url for virtual key storage |
| Worker `ai/inference_client.py` | Accept per-user API key or check quota before inference |
| Backend `ai/inference-client.ts` | Same — per-user key header or quota check |
| `job_queue/processors/job_processor.py` | Check user quota before AI analysis step |
| New: `shared/src/api/usage.types.ts` | Usage tracking types |
| New: `modules/usage/usage.repository.ts` | Usage tracking CRUD |

---

## File Storage & Artifacts

### Current layout

```
/data/artifacts/
├── YYYY-MM-DD/                      # Generated documents
│   └── {12-hex-run-id}/
│       └── {name}_{role}_{type}.pdf  # Semi-secret URL path
├── assets/
│   └── YYYY-MM-DD/
│       └── {kind}-{token}.{ext}     # Avatars, logos
└── resumes/
    └── {slug}.pdf                   # Resume version PDFs (overwritten on publish)
```

**Access control**: Artifact routes are globally public — URL knowledge = access. No auth, no user_id in path.

### Multi-user layout

```
/data/artifacts/
├── {user_id}/                       # Per-user directory
│   ├── generated/
│   │   └── YYYY-MM-DD/
│   │       └── {run-id}/
│   │           └── {name}_{role}_{type}.pdf
│   ├── assets/
│   │   └── {kind}-{token}.{ext}
│   └── resumes/
│       └── {slug}.pdf
└── shared/                          # System assets (templates, defaults)
```

### Access control changes

| Route | Current | After |
|-------|---------|-------|
| `GET /api/generator/artifacts/:date/:run/:file` | Public | **Auth required** — validate user owns the artifact via `generator_requests.user_id` |
| `GET /api/resume-versions/:slug/pdf` | Public | **Auth required** — validate user owns the version |
| `POST /api/generator/assets/upload` | Auth required | Add `user_id` to stored path |

### Storage service changes

```typescript
// BEFORE
getArtifactPath(date: string, runId: string, filename: string): string {
  return path.join(this.root, date, runId, filename);
}

// AFTER
getArtifactPath(userId: string, date: string, runId: string, filename: string): string {
  return path.join(this.root, userId, 'generated', date, runId, filename);
}

getResumePath(userId: string, slug: string): string {
  return path.join(this.root, userId, 'resumes', `${slug}.pdf`);
}
```

### Cleanup

Add retention policy (currently no cleanup exists for artifacts):

```sql
-- Track artifact age for cleanup
CREATE INDEX idx_artifacts_created ON generator_artifacts(created_at);

-- Cron job: delete artifacts older than 90 days
DELETE FROM generator_artifacts WHERE created_at < NOW() - INTERVAL '90 days';
-- Corresponding filesystem cleanup in maintenance service
```

### Network storage (SMB/CIFS)

Currently copies to `//host/share/documents/Resume/`. For multi-user, add user folder:

```
//host/share/documents/{userId}/Resume/{filename}.pdf
//host/share/documents/{userId}/CoverLetter/{filename}.pdf
```

### Files to modify

| File | Change |
|------|--------|
| `workflow/services/storage.service.ts` | Add userId to all path methods |
| `generator.artifacts.routes.ts` | Add auth middleware, validate ownership |
| `generator.assets.routes.ts` | Add userId to asset paths |
| `resume-version.publish.ts` | Per-user resume PDF paths |
| `resume-version.routes.ts` | Auth on PDF download, scope to user |
| `workflow/services/network-storage.service.ts` | Per-user network paths |
| `modules/maintenance/maintenance.service.ts` | Add artifact cleanup task |

---

## Chat Widget

### Current state

The chat widget (`POST /api/chat/message`) builds a system prompt using global data:

```typescript
// chat.prompts.ts
function getChatContext() {
  const personalInfo = new PersonalInfoStore().get();  // Global singleton
  const content = new ContentItemRepository().list();  // ALL items, no user filter
  return { personalInfo, content };
}

function buildSystemPrompt(context) {
  return `You are a helpful assistant on ${context.personalInfo.name}'s portfolio website...`;
}
```

### Multi-user decision

The chat widget is a **public-facing portfolio feature** — visitors chat with an AI about the site owner's experience. Two options:

**Option A: Keep global (portfolio owner's identity)**

If the site remains a portfolio for one person (you), the chat widget should always use the site owner's personal info. Other users of the job-finding features don't need a public-facing chat.

**Option B: Per-user chat (if each user gets a portfolio)**

If each user gets their own public portfolio page, the chat needs user context from the URL:

```typescript
// Route: /api/chat/message/:userId
const context = getChatContext(req.params.userId);
```

**Recommendation**: Option A for now. The chat widget is a portfolio feature, not a job-finding feature. Keep it global with the site owner's identity. Revisit if user portfolios become a feature.

---

## Cron & Scheduled Tasks

### Current scheduled jobs

| Job | Schedule | Scope | Multi-user impact |
|-----|----------|-------|-------------------|
| `scrape` | Every 6 hours (0, 6, 12, 18) | System | **Unchanged** — scrapes shared sources |
| `maintenance` | Daily at midnight | System | **Needs user_id awareness** for per-user data cleanup |
| `logrotate` | Daily at midnight | System | Unchanged |
| `sessionCleanup` | Daily at 3am | System | Unchanged |

### Maintenance changes

Current maintenance archives globally (no user awareness):

```typescript
// BEFORE: archive all old listings/matches
archiveListingsOlderThan(14);  // days
archiveQueueItemsOlderThan(7);
pruneDocumentCacheOlderThan(30);

// AFTER: archive per-user data with user context
archiveMatchesOlderThan(14);          // job_matches now have user_id
archiveQueueItemsOlderThan(7);       // job_queue items may have user_id
pruneDocumentCacheOlderThan(30);     // document_cache now has user_id
deleteArtifactsOlderThan(90);        // NEW: filesystem cleanup per user
```

### Fan-out scheduling

Scraping stays global, but job matching fans out per user. The scrape cron creates queue items that eventually trigger fan-out:

```
Cron triggers SCRAPE task
  → Worker scrapes sources → creates job_listings
  → For each new listing: extraction (global)
  → After extraction: fan_out_to_users() creates per-user job_match queue items
  → Workers process job_match items with per-user scoring/analysis
```

No per-user scrape schedule needed for MVP. Users customize what they see via match-policy and prefilter-policy, not scrape timing.

### Files to modify

| File | Change |
|------|--------|
| `scheduler/cron.ts` | No schedule changes; maintenance handler gets user-aware cleanup |
| `modules/maintenance/maintenance.service.ts` | Per-user archive queries, artifact cleanup |
| `job_queue/scraper_intake.py` | Fan-out to users after extraction |

---

## Registration & Access Control

### Current state (OPEN — any Google account)

The `POST /api/auth/login` handler (`auth.routes.ts:111-112`):

```typescript
// New users get 'viewer' role by default
// NO email domain check, NO invite code, NO admin approval
const roles = existingUser ? existingUser.roles : 'viewer';
```

Any person with a Google account can sign up right now. This is fine for single-user but dangerous at scale (AI quota abuse, data privacy).

### Invite-only registration (Recommended for MVP)

```sql
CREATE TABLE invite_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,       -- 8-char alphanumeric
  created_by  UUID NOT NULL REFERENCES users(id),
  claimed_by  UUID REFERENCES users(id),  -- NULL until used
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Login handler change:

```typescript
// POST /api/auth/login
if (!existingUser) {
  const { inviteCode } = req.body;
  if (!inviteCode) return apiError(res, 403, 'INVITE_REQUIRED', 'Invite code required for new accounts');

  const invite = await inviteRepo.claim(inviteCode, newUser.id);
  if (!invite) return apiError(res, 403, 'INVALID_INVITE', 'Invalid or expired invite code');
}
```

Admin endpoint to generate invites:

```
POST /api/admin/invites       (admin only) → { code: "ABC12345", expiresAt: "..." }
GET  /api/admin/invites       (admin only) → list all invites with claim status
```

### Frontend changes

- Login modal shows "Have an invite code?" field for new users
- Admin panel gets "Generate Invite" button

---

## Infrastructure

### Docker Compose additions

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_DB: jobfinder
      POSTGRES_USER: jobfinder
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - jobfinder
    deploy:
      resources:
        limits:
          memory: 2G
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U jobfinder"]
      interval: 10s

  pgbouncer:
    image: bitnami/pgbouncer:latest
    environment:
      POSTGRESQL_HOST: postgres
      POSTGRESQL_DATABASE: jobfinder
      POSTGRESQL_USERNAME: jobfinder
      POSTGRESQL_PASSWORD: ${POSTGRES_PASSWORD}
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_MAX_CLIENT_CONN: 200
      PGBOUNCER_DEFAULT_POOL_SIZE: 20
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - jobfinder

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    networks:
      - jobfinder

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "8080:80"
    depends_on:
      - api
    networks:
      - jobfinder
```

### Service scaling

```yaml
  api:
    deploy:
      replicas: 2
    environment:
      DATABASE_URL: postgresql://jobfinder:${POSTGRES_PASSWORD}@pgbouncer:6432/jobfinder
      REDIS_URL: redis://redis:6379

  worker:
    deploy:
      replicas: 2
    environment:
      DATABASE_URL: postgresql://jobfinder:${POSTGRES_PASSWORD}@pgbouncer:6432/jobfinder
```

### Redis usage

| Use case | Key pattern | TTL |
|----------|-------------|-----|
| Rate limiting | `rl:{ip}:{endpoint}` | 60s |
| User profile cache | `profile:{user_id}` | 300s |
| Session validation cache | `session:{token_hash}` | 3600s |
| Queue event pub/sub | Channel: `queue:events:{user_id}` | N/A |

### Resource estimates (100 users)

| Resource | Current (1 user) | Target (100 users) |
|----------|-----------------|-------------------|
| PostgreSQL | N/A | 2GB RAM, 50GB disk |
| Redis | N/A | 256MB RAM |
| API instances | 1 | 2 |
| Worker instances | 1 | 2-3 |
| LiteLLM | 1 | 1 (proxy, not compute-bound) |
| Ollama | 1 GPU | 1 GPU (queue manages throughput) |
| Total RAM | ~4GB | ~8-12GB |

### AI cost scaling

| Model | 1 user | 100 users | Mitigation |
|-------|--------|-----------|------------|
| Ollama (local) | Free | Free | GPU-bound; queue absorbs spikes |
| Claude (analysis) | ~$5/mo | ~$50-200/mo | Document cache, prefilter rejects, per-user daily quotas |
| Gemini (fallback) | ~$2/mo | ~$20-50/mo | Only on Ollama/Claude failures |

---

## Security Hardening

### High priority

| Change | Detail |
|--------|--------|
| Remove localhost bypass | Currently allows unauth access from 127.0.0.1/Docker IPs — remove for production |
| PostgreSQL RLS | Defense-in-depth for tenant isolation (see schema section above) |
| Auth on job-match reads | `/api/job-matches` is currently public GET — require authentication |
| Artifact access control | Generated PDFs are public via unique URLs — add auth check |
| Redis rate limiting | Replace in-memory rate limiter for multi-instance deployments |

### Medium priority

| Change | Detail |
|--------|--------|
| CSRF tokens | Origin guard exists; add proper double-submit CSRF tokens |
| Session rotation | Rotate session token after privilege changes |
| Account lockout | Rate-limit failed login attempts per email |
| User data export | Users can download all their data (GDPR) |
| Account deletion | CASCADE delete all user data (GDPR) |
| Audit log | Track who accessed/modified what data |

### Rate limiting (Redis-backed)

```typescript
const rateLimiter = new RedisRateLimiter(redis, {
  authenticated: {
    'job-matches': { windowMs: 60_000, max: 60 },
    'generator':   { windowMs: 3_600_000, max: 20 },
    'chat':        { windowMs: 60_000, max: 30 },
  },
  anonymous: {
    'auth': { windowMs: 900_000, max: 10 },
    'chat': { windowMs: 60_000, max: 5 },
  },
});
```

---

## Data Migration

One-time script to move SQLite → PostgreSQL:

1. Deploy PostgreSQL alongside SQLite (both running)
2. Run `scripts/migrate-sqlite-to-postgres.py`:
   - Reads all SQLite tables
   - Assigns existing data to your user account (`user_id` = your UUID)
   - Transforms types (TEXT timestamps → TIMESTAMPTZ, JSON strings → JSONB)
   - Inserts into PostgreSQL
3. Switch backend + worker to PostgreSQL connection string
4. Validate all features
5. Remove SQLite volumes and dependencies (better-sqlite3, sqlite-vec, sqlite3)

---

## Phases

### Phase 1: PostgreSQL + Schema (3 weeks)

1. Write PostgreSQL schema from current 62 SQLite migrations (translate all 62 into one fresh PG schema)
2. Add new tables: `user_profiles`, `user_config`, `invite_codes`, `user_ai_usage`
3. Add `user_id` FK to 7 per-user tables
4. Add RLS policies on all per-user tables
5. Create PostgreSQL connection pool (backend: postgres.js, worker: psycopg)
6. Convert 12 backend repositories from better-sqlite3 to postgres.js
7. Convert 5 worker storage classes from sqlite3 to psycopg
8. Replace sqlite-vec with pgvector for document cache embeddings
9. Write + run data migration script (assign all existing data to your user_id)
10. Add postgres, pgbouncer, redis to docker-compose
11. Update CI/CD pipeline to include postgres in test environment

### Phase 2: Registration + Backend Scoping (3 weeks)

12. Invite code generation (admin endpoint) + `invite_codes` table
13. Auto-create user on first OAuth login (with invite code validation)
14. Profile + config API endpoints (new route modules)
15. Shared types + Zod validation schemas for profile, user config, invites
16. Add `userId` param to all per-user repository methods (12 repos)
17. Update all route handlers to pass `req.user.uid` to repositories
18. Refactor `PersonalInfoStore` — load from `user_config` by userId instead of global singleton
19. Refactor `applicator.routes.ts` profile endpoint — scope `contentRepo.list(userId)`
20. Refactor `chat.prompts.ts` — `getChatContext()` stays global (portfolio feature), but document generation uses per-user context
21. Split config endpoints: system config (admin) vs user config (per-user)
22. Scope SSE/WebSocket events by user_id
23. Per-user file storage paths in `storage.service.ts`
24. Add auth to artifact download routes + resume PDF routes
25. Register new routes in app.ts

### Phase 3: Worker + Frontend (3 weeks, parallel)

**Worker:**
26. ProfileLoader: load by user_id from `user_profiles` + `content_items` (replace `LIMIT 1` query)
27. ConfigLoader: load per-user config from `user_config` table
28. ProfileCache: in-memory cache with 5-min TTL per user_id
29. ProcessorContext: build per queue item's user_id
30. Fan-out: after extraction, create `job_match` queue items per active user
31. AI quota check: verify `user_ai_usage` before analysis step
32. Queue manager: `FOR UPDATE SKIP LOCKED`, user_id on queue items
33. Update `scraper_intake.py` to split pipeline: extract globally → fan-out per user

**Frontend:**
34. Onboarding wizard (5 steps: basic info, experience, skills, preferences, review)
35. Profile page + settings page (match-policy, prefilter-policy, personal-info)
36. Dashboard page (match stats, recent activity, AI usage)
37. Navigation: user menu dropdown, route updates
38. API client for profile + user config + invite codes
39. AuthContext: add `profile`, `isOnboarded`, `refreshProfile()`
40. Login modal: invite code field for new users
41. Resume versions page: scoped to current user's versions

### Phase 4: Scaling + Security (2 weeks)

42. Nginx load balancer config
43. API + worker replicas in docker-compose
44. Redis rate limiting (replace in-memory) — per-user + per-IP limits
45. Remove localhost auth bypass in production
46. Per-user artifact cleanup in maintenance service
47. Account deletion endpoint (CASCADE delete all user data + files)
48. User data export endpoint (GDPR)
49. Load testing with simulated multi-user workload

### Phase 5: Job Applicator (1 week, optional)

50. Validate single-instance-per-user model works (session cookie scopes API responses)
51. Update `fetchApplicatorProfile()` — backend already returns per-user data via cookie
52. Test resume version download — backend returns per-user versions via cookie
53. Document the "one app instance per user" deployment model

**Total: ~12 weeks** (Phase 5 may not require code changes if backend scoping is correct)

---

## Complete File Change Inventory

### New files (~30)

```
# Infrastructure
infra/postgres/init.sql                                        # Full PG schema
infra/postgres/migrations/001_multi_tenant.sql                 # user_id FKs, RLS, new tables
infra/nginx.conf                                               # Load balancer config
scripts/migrate-sqlite-to-postgres.py                          # One-time data migration

# Shared types
shared/src/user-profile.types.ts
shared/src/api/user-profile.types.ts
shared/src/api/invite.types.ts
shared/src/api/usage.types.ts
shared/src/schemas/user-profile.schema.ts

# Backend
job-finder-BE/server/src/db.ts                                 # PostgreSQL connection pool
job-finder-BE/server/src/modules/user-profile/user-profile.repository.ts
job-finder-BE/server/src/modules/user-profile/user-profile.routes.ts
job-finder-BE/server/src/modules/user-config/user-config.repository.ts
job-finder-BE/server/src/modules/user-config/user-config.routes.ts
job-finder-BE/server/src/modules/invites/invite.repository.ts
job-finder-BE/server/src/modules/invites/invite.routes.ts
job-finder-BE/server/src/modules/usage/usage.repository.ts
job-finder-BE/server/src/modules/usage/usage.routes.ts

# Frontend
job-finder-FE/src/pages/profile/ProfilePage.tsx
job-finder-FE/src/pages/settings/SettingsPage.tsx
job-finder-FE/src/pages/dashboard/DashboardPage.tsx
job-finder-FE/src/pages/onboarding/OnboardingWizard.tsx
job-finder-FE/src/components/profile/SkillPicker.tsx
job-finder-FE/src/components/layout/UserMenu.tsx
job-finder-FE/src/api/user-profile-client.ts
```

### Modified files (~60+)

```
# Infrastructure
infra/docker-compose.prod.yml                                  # +postgres, pgbouncer, redis, nginx
infra/litellm-config.yaml                                      # (Optional) virtual key DB config
.github/workflows/deploy.yml                                   # postgres in CI

# Backend — all repositories (12)
job-finder-BE/server/src/modules/job-matches/job-match.repository.ts
job-finder-BE/server/src/modules/content-items/content-item.repository.ts
job-finder-BE/server/src/modules/resume-versions/resume-version.repository.ts
job-finder-BE/server/src/modules/generator/generator.workflow.repository.ts
job-finder-BE/server/src/modules/generator/workflow/generator.workflow.service.ts
job-finder-BE/server/src/modules/generator/workflow/services/storage.service.ts
job-finder-BE/server/src/modules/generator/workflow/services/html-pdf.service.ts
job-finder-BE/server/src/modules/generator/workflow/services/network-storage.service.ts
job-finder-BE/server/src/modules/generator/personal-info.store.ts
job-finder-BE/server/src/modules/generator/generator.artifacts.routes.ts
job-finder-BE/server/src/modules/generator/generator.assets.routes.ts
job-finder-BE/server/src/modules/generator/ai/inference-client.ts
job-finder-BE/server/src/modules/resume-versions/resume-version.publish.ts
job-finder-BE/server/src/modules/resume-versions/resume-version.routes.ts
job-finder-BE/server/src/modules/config/config.repository.ts
job-finder-BE/server/src/modules/maintenance/maintenance.service.ts
job-finder-BE/server/src/modules/chat-widget/chat.prompts.ts
job-finder-BE/server/src/modules/job-queue/queue-events.ts
job-finder-BE/server/src/routes/applicator.routes.ts
job-finder-BE/server/src/routes/auth.routes.ts
job-finder-BE/server/src/middleware/firebase-auth.ts
job-finder-BE/server/src/middleware/rate-limit.ts
job-finder-BE/server/src/config/env.ts
job-finder-BE/server/src/app.ts
job-finder-BE/server/src/index.ts
job-finder-BE/server/src/scheduler/cron.ts
job-finder-BE/server/package.json                              # -better-sqlite3, -sqlite-vec; +postgres

# Worker — all storage + processors
job-finder-worker/src/job_finder/profile/sqlite_loader.py      # → profile_loader.py
job-finder-worker/src/job_finder/job_queue/config_loader.py
job-finder-worker/src/job_finder/job_queue/processor.py
job-finder-worker/src/job_finder/job_queue/manager.py
job-finder-worker/src/job_finder/job_queue/processors/job_processor.py
job-finder-worker/src/job_finder/job_queue/scraper_intake.py
job-finder-worker/src/job_finder/storage/sqlite_client.py      # → pg_client.py
job-finder-worker/src/job_finder/storage/job_storage.py
job-finder-worker/src/job_finder/storage/job_listing_storage.py
job-finder-worker/src/job_finder/storage/job_sources_manager.py
job-finder-worker/src/job_finder/storage/companies_manager.py
job-finder-worker/src/job_finder/ai/inference_client.py
job-finder-worker/src/job_finder/flask_worker.py
job-finder-worker/requirements.txt                             # +psycopg[pool]

# Frontend
job-finder-FE/src/router.tsx
job-finder-FE/src/contexts/AuthContext.tsx
job-finder-FE/src/components/layout/Navigation.tsx
job-finder-FE/src/components/auth/AuthModal.tsx
job-finder-FE/src/pages/resume-versions/ResumeVersionsPage.tsx
job-finder-FE/src/pages/content-items/ContentItemsPage.tsx
job-finder-FE/src/pages/job-finder-config/JobFinderConfigPage.tsx
job-finder-FE/src/types/routes.ts

# Shared types
shared/src/api/auth.types.ts
shared/src/config.types.ts
shared/src/index.ts
```

---

## Open Questions

1. **Per-user resume version slugs?** Currently 5 fixed slugs. Should each user define their own version names, or start with the same 5 seeded templates? Recommendation: seed each new user with the 5 defaults (cloned from templates), let them rename/add/remove.

2. **Shared company enrichment vs per-user?** Company data is factual (shared), but users might want to tag companies with personal notes (interested, not interested). Options: keep companies global + add a `user_company_tags` join table, or keep it simple for now.

3. **Job listing visibility** — should all users see all scraped listings, or only their matches? Current plan: listings are global (shared pool), only matches are per-user. Users see their scored/analyzed matches, not the raw listing feed.

4. **AI quota limits** — what's the right daily cap per user? Options: 50 jobs/day (conservative), 200 jobs/day (generous), unlimited with cost alerts. Depends on AI cost at scale. Start conservative, increase based on actual usage data.

5. **PostgreSQL hosting** — self-hosted on same machine, or managed service? Self-hosted keeps costs at $0 but adds ops burden. Recommendation: self-hosted initially (single server has capacity), migrate to managed when user count exceeds ~50.

6. **Chat widget identity** — should the public chat widget speak as the site owner always, or become per-user if users get their own portfolio pages? Recommendation: keep as site owner's portfolio chat for now. Per-user portfolios are a separate feature.

7. **Job applicator multi-account** — should the Electron app support switching between multiple logged-in users, or is "one instance per user" sufficient? Recommendation: one instance per user for MVP. Multi-account adds complexity for minimal benefit (each user has their own machine).

8. **Source management** — should users be able to add their own job sources (career pages, boards), or are sources admin-managed only? If per-user, the `job_sources` table needs a `user_id` column and source discovery needs user scoping. Recommendation: admin-managed for now; user source suggestions via a request system later.

9. **LiteLLM virtual keys vs app-level quotas** — virtual keys give precise per-model cost tracking but require LiteLLM database integration. App-level quotas are simpler but less granular. Recommendation: start with app-level quotas (daily request count), add LiteLLM virtual keys in Phase 4 if cost tracking is needed.

10. **Existing data ownership** — during SQLite → PostgreSQL migration, all existing data (content_items, resume_versions, job_matches, generator_requests) gets assigned to your user account. Should any data be shared as templates for new users? Recommendation: clone your 5 resume version structures (without content) as empty templates for new users. Keep your actual content private.
