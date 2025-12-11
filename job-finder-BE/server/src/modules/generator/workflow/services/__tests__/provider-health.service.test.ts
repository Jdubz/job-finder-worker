import { afterAll, describe, expect, it, vi } from 'vitest'

const readFileMock = vi.fn()

const importWithMocks = async () => {
  vi.resetModules()
  readFileMock.mockReset()

  vi.doMock('node:fs/promises', () => ({ __esModule: true, default: { readFile: readFileMock }, readFile: readFileMock }))
  vi.doMock('node:os', () => ({ __esModule: true, homedir: () => '/home/testuser' }))

  return import('../provider-health.service')
}

afterAll(() => {
  vi.unmock('node:fs/promises')
  vi.unmock('node:os')
  vi.resetModules()
})

describe('ensureCliProviderHealthy', () => {
  it('throws for claude when env var missing', async () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    const { ensureCliProviderHealthy } = await importWithMocks()
    await expect(ensureCliProviderHealthy('claude')).rejects.toThrow(/CLAUDE_CODE_OAUTH_TOKEN/)
  })

  it('passes for claude when env var set', async () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'token'
    const { ensureCliProviderHealthy } = await importWithMocks()
    await expect(ensureCliProviderHealthy('claude')).resolves.toBeUndefined()
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  })

  describe('codex (config-based)', () => {
    it('resolves when OAuth credentials are configured', async () => {
      const { ensureCliProviderHealthy } = await importWithMocks()
      readFileMock.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({
            tokens: { refresh_token: 'rt_test' }
          }))
        }
        return Promise.reject(new Error('File not found'))
      })

      await expect(ensureCliProviderHealthy('codex')).resolves.toBeUndefined()
    })

    it('resolves when API key is in auth file', async () => {
      const { ensureCliProviderHealthy } = await importWithMocks()
      readFileMock.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({
            OPENAI_API_KEY: 'sk-test'
          }))
        }
        return Promise.reject(new Error('File not found'))
      })

      await expect(ensureCliProviderHealthy('codex')).resolves.toBeUndefined()
    })

    it('resolves when API key is in environment', async () => {
      process.env.OPENAI_API_KEY = 'sk-test'
      const { ensureCliProviderHealthy } = await importWithMocks()
      readFileMock.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({
            OPENAI_API_KEY: null,
            tokens: {}
          }))
        }
        return Promise.reject(new Error('File not found'))
      })

      await expect(ensureCliProviderHealthy('codex')).resolves.toBeUndefined()
      delete process.env.OPENAI_API_KEY
    })

    it('resolves when auth file missing but API key in environment', async () => {
      process.env.OPENAI_API_KEY = 'sk-test'
      const { ensureCliProviderHealthy } = await importWithMocks()
      const err = new Error('ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      readFileMock.mockRejectedValue(err)

      await expect(ensureCliProviderHealthy('codex')).resolves.toBeUndefined()
      delete process.env.OPENAI_API_KEY
    })

    it('throws when auth file is missing and no env var', async () => {
      delete process.env.OPENAI_API_KEY
      const { ensureCliProviderHealthy } = await importWithMocks()
      const err = new Error('ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      readFileMock.mockRejectedValue(err)

      await expect(ensureCliProviderHealthy('codex')).rejects.toThrow(/not configured/)
    })

    it('throws when no credentials found in auth file', async () => {
      delete process.env.OPENAI_API_KEY
      const { ensureCliProviderHealthy } = await importWithMocks()
      readFileMock.mockImplementation((path: string) => {
        if (path.includes('.codex/auth.json')) {
          return Promise.resolve(JSON.stringify({
            OPENAI_API_KEY: null,
            tokens: {}
          }))
        }
        return Promise.reject(new Error('File not found'))
      })

      await expect(ensureCliProviderHealthy('codex')).rejects.toThrow(/not authenticated/)
    })
  })

  describe('gemini (config-based)', () => {
    it('resolves when OAuth credentials are configured', async () => {
      const { ensureCliProviderHealthy } = await importWithMocks()
      readFileMock.mockImplementation((path: string) => {
        if (path.includes('settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ refresh_token: 'test-token' }))
        }
        return Promise.reject(new Error('File not found'))
      })

      await expect(ensureCliProviderHealthy('gemini')).resolves.toBeUndefined()
    })

    it('throws when settings file is missing', async () => {
      const { ensureCliProviderHealthy } = await importWithMocks()
      const err = new Error('ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      readFileMock.mockRejectedValue(err)

      await expect(ensureCliProviderHealthy('gemini')).rejects.toThrow(/not configured/)
    })

    it('throws when no auth type is selected', async () => {
      const { ensureCliProviderHealthy } = await importWithMocks()
      readFileMock.mockImplementation((path: string) => {
        if (path.includes('settings.json')) {
          return Promise.resolve(JSON.stringify({ security: {} }))
        }
        return Promise.reject(new Error('File not found'))
      })

      await expect(ensureCliProviderHealthy('gemini')).rejects.toThrow(/no auth type selected/)
    })

    it('throws when OAuth credentials are missing refresh token', async () => {
      const { ensureCliProviderHealthy } = await importWithMocks()
      readFileMock.mockImplementation((path: string) => {
        if (path.includes('settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'oauth-personal' } } }))
        }
        if (path.includes('oauth_creds.json')) {
          return Promise.resolve(JSON.stringify({ access_token: 'test' })) // No refresh_token
        }
        return Promise.reject(new Error('File not found'))
      })

      await expect(ensureCliProviderHealthy('gemini')).rejects.toThrow(/incomplete/)
    })

    it('resolves when API key auth is configured with env var', async () => {
      process.env.GEMINI_API_KEY = 'test-key'
      const { ensureCliProviderHealthy } = await importWithMocks()
      readFileMock.mockImplementation((path: string) => {
        if (path.includes('settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'api-key' } } }))
        }
        return Promise.reject(new Error('File not found'))
      })

      await expect(ensureCliProviderHealthy('gemini')).resolves.toBeUndefined()
      delete process.env.GEMINI_API_KEY
    })

    it('throws when API key auth is configured but env var missing', async () => {
      delete process.env.GEMINI_API_KEY
      delete process.env.GOOGLE_API_KEY
      const { ensureCliProviderHealthy } = await importWithMocks()
      readFileMock.mockImplementation((path: string) => {
        if (path.includes('settings.json')) {
          return Promise.resolve(JSON.stringify({ security: { auth: { selectedType: 'api-key' } } }))
        }
        return Promise.reject(new Error('File not found'))
      })

      await expect(ensureCliProviderHealthy('gemini')).rejects.toThrow(/API key not found/)
    })
  })
})
