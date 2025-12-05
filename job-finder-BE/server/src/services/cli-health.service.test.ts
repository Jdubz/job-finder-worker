import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { getLocalCliHealth as GetLocalCliHealthFn } from './cli-health.service'

describe('cli-health.service', () => {
  let getLocalCliHealth: typeof GetLocalCliHealthFn
  let mockedReadFile: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    vi.doMock('node:fs/promises', () => ({
      readFile: vi.fn()
    }))

    vi.doMock('node:os', () => ({
      homedir: vi.fn(() => '/home/testuser')
    }))

    vi.doMock('../logger', () => ({
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
      }
    }))

    const fsPromises = await import('node:fs/promises')
    mockedReadFile = vi.mocked(fsPromises.readFile)

    const module = await import('./cli-health.service')
    getLocalCliHealth = module.getLocalCliHealth
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('codex (config-based)', () => {
    it('should return healthy when OAuth credentials are configured with email', async () => {
      // Create a mock JWT with email in payload (JWTs use base64url encoding)
      const payload = { email: 'user@example.com', exp: Date.now() / 1000 + 3600 }
      const mockIdToken = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`

      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({
            OPENAI_API_KEY: null,
            tokens: {
              refresh_token: 'rt_test',
              id_token: mockIdToken
            }
          }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('.gemini/oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ refresh_token: 'test-token' }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(true)
      expect(result.codex.message).toContain('user@example.com')
    })

    it('should return healthy when OAuth credentials exist without email in JWT', async () => {
      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({
            OPENAI_API_KEY: null,
            tokens: {
              refresh_token: 'rt_test',
              id_token: 'invalid.jwt.token'
            }
          }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('.gemini/oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ refresh_token: 'test-token' }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(true)
      expect(result.codex.message).toBe('OAuth credentials configured')
    })

    it('should return healthy when API key is in auth file', async () => {
      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({
            OPENAI_API_KEY: 'sk-test-key',
            tokens: null
          }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('.gemini/oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ refresh_token: 'test-token' }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(true)
      expect(result.codex.message).toBe('API key configured')
    })

    it('should return healthy when API key is in environment', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'

      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({
            OPENAI_API_KEY: null,
            tokens: null
          }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('.gemini/oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ refresh_token: 'test-token' }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(true)
      expect(result.codex.message).toContain('environment')

      delete process.env.OPENAI_API_KEY
    })

    it('should return healthy when auth file missing but API key in environment', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-key'

      const err = new Error('ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'

      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.reject(err)
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('.gemini/oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ refresh_token: 'test-token' }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(true)
      expect(result.codex.message).toContain('environment')

      delete process.env.OPENAI_API_KEY
    })

    it('should return unhealthy when auth file is missing and no env var', async () => {
      delete process.env.OPENAI_API_KEY

      const err = new Error('ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'

      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.reject(err)
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('.gemini/oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ refresh_token: 'test-token' }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(false)
      expect(result.codex.message).toContain('auth file not found')
    })

    it('should return unhealthy when no credentials found in auth file', async () => {
      delete process.env.OPENAI_API_KEY

      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({
            OPENAI_API_KEY: null,
            tokens: {}
          }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('.gemini/oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ refresh_token: 'test-token' }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(false)
      expect(result.codex.message).toContain('no credentials found')
    })
  })

  describe('gemini (config-based)', () => {
    it('should return healthy when OAuth credentials are configured with active account', async () => {
      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({ tokens: { refresh_token: 'test' } }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('.gemini/oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ refresh_token: 'test-refresh-token' }))
        }
        if (path.includes('.gemini/google_accounts.json')) {
          return Promise.resolve(JSON.stringify({ active: 'user@gmail.com' }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.gemini.healthy).toBe(true)
      expect(result.gemini.message).toContain('user@gmail.com')
    })

    it('should return healthy when OAuth credentials exist without accounts file', async () => {
      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({ tokens: { refresh_token: 'test' } }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('.gemini/oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ refresh_token: 'test-refresh-token' }))
        }
        const err = new Error('ENOENT') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        return Promise.reject(err)
      })

      const result = await getLocalCliHealth()

      expect(result.gemini.healthy).toBe(true)
      expect(result.gemini.message).toBe('OAuth credentials configured')
    })

    it('should return unhealthy when settings file is missing', async () => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'

      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({ tokens: { refresh_token: 'test' } }))
        }
        return Promise.reject(err)
      })

      const result = await getLocalCliHealth()

      expect(result.gemini.healthy).toBe(false)
      expect(result.gemini.message).toContain('settings file not found')
    })

    it('should return unhealthy when no auth type is selected', async () => {
      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({ tokens: { refresh_token: 'test' } }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: {} }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.gemini.healthy).toBe(false)
      expect(result.gemini.message).toContain('no auth type selected')
    })

    it('should return unhealthy when OAuth credentials are missing refresh token', async () => {
      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({ tokens: { refresh_token: 'test' } }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('.gemini/oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ access_token: 'test-token' })) // No refresh_token
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.gemini.healthy).toBe(false)
      expect(result.gemini.message).toContain('missing refresh token')
    })

    it('should return healthy when API key auth is configured with env var', async () => {
      process.env.GEMINI_API_KEY = 'test-api-key'

      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({ tokens: { refresh_token: 'test' } }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'api-key' } } }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.gemini.healthy).toBe(true)
      expect(result.gemini.message).toBe('API key configured')

      delete process.env.GEMINI_API_KEY
    })

    it('should return unhealthy when API key auth is configured but env var missing', async () => {
      delete process.env.GEMINI_API_KEY
      delete process.env.GOOGLE_API_KEY

      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({ tokens: { refresh_token: 'test' } }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'api-key' } } }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.gemini.healthy).toBe(false)
      expect(result.gemini.message).toContain('API key not found')
    })

    it('should return healthy for other auth types (like gcloud)', async () => {
      mockedReadFile.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({ tokens: { refresh_token: 'test' } }))
        }
        if (path.includes('.gemini/settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'gcloud' } } }))
        }
        return Promise.reject(new Error('File not found'))
      })

      const result = await getLocalCliHealth()

      expect(result.gemini.healthy).toBe(true)
      expect(result.gemini.message).toContain('gcloud')
    })
  })
})
