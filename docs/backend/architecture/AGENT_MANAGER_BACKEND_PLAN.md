> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-12-06

# Backend Agent Manager Adoption Plan

Implement the AgentManager in the backend to use the **same ai-settings config** as the worker, rely on the `document` task type for generator flows, and route Gmail analysis through the `extraction` chain. The goal is a single shared fallback/budget system with no legacy/documentGenerator override paths.

## Scope & Principles
- **Single source of truth:** Backend reads and writes the same `ai-settings` fields (`agents`, `taskFallbacks`, `modelRates`) already used by the worker; no duplicated config.
- **Task type:** Use existing `document` task for generator; `taskFallbacks.document` is required (no defaults or back-compat).
- **CLI-first:** Only CLI agents supported in generator; API interfaces are rejected with a clear error/disable reason.
- **Per-scope runtime state:** `runtimeState.backend` is independent from `runtimeState.worker`; auth failures disable only the calling scope while preserving shared quotas.
- **No implicit defaults:** Missing auth requirements or runtime fields should fail loudly during validation.
- **Strict routing:** Gmail analysis uses `task_type = extraction`; document generation uses `task_type = generation`.

## Implementation Steps
1) **Shared types/validation**
   - Ensure `AgentTaskType` includes `document`; update `AISettings` schema/guards and contract tests to require `taskFallbacks.document`.
   - Remove backend reliance on `documentGenerator.selected`; reject/ignore that field in backend flows.

2) **Backend AgentManager (TS)**
   - Add `AgentManager` service mirroring worker semantics: fresh config per call, fallback traversal, pre-call budget check using `modelRates`, `increment_agent_usage`, `update_agent_status`, disable on quota/API errors, throw `NoAgentsAvailableError`.
   - Dispatch map limited to CLI agents (`codex/cli`, `gemini/cli`, `claude/cli`); unsupported combinations disable with `error: unsupported provider/interface`.

3) **Generator workflow integration**
   - Replace `getDocumentGeneratorCliProvider` + direct CLI calls with `agentManager.execute('document', ...)`.
   - Log `agent_id`/`model`; surface friendly user errors on `NoAgentsAvailableError`.

4) **Gmail analysis routing**
   - Ensure Gmail analysis tasks invoke `agentManager.execute('extraction', ...)` (reusing extraction chain/budget).

5) **Tests**
   - Unit: AgentManager fallback order, budget pre-check, quota vs error disable, unsupported-provider handling.
   - Integration: Generator workflow uses `generation`; Gmail analysis uses `extraction`; `NoAgentsAvailableError` yields user-facing failure.

6) **Ops**
   - Keep existing `triggerAgentReset` cron (shared config); add logging/metrics for agent disables from backend calls.

## Risks & Mitigations
- **Missing `taskFallbacks.generation`:** Validation fails early; migration or manual config update required before deploy.
- **Unsupported provider in chain:** Auto-disables with `error:`; alert via logs/metrics to fix config.
- **Budget desync:** Fresh config read/write per call plus cron reset keeps worker/backend aligned.
