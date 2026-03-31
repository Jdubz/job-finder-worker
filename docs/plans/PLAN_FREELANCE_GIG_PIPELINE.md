> Status: Draft
> Owner: @jdubz
> Last Updated: 2026-03-30

# Plan: Freelance Gig Pipeline — Discovery, Onboarding & Active Management

Add a freelance gig pipeline alongside the existing job pipeline. Two integrated user paths:

1. **Discovery & Onboarding (Path 1)** — Users explore freelance platforms, track vetting progress, and get onboarded
2. **Active Pipeline Management (Path 2)** — Vetted freelancers manage gig sources, scrape opportunities, and track their gig pipeline

Path 1 naturally converts users into Path 2 as they complete platform vetting. Multi-user from the start — each user manages their own platforms, credentials, and gig pipeline independently.

## Problem

1. **No gig discovery** — The system only handles traditional job postings. Users interested in freelance/contract work have no tool support for discovering or evaluating platforms (Toptal, A.Team, Braintrust, etc.)
2. **No onboarding tracking** — Getting vetted on curated platforms involves multi-week processes with different steps per platform. No way to track progress across platforms.
3. **No gig pipeline** — Vetted freelancers have no way to aggregate, filter, and match gig opportunities from multiple platforms in one place
4. **Single-user limitation** — The current job pipeline is global (no user_id scoping). A gig pipeline must be multi-user from day one.

## Solution

### Core concept

A **platform catalog** provides a browsable directory of freelance platforms. Users track their onboarding progress per platform via a **status tracker**. Once vetted, users store **encrypted credentials** and configure **gig sources** that feed into a per-user **scraping → matching pipeline** parallel to the existing job pipeline.

### What changes

| Component | Job Pipeline (unchanged) | Gig Pipeline (new) |
|-----------|-------------------------|-------------------|
| Sources | Global `job_sources` | Per-user `gig_sources` with credential injection |
| Listings | Global `job_listings` | Per-user `gig_listings` with rate/duration/engagement fields |
| Matches | Global `job_matches` | Per-user `gig_matches` with gig-specific statuses (interested/applied/won/lost) |
| Queue items | `job`, `scrape`, etc. | `gig`, `gig_scrape` (new types, same queue infrastructure) |
| Processor | `JobProcessor` | `GigProcessor` (lighter pipeline, skills + rate focused) |
| Auth | Global data, admin-only writes | Per-user data, user-scoped reads/writes |

### What stays the same

- **GenericScraper** — Reused as-is; gig platform differences captured in config templates + credential injection
- **Queue infrastructure** — Same `job_queue` table, `QueueManager`, dispatcher, notifier
- **BaseProcessor pattern** — `GigProcessor` extends `BaseProcessor` with `ProcessorContext` DI
- **Auth system** — Same Google OAuth + sessions. New routes use existing `verifyFirebaseAuth()` middleware
- **Migration pattern** — Sequential SQL files in `infra/sqlite/migrations/`

---

## Database Design

### Migration 065: `gig_platform_catalog`

Static reference data about freelance platforms. Shared across all users.

```sql
CREATE TABLE gig_platform_catalog (
  id                    TEXT PRIMARY KEY,     -- 'braintrust', 'toptal', etc.
  slug                  TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  description           TEXT,
  platform_url          TEXT NOT NULL,
  listing_url           TEXT,                 -- Public job board URL (null = no public listings)
  logo_url              TEXT,
  access_type           TEXT NOT NULL CHECK (access_type IN ('public', 'credential_gated', 'hybrid')),
  vetting_process       TEXT,
  fee_structure         TEXT,
  typical_rates         TEXT,
  skills_focus          TEXT,                 -- JSON array: ["engineering", "ai", "design"]
  engagement_types      TEXT,                 -- JSON array: ["project", "hourly", "retainer"]
  credential_types      TEXT,                 -- JSON array: ["api_key", "oauth_token", "session_cookie"]
  scrape_config_template TEXT,                -- JSON: default SourceConfigJson for this platform
  is_active             INTEGER NOT NULL DEFAULT 1,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Seed data for 7 platforms: Braintrust (public), Arc.dev (public), Gun.io (public), Turing (public), Toptal (credential-gated), A.Team (credential-gated), Upwork Pro (credential-gated).

### Migration 066: `user_platform_onboarding`

Per-user onboarding state. This is the Path 1 → Path 2 bridge.

```sql
CREATE TABLE user_platform_onboarding (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  platform_id   TEXT NOT NULL REFERENCES gig_platform_catalog(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'not_started'
                  CHECK (status IN ('not_started', 'researching', 'applied', 'vetting', 'vetted', 'active')),
  applied_at    TEXT,
  vetted_at     TEXT,
  activated_at  TEXT,
  notes         TEXT,
  next_steps    TEXT,
  profile_url   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, platform_id)
);

CREATE INDEX idx_upo_user ON user_platform_onboarding(user_id);
CREATE INDEX idx_upo_user_status ON user_platform_onboarding(user_id, status);
```

### Migration 067: `user_credentials`

Encrypted per-user credential storage. AES-256-GCM with server-side master key.

```sql
CREATE TABLE user_credentials (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  platform_id     TEXT NOT NULL REFERENCES gig_platform_catalog(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL CHECK (credential_type IN ('api_key', 'oauth_token', 'session_cookie', 'username_password')),
  label           TEXT,
  encrypted_data  BLOB NOT NULL,
  iv              BLOB NOT NULL,
  auth_tag        BLOB NOT NULL,
  expires_at      TEXT,
  is_valid        INTEGER NOT NULL DEFAULT 1,
  last_verified_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, platform_id, credential_type)
);

CREATE INDEX idx_ucred_user ON user_credentials(user_id);
CREATE INDEX idx_ucred_user_platform ON user_credentials(user_id, platform_id);
```

### Migration 068: `gig_sources`, `gig_listings`, `gig_matches`

Per-user gig pipeline tables paralleling the job pipeline.

```sql
-- Per-user gig sources
CREATE TABLE gig_sources (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  platform_id         TEXT REFERENCES gig_platform_catalog(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  source_type         TEXT NOT NULL,          -- 'api' | 'rss' | 'html'
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'paused', 'disabled', 'error')),
  config_json         TEXT NOT NULL,
  requires_credentials INTEGER NOT NULL DEFAULT 0,
  credential_id       TEXT REFERENCES user_credentials(id) ON DELETE SET NULL,
  tags                TEXT,
  last_scraped_at     TEXT,
  last_error          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_gsrc_user ON gig_sources(user_id);
CREATE INDEX idx_gsrc_user_status ON gig_sources(user_id, status);

-- Per-user gig listings (with gig-specific fields)
CREATE TABLE gig_listings (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  url                 TEXT NOT NULL,
  source_id           TEXT REFERENCES gig_sources(id) ON DELETE SET NULL,
  platform_id         TEXT REFERENCES gig_platform_catalog(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  client_name         TEXT,
  description         TEXT NOT NULL,
  location            TEXT,
  posted_date         TEXT,
  rate_min            REAL,
  rate_max            REAL,
  rate_type           TEXT CHECK (rate_type IN ('hourly', 'fixed', 'monthly', 'annual')),
  rate_currency       TEXT DEFAULT 'USD',
  duration            TEXT,
  engagement_type     TEXT CHECK (engagement_type IN ('project', 'hourly', 'retainer', 'contract', 'part_time')),
  hours_per_week      INTEGER,
  skills_required     TEXT,                   -- JSON array
  skills_preferred    TEXT,                   -- JSON array
  experience_level    TEXT,
  timezone_req        TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'analyzing', 'analyzed', 'skipped', 'matched')),
  filter_result       TEXT,
  match_score         REAL,
  content_fingerprint TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, url)
);

CREATE INDEX idx_glist_user ON gig_listings(user_id);
CREATE INDEX idx_glist_user_status ON gig_listings(user_id, status);

-- Per-user gig matches (with gig-specific deal pipeline statuses)
CREATE TABLE gig_matches (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL,
  gig_listing_id      TEXT NOT NULL REFERENCES gig_listings(id) ON DELETE CASCADE,
  match_score         REAL NOT NULL,
  matched_skills      TEXT,                   -- JSON array
  missing_skills      TEXT,                   -- JSON array
  match_reasons       TEXT,                   -- JSON array
  rate_assessment     TEXT,                   -- JSON: { withinRange, analysis }
  availability_fit    TEXT,                   -- JSON: { fits, notes }
  key_strengths       TEXT,                   -- JSON array
  potential_concerns  TEXT,                   -- JSON array
  proposal_tips       TEXT,                   -- JSON array
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'interested', 'applied', 'interviewing', 'won', 'lost', 'ignored')),
  status_changed_at   TEXT,
  queue_item_id       TEXT,
  analyzed_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_gmatch_user ON gig_matches(user_id);
CREATE INDEX idx_gmatch_user_status ON gig_matches(user_id, status);
CREATE INDEX idx_gmatch_listing ON gig_matches(gig_listing_id);
CREATE INDEX idx_gmatch_score ON gig_matches(user_id, match_score DESC);
```

---

## Encryption Service

New utility: `job-finder-BE/server/src/utils/encryption.ts`

- AES-256-GCM using Node.js `crypto` module
- Master key from env var `CREDENTIAL_ENCRYPTION_KEY` (32 bytes, hex-encoded)
- Random 12-byte IV per operation
- Auth tag stored alongside ciphertext for integrity verification
- Decrypted credentials never leave the server via API; only used internally by worker credential injection

```typescript
export function encrypt(plaintext: string): { encryptedData: Buffer; iv: Buffer; authTag: Buffer }
export function decrypt(payload: { encryptedData: Buffer; iv: Buffer; authTag: Buffer }): string
```

Add `CREDENTIAL_ENCRYPTION_KEY` to `EnvSchema` in `job-finder-BE/server/src/config/env.ts` (optional — required when credential features are used).

---

## Shared Types

### New: `shared/src/gig.types.ts`

Core domain types:

```typescript
export type GigPlatformAccessType = 'public' | 'credential_gated' | 'hybrid'
export type GigEngagementType = 'project' | 'hourly' | 'retainer' | 'contract' | 'part_time'
export type GigRateType = 'hourly' | 'fixed' | 'monthly' | 'annual'
export type OnboardingStatus = 'not_started' | 'researching' | 'applied' | 'vetting' | 'vetted' | 'active'
export type GigListingStatus = 'pending' | 'analyzing' | 'analyzed' | 'skipped' | 'matched'
export type GigMatchStatus = 'active' | 'interested' | 'applied' | 'interviewing' | 'won' | 'lost' | 'ignored'
export type CredentialType = 'api_key' | 'oauth_token' | 'session_cookie' | 'username_password'

export interface GigPlatform { ... }
export interface UserPlatformOnboarding { ... }
export interface UserCredential { ... }  // Never includes encrypted data
export interface GigSource { ... }
export interface GigListing { ... }      // Includes rate/duration/engagement fields
export interface GigMatch { ... }        // Includes rate_assessment, availability_fit, proposal_tips
```

### New: `shared/src/api/gig.types.ts`

API request/response contracts following existing pattern.

### Update: `shared/src/queue.types.ts`

Add `'gig'` and `'gig_scrape'` to `QUEUE_ITEM_TYPES` array.

---

## Backend Modules

All new modules in `job-finder-BE/server/src/modules/`:

| Module | Path | Auth | Description |
|--------|------|------|-------------|
| `gig-platforms` | `/api/gig-platforms` | Public read, admin write | Platform catalog CRUD |
| `gig-onboarding` | `/api/gig-onboarding` | Authenticated, user-scoped | Onboarding state tracker |
| `gig-credentials` | `/api/gig-credentials` | Authenticated, user-scoped | Encrypted credential CRUD + verify |
| `gig-sources` | `/api/gig-sources` | Authenticated, user-scoped | Per-user gig source management |
| `gig-listings` | `/api/gig-listings` | Authenticated, user-scoped | Per-user gig listing reads |
| `gig-matches` | `/api/gig-matches` | Authenticated, user-scoped | Per-user gig match reads + status updates |
| `gig-queue` | `/api/gig-queue` | Authenticated, user-scoped | Gig scrape/submit triggers |

Each module follows the existing pattern: `repository.ts` + `routes.ts` (+ `service.ts` where needed).

**Credential security boundary:** The worker accesses decrypted credentials via an internal endpoint `POST /api/gig-credentials/internal/:id/decrypt` protected by `verifyWorkerToken()` middleware. The public API never returns decrypted credential data.

---

## Worker Components

All new files in `job-finder-worker/src/job_finder/gig/`:

### `credential_injector.py`
Fetches decrypted credentials from the BE internal endpoint and merges into scraper `SourceConfig` (headers, api_key, auth fields). Credentials held in memory only during a single scrape operation.

### `gig_scraper_intake.py`
Parallels `ScraperIntake` for gigs. User-scoped deduplication (`UNIQUE(user_id, url)` on `gig_listings`). Gig-specific pre-filtering on rate, duration, engagement type, skills.

### `gig_processor.py`

```python
class GigProcessor(BaseProcessor):
    def process_gig(self, item):
        """Lighter pipeline: SCRAPE -> CREATE_LISTING -> SKILLS_MATCH -> RATE_ANALYSIS -> SAVE"""

    def process_gig_scrape(self, item):
        """Scrape user's active gig sources with credential injection."""
```

### Storage modules
- `gig_storage.py` — `GigListingStorage`, `GigMatchStorage`, `GigSourcesManager` (all user-scoped)

### Dispatch update
In `job_queue/processor.py`, add routing for `QueueItemType.GIG` → `GigProcessor.process_gig()` and `QueueItemType.GIG_SCRAPE` → `GigProcessor.process_gig_scrape()`.

### ProcessorContext extension
Add optional gig storage and credential injector fields to `ProcessorContext` dataclass.

---

## Frontend Pages

### Platform Discovery (`/gig-platforms`) — PUBLIC
Card grid of platforms from catalog. Each card shows name, description, access type badge, fee structure, skills tags. "Start Tracking" button requires auth and creates onboarding record.

### Onboarding Tracker (`/gig-onboarding`) — AUTHENTICATED
Table or kanban showing all tracked platforms by status. Status transitions: not_started → researching → applied → vetting → vetted → active. When status reaches `vetted`, prompts to add credentials. When `active`, enables gig source creation.

### Credential Management (`/gig-credentials`) — AUTHENTICATED
List of stored credentials per platform. Add/delete/verify actions. Validity indicators. Encrypted data never displayed.

### Gig Sources (`/gig-sources`) — AUTHENTICATED
Mirrors Sources page but user-scoped. Add from platform template or custom config. Manual scrape trigger.

### Gig Pipeline (`/gig-pipeline`) — AUTHENTICATED
Two tabs: Listings (with gig-specific columns: rate, duration, engagement type, platform) and Matches (with deal pipeline: active → interested → applied → interviewing → won/lost). Stats pills at top.

### Navigation
Add "Freelance" section to sidebar with links to all gig pages.

---

## Path 1 → Path 2 Conversion Flow

1. User browses **Platform Discovery** (public, no auth needed)
2. Clicks "Start Tracking" → creates onboarding record (`not_started`)
3. User progresses through: `researching` → `applied` → `vetting` (manual status updates with notes/dates)
4. User marks `vetted`:
   - If platform is `credential_gated`, UI prompts to add credentials
   - System auto-creates a gig source from platform's `scrape_config_template`
5. User marks `active`:
   - Validates credentials exist (for gated platforms)
   - Enables the gig source for scraping
   - User is now in **Path 2** — gig pipeline is live

---

## Key Architectural Decisions

1. **Separate tables, not user_id on existing tables.** Avoids migration risk on the stable job pipeline. Gig data is user-scoped from birth.

2. **Queue carries user_id in input blob.** No schema change to `job_queue` table. `GigProcessor` extracts `user_id` from `item.input` for all scoped operations.

3. **GenericScraper reused via config injection.** Platform differences captured in `scrape_config_template`. `CredentialInjector` merges secrets into config before scrape. No platform-specific scraper code.

4. **Server-side encryption only.** Credentials encrypted at rest, decrypted only for worker consumption via internal API. Never exposed to frontend.

5. **Onboarding as conversion bridge.** Status transitions in `user_platform_onboarding` drive downstream actions (credential prompts, source auto-creation), making the Path 1 → 2 flow discoverable.

---

## Implementation Order

| Batch | Scope | Key Files |
|-------|-------|-----------|
| 1. Foundation | Migrations 065-068, encryption service, shared types, queue type extensions | `infra/sqlite/migrations/065-068_*.sql`, `shared/src/gig.types.ts`, `BE/utils/encryption.ts` |
| 2. Backend Read Path | Platform catalog, onboarding, credentials modules | `BE/modules/gig-platforms/`, `gig-onboarding/`, `gig-credentials/` |
| 3. Frontend Discovery | API clients, Platform Discovery page, Onboarding Tracker, Credential Management | `FE/pages/gig-platforms/`, `gig-onboarding/`, `gig-credentials/` |
| 4. Worker Pipeline | Gig storage, credential injector, gig scraper intake, GigProcessor, dispatch updates | `worker/gig/gig_processor.py`, `gig_storage.py`, `credential_injector.py` |
| 5. Backend Write Path | Gig sources, listings, matches modules, gig queue routes | `BE/modules/gig-sources/`, `gig-listings/`, `gig-matches/` |
| 6. Frontend Pipeline | Gig Sources page, Gig Pipeline page (listings + matches) | `FE/pages/gig-sources/`, `gig-pipeline/` |
| 7. Integration | Path 1→2 flow, platform config templates, gig pre-filtering, nav updates | Cross-cutting |

---

## Verification

1. **Encryption round-trip**: encrypt → store → decrypt produces original plaintext; tampered ciphertext throws
2. **User isolation**: User A's gig data invisible to User B (repository-level WHERE user_id = ?)
3. **Credential security**: API responses never contain `encrypted_data`; worker internal endpoint requires `WORKER_WS_TOKEN`
4. **Scrape pipeline**: Submit gig source → trigger gig_scrape → gig_listings created → GigProcessor → gig_matches saved
5. **Onboarding flow**: Browse platforms → track → vet → add credentials → auto-create source → scrape gigs
6. **Queue dispatch**: New `gig` and `gig_scrape` item types correctly routed to `GigProcessor`
