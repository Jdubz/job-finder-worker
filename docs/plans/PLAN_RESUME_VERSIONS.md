> Status: Draft
> Owner: @jdubz
> Last Updated: 2026-03-08

# Plan: Resume Versions — Static Document Management System

Replace the per-application AI resume generation pipeline with a curated set of pre-built, role-targeted resume versions. Each version is hand-polished, stored as structured content, and published as a single PDF. The job applicator selects the best-fit version instead of generating a new document for every application.

## Problem

The current system generates a new resume from scratch for every job application:

1. **Redundant generation** — AI produces nearly identical resumes for similar roles (e.g., three "Senior Frontend Engineer" applications yield three 95%-identical PDFs)
2. **Approval bottleneck** — Every generation requires manual review via `ResumeReviewForm` before the PDF is rendered, blocking the applicator flow
3. **Quality inconsistency** — AI output varies between runs; minor phrasing differences across applications rather than one polished version
4. **Cost** — Each generation is 2-3 LiteLLM/Claude calls (generate + optional refit + optional cover letter)
5. **Latency** — Generation + review + render adds minutes per application, slowing bulk application workflows

In practice, there are only a handful of distinct role categories being applied to. A small set of highly polished, version-controlled resumes covers all target roles.

## Solution

### Core concept

Replace per-application generation with **5 curated resume versions**, each targeting a role category:

| Slug | Name | Target Roles |
|------|------|-------------|
| `frontend` | Frontend Engineer | React, TypeScript, UI/UX, design systems |
| `fullstack` | Full Stack Engineer | End-to-end web, Node + React, APIs |
| `backend` | Backend Engineer | APIs, distributed systems, databases, infra |
| `ai` | AI / ML Engineer | LLMs, ML pipelines, data engineering, AI tooling |
| `solution-engineer` | Solution Engineer | Pre-sales, technical consulting, integrations |

Each version stores its content as structured items (like `content_items`) and renders to PDF on admin publish. The applicator picks the best-fit version per job.

### What changes

| Component | Before | After |
|-----------|--------|-------|
| Resume content | AI-generated per application | Pre-authored, stored in `resume_items` table |
| PDF creation | Per-application via Playwright after AI + review | On-demand admin publish via same Playwright pipeline |
| Applicator selection | Dropdown of per-job generated docs | Dropdown of 5 resume versions |
| MCP agent | Uploads pre-selected doc blindly | Can query versions and select best fit |
| Document Builder page | AI generation wizard with review form | Removed |
| Documents page | History of generated artifacts | Removed |
| New: Resume Versions page | N/A | Content editor + publish + download |

### What stays the same

- **PDF rendering pipeline** — `atsResumeHtml()` + `HtmlPdfService.renderResume()` + `injectPdfMetadata()` are reused as-is
- **Cover letter generation** — Untouched; still generated per-application via the existing generator workflow
- **Content items** — The master content items page remains as the source-of-truth for all experience/project/skill data. Resume versions reference similar structured data but are independent copies tailored per version.
- **Auth model** — Same Google OAuth + roles. Admin = edit/publish, public = view/download.

---

## Database Design

### Migration 062: `resume_versions` + `resume_items`

#### `resume_versions`

Stores the 5 resume types with their publish state.

```sql
CREATE TABLE resume_versions (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  pdf_path      TEXT,              -- relative path to published PDF (null = unpublished)
  pdf_size_bytes INTEGER,
  published_at  TEXT,              -- ISO timestamp of last publish
  published_by  TEXT,              -- email of admin who published
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

**Seed data** (inserted by migration):

```sql
INSERT INTO resume_versions (id, slug, name, description, created_at, updated_at) VALUES
  ('rv-frontend',         'frontend',          'Frontend Engineer',    'React, TypeScript, UI/UX, design systems',               NOW, NOW),
  ('rv-fullstack',        'fullstack',         'Full Stack Engineer',  'End-to-end web development, Node + React, APIs',         NOW, NOW),
  ('rv-backend',          'backend',           'Backend Engineer',     'APIs, distributed systems, databases, infrastructure',    NOW, NOW),
  ('rv-ai',               'ai',                'AI / ML Engineer',     'LLMs, ML pipelines, data engineering, AI tooling',       NOW, NOW),
  ('rv-solution-engineer', 'solution-engineer', 'Solution Engineer',   'Pre-sales, technical consulting, integrations',          NOW, NOW);
```

#### `resume_items`

Mirrors `content_items` schema with an added `resume_version_id` foreign key. Flat table with parent-child nesting via `parent_id`.

```sql
CREATE TABLE resume_items (
  id                 TEXT PRIMARY KEY,
  resume_version_id  TEXT NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  parent_id          TEXT REFERENCES resume_items(id) ON DELETE SET NULL,
  order_index        INTEGER NOT NULL DEFAULT 0,
  ai_context         TEXT CHECK (ai_context IN ('work', 'highlight', 'project', 'education', 'skills', 'narrative', 'section')),
  title              TEXT,
  role               TEXT,
  location           TEXT,
  website            TEXT,
  start_date         TEXT,       -- YYYY-MM format
  end_date           TEXT,       -- YYYY-MM format
  description        TEXT,
  skills             TEXT,       -- JSON array stored as TEXT
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  created_by         TEXT NOT NULL,
  updated_by         TEXT NOT NULL
);

CREATE INDEX idx_resume_items_version ON resume_items(resume_version_id);
CREATE INDEX idx_resume_items_parent  ON resume_items(parent_id);
```

**Nesting convention** (same as `content_items`):

```
resume_items (for version "frontend"):
├── ai_context: 'narrative'    → Professional summary
├── ai_context: 'section'      → "Experience" container
│   ├── ai_context: 'work'     → Company + role
│   │   ├── ai_context: 'highlight' → Achievement bullet
│   │   └── ai_context: 'highlight' → Achievement bullet
│   └── ai_context: 'work'     → Another role
├── ai_context: 'section'      → "Projects" container
│   └── ai_context: 'project'  → Project entry
├── ai_context: 'section'      → "Skills" container
│   └── ai_context: 'skills'   → Skill category + items
└── ai_context: 'section'      → "Education" container
    └── ai_context: 'education' → Degree entry
```

---

## Shared Types

### `shared/src/resume-version.types.ts`

```typescript
import type { ContentItemAIContext } from './content-item.types'
import type { TimestampJson } from './schemas/timestamp.schema'

/** The 5 resume version slugs */
export type ResumeVersionSlug =
  | 'frontend'
  | 'fullstack'
  | 'backend'
  | 'ai'
  | 'solution-engineer'

export interface ResumeVersion {
  id: string
  slug: ResumeVersionSlug
  name: string
  description: string | null
  pdfPath: string | null        // relative artifact path (null = unpublished)
  pdfSizeBytes: number | null
  publishedAt: TimestampJson | null
  publishedBy: string | null
  createdAt: TimestampJson
  updatedAt: TimestampJson
}

export interface ResumeItem {
  id: string
  resumeVersionId: string
  parentId: string | null
  order: number
  aiContext: ContentItemAIContext | null
  title: string | null
  role: string | null
  location: string | null
  website: string | null
  startDate: string | null
  endDate: string | null
  description: string | null
  skills: string[] | null
  createdAt: TimestampJson
  updatedAt: TimestampJson
  createdBy: string
  updatedBy: string
}

export type ResumeItemNode = ResumeItem & {
  children?: ResumeItemNode[]
}

export type CreateResumeItemData = {
  parentId?: string | null
  order?: number
  aiContext?: ContentItemAIContext | null
  title?: string | null
  role?: string | null
  location?: string | null
  website?: string | null
  startDate?: string | null
  endDate?: string | null
  description?: string | null
  skills?: string[] | null
}

export type UpdateResumeItemData = Partial<CreateResumeItemData>
```

### `shared/src/api/resume-version.types.ts`

```typescript
import type { ResumeVersion, ResumeItem, ResumeItemNode, CreateResumeItemData, UpdateResumeItemData } from '../resume-version.types'

// --- Version endpoints ---

export interface ListResumeVersionsResponse {
  versions: ResumeVersion[]
}

export interface GetResumeVersionResponse {
  version: ResumeVersion
  items: ResumeItemNode[]   // full tree for this version
}

export interface PublishResumeVersionResponse {
  version: ResumeVersion    // updated with new pdfPath, publishedAt, etc.
  message: string
}

// --- Item endpoints ---

export interface ListResumeItemsResponse {
  items: ResumeItemNode[]
  total: number
}

export interface CreateResumeItemRequest {
  itemData: CreateResumeItemData
  userEmail: string
}

export interface CreateResumeItemResponse {
  item: ResumeItem
  message: string
}

export interface UpdateResumeItemRequest {
  itemData: UpdateResumeItemData
  userEmail: string
}

export interface UpdateResumeItemResponse {
  item: ResumeItem
  message: string
}

export interface DeleteResumeItemResponse {
  itemId: string
  deleted: boolean
  message: string
}

export interface ReorderResumeItemRequest {
  parentId?: string | null
  orderIndex: number
  userEmail: string
}

export interface ReorderResumeItemResponse {
  item: ResumeItem
}
```

Both files exported from `shared/src/index.ts`.

---

## Backend API

### Module: `modules/resume-versions/`

Files:
- `resume-version.repository.ts` — Database access (mirrors `content-item.repository.ts` patterns)
- `resume-version.routes.ts` — Express router
- `resume-version.publish.ts` — Transform items → `ResumeContent` → PDF

### Endpoints

All mounted at `/api/resume-versions`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Public | List all 5 versions with publish status |
| GET | `/:slug` | Public | Get version detail + full item tree |
| GET | `/:slug/items` | Public | Get items as nested tree |
| POST | `/:slug/items` | Admin | Create a new item |
| PATCH | `/:slug/items/:id` | Admin | Update an item |
| DELETE | `/:slug/items/:id` | Admin | Delete an item; children become root-level items (parent_id set to NULL) |
| POST | `/:slug/items/:id/reorder` | Admin | Reorder/reparent an item |
| POST | `/:slug/publish` | Admin | Render PDF and update version |
| GET | `/:slug/pdf` | Public | Stream the published PDF file |

### Publish Flow

`POST /:slug/publish` performs:

1. **Load items** — Fetch all `resume_items` for this version as a tree
2. **Transform to ResumeContent** — Map the nested item tree into the existing `ResumeContent` interface:
   - `narrative` items → `personalInfo.summary` / `professionalSummary`
   - `work` items → `experience[]` (children with `highlight` → `highlights[]`)
   - `project` items → `projects[]`
   - `skills` items → `skills[]` (title = category, skills JSON = items)
   - `education` items → `education[]`
   - Personal info (name, email, contact) from the existing `PersonalInfo` config
3. **Render PDF** — Call `HtmlPdfService.renderResume(resumeContent, personalInfo)`
4. **Store artifact** — Save to `/data/artifacts/resumes/{slug}.pdf` (stable path, overwritten on each publish)
5. **Update version record** — Set `pdf_path`, `pdf_size_bytes`, `published_at`, `published_by`
6. **Return** updated `ResumeVersion`

### Route Registration (`app.ts`)

```typescript
// Resume versions — public read, admin mutations + publish
const resumeVersionMutationGuards: RequestHandler[] = [verifyFirebaseAuth, requireRole('admin')]
app.use('/api/resume-versions', buildResumeVersionRouter({ mutationsMiddleware: resumeVersionMutationGuards }))
```

Placed in the public section (before the `app.use('/api', verifyFirebaseAuth)` catch-all), same pattern as content-items.

---

## Frontend

### New Route

```typescript
// routes.ts
RESUMES: "/resumes"

// router.tsx — public route (editing gated inside component)
{ path: ROUTES.RESUMES, element: <LazyPage><ResumeVersionsPage /></LazyPage> }
```

### Page: `pages/resume-versions/ResumeVersionsPage.tsx`

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│  Resume Versions                          [Edit Mode] 🔒 │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│ ● Frontend │  Frontend Engineer Resume                   │
│   Fullstack│  "React, TypeScript, UI/UX, design systems" │
│   Backend  │                                             │
│   AI       │  Published: Mar 7, 2026                     │
│   Solution │  [Download PDF]  [Publish Changes] 🔒       │
│   Engineer │                                             │
│            │  ┌─ Professional Summary ──────────────────┐│
│            │  │  Full-stack engineer with 8+ years...   ││
│            │  └────────────────────────────────────────-┘│
│            │  ┌─ Experience ───────────────────────────-┐│
│            │  │  ├─ AWS — Solutions Architect           ││
│            │  │  │   ├─ Led migration of...             ││
│            │  │  │   └─ Built CI/CD pipeline...         ││
│            │  │  └─ Acme Corp — Senior Engineer         ││
│            │  └────────────────────────────────────────-┘│
│            │  ┌─ Skills ──────────────────────────────-─┐│
│            │  │  └─ Languages: TypeScript, Python...    ││
│            │  └────────────────────────────────────────-┘│
│            │  ... (projects, education)                   │
└────────────┴─────────────────────────────────────────────┘
```

**Behavior:**
- Left sidebar: version selector (active version highlighted)
- Right panel: nested item tree for selected version
- **Public users**: View items, download PDF
- **Admin (edit mode)**: Add/edit/delete/reorder items, publish button
- Reuses `ContentItemCard` / `ContentItemForm` component patterns (may share or fork)
- Publish button triggers `POST /resume-versions/:slug/publish`, shows loading state, refreshes version data on success

### Components

| Component | Description |
|-----------|-------------|
| `ResumeVersionsPage.tsx` | Main page with version sidebar + item panel |
| `ResumeVersionSidebar.tsx` | Version list with selection, publish status badges |
| `ResumeItemCard.tsx` | Recursive nested item display/edit (fork of `ContentItemCard`) |
| `ResumeItemForm.tsx` | Create/edit form for items (fork of `ContentItemForm`) |

### API Client

```typescript
// api/resume-versions-client.ts
export class ResumeVersionsClient extends BaseApiClient {
  async listVersions(): Promise<ResumeVersion[]>
  async getVersion(slug: string): Promise<GetResumeVersionResponse>
  async getItems(slug: string): Promise<ResumeItemNode[]>
  async createItem(slug: string, userEmail: string, data: CreateResumeItemData): Promise<ResumeItem>
  async updateItem(slug: string, id: string, userEmail: string, data: UpdateResumeItemData): Promise<ResumeItem>
  async deleteItem(slug: string, id: string): Promise<void>
  async reorderItem(slug: string, id: string, userEmail: string, parentId: string | null, orderIndex: number): Promise<ResumeItem>
  async publish(slug: string): Promise<PublishResumeVersionResponse>
  getPdfUrl(slug: string): string  // returns download URL
}
```

### Hook

```typescript
// hooks/useResumeVersion.ts
export function useResumeVersion(slug: string): {
  version: ResumeVersion | null
  items: ResumeItemNode[]
  loading: boolean
  error: Error | null
  createItem: (data: CreateResumeItemData) => Promise<ResumeItem>
  updateItem: (id: string, data: UpdateResumeItemData) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  reorderItem: (id: string, parentId: string | null, orderIndex: number) => Promise<void>
  publish: () => Promise<void>
  refetch: () => Promise<void>
}
```

### Removed Pages

- `DocumentBuilderPage` — Remove route, keep file for reference during transition
- `DocumentsPage` — Remove route, keep file for reference during transition
- `ResumeReviewForm` component — No longer needed

### Navigation

Update `MainLayout` sidebar:
- Remove "Document Builder" and "Documents" nav items
- Add "Resumes" nav item (public, between "Content Items" and "AI Prompts")

---

## Job Applicator Changes

### Renderer (`src/renderer/app.ts`)

**Replace document selection UI:**

Before:
```html
<select id="resumeSelect">   <!-- per-job generated docs -->
<select id="coverLetterSelect">
```

After:
```html
<select id="resumeVersionSelect">  <!-- 5 resume versions -->
  <option value="frontend">Frontend Engineer (published Mar 7)</option>
  <option value="fullstack">Full Stack Engineer (published Mar 5)</option>
  ...
</select>
<select id="coverLetterSelect">  <!-- keep as-is for cover letters -->
```

**Changes:**
- On app load: fetch `GET /api/resume-versions` to populate dropdown
- Only show versions that have `pdfPath` (published)
- Store `selectedResumeVersionSlug` instead of `selectedResumeId`
- Upload button uses version PDF URL instead of generator artifact URL
- Auto-select logic: if job context available, pre-select best-fit version based on role keywords

### Main Process (`src/main.ts`)

**`fill-form` handler changes:**
- Accept `resumeVersionSlug` instead of `resumeUrl` in options
- Download version PDF: `GET /api/resume-versions/{slug}/pdf` → temp file
- Pass to `setDocumentPaths({ resumePath, coverLetterPath })`
- Rest of upload flow unchanged (CDP file setting)

### API Client (`src/api-client.ts`)

Add:
```typescript
async fetchResumeVersions(): Promise<ResumeVersion[]>
async downloadResumeVersionPdf(slug: string): Promise<string>  // returns temp file path
```

### MCP Server

#### New Tool: `get_resume_versions`

```typescript
{
  name: "get_resume_versions",
  description:
    "Get available resume versions. Each version targets a specific role category. " +
    "Use this to decide which resume to upload based on the job being applied to. " +
    "Returns version slugs, names, descriptions, and publish dates.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
}
```

Returns:
```json
{
  "versions": [
    { "slug": "frontend", "name": "Frontend Engineer", "description": "React, TypeScript, UI/UX..." },
    { "slug": "fullstack", "name": "Full Stack Engineer", "description": "..." },
    ...
  ]
}
```

#### Modified Tool: `upload_file`

The `type: "resume"` path changes to use the pre-selected version PDF (set during `fill-form`). No schema change needed — the version selection happens before the agent starts. The agent still calls `upload_file` with `type: "resume"` and the correct file is already staged.

However, the agent prompt should be updated to mention that it can call `get_resume_versions` to verify the right version was selected, and suggest a different one if the pre-selected version doesn't match the role.

#### Tool Executor (`src/tool-executor.ts`)

Add handler for `get_resume_versions`:
- Calls backend API `GET /api/resume-versions`
- Returns formatted version list

### Agent Prompt Update

Update the fill-form prompt to include:
```
A resume has been pre-selected for this application. You can call get_resume_versions
to see all available versions and verify the selection is appropriate for the role.
The resume will be uploaded as a PDF — you cannot modify its contents.
```

---

## Cleanup & Deprecation

### Hard Removals (this PR)

| Item | Location | Action |
|------|----------|--------|
| `DocumentBuilderPage` route | `router.tsx` | Remove route entry |
| `DocumentsPage` route | `router.tsx` | Remove route entry |
| `DOCUMENT_BUILDER` constant | `routes.ts` | Remove |
| `DOCUMENTS` constant | `routes.ts` | Remove |
| Nav links to Document Builder / Documents | `MainLayout` sidebar | Remove |
| Resume generation in applicator `loadDocuments()` | `renderer/app.ts` | Replace with version fetch |
| `generateBtn` / generation UI | `renderer/app.ts` | Remove |

### Soft Deprecation (keep code, remove routes)

| Item | Reason to Keep |
|------|---------------|
| `GeneratorWorkflowService` | Still needed for cover letter generation |
| `HtmlPdfService` | Reused by resume version publish |
| `ResumeReviewForm` component | May be useful reference; delete after feature stabilizes |
| `generator_requests` table | Historical data; no schema change needed |
| `document_cache` table | Still used for cover letter caching |

### Config/Route Changes in `app.ts`

```diff
  // Remove or comment out:
- app.use('/api/generator', generatorSelectivePublicRead, generatorPipeline)

  // Keep generator for cover letters only (if still needed):
+ app.use('/api/generator', generatorSelectivePublicRead, generatorPipeline)  // cover letters only

  // Add:
+ const resumeVersionMutationGuards: RequestHandler[] = [verifyFirebaseAuth, requireRole('admin')]
+ app.use('/api/resume-versions', buildResumeVersionRouter({ mutationsMiddleware: resumeVersionMutationGuards }))
```

The generator pipeline stays mounted for cover letter generation. Resume-specific generator endpoints are no longer called by any client code but remain functional for backward compatibility.

---

## Implementation Order

### Phase 1: Data Layer
1. Migration `062_resume_versions.sql`
2. Shared types (`resume-version.types.ts`, `api/resume-version.types.ts`)
3. Export from `shared/src/index.ts`

### Phase 2: Backend
4. `ResumeVersionRepository` (versions + items CRUD)
5. `resume-version.routes.ts` (all endpoints except publish)
6. `resume-version.publish.ts` (items → ResumeContent transform + PDF render)
7. Register in `app.ts`

### Phase 3: Frontend
8. `ResumeVersionsClient` API client
9. `useResumeVersion` hook
10. `ResumeVersionsPage` + components
11. Route registration + nav updates
12. Remove Document Builder / Documents routes and nav

### Phase 4: Job Applicator
13. API client additions (`fetchResumeVersions`, version PDF download)
14. Renderer UI changes (version dropdown replacing doc dropdown)
15. Main process changes (`fill-form` uses version PDF)
16. MCP tool additions (`get_resume_versions`)
17. Agent prompt updates

### Phase 5: Testing & Cleanup
18. Manual test: create items for one version, publish, verify PDF
19. Manual test: applicator selects version, uploads to job site
20. Remove deprecated nav items and routes
21. Update memory/docs

---

## Open Questions

1. **Should admins be able to add/remove resume versions?** Current plan seeds 5 fixed versions. Adding a UI for version CRUD is more work. Recommendation: fixed for now, table supports adding more via migration later.

2. **Should resume items be seeded from existing content_items?** Could auto-populate each version with a copy of current content items as a starting point. Recommendation: yes, write a one-time seed script (not a migration) that copies content_items into each version.

3. **Cover letter strategy** — The current generator still works for cover letters. Should it remain as-is, or should cover letters also become version-based? Recommendation: leave as-is for now; cover letters are more per-application by nature.

4. **Version auto-selection in applicator** — How should the agent/UI decide which version to use? Options:
   - Simple keyword matching on job title (current plan)
   - Store a `keywords` column on `resume_versions` for matching
   - Let the MCP agent decide using `get_resume_versions` + job context
   Recommendation: all three — keyword column for UI auto-select, agent uses `get_resume_versions` tool for its own judgment.
