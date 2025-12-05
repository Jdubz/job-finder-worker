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

  try {
    // Check settings.json for auth type
    const settingsPath = join(geminiDir, 'settings.json')
    const settingsRaw = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(settingsRaw) as GeminiSettings
    const authType = settings?.security?.auth?.selectedType

    if (!authType) {
      throw new UserFacingError('Gemini CLI not configured: no auth type selected. Please run "gemini" to set up authentication.')
    }

    // For OAuth auth types, verify credentials file exists with refresh token
    if (authType.startsWith('oauth')) {
      const credsPath = join(geminiDir, 'oauth_creds.json')
      const credsRaw = await readFile(credsPath, 'utf-8')
      const creds = JSON.parse(credsRaw) as GeminiOAuthCreds

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
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error
    }
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      throw new UserFacingError('Gemini CLI not configured. Please run "gemini" to set up authentication.')
    }
    throw new UserFacingError(`Failed to verify Gemini configuration: ${err.message}`)
  }
}

export async function ensureCliProviderHealthy(provider: CliProvider): Promise<void> {
  switch (provider) {
    case 'codex':
      return checkCodexConfig()
    case 'gemini':
      return checkGeminiConfig()
    case 'claude':
      // No health check available for Claude yet
      return
    default:
      return
  }
}
