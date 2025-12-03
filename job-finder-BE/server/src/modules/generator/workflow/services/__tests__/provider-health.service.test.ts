import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

var execFileMock: ReturnType<typeof vi.fn>

vi.mock('node:child_process', () => {
  execFileMock = vi.fn()
  const execFileProxy = (...args: any[]) => execFileMock(...args)
  return { __esModule: true, execFile: execFileProxy, default: { execFile: execFileProxy } }
})
vi.mock('node:util', () => ({
  promisify: (fn: any) =>
    (...args: any[]) =>
      new Promise((resolve, reject) => {
        fn(...args, (err: any, stdout: any, stderr: any) => {
          if (err) {
            reject(err)
          } else {
            resolve({ stdout, stderr })
          }
        })
      })
}))

import { ensureCliProviderHealthy } from '../provider-health.service'

describe('ensureCliProviderHealthy', () => {
  beforeEach(() => {
    if (!execFileMock) {
      execFileMock = vi.fn()
    }
    execFileMock.mockReset()
  })

  afterEach(() => {
    execFileMock?.mockReset()
  })

  it('passes through when provider has no health check', async () => {
    await expect(ensureCliProviderHealthy('claude')).resolves.toBeUndefined()
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('resolves when CLI command succeeds', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => cb?.(null, 'ok', ''))
    await expect(ensureCliProviderHealthy('codex')).resolves.toBeUndefined()
    expect(execFileMock).toHaveBeenCalledWith('codex', ['login', 'status'], expect.any(Object), expect.any(Function))
  })

  it('wraps stderr in error message when command fails', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => cb?.(Object.assign(new Error('boom'), { stderr: 'auth missing' }), '', ''))
    await expect(ensureCliProviderHealthy('gemini')).rejects.toThrow(/auth missing/)
  })

  it('uses fallback message when error has no stderr', async () => {
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => cb?.(new Error('no stderr'), '', ''))
    await expect(ensureCliProviderHealthy('codex')).rejects.toThrow(/no stderr/)
  })
})
