import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AgentCliProvider, AgentCliStatus } from '@shared/types'
import { logger } from '../logger'

const execFileAsync = promisify(execFile)

export type CliHealthMap = Record<AgentCliProvider, AgentCliStatus>

const CHECKS: Record<AgentCliProvider, { cmd: string; args: string[]; successPattern: RegExp }> = {
  codex: { cmd: 'codex', args: ['login', 'status'], successPattern: /logged in/i },
  gemini: { cmd: 'gemini', args: ['auth', 'status'], successPattern: /(logged in|authenticated)/i }
}

async function runCheck(provider: AgentCliProvider): Promise<AgentCliStatus> {
  const check = CHECKS[provider]
  try {
    const { stdout, stderr } = await execFileAsync(check.cmd, check.args, { timeout: 5_000 })
    const output = `${stdout} ${stderr}`.trim()
    const lower = output.toLowerCase()
    const healthy = check.successPattern.test(lower) && !/not\s+(logged in|authenticated)/i.test(lower)

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
