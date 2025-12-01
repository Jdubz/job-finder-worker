> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-11-30

# RFC: AI Provider Fallback Implementation

## Summary

Implement fallback support for AI providers across the worker and document generator services. When the primary configured AI provider fails (rate limits, API errors, downtime), the system should automatically retry with alternative providers in a configurable priority order.

## Background

The application currently supports multiple AI providers:

- **Codex** (CLI interface) - OpenAI via authenticated CLI session
- **Claude** (API interface) - Anthropic's Claude models
- **OpenAI** (API interface) - Direct OpenAI API
- **Gemini** (API/CLI interface) - Google's Gemini models

### Current State

The `ai-settings` config supports per-task provider selection:

```typescript
interface AISettings {
  worker: {
    selected: { provider, interface, model }
    tasks?: {
      jobMatch?: { provider?, interface?, model? }
      companyDiscovery?: { provider?, interface?, model? }
      sourceDiscovery?: { provider?, interface?, model? }
    }
  }
  documentGenerator: {
    selected: { provider, interface, model }
  }
  options: AIProviderOption[]
}
```

However:
1. **No fallback mechanism exists** - if the selected provider fails, the task fails
2. **Backend Node.js packages are installed but unused** - `@anthropic-ai/claude-code`, `@google/gemini-cli`, `openai`, `@google/generative-ai` are in `package.json` but never imported
3. **Worker Python providers exist** but only one is used per request (no retry chain)

## Proposed Design

### 1. Fallback Priority Configuration

Extend `AISettings` to include fallback configuration:

```typescript
interface AIFallbackConfig {
  enabled: boolean
  /** Max retries across all providers */
  maxRetries: number
  /** Delay between retries in ms */
  retryDelayMs: number
  /** Provider priority order (first is primary) */
  providerOrder: AIProviderType[]
}

interface AISettingsSection {
  selected: AIProviderSelection
  tasks?: AITasksConfig
  /** NEW: Fallback configuration */
  fallback?: AIFallbackConfig
}
```

Default configuration:
```typescript
const DEFAULT_FALLBACK_CONFIG: AIFallbackConfig = {
  enabled: true,
  maxRetries: 3,
  retryDelayMs: 1000,
  providerOrder: ["claude", "openai", "gemini", "codex"]
}
```

### 2. Worker Implementation (Python)

Modify `providers.py` to support fallback chains:

```python
class AIProviderChain:
    """Manages a chain of AI providers with automatic fallback."""

    def __init__(
        self,
        primary: AIProvider,
        fallbacks: List[AIProvider],
        max_retries: int = 3,
        retry_delay_seconds: float = 1.0,
    ):
        self.primary = primary
        self.fallbacks = fallbacks
        self.max_retries = max_retries
        self.retry_delay_seconds = retry_delay_seconds

    def generate(self, prompt: str, **kwargs) -> tuple[str, str]:
        """
        Generate with automatic fallback.
        Returns (response_text, provider_used).
        """
        providers = [self.primary] + self.fallbacks
        last_error = None

        for i, provider in enumerate(providers):
            for attempt in range(self.max_retries):
                try:
                    response = provider.generate(prompt, **kwargs)
                    return response, type(provider).__name__
                except AIProviderError as e:
                    last_error = e
                    if attempt < self.max_retries - 1:
                        time.sleep(self.retry_delay_seconds)

            # Log fallback
            logger.warning(
                f"Provider {type(provider).__name__} failed, "
                f"falling back to next provider"
            )

        raise AIProviderError(
            f"All providers failed. Last error: {last_error}"
        )

def create_provider_chain_from_config(
    ai_settings: Dict[str, Any],
    section: str = "worker",
    task: Optional[str] = None,
) -> AIProviderChain:
    """Create a provider chain with fallbacks from config."""
    fallback_config = ai_settings.get(section, {}).get("fallback", {})

    if not fallback_config.get("enabled", True):
        # No fallback - return single provider wrapped in chain
        primary = create_provider_from_config(ai_settings, section, task)
        return AIProviderChain(primary, [], max_retries=1)

    provider_order = fallback_config.get(
        "providerOrder",
        ["claude", "openai", "gemini", "codex"]
    )

    # Get primary from selected config
    primary_type = ai_settings.get(section, {}).get("selected", {}).get("provider")

    # Build provider list in priority order
    providers = []
    for provider_type in provider_order:
        if provider_type == primary_type:
            continue  # Skip primary, it goes first
        try:
            # Try to create provider (may fail if API key not set)
            provider = _create_provider_by_type(provider_type, ai_settings)
            providers.append(provider)
        except AIProviderError:
            continue  # Skip unavailable providers

    primary = create_provider_from_config(ai_settings, section, task)

    return AIProviderChain(
        primary=primary,
        fallbacks=providers,
        max_retries=fallback_config.get("maxRetries", 3),
        retry_delay_seconds=fallback_config.get("retryDelayMs", 1000) / 1000,
    )
```

### 3. Backend Implementation (Node.js)

Wire up the existing npm packages in the document generator:

```typescript
// job-finder-BE/server/src/modules/generator/ai/providers.ts

import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { GoogleGenerativeAI } from "@google/generative-ai"

interface AIProvider {
  name: string
  generate(prompt: string, options?: GenerateOptions): Promise<string>
}

class ClaudeProvider implements AIProvider {
  name = "claude"
  private client: Anthropic

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY })
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: options?.model || "claude-sonnet-4-5-20250929",
      max_tokens: options?.maxTokens || 4096,
      messages: [{ role: "user", content: prompt }],
    })
    return response.content[0].type === "text" ? response.content[0].text : ""
  }
}

// Similar implementations for OpenAIProvider, GeminiProvider

class AIProviderChain {
  constructor(
    private providers: AIProvider[],
    private maxRetries = 3,
    private retryDelayMs = 1000,
  ) {}

  async generate(prompt: string, options?: GenerateOptions): Promise<{ text: string; provider: string }> {
    let lastError: Error | null = null

    for (const provider of this.providers) {
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          const text = await provider.generate(prompt, options)
          return { text, provider: provider.name }
        } catch (error) {
          lastError = error as Error
          if (attempt < this.maxRetries - 1) {
            await sleep(this.retryDelayMs)
          }
        }
      }
      logger.warn(`Provider ${provider.name} failed, trying next`)
    }

    throw new Error(`All AI providers failed: ${lastError?.message}`)
  }
}
```

### 4. Configuration UI

Add fallback configuration to the AI Settings page:

```typescript
// Add to job-finder-FE/src/pages/job-finder-config/AISettingsSection.tsx

<Card>
  <CardHeader>
    <CardTitle>Fallback Configuration</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Enable Fallbacks</Label>
        <Switch checked={settings.fallback?.enabled} onChange={...} />
      </div>

      <div>
        <Label>Provider Priority</Label>
        <SortableProviderList
          providers={settings.fallback?.providerOrder}
          onChange={...}
        />
      </div>

      <div>
        <Label>Max Retries</Label>
        <Input type="number" value={settings.fallback?.maxRetries} />
      </div>
    </div>
  </CardContent>
</Card>
```

## Implementation Tasks

### Phase 1: Worker Fallback Support
- [ ] Add `AIFallbackConfig` type to `shared/src/config.types.ts`
- [ ] Add `DEFAULT_FALLBACK_CONFIG` constant
- [ ] Implement `AIProviderChain` class in `job-finder-worker/src/job_finder/ai/providers.py`
- [ ] Update `create_provider_from_config` to return chain
- [ ] Add provider availability checks (verify API keys are set)
- [ ] Add logging for fallback events
- [ ] Add tests for fallback behavior

### Phase 2: Backend Fallback Support
- [ ] Create `job-finder-BE/server/src/modules/generator/ai/providers.ts`
- [ ] Implement provider classes using existing npm packages
- [ ] Implement `AIProviderChain` for document generator
- [ ] Wire into document generation workflow
- [ ] Add config route to expose available providers
- [ ] Add tests for backend providers

### Phase 3: UI Configuration
- [ ] Add fallback settings to AI Settings section
- [ ] Implement draggable provider priority list
- [ ] Add provider availability indicators (green/red based on API key presence)
- [ ] Update config validation

### Phase 4: Observability
- [ ] Add metrics for provider usage (which providers are being used)
- [ ] Add metrics for fallback events (how often fallbacks occur)
- [ ] Add alerts for high fallback rates
- [ ] Add provider health dashboard

## Testing Strategy

1. **Unit Tests**
   - Provider chain fallback logic
   - Retry behavior with delays
   - Provider availability checks

2. **Integration Tests**
   - End-to-end fallback with mock providers
   - Config loading and provider chain creation

3. **Manual Testing**
   - Disable primary provider API key, verify fallback works
   - Simulate rate limits, verify retry behavior

## Dependencies

The following packages are already installed and will be used:

**Backend (job-finder-BE):**
- `openai` - OpenAI API client
- `@anthropic-ai/sdk` - Anthropic Claude API client (via claude-code)
- `@google/generative-ai` - Google Gemini API client

**Worker (job-finder-worker):**
- `anthropic` - Anthropic Python SDK
- `openai` - OpenAI Python SDK
- `google-generativeai` - Google Gemini Python SDK

## Open Questions

1. **Should fallback order be per-task configurable?**
   - Current design: Global fallback order per section (worker/documentGenerator)
   - Alternative: Per-task fallback orders (more complex UI)

2. **How to handle model compatibility across providers?**
   - Some prompts may be optimized for specific models
   - Consider: Map equivalent models across providers

3. **Should we support "circuit breaker" patterns?**
   - Temporarily disable providers that are consistently failing
   - Reset after cooldown period

## Timeline

This RFC documents future work. Implementation will be scheduled based on priority.
