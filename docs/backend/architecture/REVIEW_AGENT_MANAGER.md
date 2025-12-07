> Status: Resolved
> Owner: @jdubz
> Last Updated: 2025-12-06

# Agent Manager Implementation Review

Review of the AgentManager implementation against RFC_AGENT_MANAGER.md and AGENT_MANAGER_BACKEND_PLAN.md, with focus on the document generation pipeline.

---

## Critical Issues

### 1. Backend AgentManager Error Handling Mismatch with RFC

**Location:** `job-finder-BE/server/src/modules/generator/ai/agent-manager.ts:100-104`

**Issue:** The backend AgentManager breaks the fallback chain on *any* error, not just non-quota errors as specified in the RFC.

```typescript
// Current behavior
} catch (err) {
  const reason = err instanceof Error ? err.message : 'agent failed'
  this.disableAgent(aiSettings, agentId, `error: ${reason}`)
  throw err  // <-- Throws immediately, doesn't try next agent
}
```

**RFC specifies:** Continue to next agent on `QuotaExhaustedError`, but break on `AIProviderError`.

**Python implementation correctly distinguishes** (`agent_manager.py:225-240`):
```python
except QuotaExhaustedError as e:
    # ... continue to next agent
except AIProviderError as e:
    # ... break
```

**Impact:** If the first agent in the fallback chain has a transient error, the entire document generation fails instead of trying the next agent.

---

### 2. Auth Check Logic Inconsistency

**Location:** `job-finder-BE/server/src/modules/generator/ai/agent-manager.ts:114-130`

**Issue:** The backend's `checkAuth()` method has confusing logic for the "any-of" semantics. When `envList` is empty, `envSatisfied` evaluates to `false`, which is counterintuitive. The Python implementation uses a simpler `_check_cli_auth()` with config-based lookup.

---

### 3. Missing `claude` in `AgentCliProvider` Type

**Location:** `shared/src/agent-cli.types.ts:1`

```typescript
export type AgentCliProvider = 'codex' | 'gemini'  // Missing 'claude'
```

**Impact:** Shared types don't include `claude` as a CLI provider, yet the migration and both AgentManagers support it.

---

### 4. Task Type Inconsistency in Backend Plan

**Backend Plan says:**
> "Strict routing: Gmail analysis uses `task_type = extraction`; document generation uses `task_type = generation`"

**Issue:** The plan has a typo (`generation` vs `document`). Implementation correctly uses `document`. Also, no Gmail analysis routing exists in backend code.

---

## Medium Issues

### 5. Race Condition in Budget Tracking

**Location:** `job-finder-BE/server/src/modules/generator/ai/agent-manager.ts:90-98`

**Issue:** Between the budget check and the usage increment, another concurrent request could pass the budget check, leading to budget overruns.

```typescript
if (agent.dailyUsage + cost > agent.dailyBudget) { /* check */ }
// ... async gap ...
const output = await this.runAgent(agent, prompt, model)
agent.dailyUsage += cost  // <-- Incremented after async call
```

**Mitigation:** Python worker reads fresh config per call, but backend doesn't protect concurrent HTTP requests.

---

### 6. No Timeout on CLI Execution

**Location:** `job-finder-BE/server/src/modules/generator/workflow/services/cli-runner.ts`

**Issue:** The `runCliProvider` function spawns CLI processes without a timeout. A hanging CLI command blocks the request indefinitely.

**Missing:**
- Process timeout
- Signal handling for graceful termination

---

### 7. Cover Letter Has No Hallucination Prevention

**Location:** `job-finder-BE/server/src/modules/generator/workflow/generator.workflow.service.ts:538-558`

Resume generation validates against content items to prevent hallucinated companies/roles:
```typescript
// Resume validation (lines 446-466)
if (!source) return null // drop hallucinated or unknown companies
```

Cover letter just parses JSON without validation:
```typescript
// Cover letter (lines 551-553)
const parsed = JSON.parse(agentResult.output) as CoverLetterContent
return parsed  // No validation!
```

**Risk:** AI could hallucinate experiences or skills in cover letters.

---

### 8. Model Rates Not Updated for New Models

**Location:** `job-finder-BE/server/src/db/config-migrations/20251205_001_ai-settings-agent-manager.ts:45-55`

Migration creates agents with models like `claude-sonnet-4-20250514` which aren't in the rates. These default to `1.0`, which may not be accurate.

---

## Minor Issues

### 9. Inconsistent Error Types

**Location:** `job-finder-BE/server/src/modules/generator/ai/agent-manager.ts:17-21`

Backend throws different error classes for different failures:
- `UserFacingError` for config issues
- `NoAgentsAvailableError` for fallback exhaustion

Python consistently uses `NoAgentsAvailableError` with `tried_agents` for all agent-related failures.

---

### 10. CLI Runner Has Redundant Fallback Logic

**Location:** `job-finder-BE/server/src/modules/generator/workflow/services/cli-runner.ts:74-76`

```typescript
const providers: CliProvider[] =
  options.allowFallbackToCodex === false || preferred === 'codex'
    ? [preferred]
    : [preferred, 'codex']
```

This internal fallback mechanism bypasses AgentManager's fallback chain, creating redundant logic.

---

### 11. Missing `documentGenerator.selected` Deprecation

RFC states `documentGenerator.selected` should be rejected/ignored in backend flows, but:
- Migration still populates it
- Shared types still include it
- No validation rejects it

---

## Model Agnosticism Violations

The codebase should be model-agnostic with AgentManager as the single source of truth. Models should use `-latest` aliases (e.g., `claude-sonnet-latest`) to inherit improvements organically.

### 12. `AI_PROVIDER_MODELS` Constant Hardcodes Models

**Location:** `shared/src/config.types.ts:40-59`

```typescript
export const AI_PROVIDER_MODELS = {
  claude: {
    api: [
      "claude-sonnet-4-5-20250929",
      "claude-sonnet-4-20250514",
      // ...dated versions
    ],
  },
  // ...
}
```

**Issue:** Hardcodes specific model versions for UI dropdowns. Should be removed or populated dynamically from config.

---

### 13. Provider Classes Have Hardcoded Model Defaults

**Location:** `job-finder-worker/src/job_finder/ai/providers.py`

```python
# Line 59 - ClaudeProvider
def __init__(self, api_key=None, model: str = "claude-sonnet-4-5-20250929"):

# Line 93 - OpenAIProvider
def __init__(self, api_key=None, model: str = "gpt-4o"):

# Line 127 - GeminiProvider
def __init__(self, api_key=None, model: str = "gemini-2.0-flash"):

# Line 277 - CodexCLIProvider
def __init__(self, model: Optional[str] = "gpt-5-codex", timeout: int = 60):

# Line 371 - ClaudeCLIProvider
self.model = model or "claude-3-5-sonnet-20241022"
```

**Issue:** These should **require** model as a parameter (no default) since AgentManager always provides it.

---

### 14. Migration Uses Dated Model Versions

**Location:** `job-finder-BE/server/src/db/config-migrations/20251205_001_ai-settings-agent-manager.ts:170-194`

```typescript
defaultModel: 'claude-sonnet-4-20250514'  // Should be: claude-sonnet-latest
```

---

### 15. Model Rates Keys Won't Match `-latest` Aliases

**Location:** `job-finder-BE/server/src/db/config-migrations/20251205_001_ai-settings-agent-manager.ts:45-55`

```typescript
const DEFAULT_MODEL_RATES = {
  'claude-3-opus': 1.5,      // Won't match 'claude-opus-latest'
  'claude-3-sonnet': 1.0,    // Won't match 'claude-sonnet-latest'
}
```

**Recommendation:** Use `-latest` aliases as keys or implement tier-based rates:
```typescript
// Option A: -latest aliases
modelRates: {
  'claude-sonnet-latest': 1.0,
  'claude-opus-latest': 1.5,
}

// Option B: Tier-based (provider.tier)
modelRates: {
  'claude.sonnet': 1.0,
  'claude.opus': 1.5,
}
```

---

## Documentation vs Implementation Gaps

| RFC/Plan Says | Implementation Does |
|---------------|---------------------|
| Break on `AIProviderError`, continue on `QuotaExhaustedError` | Backend breaks on all errors |
| Task type `generation` for documents | Task type `document` (correct in code, typo in plan) |
| Gmail analysis uses `extraction` | No Gmail analysis routing in backend |
| Remove `documentGenerator.selected` | Still present in schema and migration |
| Model selection via config only | Hardcoded defaults in provider classes |

---

## Recommendations

### High Priority
1. **Fix backend error handling** - Add QuotaExhaustedError detection to continue fallback chain
2. **Remove hardcoded model defaults** - Make `model` a required parameter in provider constructors
3. **Use `-latest` model aliases** - Update migration and config to use `claude-sonnet-latest`, etc.
4. **Add CLI timeout** - Implement process timeout (60-120 seconds)

### Medium Priority
5. **Add cover letter validation** - Validate mentioned skills/technologies exist in content items
6. **Fix `AgentCliProvider` type** - Add `'claude'`
7. **Remove or dynamicize `AI_PROVIDER_MODELS`** - Eliminate hardcoded model lists
8. **Update model rates** - Use `-latest` keys or implement pattern/tier matching

### Low Priority
9. **Consider optimistic locking** for budget updates to prevent race conditions
10. **Remove redundant CLI runner fallback** - Let AgentManager handle all fallbacks
11. **Deprecate `documentGenerator.selected`** - Add validation to reject/warn

---

## Implementation Summary (2025-12-06)

The following issues have been addressed:

### Completed Fixes

| Issue | Status | Files Changed |
|-------|--------|---------------|
| #1 Backend error handling mismatch | ✅ Fixed | `agent-manager.ts` - Added `QuotaExhaustedError` and `AgentExecutionError` classes, proper fallback behavior |
| #2 Auth check logic | ✅ Reviewed | Logic is correct, documented |
| #3 Missing `claude` in AgentCliProvider | ✅ Fixed | `agent-cli.types.ts` |
| #5 No CLI timeout | ✅ Fixed | `cli-runner.ts` - Added 2-minute default timeout with SIGTERM/SIGKILL |
| #6 Quota error detection | ✅ Fixed | `auth-error.util.ts` - Added `isQuotaError()` function |
| #7 Cover letter hallucination validation | ✅ Fixed | `generator.workflow.service.ts` - Added warning-level validation |
| #12 `AI_PROVIDER_MODELS` hardcodes models | ✅ Fixed | `config.types.ts` - Removed constant, added documentation comment |
| #13 Provider hardcoded model defaults | ✅ Fixed | `providers.py` - Made `model` required parameter in all provider classes |
| #14 Migration uses dated model versions | ✅ Fixed | Migration now uses `claude-sonnet-4-5-latest` |
| #15 Model rates keys won't match aliases | ✅ Fixed | Added `-latest` aliases to model rates |
| #10 Redundant CLI runner fallback | ✅ Fixed | `cli-runner.ts` - Removed internal fallback loop, AgentManager handles fallbacks |
| #11 `documentGenerator.selected` deprecation | ✅ Fixed | Made optional with `@deprecated` JSDoc, removed from migration defaults |

### Changes Summary

```
agent-manager.ts        +51 lines  - Error types, fallback logic
cli-runner.ts           -20 lines  - Removed redundant fallback, simplified to single provider
auth-error.util.ts      +23 lines  - Quota error detection
generator.workflow.service.ts +75 lines - Cover letter validation
providers.py            +37 lines  - Required model parameter
config.types.ts         -26 lines  - Removed AI_PROVIDER_MODELS, deprecated documentGenerator
agent-cli.types.ts      +1 line    - Added 'claude'
migration.ts            -10 lines  - -latest aliases, removed documentGenerator default
guards.ts               +5 lines   - Made documentGenerator validation optional
config.schema.ts        +2 lines   - Made documentGenerator optional with deprecation
```

### Remaining Items (Low Priority)

- Race condition in budget tracking (consider optimistic locking)
