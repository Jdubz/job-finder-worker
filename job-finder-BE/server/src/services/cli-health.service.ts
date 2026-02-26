import type { AgentCliProvider, AgentCliStatus } from '@shared/types'

export type CliHealthMap = Record<AgentCliProvider, AgentCliStatus>

/**
 * Check AI provider health by probing the LiteLLM proxy.
 *
 * All AI inference routes through LiteLLM now — provider-level credentials
 * live in the litellm container, not here. We check proxy reachability
 * as a proxy (pun intended) for provider availability.
 */
export async function getLocalCliHealth(): Promise<CliHealthMap> {
  const baseUrl = (process.env.LITELLM_BASE_URL || 'http://litellm:4000').replace(/\/v1\/?$/, '')

  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) })
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
