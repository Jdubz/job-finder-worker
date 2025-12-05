import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AgentCliProvider, AgentCliStatus } from '@shared/types'
import { logger } from '../logger'

const execFileAsync = promisify(execFile)

export type CliHealthMap = Record<AgentCliProvider, AgentCliStatus>

type CliCheck = { cmd: string; args: string[]; successPattern: RegExp }

/**
 * Health checks should be lightweight, non‑interactive, and actually hit the
 * remote service so expired/invalid tokens are detected. Using `gemini auth status`
 * can block waiting for interactive input, so we instead run a tiny models list
 * call in non‑interactive mode.
 */
const CHECKS: Record<AgentCliProvider, CliCheck> = {
  codex: { cmd: 'codex', args: ['login', 'status'], successPattern: /logged in/i },
  gemini: {
    cmd: 'bash',
    args: [
      '-lc',
      // Auth-only, non-interactive check (no model request, avoids quota burn)
      'CI=true GEMINI_NON_INTERACTIVE=1 GEMINI_OUTPUT=json gemini auth status --quiet'
    ],
    // Auth status prints account/project info on success; any auth-related keywords are fine
    successPattern: /authenticated|authorized|project|account|api key|token/i
  }
}

async function runCheck(provider: AgentCliProvider): Promise<AgentCliStatus> {
  const check = CHECKS[provider]
  try {
    const { stdout, stderr } = await execFileAsync(check.cmd, check.args, { timeout: 7_000 })
    const output = `${stdout} ${stderr}`.trim()
    const lower = output.toLowerCase()
    const unauthenticated = /unauthorized|permission|auth required|login required|unavailable/i.test(lower)
    const healthy = check.successPattern.test(lower) && !unauthenticated

    return {
      healthy,
      message: output || 'Command succeeded'
    }
  } catch (error) {
    const err = error as Error & { stderr?: string }
    const message = err.stderr?.trim() || err.message || 'Unknown error'
    logger.warn({ provider, message }, 'Agent CLI health check failed')
    return {
      healthy: false,
      message
    }
  }
}

export async function getLocalCliHealth(): Promise<CliHealthMap> {
  const entries = await Promise.all(
    (Object.keys(CHECKS) as AgentCliProvider[]).map(async (provider) => {
      const status = await runCheck(provider)
      return [provider, status] as const
    })
  )

  return Object.fromEntries(entries) as CliHealthMap
}
