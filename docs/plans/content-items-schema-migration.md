# Content Items Unified Schema Migration

## Context
- The current SQLite table () mirrors the legacy Firestore union schema with a  discriminator and arbitrary . Frontend code (e.g., , ) still assumes per-type fields and renders large swaths of optional UI that no longer align with the desired resume model.
- The exported legacy data () contains inconsistent properties (, , , etc.) that no longer map to the simplified structure the business now needs (Title, Role, Location, Website, Start/End dates, Markdown description, Skills, Parent relationship, ordering, visibility).
- Back-end routes () simply pass JSON blobs through to SQLite without validation enforcing the new schema, and  still describes the union of legacy item types.
- Front-end hooks and components (, , , , , etc.) render bespoke layouts per type and expose legacy fields in forms, which contradicts the new single nested model requirement.
- Existing tests (unit + e2e) target old behaviors (type-specific editing, optional import/export flows) and will fail once the schema/UI changes.

## Target Model
All content items share the same shape:

| Field | Type | Notes |
| --- | --- | --- |
| uid=1000(jdubz) gid=1000(jdubz) groups=1000(jdubz),4(adm),24(cdrom),27(sudo),30(dip),46(plugdev),100(users),114(lpadmin),983(docker) | UUID | Primary key |
|  | UUID nullable | References another content item (null = root) |
|  | integer | Defines ordering within the parent (dense ascending) |
|  | text nullable | Displayed heading |
|  | text nullable | Subtitle (job title / relationship) |
|  | text nullable | Human-readable location |
|  | text nullable | External link (https://...) |
|  | text nullable | ISO  string |
|  | text nullable | ISO  string, null for present |
|  | text nullable | Markdown body rendered in UI |
|  | json (text) | Array of strings |
|  | enum | Reuse  |
| ,  | timestamp / text | existing auditing |

No other free-form  or  discriminator is required. Child content items inherit the same schema. All fields are optional; UI must omit empty properties.

## Migration Plan

### 1. Database & Shared Types
1. Add a new SQL migration ():
   - Create temporary table  with the target columns above.
   - Copy data from  by mapping legacy fields (example mapping table below) and flattening  keys where available.
   - Drop the old table and rename  → .
   - Create indexes on  and .

   | Legacy source | Target field | Notes |
   | --- | --- | --- |
   | // |  | choose first non-null |
   | / |  |
   |  |  |
   | / |  |
   |  |  | normalize to YYYY-MM |
   |  |  |
   | // |  |
   | / |  array |
   | , , , audit fields | carry over |

2. Update  to define a single  interface that mirrors the table fields (remove old union types,  variants, etc.). Update all shared exports consumed by FE/BE.
3. Adjust  to:
   - Remove -specific logic and  storage.
   - Serialize  as JSON text.
   - Enforce ordering semantics when creating/updating/deleting items (shift siblings after inserts, pull gaps after deletes).
4. Update request validation in  (zod schema) to match the new structure (optional fields, arrays) and remove unused enums (,  still used).
5. Remove legacy references to , , etc., in API handlers and  consumers.

### 2. API Contract & Services
1. Replace the current generic  query with a version that returns nested items (parent followed by sorted children). Provide an optional  filter.
2. Introduce reorder endpoints:
   -  with  to move items between parents or re-sequence siblings.
   - Update repository layer to support atomic reorder operations (SQL transaction updating siblings’ ).
3. Keep CRUD endpoints but ensure responses emit the flattened shape.
4. Delete dead code paths related to type-specific behaviors, including any unused routes or services in .

### 3. Frontend Architecture
1. Remove legacy type-specific components under , , , , etc. Replace with a single  component that:
   - Displays the defined fields (title, role, location, dates, description rendered as Markdown, website link, skill chips) only if present.
   - Recursively renders child cards beneath the parent content.
2. Implement inline edit mode per item:
   - Card header actions toggling between read-only and edit states.
   - Edit state renders a form built from reusable  components that map to the schema fields.
   - Buttons:  (PATCH), , .  opens a blank child form, pre-populated with .
3. Update  hook to:
   - Consume the new nested response.
   - Add helpers for , , .
4. Refresh import/export utilities to align with the new schema (CSV/JSON representing the flattened fields). Remove , ,  components that were only needed for type unions.
5. Update API client () to match the new contract (payload interface, reorder endpoint, nested response typing) and delete unused fields.
6. Simplify  to the new interface and delete  wrappers if the API already returns nested arrays.
7. Ensure drag-and-drop or button-based reorder UI is available (could reuse existing list reordering components from other pages if available; otherwise, build new controls).
8. Remove redundant UI flows (legacy experience vs. content items) so this page is the single source of truth.

### 4. Data Migration Execution
1. Write a Node script () that:
   - Reads the new SQLite schema.
   - Imports , normalizes fields, and inserts them via the repository.
   - Optionally, keep a seed file for local dev under  reflecting the new shape.
2. Document the manual steps in  (apply migration, run script, verify counts).

### 5. Testing Impact
- **Backend unit/integration**:
  - Add repository tests covering CRUD, nested fetch, and reorder operations ( – currently missing, must be created).
  - Update any shared type tests if present.
- **Frontend unit**:
  -  and  must be rewritten for the new schema (single form, nested rendering, reorder actions).
  - Remove tests tied to type-specific components.
- **E2E**:
  - Update Playwright specs (, , ) to exercise the new UI by creating/editing nested items, verifying reorder, and ensuring unauthenticated users still see read-only content.
  - Add a new E2E test focused on drag/drop or reorder API usage.

### 6. Code Removal Checklist
- Delete unused  component directories and dialogs.
- Remove legacy helper utilities referencing specific types (search , etc.).
- Purge unused fields from  once migration completes.
- Drop deprecated Firestore references ().

### 7. Rollout Steps
1. Land the schema + shared types change behind a feature branch ().
2. Update backend API + tests, deploy to staging docker instance.
3. Update frontend UI + tests, deploy preview, run all e2e suites.
4. Execute migration SQL + data import on production host (Watchtower-managed stack) during scheduled maintenance.
5. Remove legacy docs and mark new plan complete.

