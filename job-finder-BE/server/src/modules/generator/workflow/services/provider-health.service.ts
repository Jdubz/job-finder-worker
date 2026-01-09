import type { CliProvider } from './cli-runner'
import { UserFacingError } from '../generator.workflow.service'

/**
 * Ensure the CLI provider is healthy and ready for use.
 * Only Claude CLI is supported for backend generator tasks.
 */
export async function ensureCliProviderHealthy(provider: CliProvider): Promise<void> {
  // Only Claude CLI is supported
  if (provider !== 'claude') {
    throw new UserFacingError(`Unsupported CLI provider: ${provider}. Only 'claude' is supported.`)
  }

  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    throw new UserFacingError('Claude CLI not authenticated. Set CLAUDE_CODE_OAUTH_TOKEN for this service scope.')
  }
}
