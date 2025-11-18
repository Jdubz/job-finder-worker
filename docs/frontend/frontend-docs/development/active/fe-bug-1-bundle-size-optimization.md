# FE-BUG-1 — Bundle Size Optimization

- **Status**: Todo
- **Owner**: Worker B
- **Priority**: P1 (High Impact)
- **Labels**: priority-p1, repository-frontend, type-performance, status-todo

## Why This Matters

`npm run build` currently generates a main chunk (`dist/assets/index-uADF9HG1.js`) of ~756 KB. Slow initial loads hurt Core Web Vitals and limit frontend deploy velocity. We need a clear, reproducible plan to cut the bundle down using only the files in this repo.

## Approach

1. **Measure the Baseline**
   - Run `npm run build -- --analyze` (Vite’s visualizer). If the analyzer is not installed, add it under `devDependencies` and commit the configuration.
   - Save the output as `docs/perf/bundle-report-YYYYMMDD.md` with top offenders listed (import path + size).
2. **Implement Code Splitting**
   - Review `src/router.tsx` — many routes already use `React.lazy`, but shared contexts/components may still be eager-loaded.
   - Identify large feature modules (`src/pages/**`, `src/features/**`) that can be lazily imported when their parent component renders. Example: load Document Builder feature modules only when the page is active.
3. **Optimize Dependencies**
   - Replace `import { xyz } from "firebase"` with modular imports (e.g., `import { getAuth } from "firebase/auth"`). Check `src/config/firebase.ts` and utilities for tree-shaking opportunities.
   - Audit icon imports (see `lucide-react` usages in `src/components`). Prefer named icon imports to reduce bundle size.
   - Remove unused exports from `src/lib/` or convert to dynamic imports if rarely used.
4. **Introduce Bundle Guardrails**
   - Add a script (e.g., `scripts/check-bundle-size.mjs`) that reads `dist/manifest.json` and fails if `index-*.js` exceeds 500 KB. Wire it into `package.json` (perhaps `npm run build:ci`).
   - Document how to interpret failures in `docs/perf/README.md`.
5. **Validate UX**
   - After refactors, run `npm run dev` and `npm run build && npm run preview` to ensure lazy loading doesn’t break navigation.
   - Smoke test major pages: `/`, `/job-finder`, `/document-builder`, `/queue-management`.

## Deliverables

- Updated code with tree-shaken imports and lazy loading.
- `docs/perf/bundle-report-<date>.md` summarizing before/after bundle sizes.
- `scripts/check-bundle-size.mjs` (or similar) plus `npm run check:bundle` command.
- README snippet describing how to run bundle analysis.

## Acceptance Criteria

- [ ] Main bundle (`dist/assets/index-*.js`) is < 500 KB after `npm run build`.
- [ ] Bundle report committed documenting the reduction.
- [ ] Automatic size check exists and is enforced in CI or as a pre-commit step.
- [ ] Navigation across all major routes works without blank states.
- [ ] `npm run lint`, `npm run test`, and `npm run build` pass.

## Helpful Files

- `src/router.tsx` — current lazy-loading setup.
- `src/config/firebase.ts` — Firebase import surface.
- `src/components/*` — icon and UI imports.
- `vite.config.ts` — place to configure bundle analyzer.
