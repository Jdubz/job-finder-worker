import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { logger } from '../../../../logger'

// Primary provider is 'codex' (OpenAI/ChatGPT)
// Other providers are included for future support but not currently active
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
  // Currently only OpenAI/Codex provider is actively supported
  // Other providers are included in fallback chain for future implementation
  const providers: CliProvider[] =
    preferred === 'codex' ? ['codex'] : [preferred, 'codex']

  for (const provider of providers) {
    const result = await executeCommand(provider, prompt)
    if (result.success) {
      return result
    }
  }

  // If all providers fail, log a warning about the current limitations
  logger.warn('Document generation failed. Only OpenAI/Codex provider is currently supported.')
  return { success: false, output: '', error: 'Provider failed. Currently only OpenAI/Codex is supported.' }
}

async function executeCommand(provider: CliProvider, prompt: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const command = buildCommand(provider, prompt)
    const logFile = path.join(os.tmpdir(), `generator-cli-${randomUUID()}.log`)

    logger.info({ provider, cmd: command.cmd }, 'Executing AI generation command')

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

    child.on('error', (error: any) => {
      failed = true
      logger.warn({ provider, error }, 'CLI process error')
      // Check if the command was not found
      if (error.code === 'ENOENT') {
        const errorMsg = `AI CLI tool '${command.cmd}' not found. Please ensure the ${provider} CLI is installed and available in PATH.`
        logger.error(errorMsg)
        resolve({ success: false, output: '', error: errorMsg })
      } else {
        resolve({ success: false, output: stdout, error: error.message })
      }
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
