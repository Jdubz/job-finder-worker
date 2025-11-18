# Shared Types Context

This directory lives inside the `job-finder-worker` monorepo and replaces the old `@jsdubzw/job-finder-shared-types` npm package. All consumers import from the local alias `@shared/types`, which is mapped to this folder via `tsconfig.json` paths in each package (frontend, backend, server).

## Integration Points

- **job-finder-FE** (Vite/React): alias configured in `tsconfig*.json` and `vite.config.ts`. API clients and hooks import directly from `@shared/types`.
- **job-finder-BE / server**: TypeScript builds use `tsc-alias` to rewrite `@shared/types` imports to relative file paths before shipping. Cloud Functions and the new Node server share the same definitions.
- **job-finder-worker (Python)**: treat `shared/src` as the source of truth and mirror the models in Pydantic.

## Contribution Notes

- Update schemas in `shared/src` first, then run the relevant builds (`server`, `functions`, `frontend`) so `tsc-alias` rewrites paths.
- Any time you add a new type, mention it in `shared/README.md` and notify the other packages to regenerate generated clients if needed.
- Remember there is no npm publish step anymore; the monorepo is the distribution.
