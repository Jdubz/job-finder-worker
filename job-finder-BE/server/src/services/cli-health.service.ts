import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentCliProvider, AgentCliStatus } from '@shared/types'
import { logger } from '../logger'

export type CliHealthMap = Record<AgentCliProvider, AgentCliStatus>

// Both providers now use config-based checks
const PROVIDERS: AgentCliProvider[] = ['codex', 'gemini']

interface CodexAuthFile {
  OPENAI_API_KEY?: string | null
  tokens?: {
    refresh_token?: string
    id_token?: string
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

interface GeminiAccounts {
  active?: string
}

function extractEmailFromJwt(idToken: string): string | null {
  try {
    // JWT format: header.payload.signature - we need the payload
    const parts = idToken.split('.')
    if (parts.length !== 3) return null

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
    return payload.email || null
  } catch {
    return null
  }
}

async function checkCodexConfig(): Promise<AgentCliStatus> {
  const codexDir = join(homedir(), '.codex')
  const authPath = join(codexDir, 'auth.json')

  try {
    const authRaw = await readFile(authPath, 'utf-8')
    const auth = JSON.parse(authRaw) as CodexAuthFile

    // Check for API key in file
    if (auth.OPENAI_API_KEY) {
      return {
        healthy: true,
        message: 'API key configured'
      }
    }

    // Check for API key in environment
    if (process.env.OPENAI_API_KEY) {
      return {
        healthy: true,
        message: 'API key configured (from environment)'
      }
    }

    // Check for OAuth tokens
    if (auth.tokens?.refresh_token) {
      // Try to extract email from id_token
      if (auth.tokens.id_token) {
        const email = extractEmailFromJwt(auth.tokens.id_token)
        if (email) {
          return {
            healthy: true,
            message: `Authenticated as ${email}`
          }
        }
      }

      return {
        healthy: true,
        message: 'OAuth credentials configured'
      }
    }

    return {
      healthy: false,
      message: 'Codex CLI not authenticated: no credentials found'
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException

    // If auth file doesn't exist, check for API key in environment
    if (err.code === 'ENOENT') {
      if (process.env.OPENAI_API_KEY) {
        return {
          healthy: true,
          message: 'API key configured (from environment)'
        }
      }
      return {
        healthy: false,
        message: 'Codex CLI not configured: auth file not found'
      }
    }

    logger.warn({ error: err.message }, 'Codex config check failed')
    return {
      healthy: false,
      message: err.message || 'Failed to read Codex config'
    }
  }
}

async function checkGeminiConfig(): Promise<AgentCliStatus> {
  const geminiDir = join(homedir(), '.gemini')

  try {
    // Check settings.json for auth type
    const settingsPath = join(geminiDir, 'settings.json')
    const settingsRaw = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(settingsRaw) as GeminiSettings
    const authType = settings?.security?.auth?.selectedType

    if (!authType) {
      return {
        healthy: false,
        message: 'Gemini CLI not configured: no auth type selected'
      }
    }

    // For OAuth auth types, verify credentials file exists with refresh token
    if (authType.startsWith('oauth')) {
      const credsPath = join(geminiDir, 'oauth_creds.json')
      const credsRaw = await readFile(credsPath, 'utf-8')
      const creds = JSON.parse(credsRaw) as GeminiOAuthCreds

      if (!creds.refresh_token) {
        return {
          healthy: false,
          message: 'Gemini OAuth credentials missing refresh token'
        }
      }

      // Check for active account (optional file)
      try {
        const accountsPath = join(geminiDir, 'google_accounts.json')
        const accountsRaw = await readFile(accountsPath, 'utf-8')
        const accounts = JSON.parse(accountsRaw) as GeminiAccounts

        if (accounts.active) {
          return {
            healthy: true,
            message: `Authenticated as ${accounts.active}`
          }
        }
      } catch {
        // Accounts file is optional, ignore errors
      }

      return {
        healthy: true,
        message: 'OAuth credentials configured'
      }
    }

    // For API key auth, check environment variables
    if (authType === 'api-key') {
      const hasKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
      return {
        healthy: hasKey,
        message: hasKey ? 'API key configured' : 'Gemini API key not found in environment'
      }
    }

    // For other auth types (like gcloud), assume configured if settings exist
    return {
      healthy: true,
      message: `Auth type '${authType}' configured`
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return {
        healthy: false,
        message: 'Gemini CLI not configured: settings file not found'
      }
    }
    logger.warn({ error: err.message }, 'Gemini config check failed')
    return {
      healthy: false,
      message: err.message || 'Failed to read Gemini config'
    }
  }
}

async function runCheck(provider: AgentCliProvider): Promise<AgentCliStatus> {
  switch (provider) {
    case 'codex':
      return checkCodexConfig()
    case 'gemini':
      return checkGeminiConfig()
    default:
      return { healthy: false, message: `Unknown provider: ${provider}` }
  }
}

export async function getLocalCliHealth(): Promise<CliHealthMap> {
  const entries = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const status = await runCheck(provider)
      return [provider, status] as const
    })
  )

  return Object.fromEntries(entries) as CliHealthMap
}
