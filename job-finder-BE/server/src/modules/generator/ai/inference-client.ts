/**
 * Unified AI inference client via LiteLLM proxy.
 *
 * Replaces AgentManager by routing all AI requests through the LiteLLM proxy,
 * which handles provider selection, fallbacks, retries, and budget tracking.
 *
 * Exposes the same interface as the old AgentManager so callers can swap
 * with minimal changes.
 *
 * Model auto-resolution: When a `claude-document` request silently falls back
 * to Gemini (indicating a stale/retired model ID or inaccessible model), the
 * client detects the degradation and probes the Anthropic API directly for the
 * latest accessible Claude model. On success, registers the working model in
 * LiteLLM via its admin API so subsequent requests route to it automatically.
 */

import type { Logger } from 'pino'
import { logger } from '../../../logger'

// ── Task Router ─────────────────────────────────────────────────────────────

const TASK_MODEL_MAP: Record<string, string> = {
  extraction: 'local-extract',
  analysis: 'local-extract',
  document: 'claude-document',
  chat: 'claude-document',
}

const DEFAULT_MODEL = 'gemini-general'

function getModelForTask(taskType: string, useLocal = true): string {
  const model = TASK_MODEL_MAP[taskType] ?? DEFAULT_MODEL
  if (!useLocal && model.startsWith('local-')) return DEFAULT_MODEL
  return model
}

// ── Model Resolver ──────────────────────────────────────────────────────────

/**
 * Process-wide probe state. Tracks whether we've already probed Anthropic
 * and registered a working model with LiteLLM.
 */
let probeInProgress: Promise<string | null> | null = null
let lastProbeAtMs = 0
const PROBE_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

/** @internal Reset resolved model state (for tests only) */
export function _resetResolvedModel(): void {
  probeInProgress = null
  lastProbeAtMs = 0
}

/**
 * Known Claude model IDs to probe, newest first.
 * Sonnet preferred (best quality for document generation), then Haiku (fallback).
 * Generalized names (no date suffix) resolve to the latest patch in that family.
 */
const CLAUDE_CANDIDATES = [
  'claude-sonnet-4-7',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-sonnet-4-0',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
]

/**
 * Probe Anthropic directly for the latest working Claude model accessible
 * with the current API key. Tries each candidate with a minimal 1-token request.
 *
 * On success, registers the working model as a new `claude-document` deployment
 * in LiteLLM via its admin API, so subsequent requests route to it automatically.
 *
 * Returns the working model ID (e.g., "claude-sonnet-4-6") or null.
 * Deduplicates concurrent calls — only one probe runs at a time.
 */
async function probeWorkingClaudeModel(
  litellmBaseUrl: string,
  litellmApiKey: string,
  anthropicApiKey: string,
  log: Logger
): Promise<string | null> {
  // Deduplicate: if a probe is already running, wait for it
  if (probeInProgress) return probeInProgress

  probeInProgress = (async () => {
    // ── Step 1: Find a working model via direct Anthropic API call ──────────
    let workingModel: string | null = null

    for (const candidate of CLAUDE_CANDIDATES) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: candidate,
            max_tokens: 1,
            messages: [{ role: 'user', content: '.' }],
          }),
          signal: AbortSignal.timeout(15_000),
        })

        if (response.ok) {
          workingModel = candidate
          log.info({ model: candidate }, 'Claude model probe succeeded via Anthropic API')
          break
        }

        const body = await response.text().catch(() => '')
        log.debug({ model: candidate, status: response.status, body: body.slice(0, 100) }, 'Claude model probe failed')
      } catch (err) {
        log.debug({ model: candidate, err }, 'Claude model probe error')
      }
    }

    if (!workingModel) {
      log.error('All Claude model probes failed — Claude will be unavailable until API key or model access is updated')
      return null
    }

    // ── Step 2: Register working model in LiteLLM via admin API ────────────
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (litellmApiKey) {
        headers.Authorization = `Bearer ${litellmApiKey}`
      }

      const response = await fetch(`${litellmBaseUrl}/model/new`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model_name: 'claude-document',
          litellm_params: {
            model: `anthropic/${workingModel}`,
            api_key: anthropicApiKey,
          },
        }),
        signal: AbortSignal.timeout(10_000),
      })

      if (response.ok) {
        log.info(
          { resolvedModel: workingModel },
          'Registered working Claude model in LiteLLM — future claude-document requests will use it'
        )
      } else {
        const body = await response.text().catch(() => '')
        log.warn(
          { status: response.status, body: body.slice(0, 200) },
          `Found working model ${workingModel} but failed to register in LiteLLM — restart LiteLLM to apply`
        )
      }
    } catch (err) {
      log.warn({ err, model: workingModel }, 'Failed to register model in LiteLLM (non-fatal)')
    }

    return workingModel
  })()

  try {
    return await probeInProgress
  } finally {
    probeInProgress = null
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

type AgentExecutionResult = {
  output: string
  agentId: string
  model: string | undefined
}

export class InferenceError extends Error {}

class NoAgentsAvailableError extends Error {
  constructor(
    message: string,
    readonly taskType: string,
    readonly triedAgents: string[]
  ) {
    super(message)
  }
}

// ── Inference Client ────────────────────────────────────────────────────────

export class InferenceClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly anthropicApiKey: string
  private readonly timeoutMs: number

  /** When false, local-* models are rerouted to the default cloud model. */
  useLocalModels = true

  constructor(private readonly log: Logger = logger) {
    this.baseUrl = (process.env.LITELLM_BASE_URL || 'http://litellm:4000').replace(/\/v1\/?$/, '')
    this.apiKey = process.env.LITELLM_MASTER_KEY || ''
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || ''
    // LITELLM_TIMEOUT is in seconds (matching Python client); convert to ms
    this.timeoutMs = Number(process.env.LITELLM_TIMEOUT || '120') * 1000
  }

  /**
   * Execute an AI task via LiteLLM proxy.
   * Drop-in replacement for AgentManager.execute().
   */
  async execute(
    taskType: string,
    prompt: string,
    modelOverride?: string,
    options: { max_tokens?: number; temperature?: number; systemPrompt?: string } = {}
  ): Promise<AgentExecutionResult> {
    const model = modelOverride || getModelForTask(taskType, this.useLocalModels)

    const result = await this.callLitellm(model, taskType, prompt, options)

    // Detect silent fallback: requested Claude alias, got Gemini back.
    // Probe Anthropic directly for a working model and register it in LiteLLM.
    // Respects cooldown to avoid hammering on sustained Claude outages.
    const requestedAlias = (modelOverride || getModelForTask(taskType, this.useLocalModels)) === 'claude-document'
    if (requestedAlias && this.isGeminiModel(result.model)) {
      this.log.warn(
        { requestedModel: model, actualModel: result.model, taskType },
        'Claude request silently fell back to Gemini'
      )

      if (!this.anthropicApiKey) {
        this.log.debug('ANTHROPIC_API_KEY not available — skipping Claude model probe')
      } else {
        const now = Date.now()
        if (now - lastProbeAtMs >= PROBE_COOLDOWN_MS) {
          lastProbeAtMs = now
          probeWorkingClaudeModel(this.baseUrl, this.apiKey, this.anthropicApiKey, this.log)
            .catch(() => { /* non-fatal */ })
        }
      }
    }

    return result
  }

  private async callLitellm(
    model: string,
    taskType: string,
    prompt: string,
    options: { max_tokens?: number; temperature?: number; systemPrompt?: string }
  ): Promise<AgentExecutionResult> {
    const url = `${this.baseUrl}/v1/chat/completions`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
            { role: 'user', content: prompt },
          ],
          max_tokens: options.max_tokens ?? 8192,
          temperature: options.temperature ?? 0.7,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const body = await response.text().catch(() => '')

        if (response.status === 429) {
          throw new InferenceError(
            'AI provider rate limit exceeded. Please try again later.'
          )
        }

        if (response.status === 502 || response.status === 503) {
          throw new NoAgentsAvailableError(
            `All LiteLLM providers unavailable for model ${model}: ${body}`,
            taskType,
            [model]
          )
        }

        throw new InferenceError(
          `AI generation failed (HTTP ${response.status}): ${body.slice(0, 200)}`
        )
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>
        model?: string
        usage?: { total_tokens?: number }
      }

      const output = data.choices?.[0]?.message?.content || ''
      const actualModel = data.model || model

      this.log.info(
        { taskType, model: actualModel, tokens: data.usage?.total_tokens },
        'LiteLLM call succeeded'
      )

      return { output, agentId: `litellm:${model}`, model: actualModel }
    } catch (err) {
      if (err instanceof InferenceError || err instanceof NoAgentsAvailableError) {
        throw err
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new InferenceError(
          `AI generation timed out after ${this.timeoutMs / 1000} seconds`
        )
      }

      const msg = err instanceof Error ? err.message : 'Unknown error'
      this.log.error({ err, model }, 'LiteLLM request failed')
      throw new InferenceError(`AI generation failed: ${msg}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  private isClaudeModel(model?: string): boolean {
    if (!model) return false
    const m = model.toLowerCase()
    return m === 'claude-document' || m.includes('claude') || m.includes('anthropic')
  }

  private isGeminiModel(model?: string): boolean {
    if (!model) return false
    return model.toLowerCase().includes('gemini')
  }

  /**
   * Stream a chat completion via LiteLLM proxy (SSE).
   * Used by ChatService for real-time streaming.
   */
  async *streamChat(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    model?: string,
    options: { max_tokens?: number } = {}
  ): AsyncGenerator<string> {
    const resolvedModel = model || getModelForTask('chat', this.useLocalModels)

    const url = `${this.baseUrl}/v1/chat/completions`

    const body: Record<string, unknown> = {
      model: resolvedModel,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages,
      ],
      max_tokens: options.max_tokens ?? 1024,
      stream: true,
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => '')
        throw new InferenceError(`LiteLLM stream failed: HTTP ${response.status}: ${body.slice(0, 200)}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') return

          try {
            const parsed = JSON.parse(data) as {
              choices: Array<{ delta: { content?: string } }>
            }
            const content = parsed.choices?.[0]?.delta?.content
            if (content) yield content
          } catch (parseErr) {
            this.log.debug({ chunkLength: data.length, err: parseErr }, 'Skipping malformed SSE chunk')
          }
        }
      }
    } catch (err) {
      if (err instanceof InferenceError) throw err
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new InferenceError(`Chat stream timed out after ${this.timeoutMs / 1000} seconds`)
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }
}
