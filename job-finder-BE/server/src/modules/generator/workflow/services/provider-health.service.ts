import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CliProvider } from './cli-runner'
import { UserFacingError } from '../generator.workflow.service'

interface CodexAuthFile {
  OPENAI_API_KEY?: string | null
  tokens?: {
    refresh_token?: string
  }
}

interface GeminiSettings {
  security?: {
    auth?: {
      selectedType?: string
    }
  }
}

interface GeminiOAuthCreds {
  refresh_token?: string
}

async function checkCodexConfig(): Promise<void> {
  const codexDir = join(homedir(), '.codex')
  const authPath = join(codexDir, 'auth.json')

  try {
    const authRaw = await readFile(authPath, 'utf-8')
    const auth = JSON.parse(authRaw) as CodexAuthFile

    // Check for API key in file
    if (auth.OPENAI_API_KEY) {
      return // API key configured
    }

    // Check for API key in environment
    if (process.env.OPENAI_API_KEY) {
      return // API key from environment
    }

    // Check for OAuth tokens
    if (auth.tokens?.refresh_token) {
      return // OAuth credentials configured
    }

    throw new UserFacingError('Codex CLI not authenticated. Please run "codex login" to set up authentication.')
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error
    }
    const err = error as NodeJS.ErrnoException

    // If auth file doesn't exist, check for API key in environment
    if (err.code === 'ENOENT') {
      if (process.env.OPENAI_API_KEY) {
        return // API key from environment
      }
      throw new UserFacingError('Codex CLI not configured. Please run "codex login" to set up authentication.')
    }

    throw new UserFacingError(`Failed to verify Codex configuration: ${err.message}`)
  }
}

async function checkGeminiConfig(): Promise<void> {
  const geminiDir = join(homedir(), '.gemini')
  const settingsPath = join(geminiDir, 'settings.json')

  // First, try to read and parse settings.json
  let settings: GeminiSettings
  try {
    const settingsRaw = await readFile(settingsPath, 'utf-8')
    settings = JSON.parse(settingsRaw) as GeminiSettings
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      throw new UserFacingError('Gemini CLI not configured. Please run "gemini" to set up authentication.')
    }
    throw new UserFacingError(`Failed to read Gemini settings: ${err.message}`)
  }

  const authType = settings?.security?.auth?.selectedType

  if (!authType) {
    throw new UserFacingError('Gemini CLI not configured: no auth type selected. Please run "gemini" to set up authentication.')
  }

  // For OAuth auth types, verify credentials file exists with refresh token
  if (authType.startsWith('oauth')) {
    const credsPath = join(geminiDir, 'oauth_creds.json')
    let creds: GeminiOAuthCreds
    try {
      const credsRaw = await readFile(credsPath, 'utf-8')
      creds = JSON.parse(credsRaw) as GeminiOAuthCreds
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        throw new UserFacingError('Gemini OAuth credentials file not found. Please run "gemini" to re-authenticate.')
      }
      throw new UserFacingError(`Failed to read Gemini OAuth credentials: ${err.message}`)
    }

    if (!creds.refresh_token) {
      throw new UserFacingError('Gemini OAuth credentials incomplete. Please run "gemini" to re-authenticate.')
    }
    return // OAuth credentials are valid
  }

  // For API key auth, check environment variables
  if (authType === 'api-key') {
    const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
    if (!hasKey) {
      throw new UserFacingError('Gemini API key not found. Please set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.')
    }
    return
  }

  // For other auth types (like gcloud), assume configured if settings exist
}

export async function ensureCliProviderHealthy(provider: CliProvider): Promise<void> {
  switch (provider) {
    case 'codex':
      return checkCodexConfig()
    case 'gemini':
      return checkGeminiConfig()
    case 'claude':
      if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return
      try {
        const credPath = join(homedir(), '.anthropic', 'credentials.json')
        await readFile(credPath, 'utf-8')
        return
      } catch (err) {
        throw new UserFacingError(
          'Claude CLI not authenticated. Set CLAUDE_CODE_OAUTH_TOKEN or run "claude login" to configure credentials.'
        )
      }
    default:
      return
  }
}
