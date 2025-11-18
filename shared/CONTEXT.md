# Shared Types Context

This directory lives inside the `job-finder-worker` monorepo and replaces the old `@jsdubzw/job-finder-shared-types` npm package. It now builds a local workspace package (`@shared/types`) with dual ESM/CJS outputs plus `.d.ts` files. Consumers simply add `@shared/types` as a dependency (e.g., `file:../shared`) and import from the package—no custom `tsconfig` path aliases are needed.

## Integration Points

- **job-finder-FE** (Vite/React): depends on `@shared/types` (declared via `file:../shared`). TypeScript sees the package through standard node resolution.
- **job-finder-BE / server**: depends on `@shared/types` for compile-time types. Builds run `npm run build:shared` first so `.d.ts` are always fresh.
- **job-finder-worker (Python)**: treat `shared/src` as the source of truth and mirror the models in Pydantic.

## Contribution Notes

- Update schemas in `shared/src` first, run `npm run build --workspace shared`, then execute the relevant workspace builds (`server`, `functions`, `frontend`).
- Any time you add a new type, mention it in `shared/README.md` and notify the other packages to regenerate generated clients if needed.
- Remember there is no npm publish step anymore; the monorepo is the distribution.
