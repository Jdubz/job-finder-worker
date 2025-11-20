import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { logger } from '../../../../logger'

export type CliProvider = 'codex' | 'gemini' | 'claude'

interface CliResult {
  success: boolean
  output: string
  error?: string
}

function buildCommand(provider: CliProvider, prompt: string): { cmd: string; args: string[] } {
  if (provider === 'codex') {
    return {
      cmd: 'codex',
      args: ['exec', '--cd', process.cwd(), '--dangerously-bypass-approvals-and-sandbox', prompt]
    }
  }
  if (provider === 'gemini') {
    return {
      cmd: 'gemini',
      args: ['--print', '--model', 'gemini-1.5-flash', '--output', 'json', '--prompt', prompt]
    }
  }
  if (provider === 'claude') {
    return {
      cmd: 'claude',
      args: ['--print', '--dangerously-skip-permissions', '--output-format', 'json', '--prompt', prompt]
    }
  }
  return {
    cmd: 'codex',
    args: ['exec', '--cd', process.cwd(), '--dangerously-bypass-approvals-and-sandbox', prompt]
  }
}

export async function runCliProvider(prompt: string, preferred: CliProvider = 'codex'): Promise<CliResult> {
  const providers: CliProvider[] =
    preferred === 'codex' ? ['codex', 'gemini', 'claude'] : [preferred, 'codex', 'gemini', 'claude']
  for (const provider of providers) {
    const result = await executeCommand(provider, prompt)
    if (result.success) {
      return result
    }
  }
  return { success: false, output: '', error: 'All providers failed' }
}

async function executeCommand(provider: CliProvider, prompt: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const command = buildCommand(provider, prompt)
    const logFile = path.join(os.tmpdir(), `generator-cli-${randomUUID()}.log`)

    const child = spawn(command.cmd, command.args, {
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let failed = false

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error) => {
      failed = true
      logger.warn({ provider, error }, 'CLI process error')
      resolve({ success: false, output: stdout, error: error.message })
    })

    child.on('close', (code) => {
      if (failed) {
        return
      }
      if (code === 0) {
        resolve({ success: true, output: stdout })
      } else {
        logger.warn({ provider, code, stderr, logFile }, 'CLI provider failed')
        resolve({ success: false, output: stdout, error: stderr })
      }
    })
  })
}
