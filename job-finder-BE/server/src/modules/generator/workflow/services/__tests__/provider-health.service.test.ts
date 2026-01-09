import { afterAll, describe, expect, it, vi } from 'vitest'

const importWithMocks = async () => {
  vi.resetModules()
  return import('../provider-health.service')
}

afterAll(() => {
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
})
