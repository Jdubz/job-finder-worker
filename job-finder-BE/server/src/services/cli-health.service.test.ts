import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { getLocalCliHealth as GetLocalCliHealthFn } from './cli-health.service'

describe('cli-health.service', () => {
  let getLocalCliHealth: typeof GetLocalCliHealthFn
  const originalEnv = process.env

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    process.env = { ...originalEnv }

    const module = await import('./cli-health.service')
    getLocalCliHealth = module.getLocalCliHealth
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
})
