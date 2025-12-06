> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-06

# Plan: Agent Manager per-scope runtime state with shared budget

## Goals
- Make agent enable/disable and auth health independent per runtime scope (worker vs backend), while keeping a single shared quota budget/usage per agent.
- Hard-cut to the new schema (no legacy fields, no defaults); validation must fail loudly on missing or malformed config.
- Add Claude CLI to production ai-settings with proper auth gating and fallback coverage.
- Keep queues and generator workflows resilient: missing creds disable only the affected scope, never crash processes.

## Decisions
- `AgentRuntimeState` is per-scope: `{ enabled: boolean; reason: string | null }`.
- `AgentConfig` keeps shared `dailyBudget` and `dailyUsage`; runtime flags are stored under `runtimeState: { worker, backend }`.
- Agent availability for a scope = (scope runtime enabled) AND (shared budget not exceeded). Budget increments are shared.
- Auth checks disable only the calling scope; other scopes remain untouched.
- Cron reset: zero `dailyUsage` (shared) and re-enable only scopes whose `reason` starts with `quota_exhausted:`.
- No implicit defaults: all required keys must exist; validators throw on missing/extra fields.

## Scope of work
- **Shared types/validation**: Update `AgentConfig`, `AgentRuntimeState`, `AgentScope`, `AISettings`; tighten `isAISettings` and related guards.
- **Worker**: AgentManager + ConfigLoader read/write `runtimeState.worker`; scope-aware status updates; shared budget enforcement unchanged.
- **Backend**: Add TS AgentManager for generator with `scope='backend'`; wire generator workflow to it; availability endpoints stop mutating runtime flags.
- **Auth gating**: per-scope disable on missing creds (CLI/API). Ensure Claude CLI command uses correct flags/model; map auth errors to disable reason.
- **Cron**: per-scope reset logic while preserving shared budget semantics and worker stopReason handling.
- **Migration**: one-way migration to new schema; fail if required fields absent; drop legacy runtime fields; add `claude.cli` with both scopes initialized; append to fallbacks.
- **Prod config**: update `/srv/job-finder/data/jobfinder.db` ai-settings to new schema with claude CLI and scoped runtime states.
- **Testing**: unit (scope disable, budget), integration (worker vs backend auth divergence), cron reset, generator fallback when backend scope disabled.

## Deliverables
- Updated `docs/shared/designs/RFC_AGENT_MANAGER.md` reflecting per-scope runtime and hard cutover.
- Code changes across shared types/guards, worker, backend generator, cron, migration, tests.
- Prod ai-settings updated with Claude CLI and scoped runtime state.
