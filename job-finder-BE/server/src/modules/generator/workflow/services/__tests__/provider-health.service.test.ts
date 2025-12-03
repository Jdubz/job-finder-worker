import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
import { ensureCliProviderHealthy } from '../provider-health.service'
import { execFile } from 'node:child_process'

const execFileMock = execFile as unknown as ReturnType<typeof vi.fn>

describe('ensureCliProviderHealthy', () => {
  afterEach(() => {
    vi.resetAllMocks()
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
