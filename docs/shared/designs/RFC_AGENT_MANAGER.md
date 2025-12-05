> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-12-04

# RFC: Agent Manager

## Summary

Implement an Agent Manager in the worker that abstracts AI agent selection from callers. The worker supplies a task type and prompt; the manager selects the appropriate agent based on configuration, availability, and budget. This centralizes agent lifecycle management including fallback chains, daily budgets, error handling, and automatic recovery.

This is a **hard cutover** - all legacy configuration fields will be removed, not deprecated.

## Background

### Current State

The worker calls `create_provider_from_config()` directly with per-task overrides. There is no fallback mechanism, budget tracking, or centralized error handling.

**Current ai-settings structure (to be replaced entirely):**
```typescript
interface AISettings {
  worker: {
    selected: { provider, interface, model }
    tasks?: { jobMatch?, companyDiscovery?, sourceDiscovery? }  // REMOVE
  }
  documentGenerator: { selected: { provider, interface, model } }
  options: AIProviderOption[]
}
```

### Problems

1. No fallback when primary agent fails
2. No budget tracking - agents can exhaust quotas unexpectedly
3. Manual intervention required for all agent failures
4. Callers know which specific agent to use (tight coupling)
5. No distinction between recoverable (budget) and non-recoverable (error) failures
6. Per-task overrides add complexity without value

## Design

### Agent Task Types

Abstract task types describing the nature of work, decoupled from queue item types:

| Task Type | Description | Use Cases |
|-----------|-------------|-----------|
| `extraction` | Structured data extraction from text | Job details, company info parsing, source discovery |
| `analysis` | Reasoning and evaluation | Match scoring rationale, research synthesis |

Processor mapping (internal to AgentManager callers):
```python
QUEUE_TO_AGENT_TASK = {
    "job": "extraction",
    "company": "extraction",
    "source_discovery": "extraction",
    "agent_review": "analysis",
}
```

### New ai-settings Structure

```typescript
/** Agent ID format: "{provider}.{interface}" */
type AgentId = `${AIProviderType}.${AIInterfaceType}`

/** Agent task types */
type AgentTaskType = "extraction" | "analysis"

interface AgentConfig {
  provider: AIProviderType
  interface: AIInterfaceType
  defaultModel: string
  enabled: boolean
  reason: string | null  // "quota_exhausted:*" or "error:*"
  dailyBudget: number
  dailyUsage: number
}

interface AISettings {
  /** Configured agents keyed by agent ID */
  agents: Record<AgentId, AgentConfig>

  /** Fallback chains per task type */
  taskFallbacks: Record<AgentTaskType, AgentId[]>

  /** Model cost rates (default: 1.0) */
  modelRates: Record<string, number>

  /** Document generator selection (until backend uses AgentManager) */
  documentGenerator: {
    selected: { provider: AIProviderType; interface: AIInterfaceType; model: string }
  }

  /** Provider availability metadata (populated by backend) */
  options: AIProviderOption[]
}
```

**Example Configuration:**
```json
{
  "agents": {
    "gemini.cli": {
      "provider": "gemini",
      "interface": "cli",
      "defaultModel": "gemini-2.0-flash",
      "enabled": true,
      "reason": null,
      "dailyBudget": 100,
      "dailyUsage": 0
    },
    "codex.cli": {
      "provider": "codex",
      "interface": "cli",
      "defaultModel": "gpt-4o",
      "enabled": true,
      "reason": null,
      "dailyBudget": 50,
      "dailyUsage": 0
    },
    "gemini.api": {
      "provider": "gemini",
      "interface": "api",
      "defaultModel": "gemini-2.0-flash",
      "enabled": true,
      "reason": null,
      "dailyBudget": 200,
      "dailyUsage": 0
    }
  },
  "taskFallbacks": {
    "extraction": ["gemini.cli", "codex.cli", "gemini.api"],
    "analysis": ["codex.cli", "gemini.cli"]
  },
  "modelRates": {
    "gpt-4o": 1.0,
    "gpt-4o-mini": 0.5,
    "gemini-2.0-flash": 0.3,
    "gemini-1.5-pro": 1.0
  }
}
```

### Budget Enforcement

**Budget is enforced by AgentManager, not by agents themselves.** Agents do not track or enforce budgets - they only throw errors for actual API/CLI failures.

AgentManager checks budget BEFORE calling an agent:
```python
def execute(self, task_type: str, prompt: str, ...):
    ai_settings = self.config_loader.get_ai_settings()  # Fresh read every call

    for agent_id in ai_settings["taskFallbacks"].get(task_type, []):
        agent = ai_settings["agents"].get(agent_id)
        if not agent:
            continue

        # Skip disabled agents
        if not agent["enabled"]:
            continue

        # BUDGET CHECK - enforced here, not in agent
        if agent["dailyUsage"] >= agent["dailyBudget"]:
            self._disable_agent(agent_id, reason="quota_exhausted: daily budget reached")
            continue

        try:
            result = self._call_agent(agent_id, agent, prompt, ...)
            self._increment_usage(agent_id, model)  # ConfigLoader handles model rate lookup
            return result
        except AIProviderError as e:
            self._disable_agent(agent_id, reason=f"error: {str(e)}")
            # BREAK, not continue: API errors (auth failures, invalid requests)
            # often indicate systemic issues that won't be fixed by trying
            # another agent. Quota exhaustion continues; errors stop.
            break

    raise NoAgentsAvailableError(...)
```

**Cost Calculation:**
```python
model_rate = ai_settings["modelRates"].get(model, 1.0)
new_usage = agent["dailyUsage"] + model_rate
```

### Error Handling

| Condition | Action | Recovery |
|-----------|--------|----------|
| Budget exceeded (pre-check) | Disable agent, reason `quota_exhausted: daily budget reached` | Auto-enabled by cron |
| AIProviderError | Disable agent, reason `error: {message}` | Manual re-enable via UI |

**Queue Behavior on NoAgentsAvailableError:**
1. Move current task back to `pending`
2. Stop the queue
3. Set `stopReason` explaining which task type has no agents

### AgentManager Class

```python
@dataclass
class AgentResult:
    text: str
    agent_id: str
    model: str

class NoAgentsAvailableError(Exception):
    pass

class AgentManager:
    def __init__(self, config_loader: ConfigLoader):
        self.config_loader = config_loader

    def execute(
        self,
        task_type: str,
        prompt: str,
        model_override: Optional[str] = None,
        **kwargs
    ) -> AgentResult:
        """Execute a task using the appropriate agent from fallback chain."""
        ai_settings = self.config_loader.get_ai_settings()

        fallback_chain = ai_settings["taskFallbacks"].get(task_type, [])
        if not fallback_chain:
            raise NoAgentsAvailableError(f"No fallback chain for task: {task_type}")

        for agent_id in fallback_chain:
            agent = ai_settings["agents"].get(agent_id)
            if not agent or not agent["enabled"]:
                continue

            # Budget enforcement
            if agent["dailyUsage"] >= agent["dailyBudget"]:
                self._disable_agent(agent_id, "quota_exhausted: daily budget reached")
                continue

            try:
                model = model_override or agent["defaultModel"]
                provider = self._create_provider(agent, model)
                response = provider.generate(prompt, **kwargs)
                self._increment_usage(agent_id, model)  # ConfigLoader handles model rate lookup
                return AgentResult(text=response, agent_id=agent_id, model=model)
            except AIProviderError as e:
                self._disable_agent(agent_id, f"error: {str(e)}")
                # BREAK, not continue: API errors indicate systemic issues
                # that won't be fixed by trying another agent
                break

        raise NoAgentsAvailableError(f"No agents available for task '{task_type}'")

    def _create_provider(self, agent: dict, model: str) -> AIProvider:
        provider_map = {
            ("codex", "cli"): CodexCLIProvider,
            ("gemini", "cli"): GeminiCLIProvider,
            ("gemini", "api"): GeminiProvider,
            ("claude", "api"): ClaudeProvider,
            ("openai", "api"): OpenAIProvider,
        }
        cls = provider_map.get((agent["provider"], agent["interface"]))
        if not cls:
            raise AIProviderError(
                f"No provider class for {agent['provider']}/{agent['interface']}"
            )
        return cls(model=model)

    def _increment_usage(self, agent_id: str, model: str):
        """Increment agent usage. ConfigLoader handles model rate lookup from modelRates."""
        self.config_loader.increment_agent_usage(agent_id, model)

    def _disable_agent(self, agent_id: str, reason: str):
        self.config_loader.update_agent_status(agent_id, enabled=False, reason=reason)
```

### Midnight Cron Job

Add `agentReset` to CronConfig:

```typescript
interface CronConfig {
  jobs: {
    scrape: CronJobSchedule
    maintenance: CronJobSchedule
    logrotate: CronJobSchedule
    agentReset: CronJobSchedule  // NEW - runs at midnight
  }
}
```

**Cron Logic:**
```typescript
async function resetAgents() {
  const aiSettings = configRepo.get<AISettings>('ai-settings')

  for (const [agentId, config] of Object.entries(aiSettings.agents)) {
    // Reset daily usage for ALL agents
    config.dailyUsage = 0

    // Re-enable only quota-exhausted agents
    if (!config.enabled && config.reason?.startsWith('quota_exhausted:')) {
      config.enabled = true
      config.reason = null
    }
    // NOTE: error-disabled agents stay disabled
  }

  configRepo.upsert('ai-settings', aiSettings, { updatedBy: 'cron-agent-reset' })

  // Attempt queue restart if stopped due to agent availability
  // Clear stopReason to allow queue to process items again
  const workerSettings = configRepo.get<WorkerSettings>('worker-settings')
  if (workerSettings.runtime.stopReason?.includes('No agents available')) {
    workerSettings.runtime.stopReason = null
    configRepo.upsert('worker-settings', workerSettings, { updatedBy: 'cron-agent-reset' })
    // Queue will automatically resume on next worker poll since stopReason is cleared
  }
}
```

---

## Integration Points

### Files to Modify

#### Shared Types (`shared/src/`)

| File | Changes |
|------|---------|
| `config.types.ts:75` | Remove `AITaskName` type |
| `config.types.ts:78-82` | Remove `AITaskConfig` interface |
| `config.types.ts:85-89` | Remove `AITasksConfig` interface |
| `config.types.ts:91-95` | Remove `AISettingsSection` interface |
| `config.types.ts:98-103` | Replace `AISettings` with new structure |
| `config.types.ts:608-616` | Add `agentReset` to `CronConfig.jobs` |
| `guards.ts:135-197` | Update `isAISettings()` validator |
| `queue.types.ts` | Update re-exports |

#### Worker Python (`job-finder-worker/src/job_finder/`)

| File | Line(s) | Current | New |
|------|---------|---------|-----|
| `ai/providers.py` | 406-536 | `create_provider_from_config()` with task/section params | Remove function, use AgentManager |
| `ai/agent_manager.py` | NEW | - | Create AgentManager class |
| `ai/extraction.py` | 228 | Takes `AIProvider` in constructor | Takes `AgentManager` |
| `ai/matcher.py` | - | Takes `AIProvider` | Takes `AgentManager` |
| `flask_worker.py` | 228 | `create_provider_from_config(ai_settings, task="jobMatch")` | Use AgentManager |
| `flask_worker.py` | 300-301 | Creates providers for jobMatch/companyDiscovery | Use AgentManager |
| `job_queue/processors/job_processor.py` | 139 | `create_provider_from_config(ai_settings, task="jobMatch")` | Use AgentManager |
| `job_queue/processors/job_processor.py` | 186-192 | Refreshes multiple providers | Use AgentManager |
| `job_queue/processors/company_processor.py` | - | Uses CompanyInfoFetcher with provider | Pass AgentManager |
| `job_queue/processors/source_processor.py` | 134 | `create_provider_from_config(ai_settings, task="sourceDiscovery")` | Use AgentManager |
| `job_queue/config_loader.py` | 108-225 | `get_ai_settings()` with normalization | Return new structure |
| `job_queue/config_loader.py` | NEW | - | Add `increment_agent_usage()`, `update_agent_status()` |
| `exceptions.py` | NEW | - | Add `NoAgentsAvailableError` |

#### Backend TypeScript (`job-finder-BE/server/src/`)

| File | Changes |
|------|---------|
| `modules/config/config.routes.ts:48-89` | Update `buildProviderOptionsWithAvailability()` for new structure |
| `modules/config/config.routes.ts:183-196` | Update ai-settings GET handler |
| `scheduler/cron.ts` | Add `agentReset` job and `resetAgents()` function |
| `modules/job-queue/job-queue.routes.ts` | Add `/cron/trigger/agent-reset` endpoint |

#### Frontend (`job-finder-FE/src/`)

| File | Changes |
|------|---------|
| `pages/job-finder-config/components/tabs/AISettingsTab.tsx` | Complete rewrite for new agent/fallback UI |
| `api/config-client.ts` | Update AISettings shape handling |

### Files to Delete

| File | Reason |
|------|--------|
| `docs/shared/designs/RFC_AI_PROVIDER_FALLBACKS.md` | Superseded by this RFC |

### Types to Remove

| Type | Location | Replacement |
|------|----------|-------------|
| `AITaskName` | config.types.ts:75 | `AgentTaskType` |
| `AITaskConfig` | config.types.ts:78-82 | None (removed) |
| `AITasksConfig` | config.types.ts:85-89 | None (removed) |
| `AISettingsSection` | config.types.ts:91-95 | Inline in AISettings |
| `AIProviderSelection` | config.types.ts:68-72 | Inline in documentGenerator |

### Functions to Remove

| Function | Location | Replacement |
|----------|----------|-------------|
| `create_provider_from_config()` | providers.py:406-536 | `AgentManager.execute()` |
| `_normalize_ai_settings()` | config_loader.py:177-225 | New structure, no normalization |

---

## Implementation Tasks

### Phase 1: Data Model & Config
- [ ] Add `AgentTaskType`, `AgentId`, `AgentConfig` types to config.types.ts
- [ ] Replace `AISettings` interface with new structure
- [ ] Remove `AITaskName`, `AITaskConfig`, `AITasksConfig`, `AISettingsSection`
- [ ] Add `agentReset` to `CronConfig.jobs`
- [ ] Update `isAISettings()` guard in guards.ts
- [ ] Add `increment_agent_usage()` and `update_agent_status()` to ConfigLoader

### Phase 2: AgentManager Implementation
- [ ] Create `agent_manager.py` with `AgentManager` class
- [ ] Implement `execute()` with fallback chain and budget enforcement
- [ ] Add `NoAgentsAvailableError` to exceptions.py
- [ ] Add `AgentResult` dataclass

### Phase 3: Worker Integration
- [ ] Update `JobExtractor` to use AgentManager
- [ ] Update `job_processor.py` to use AgentManager
- [ ] Update `company_processor.py` to use AgentManager
- [ ] Update `source_processor.py` to use AgentManager
- [ ] Update `flask_worker.py` initialization
- [ ] Remove `create_provider_from_config()` function
- [ ] Handle `NoAgentsAvailableError` - move item to pending, stop queue

### Phase 4: Midnight Cron
- [ ] Add `agentReset` to DEFAULT_CRON_CONFIG in cron.ts
- [ ] Implement `resetAgents()` function
- [ ] Add queue restart attempt logic
- [ ] Add `/cron/trigger/agent-reset` endpoint
- [ ] Update `CronJobKey` type and `lastRunHourKey` state

### Phase 5: Frontend UI
- [ ] Rewrite AISettingsTab for new agent structure
- [ ] Add agent list with enable/disable, budget, usage display
- [ ] Add fallback chain configuration per task type
- [ ] Add model rates table
- [ ] Add "Re-enable" button for error-disabled agents

### Phase 6: Database Migration
- [ ] Create migration script to transform existing ai-settings to new format
- [ ] Test migration with production data snapshot

---

## Testing Strategy

1. **Unit Tests**
   - AgentManager fallback chain traversal
   - Budget enforcement before agent call
   - Agent disabling on error
   - Cost calculation with model rates

2. **Integration Tests**
   - End-to-end task execution with mocked providers
   - Queue stop/restart on NoAgentsAvailableError
   - Midnight cron reset behavior
   - Config persistence after agent state changes

3. **Manual Testing**
   - Set low budget, verify fallback when exhausted
   - Trigger provider error, verify manual re-enable required
   - Run cron, verify budget reset and queue restart
