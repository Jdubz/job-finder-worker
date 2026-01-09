import type { AgentCliProvider, AgentCliStatus } from '@shared/types'
import { logger } from '../logger'

export type CliHealthMap = Record<AgentCliProvider, AgentCliStatus>

// Only Claude CLI is supported for backend generator tasks
const PROVIDERS: AgentCliProvider[] = ['claude']

async function checkClaudeConfig(): Promise<AgentCliStatus> {
  // Claude CLI uses OAuth token from environment variable
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN

  if (oauthToken) {
    return {
      healthy: true,
      message: 'OAuth token configured'
    }
  }

  // Check for Claude API key as fallback indicator (though we use CLI)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    return {
      healthy: true,
      message: 'API key configured (CLI may use OAuth separately)'
    }
  }

  return {
    healthy: false,
    message: 'Claude CLI not configured: CLAUDE_CODE_OAUTH_TOKEN not set'
  }
}

async function runCheck(provider: AgentCliProvider): Promise<AgentCliStatus> {
  switch (provider) {
    case 'claude':
      return checkClaudeConfig()
    default:
      return { healthy: false, message: `Unknown provider: ${provider}` }
  }
}

export async function getLocalCliHealth(): Promise<CliHealthMap> {
  const entries = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const status = await runCheck(provider)
      return [provider, status] as const
    })
  )

  return Object.fromEntries(entries) as CliHealthMap
}
