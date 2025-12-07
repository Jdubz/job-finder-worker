import { spawn, type ChildProcess } from 'node:child_process'
import { logger } from '../../../../logger'
import { isAuthenticationError, isQuotaError } from './auth-error.util'

// Primary provider is 'codex' (OpenAI/ChatGPT)
// Other providers are included for future support but not currently active
export type CliProvider = 'codex' | 'gemini' | 'claude'

export type CliErrorType = 'quota' | 'auth' | 'timeout' | 'not_found' | 'other'

interface CliResult {
  success: boolean
  output: string
  error?: string
  errorType?: CliErrorType
}

export interface CliRunOptions {
  model?: string
  /** Timeout in milliseconds (default: 120000 = 2 minutes) */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 120_000 // 2 minutes

function classifyError(message?: string): CliErrorType {
  if (!message) return 'other'
  if (isQuotaError(message)) return 'quota'
  if (isAuthenticationError(message)) return 'auth'
  return 'other'
}

function sanitizeCliError(raw?: string): string {
  if (!raw) return 'AI generation failed'
  const text = raw.toString()
  if (isAuthenticationError(text)) {
    return 'AI provider authentication required. Please log in and retry.'
  }
  if (isQuotaError(text)) {
    return 'AI provider rate limit or quota exceeded. Please try again later.'
  }
  // Strip long prompts: keep content before separator lines or first 400 chars
  const separators = ['--------', 'INPUT DATA', 'user\n']
  for (const sep of separators) {
    const idx = text.indexOf(sep)
    if (idx > 0) return text.slice(0, idx).trim()
  }
  return text.slice(0, 400).trim()
}

function buildCommand(provider: CliProvider, prompt: string, model?: string): { cmd: string; args: string[] } {
  if (provider === 'codex') {
    return {
      cmd: 'codex',
      // Skip Codex's git repo trust check because production containers don't include the .git folder
      args: ['exec', '--skip-git-repo-check', '--cd', process.cwd(), '--dangerously-bypass-approvals-and-sandbox', prompt]
    }
  }
  if (provider === 'gemini') {
    return {
      cmd: 'gemini',
      args: ['--print', '--model', model || 'gemini-1.5-flash', '--output', 'json', '--prompt', prompt]
    }
  }
  if (provider === 'claude') {
    const args = ['--print', '--output-format', 'json']
    if (model) {
      args.push('--model', model)
    }
    if (process.env.CLAUDE_SKIP_PERMISSIONS !== 'false') {
      args.push('--dangerously-skip-permissions')
    }
    args.push('--prompt', prompt)
    return {
      cmd: 'claude',
      args
    }
  }
  return {
    cmd: 'codex',
    args: ['exec', '--cd', process.cwd(), '--dangerously-bypass-approvals-and-sandbox', prompt]
  }
}

/**
 * Execute a CLI provider command.
 *
 * Note: Fallback logic is handled by AgentManager at a higher level.
 * This function only executes a single provider.
 */
export async function runCliProvider(
  prompt: string,
  provider: CliProvider,
  options: CliRunOptions = {}
): Promise<CliResult> {
  return executeCommand(provider, prompt, options.model, options.timeoutMs)
}

async function executeCommand(
  provider: CliProvider,
  prompt: string,
  model?: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<CliResult> {
  return new Promise((resolve) => {
    const command = buildCommand(provider, prompt, model)

    logger.info({ provider, cmd: command.cmd, timeoutMs }, 'Executing AI generation command')

    const child: ChildProcess = spawn(command.cmd, command.args, {
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let failed = false
    let timedOut = false

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!failed) {
        timedOut = true
        failed = true
        logger.warn({ provider, timeoutMs }, 'CLI process timed out, killing process')
        child.kill('SIGTERM')
        // Give it a moment to terminate gracefully, then force kill
        const forceKillTimeout = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 5000)
        // Clear force kill timeout if process exits gracefully
        child.once('exit', () => clearTimeout(forceKillTimeout))
        resolve({
          success: false,
          output: stdout,
          error: `AI generation timed out after ${timeoutMs / 1000} seconds`,
          errorType: 'timeout'
        })
      }
    }, timeoutMs)

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeoutId)
      if (failed) return
      failed = true
      logger.warn({ provider, error }, 'CLI process error')
      // Check if the command was not found
      if (error.code === 'ENOENT') {
        const errorMsg = `AI CLI tool '${command.cmd}' not found. Please ensure the ${provider} CLI is installed and available in PATH.`
        logger.error(errorMsg)
        resolve({ success: false, output: '', error: errorMsg, errorType: 'not_found' })
      } else {
        const errorType = classifyError(error.message)
        resolve({ success: false, output: stdout, error: error.message || 'Unknown error', errorType })
      }
    })

    child.on('close', (code) => {
      clearTimeout(timeoutId)
      if (failed || timedOut) {
        return
      }
      if (code === 0) {
        resolve({ success: true, output: stdout })
        return
      }

      // Some CLI tools emit valid JSON but still return non-zero (e.g., extra stderr noise).
      // If stdout parses as JSON, treat it as success so downstream rendering can continue.
      try {
        const parsed = JSON.parse(stdout) // validate once; keep returning stdout to preserve API contract
        void parsed
        logger.warn({ provider, code }, 'CLI exited non-zero but produced JSON; accepting output')
        resolve({ success: true, output: stdout })
        return
      } catch {
        const combinedOutput = stderr || stdout
        const errorType = classifyError(combinedOutput)
        logger.warn({ provider, code, stderr, errorType }, 'CLI provider failed')
        resolve({
          success: false,
          output: stdout,
          error: sanitizeCliError(combinedOutput),
          errorType
        })
      }
    })
  })
}
