## Summary
Explain what changed and why. Mention the workspace(s) this touches (FE, API/server, Firebase functions, worker, shared types, infra, docs, etc.).

## Testing
Check everything you ran (or remove items that do not apply).
- [ ] `npm run lint:server`
- [ ] `npm run lint:functions`
- [ ] `npm run lint:frontend`
- [ ] `npm run build:server`
- [ ] `npm run build:frontend`
- [ ] Workspace-specific unit tests (`npm test --workspace ...`, `pytest`, etc.)
- [ ] Other (describe below)

## Checklist
- [ ] Added/updated docs, env samples, or SQL migrations if needed
- [ ] Added/updated types in `shared/` if API/worker contracts changed
- [ ] Verified relevant Husky hooks still pass locally
- [ ] Confirmed no secrets or personal data are committed

## Screenshots / Logs
Attach screenshots, terminal output, or logs if they help reviewers.

## Additional Notes
Anything else reviewers should know (rollout steps, follow-ups, blockers, related issues).
