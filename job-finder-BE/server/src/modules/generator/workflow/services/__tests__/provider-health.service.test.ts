import { describe, expect, it, vi } from 'vitest'

const execFileAsyncMock = vi.fn()

const importWithMocks = async () => {
  vi.resetModules()
  execFileAsyncMock.mockReset()

  vi.doMock('node:child_process', () => ({ execFile: vi.fn() }))
  vi.doMock('node:util', () => ({ __esModule: true, promisify: () => execFileAsyncMock }))

  return import('../provider-health.service')
}

describe('ensureCliProviderHealthy', () => {
  it('passes through when provider has no health check', async () => {
    const { ensureCliProviderHealthy } = await importWithMocks()
    await expect(ensureCliProviderHealthy('claude')).resolves.toBeUndefined()
    expect(execFileAsyncMock).not.toHaveBeenCalled()
  })

  it('resolves when CLI command succeeds', async () => {
    const { ensureCliProviderHealthy } = await importWithMocks()
    execFileAsyncMock.mockResolvedValue({ stdout: 'ok', stderr: '' })
    await expect(ensureCliProviderHealthy('codex')).resolves.toBeUndefined()
    expect(execFileAsyncMock).toHaveBeenCalledWith('codex', ['login', 'status'], { timeout: 5_000 })
  })

  it('wraps stderr in error message when command fails', async () => {
    const { ensureCliProviderHealthy } = await importWithMocks()
    execFileAsyncMock.mockRejectedValue(Object.assign(new Error('boom'), { stderr: 'auth missing' }))
    await expect(ensureCliProviderHealthy('gemini')).rejects.toThrow(/auth missing/)
  })

  it('uses fallback message when error has no stderr', async () => {
    const { ensureCliProviderHealthy } = await importWithMocks()
    const err = new Error('no stderr') as Error & { stderr?: string }
    delete err.stderr
    execFileAsyncMock.mockRejectedValue(err)
    await expect(ensureCliProviderHealthy('codex')).rejects.toThrow(/no stderr/)
  })
})
