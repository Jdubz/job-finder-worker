import { afterAll, describe, expect, it, vi } from 'vitest'

const importWithMocks = async () => {
  vi.resetModules()
  return import('../provider-health.service')
}

afterAll(() => {
  vi.resetModules()
})

describe('ensureLitellmHealthy', () => {
  it('throws when LiteLLM proxy is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const { ensureLitellmHealthy } = await importWithMocks()
    await expect(ensureLitellmHealthy()).rejects.toThrow(/not reachable/)
    vi.unstubAllGlobals()
  })

  it('throws when LiteLLM returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    const { ensureLitellmHealthy } = await importWithMocks()
    await expect(ensureLitellmHealthy()).rejects.toThrow(/HTTP 503/)
    vi.unstubAllGlobals()
  })

  it('passes when LiteLLM returns 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const { ensureLitellmHealthy } = await importWithMocks()
    await expect(ensureLitellmHealthy()).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })
})
