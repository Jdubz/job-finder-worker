import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CliProvider } from './cli-runner'

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

    const stdout = typeof result === 'object' && result !== null && 'stdout' in result ? String((result as any).stdout) : ''
    const stderr = typeof result === 'object' && result !== null && 'stderr' in result ? String((result as any).stderr) : ''
    const combined = `${stdout}\n${stderr}`.toLowerCase()

    const authHints = ['not logged in', 'login required', 'log in to continue', 'refresh token', 'expired token']
    if (authHints.some((hint) => combined.includes(hint))) {
      throw new Error('Authentication required')
    }
  } catch (error) {
    const asError = error as Error & { stderr?: string }
    const detail = asError.stderr || asError.message || 'Unknown error'
    throw new Error(`AI provider '${provider}' is not authenticated or unavailable: ${detail}`)
  }
}
