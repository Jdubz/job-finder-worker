import type { AgentCliProvider, AgentCliStatus, LitellmModelHealth } from '@shared/types'
import { logger } from '../logger'

export type CliHealthMap = Record<AgentCliProvider, AgentCliStatus>

function getLitellmBaseUrl(): string {
  return (process.env.LITELLM_BASE_URL || 'http://litellm:4000').replace(/\/v1\/?$/, '')
}

function getLitellmMasterKey(): string {
  return process.env.LITELLM_MASTER_KEY || ''
}

/**
 * Check AI provider health by probing the LiteLLM proxy.
 *
 * All AI inference routes through LiteLLM now — provider-level credentials
 * live in the litellm container, not here. We check proxy reachability
 * as a proxy (pun intended) for provider availability.
 */
export async function getLocalCliHealth(): Promise<CliHealthMap> {
  try {
    const response = await fetch(`${getLitellmBaseUrl()}/health/readiness`, { signal: AbortSignal.timeout(5000) })
    if (response.ok) {
      return {
        claude: { healthy: true, message: 'LiteLLM proxy healthy' },
      }
    }
    return {
      claude: { healthy: false, message: `LiteLLM proxy returned HTTP ${response.status}` },
    }
  } catch {
    return {
      claude: { healthy: false, message: 'LiteLLM proxy unreachable' },
    }
  }
}

/**
 * Query LiteLLM /health endpoint for per-model health status.
 * Returns structured health data for each configured model.
 */
export async function getLitellmModelHealth(): Promise<LitellmModelHealth[]> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (getLitellmMasterKey()) {
      headers.Authorization = `Bearer ${getLitellmMasterKey()}`
    }

    const response = await fetch(`${getLitellmBaseUrl()}/health`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      logger.warn({ status: response.status }, 'LiteLLM /health returned non-200')
      return []
    }

    const data = await response.json() as {
      healthy_endpoints?: Array<{ model: string; model_name?: string }>
      unhealthy_endpoints?: Array<{ model: string; model_name?: string; error?: string }>
    }

    const results: LitellmModelHealth[] = []

    for (const ep of data.healthy_endpoints ?? []) {
      const group = resolveModelGroup(ep.model)
      results.push({
        model: ep.model,
        modelGroup: group,
        healthy: true,
      })
    }

    for (const ep of data.unhealthy_endpoints ?? []) {
      const group = resolveModelGroup(ep.model)
      // Extract just the error type/message, not the full stack trace
      const errorMsg = extractErrorSummary(ep.error)
      results.push({
        model: ep.model,
        modelGroup: group,
        healthy: false,
        error: errorMsg,
      })
    }

    return results
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch LiteLLM /health (non-fatal)')
    return []
  }
}

/**
 * Resolve a LiteLLM model identifier to its model_group name.
 * E.g., "anthropic/claude-sonnet-4-6" → "claude-document"
 */
function resolveModelGroup(model: string): string {
  const modelLower = model.toLowerCase()
  if (modelLower.includes('claude') || modelLower.includes('anthropic')) return 'claude-document'
  if (modelLower.includes('gemini')) return 'gemini-general'
  if (modelLower.includes('nomic') || modelLower.includes('embed')) return 'local-embed'
  if (modelLower.includes('ollama') || modelLower.includes('llama') || modelLower.includes('gemma') || modelLower.includes('openai/')) return 'local-extract'
  return model
}

/**
 * Extract a concise error summary from LiteLLM's verbose error string.
 * E.g., "litellm.BadRequestError: AnthropicException - {...}" → "AnthropicException - invalid_request_error"
 */
function extractErrorSummary(error?: string): string | undefined {
  if (!error) return undefined

  // Try to extract the provider exception type and message
  const exceptionMatch = error.match(/(\w+Exception)\s*-\s*(\{[^}]+\})/)
  if (exceptionMatch) {
    try {
      const parsed = JSON.parse(exceptionMatch[2])
      const errType = parsed?.error?.type || parsed?.type
      return `${exceptionMatch[1]}: ${errType || 'unknown error'}`
    } catch {
      return exceptionMatch[1]
    }
  }

  // Try to extract just the first line
  const firstLine = error.split('\n')[0]
  // Strip litellm prefix
  const cleaned = firstLine.replace(/^litellm\.\w+:\s*/, '')
  return cleaned.slice(0, 120)
}
