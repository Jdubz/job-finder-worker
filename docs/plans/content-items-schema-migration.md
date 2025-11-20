> Status: In Progress
> Owner: @jdubz
> Last Updated: 2025-11-20

# Content Items Unified Schema Migration

## Context
- The current SQLite table (`job-finder-BE/server/src/db/migrations/001_initial_schema.sql`) mirrors the legacy Firestore union schema with a `type` discriminator and arbitrary `body_json`. Frontend code (e.g., `job-finder-FE/src/pages/content-items/ContentItemsPage.tsx`, `components/content-types/*`) still assumes per-type fields and renders large swaths of optional UI that no longer align with the desired resume model.
- The exported legacy data (`docs/content-items-export.json`) contains inconsistent properties (`name`, `description`, `technologies`, etc.) that no longer map to the simplified structure the business now needs (Title, Role, Location, Website, Start/End dates, Markdown description, Skills, Parent relationship, ordering, visibility).
- Back-end routes (`job-finder-BE/server/src/modules/content-items/content-item.routes.ts`) simply pass JSON blobs through to SQLite without validation enforcing the new schema, and `shared/src/content-item.types.ts` still describes the union of legacy item types.
- Front-end hooks and components (`useContentItems`, `ContentItemDialog`, `ContentItemDialogV2`, `components/content-types/*`, `components/ProfileSectionList`, etc.) render bespoke layouts per type and expose legacy fields in forms, which contradicts the new single nested model requirement.
- Existing tests (unit + e2e) target old behaviors (type-specific editing, optional import/export flows) and will fail once the schema/UI changes.

## Target Model
All content items share the same shape:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `parent_id` | UUID nullable | References another content item (null = root) |
| `order_index` | integer | Defines ordering within the parent (dense ascending) |
| `title` | text nullable | Displayed heading |
| `role` | text nullable | Subtitle (job title / relationship) |
| `location` | text nullable | Human-readable location |
| `website` | text nullable | External link (https://...) |
| `start_date` | text nullable | ISO `YYYY-MM` string |
| `end_date` | text nullable | ISO `YYYY-MM` string, null for present |
| `description` | text nullable | Markdown body rendered in UI |
| `skills` | json (text) | Array of strings |
| `visibility` | enum | Reuse `published|draft|archived` |
| `created_at/updated_at`, `created_by/updated_by` | timestamp / text | existing auditing |

No other free-form `body_json` or `type` discriminator is required. Child content items inherit the same schema. All fields are optional; UI must omit empty properties.

## Migration Plan

### 1. Database & Shared Types
1. Add a new SQL migration (`infra/sqlite/migrations/005_content_items_unify.sql`):
   - Create temporary table `content_items_new` with the target columns above.
   - Copy data from `content_items` by mapping legacy fields (example mapping table below) and flattening `body_json` keys where available.
   - Drop the old table and rename `content_items_new` → `content_items`.
   - Create indexes on `(parent_id, order_index)` and `visibility`.

   | Legacy source | Target field | Notes |
   | --- | --- | --- |
   | `body_json.title`/`name`/`heading` | `title` | choose first non-null |
   | `body_json.role`/`company` | `role` |
   | `body_json.location` | `location` |
   | `body_json.website`/`url` | `website` |
   | `body_json.startDate` | `start_date` | normalize to YYYY-MM |
   | `body_json.endDate` | `end_date` |
   | `body_json.description`/`summary`/`content` | `description` |
   | `body_json.skills`/`technologies` | `skills` array |
   | `parent_id`, `order_index`, `visibility`, audit fields | carry over |

2. Update `shared/src/content-item.types.ts` to define a single `ContentItem` interface that mirrors the table fields (remove old union types, `CreateContentItemData` variants, etc.). Update all shared exports consumed by FE/BE.
3. Adjust `job-finder-BE/server/src/modules/content-items/content-item.repository.ts` to:
   - Remove `type`-specific logic and `body_json` storage.
   - Serialize `skills` as JSON text.
   - Enforce ordering semantics when creating/updating/deleting items (shift siblings after inserts, pull gaps after deletes).
4. Update request validation in `content-item.routes.ts` (zod schema) to match the new structure (optional fields, arrays) and remove unused enums (`contentItemTypes`, `visibilityValues` still used).
5. Remove legacy references to `ContentItemType`, `CreateContentItemData`, etc., in API handlers and `@shared/types` consumers.

### 2. API Contract & Services
1. Replace the current generic `list` query with a version that returns nested items (parent followed by sorted children). Provide an optional `includeDrafts` filter.
2. Introduce reorder endpoints:
   - `POST /api/content-items/:id/reorder` with `{ parentId, orderIndex }` to move items between parents or re-sequence siblings.
   - Update repository layer to support atomic reorder operations (SQL transaction updating siblings’ `order_index`).
3. Keep CRUD endpoints but ensure responses emit the flattened shape.
4. Delete dead code paths related to type-specific behaviors, including any unused routes or services in `job-finder-BE/server/src/modules/content-items`.

### 3. Frontend Architecture
1. Remove legacy type-specific components under `job-finder-FE/src/pages/content-items/components/content-types/*`, `CompanyList`, `ProjectList`, `EducationList`, etc. Replace with a single `ContentItemCard` component that:
   - Displays the defined fields (title, role, location, dates, description rendered as Markdown, website link, skill chips) only if present.
   - Recursively renders child cards beneath the parent content.
2. Implement inline edit mode per item:
   - Card header actions toggling between read-only and edit states.
   - Edit state renders a form built from reusable `FormField` components that map to the schema fields.
   - Buttons: `Save` (PATCH), `Delete`, `Add Child`. `Add Child` opens a blank child form, pre-populated with `parentId`.
3. Update `useContentItems` hook to:
   - Consume the new nested response.
   - Add helpers for `reorderItems`, `moveToParent`, `appendChild`.
4. Refresh import/export utilities to align with the new schema (CSV/JSON representing the flattened fields). Remove `ContentItemDialogV2`, `ContentItemDialog`, `ContentItemsHierarchy` components that were only needed for type unions.
5. Update API client (`job-finder-FE/src/api/content-items-client.ts`) to match the new contract (payload interface, reorder endpoint, nested response typing) and delete unused fields.
6. Simplify `@/types/content-items` to the new interface and delete `ContentItemWithChildren` wrappers if the API already returns nested arrays.
7. Ensure drag-and-drop or button-based reorder UI is available (could reuse existing list reordering components from other pages if available; otherwise, build new controls).
8. Remove redundant UI flows (legacy experience vs. content items) so this page is the single source of truth.

### 4. Data Migration Execution
1. Write a Node script (`scripts/migrate-content-items.js`) that:
   - Reads the new SQLite schema.
   - Imports `docs/content-items-export.json`, normalizes fields, and inserts them via the repository.
   - Optionally, keep a seed file for local dev under `infra/sqlite/seeders` reflecting the new shape.
2. Document the manual steps in `docs/worker/runbooks/operations/content-items-migration.md` (apply migration, run script, verify counts).

### 5. Testing Impact
- **Backend unit/integration**:
  - Add repository tests covering CRUD, nested fetch, and reorder operations (`job-finder-BE/server/src/modules/content-items/__tests__/*` – currently missing, must be created).
  - Update any shared type tests if present.
- **Frontend unit**:
  - `job-finder-FE/src/pages/content-items/__tests__/ContentItemsPage.test.tsx` and `hooks/__tests__/useContentItems.test.ts` must be rewritten for the new schema (single form, nested rendering, reorder actions).
  - Remove tests tied to type-specific components.
- **E2E**:
  - Update Playwright specs (`job-finder-FE/e2e/admin-route-protection.spec.ts`, `authenticated-viewer.spec.ts`, `unauthenticated-user.spec.ts`) to exercise the new UI by creating/editing nested items, verifying reorder, and ensuring unauthenticated users still see read-only content.
  - Add a new E2E test focused on drag/drop or reorder API usage.

### 6. Code Removal Checklist
- Delete unused `content-item` component directories and dialogs.
- Remove legacy helper utilities referencing specific types (search `type === "company"`, etc.).
- Purge unused fields from `docs/content-items-export.json` once migration completes.
- Drop deprecated Firestore references (`docs/archive/.../content-items`).

### 7. Rollout Steps
1. Land the schema + shared types change behind a feature branch (`content-items-redux`).
2. Update backend API + tests, deploy to staging docker instance.
3. Update frontend UI + tests, deploy preview, run all e2e suites.
4. Execute migration SQL + data import on production host (Watchtower-managed stack) during scheduled maintenance.
5. Remove legacy docs and mark new plan complete.

## Progress Log
- **2025-11-20** — Added SQLite migration `005_content_items_unify.sql` to reshape the `content_items` table into the new schema (title/role/location/etc.), copy legacy data with `json_extract`, and recreate indexes.
