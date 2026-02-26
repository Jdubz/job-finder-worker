/**
 * Unified AI inference client via LiteLLM proxy.
 *
 * Replaces AgentManager by routing all AI requests through the LiteLLM proxy,
 * which handles provider selection, fallbacks, retries, and budget tracking.
 *
 * Exposes the same interface as the old AgentManager so callers can swap
 * with minimal changes.
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

function getModelForTask(taskType: string): string {
  return TASK_MODEL_MAP[taskType] ?? DEFAULT_MODEL
}

// ── Types ───────────────────────────────────────────────────────────────────

export type AgentExecutionResult = {
  output: string
  agentId: string
  model: string | undefined
}

export class InferenceError extends Error {}

export class NoAgentsAvailableError extends Error {
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

  constructor(private readonly log: Logger = logger) {
    this.baseUrl = process.env.LITELLM_BASE_URL || 'http://litellm:4000'
    this.apiKey = process.env.LITELLM_MASTER_KEY || ''
    this.timeoutMs = Number(process.env.LITELLM_TIMEOUT || '120000')
  }

  /**
   * Pre-check that LiteLLM proxy is reachable.
   * Drop-in replacement for AgentManager.ensureAvailable().
   */
  ensureAvailable(_taskType: string): void {
    // LiteLLM handles provider availability — if it's configured and running,
    // we trust it to route requests. No pre-flight check needed at the proxy
    // level (the actual call will surface errors).
    //
    // This is a no-op to maintain API compatibility.
  }

  /**
   * Execute an AI task via LiteLLM proxy.
   * Drop-in replacement for AgentManager.execute().
   */
  async execute(
    taskType: string,
    prompt: string,
    modelOverride?: string
  ): Promise<AgentExecutionResult> {
    const model = modelOverride || getModelForTask(taskType)
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
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 8192,
          temperature: 0.7,
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
      this.log.error({ err, taskType, model }, 'LiteLLM request failed')
      throw new InferenceError(`AI generation failed: ${msg}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  /**
   * Stream a chat completion via LiteLLM proxy (SSE).
   * Used by ChatService for real-time streaming.
   */
  async *streamChat(
    messages: Array<{ role: string; content: string }>,
    systemPrompt?: string,
    model?: string
  ): AsyncGenerator<string> {
    const resolvedModel = model || getModelForTask('chat')
    const url = `${this.baseUrl}/v1/chat/completions`

    const body: Record<string, unknown> = {
      model: resolvedModel,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages,
      ],
      max_tokens: 1024,
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
        throw new Error(`LiteLLM stream failed: HTTP ${response.status}`)
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
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Chat stream timed out')
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }
}
