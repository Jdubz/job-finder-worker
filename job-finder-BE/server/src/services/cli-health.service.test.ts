import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { getLocalCliHealth as GetLocalCliHealthFn } from './cli-health.service'

describe('cli-health.service', () => {
  let getLocalCliHealth: typeof GetLocalCliHealthFn
  const originalEnv = process.env

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    // Reset environment
    process.env = { ...originalEnv }
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    delete process.env.ANTHROPIC_API_KEY

    vi.doMock('../logger', () => ({
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
      }
    }))

    const module = await import('./cli-health.service')
    getLocalCliHealth = module.getLocalCliHealth
  })

  afterEach(() => {
    process.env = originalEnv
    vi.resetModules()
  })

  describe('claude (env-based)', () => {
    it('should return healthy when CLAUDE_CODE_OAUTH_TOKEN is set', async () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test-oauth-token'

      const result = await getLocalCliHealth()

      expect(result.claude.healthy).toBe(true)
      expect(result.claude.message).toBe('OAuth token configured')
    })

    it('should return healthy when ANTHROPIC_API_KEY is set as fallback indicator', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-test-api-key'

      const result = await getLocalCliHealth()

      expect(result.claude.healthy).toBe(true)
      expect(result.claude.message).toContain('API key configured')
    })

    it('should prefer CLAUDE_CODE_OAUTH_TOKEN over ANTHROPIC_API_KEY', async () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test-oauth-token'
      process.env.ANTHROPIC_API_KEY = 'sk-test-api-key'

      const result = await getLocalCliHealth()

      expect(result.claude.healthy).toBe(true)
      expect(result.claude.message).toBe('OAuth token configured')
    })

    it('should return unhealthy when no credentials are set', async () => {
      delete process.env.CLAUDE_CODE_OAUTH_TOKEN
      delete process.env.ANTHROPIC_API_KEY

      const result = await getLocalCliHealth()

      expect(result.claude.healthy).toBe(false)
      expect(result.claude.message).toContain('CLAUDE_CODE_OAUTH_TOKEN')
    })

    it('should only return claude provider (no codex, gemini)', async () => {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test-oauth-token'

      const result = await getLocalCliHealth()

      // Should only have claude key
      expect(Object.keys(result)).toEqual(['claude'])
      // Should NOT have legacy providers
      expect('codex' in result).toBe(false)
      expect('gemini' in result).toBe(false)
    })
  })
})
