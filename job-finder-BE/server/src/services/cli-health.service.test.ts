import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { getLocalCliHealth as GetLocalCliHealthFn, getLitellmModelHealth as GetLitellmModelHealthFn } from './cli-health.service'

describe('cli-health.service', () => {
  let getLocalCliHealth: typeof GetLocalCliHealthFn
  let getLitellmModelHealth: typeof GetLitellmModelHealthFn
  const originalEnv = process.env

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    process.env = { ...originalEnv }

    const module = await import('./cli-health.service')
    getLocalCliHealth = module.getLocalCliHealth
    getLitellmModelHealth = module.getLitellmModelHealth
  })

  afterEach(() => {
    process.env = originalEnv
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('should return healthy when LiteLLM proxy is reachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const result = await getLocalCliHealth()

    expect(result.claude.healthy).toBe(true)
    expect(result.claude.message).toBe('LiteLLM proxy healthy')
  })

  it('should return unhealthy when LiteLLM proxy returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))

    const result = await getLocalCliHealth()

    expect(result.claude.healthy).toBe(false)
    expect(result.claude.message).toContain('503')
  })

  it('should return unhealthy when LiteLLM proxy is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

    const result = await getLocalCliHealth()

    expect(result.claude.healthy).toBe(false)
    expect(result.claude.message).toBe('LiteLLM proxy unreachable')
  })

  it('should only return claude provider key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    const result = await getLocalCliHealth()

    expect(Object.keys(result)).toEqual(['claude'])
  })

  it('should use LITELLM_BASE_URL from env', async () => {
    process.env.LITELLM_BASE_URL = 'http://custom-proxy:9000'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    // Re-import to pick up new env
    const module = await import('./cli-health.service')
    await module.getLocalCliHealth()

    expect(fetchMock).toHaveBeenCalledWith(
      'http://custom-proxy:9000/health/readiness',
      expect.any(Object)
    )
  })

  describe('getLitellmModelHealth', () => {
    it('should return empty array on non-200 response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

      const result = await getLitellmModelHealth()

      expect(result).toEqual([])
    })

    it('should return empty array when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

      const result = await getLitellmModelHealth()

      expect(result).toEqual([])
    })

    it('should parse healthy and unhealthy endpoints', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          healthy_endpoints: [
            { model: 'gemini/gemini-2.5-flash' },
            { model: 'openai/llama3.1:8b' },
          ],
          unhealthy_endpoints: [
            { model: 'anthropic/claude-sonnet-4-6', error: 'litellm.BadRequestError: AnthropicException - {"type":"error","error":{"type":"invalid_request_error","message":"Error"}}' },
          ],
        })
      }))

      const result = await getLitellmModelHealth()

      expect(result).toHaveLength(3)
      expect(result.find(m => m.modelGroup === 'gemini-general')).toMatchObject({ healthy: true })
      expect(result.find(m => m.modelGroup === 'local-extract')).toMatchObject({ healthy: true })
      const claude = result.find(m => m.modelGroup === 'claude-document')
      expect(claude?.healthy).toBe(false)
      expect(claude?.error).toContain('AnthropicException')
    })

    it('should send Authorization header only when LITELLM_MASTER_KEY is set', async () => {
      process.env.LITELLM_MASTER_KEY = 'test-key'
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ healthy_endpoints: [], unhealthy_endpoints: [] })
      })
      vi.stubGlobal('fetch', fetchMock)

      const module = await import('./cli-health.service')
      await module.getLitellmModelHealth()

      const headers = fetchMock.mock.calls[0][1].headers
      expect(headers.Authorization).toBe('Bearer test-key')
    })

    it('should omit Authorization header when LITELLM_MASTER_KEY is empty', async () => {
      process.env.LITELLM_MASTER_KEY = ''
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ healthy_endpoints: [], unhealthy_endpoints: [] })
      })
      vi.stubGlobal('fetch', fetchMock)

      const module = await import('./cli-health.service')
      await module.getLitellmModelHealth()

      const headers = fetchMock.mock.calls[0][1].headers
      expect(headers.Authorization).toBeUndefined()
    })
  })
})
