import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CliProvider } from './cli-runner'
import { UserFacingError } from '../generator.workflow.service'
import { isAuthenticationError } from './auth-error.util'

const execFileAsync = promisify(execFile)

const HEALTH_CHECKS: Record<CliProvider, { cmd: string; args: string[] } | null> = {
  codex: { cmd: 'codex', args: ['login', 'status'] },
  gemini: { cmd: 'gemini', args: ['auth', 'status'] },
  claude: null // no CLI health command available yet
}

export async function ensureCliProviderHealthy(provider: CliProvider): Promise<void> {
  const check = HEALTH_CHECKS[provider]
  if (!check) {
    // Nothing to validate for this provider yet
    return
  }

  try {
    const result = await execFileAsync(check.cmd, check.args, { timeout: 5_000 })

    if (isAuthenticationError(result.stderr) || isAuthenticationError(result.stdout)) {
      throw new UserFacingError('AI provider authentication required. Please log in and retry.')
    }
  } catch (error) {
    const asError = error as Error & { stderr?: string }
    const detail = asError.stderr || asError.message || 'Unknown error'
    throw new UserFacingError(`AI provider '${provider}' is not authenticated or unavailable: ${detail}`)
  }
}
