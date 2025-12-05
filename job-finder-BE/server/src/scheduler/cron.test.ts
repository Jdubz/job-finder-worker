import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { getWorkerCliHealth as GetWorkerCliHealthFn } from './cron'

// Mock the logger before importing
vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

// Mock the env config
vi.mock('../config/env', () => ({
  env: {
    WORKER_MAINTENANCE_URL: 'http://localhost:5555/maintenance',
    NODE_ENV: 'test',
    LOG_DIR: '/tmp/logs',
    LOG_ROTATE_MAX_BYTES: 10485760,
    LOG_ROTATE_RETENTION_DAYS: 7
  }
}))

describe('cron - getWorkerCliHealth', () => {
  let getWorkerCliHealth: typeof GetWorkerCliHealthFn
  let originalFetch: typeof global.fetch

  beforeEach(async () => {
    vi.clearAllMocks()
    originalFetch = global.fetch
    process.env.WORKER_MAINTENANCE_URL = 'http://localhost:5555/maintenance'

    // Re-import the module to get fresh state
    const module = await import('./cron')
    getWorkerCliHealth = module.getWorkerCliHealth
  })

  afterEach(() => {
    global.fetch = originalFetch
    delete process.env.WORKER_MAINTENANCE_URL
    vi.resetModules()
  })

  it('should return successful worker CLI health when fetch succeeds', async () => {
    const mockProviders = {
      codex: { healthy: true, message: 'logged in as user@example.com' },
      gemini: { healthy: true, message: 'authenticated' }
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ providers: mockProviders })
    })

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(true)
    expect(result.providers).toEqual(mockProviders)
    expect(result.workerUrl).toBe('http://localhost:5555')
    expect(result.error).toBeUndefined()
  })

  it('should handle response payload without providers wrapper', async () => {
    const mockProviders = {
      codex: { healthy: true, message: 'logged in' },
      gemini: { healthy: false, message: 'not authenticated' }
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProviders)
    })

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(true)
    expect(result.providers).toEqual(mockProviders)
  })

  it('should return unreachable when fetch fails with network error', async () => {
    const networkError = new Error('Network request failed')
    global.fetch = vi.fn().mockRejectedValue(networkError)

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(false)
    expect(result.error).toBe('Network request failed')
    expect(result.workerUrl).toBe('http://localhost:5555')
    expect(result.providers).toBeUndefined()
  })

  it('should return unreachable when worker responds with non-ok status', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503
    })

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(false)
    expect(result.error).toContain('503')
  })

  it('should return unreachable when fetch times out', async () => {
    // Simulate an abort error (what happens when AbortController.abort() is called)
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    global.fetch = vi.fn().mockRejectedValue(abortError)

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(false)
    expect(result.error).toContain('aborted')
  })

  it('should format error message when error is not an Error instance', async () => {
    global.fetch = vi.fn().mockRejectedValue('string error')

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(false)
    expect(result.error).toBe('string error')
  })

  it('should derive worker URL correctly from maintenance URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ providers: {} })
    })

    const result = await getWorkerCliHealth()

    // The worker base URL should strip the /maintenance path
    expect(result.workerUrl).toBe('http://localhost:5555')
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:5555/cli/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('should handle empty providers response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ providers: {} })
    })

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(true)
    expect(result.providers).toEqual({})
  })
})
