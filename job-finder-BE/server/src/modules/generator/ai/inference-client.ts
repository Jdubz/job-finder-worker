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
 * to Gemini (indicating a stale/retired model ID), the client detects the
 * degradation and probes Anthropic for the latest Sonnet model. On success,
 * subsequent calls use the resolved model directly, bypassing the stale alias.
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
 * Process-wide resolved Claude model ID. Once we discover the correct model,
 * all InferenceClient instances in this process use it. Reset to null on
 * probe failure so we retry next time.
 */
let resolvedClaudeModel: string | null = null
let resolveInProgress: Promise<string | null> | null = null

/**
 * Known generalized Sonnet model IDs, newest first.
 * These follow Anthropic's naming: claude-sonnet-{major}-{minor}
 * (no date suffix = latest patch in that family).
 */
const SONNET_CANDIDATES = [
  'claude-sonnet-4-7',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5',
  'claude-sonnet-4-0',
]

/**
 * Probe LiteLLM for the latest working Sonnet model.
 * Tries each candidate as a direct anthropic/ prefixed model (bypassing the
 * claude-document alias) with a minimal 1-token request.
 *
 * Returns the working model ID (e.g., "anthropic/claude-sonnet-4-6") or null.
 * Deduplicates concurrent calls — only one probe runs at a time.
 */
async function probeLatestSonnet(baseUrl: string, apiKey: string, log: Logger): Promise<string | null> {
  // Deduplicate: if a probe is already running, wait for it
  if (resolveInProgress) return resolveInProgress

  resolveInProgress = (async () => {
    for (const candidate of SONNET_CANDIDATES) {
      const model = `anthropic/${candidate}`
      try {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: '.' }],
            max_tokens: 1,
          }),
          signal: AbortSignal.timeout(15_000),
        })

        if (response.ok) {
          log.info({ model }, 'Claude model probe succeeded — resolved latest Sonnet')
          return model
        }

        const body = await response.text().catch(() => '')
        log.debug({ model, status: response.status, body: body.slice(0, 100) }, 'Claude model probe failed')
      } catch (err) {
        log.debug({ model, err }, 'Claude model probe error')
      }
    }

    log.error('All Sonnet model probes failed — Claude will be unavailable until model ID is updated')
    return null
  })()

  try {
    return await resolveInProgress
  } finally {
    resolveInProgress = null
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
  private readonly timeoutMs: number

  /** When false, local-* models are rerouted to the default cloud model. */
  useLocalModels = true

  constructor(private readonly log: Logger = logger) {
    this.baseUrl = (process.env.LITELLM_BASE_URL || 'http://litellm:4000').replace(/\/v1\/?$/, '')
    this.apiKey = process.env.LITELLM_MASTER_KEY || ''
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
    let model = modelOverride || getModelForTask(taskType, this.useLocalModels)

    // If we've already resolved the correct Claude model, use it directly
    if (model === 'claude-document' && resolvedClaudeModel) {
      model = resolvedClaudeModel
    }

    const result = await this.callLitellm(model, prompt, options)

    // Detect silent fallback: requested Claude, got Gemini
    if (this.isClaudeModel(model) && this.isGeminiModel(result.model)) {
      this.log.warn(
        { requestedModel: model, actualModel: result.model, taskType },
        'Claude request silently fell back to Gemini — attempting model resolution'
      )

      // Probe for the correct model (non-blocking for this request — the Gemini
      // result is still valid, just lower quality)
      probeLatestSonnet(this.baseUrl, this.apiKey, this.log).then(resolved => {
        if (resolved) {
          resolvedClaudeModel = resolved
          this.log.info({ resolvedModel: resolved }, 'Future Claude requests will use resolved model')
        }
      }).catch(() => { /* non-fatal */ })
    }

    return result
  }

  private async callLitellm(
    model: string,
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
            'unknown',
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
        { taskType: 'inference', model: actualModel, tokens: data.usage?.total_tokens },
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
    let resolvedModel = model || getModelForTask('chat', this.useLocalModels)

    // Use resolved Claude model if available
    if (resolvedModel === 'claude-document' && resolvedClaudeModel) {
      resolvedModel = resolvedClaudeModel
    }

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
