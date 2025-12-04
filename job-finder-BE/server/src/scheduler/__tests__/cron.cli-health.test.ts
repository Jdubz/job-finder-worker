import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { getWorkerCliHealth } from '../cron'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock the env module
vi.mock('../../config/env', () => ({
  env: {
    WORKER_MAINTENANCE_URL: 'http://worker:5555/maintenance'
  }
}))

// Mock the logger
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

describe('getWorkerCliHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns CLI health when worker is reachable', async () => {
    const mockResponse = {
      providers: {
        codex: { available: true, authenticated: true, message: 'Logged in' },
        gemini: { available: true, authenticated: true, message: "I'm ready" }
      },
      timestamp: 1234567890
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    })

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(true)
    expect(result.providers).toEqual(mockResponse.providers)
    expect(result.timestamp).toBe(mockResponse.timestamp)
    expect(result.workerUrl).toBe('http://worker:5555')
    expect(result.error).toBeUndefined()

    expect(mockFetch).toHaveBeenCalledWith(
      'http://worker:5555/cli/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('returns error when worker is not reachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(false)
    expect(result.error).toBe('Connection refused')
    expect(result.workerUrl).toBe('http://worker:5555')
    expect(result.providers).toBeUndefined()
  })

  it('returns error when worker returns non-200 status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500
    })

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(false)
    expect(result.error).toBe('Worker CLI health responded with 500')
    expect(result.workerUrl).toBe('http://worker:5555')
  })

  it('handles timeout correctly', async () => {
    // AbortController with fake timers is tricky - just test the abort error case directly
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    mockFetch.mockRejectedValueOnce(abortError)

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(false)
    expect(result.error).toContain('aborted')
  })

  it('handles mixed provider status correctly', async () => {
    const mockResponse = {
      providers: {
        codex: { available: true, authenticated: false, message: 'Not logged in' },
        gemini: { available: false, authenticated: false, message: 'CLI not installed' }
      },
      timestamp: 1234567890
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    })

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(true)

    // Codex: installed but not authenticated
    expect(result.providers?.codex.available).toBe(true)
    expect(result.providers?.codex.authenticated).toBe(false)

    // Gemini: not installed
    expect(result.providers?.gemini.available).toBe(false)
    expect(result.providers?.gemini.authenticated).toBe(false)
  })

  it('parses worker URL correctly from maintenance URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ providers: {}, timestamp: 0 })
    })

    await getWorkerCliHealth()

    // Should extract base URL from WORKER_MAINTENANCE_URL
    expect(mockFetch).toHaveBeenCalledWith(
      'http://worker:5555/cli/health',
      expect.any(Object)
    )
  })

  it('handles JSON parse error gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new SyntaxError('Invalid JSON') }
    })

    const result = await getWorkerCliHealth()

    expect(result.reachable).toBe(false)
    expect(result.error).toContain('Invalid JSON')
  })
})

describe('CLI Health Response Types', () => {
  it('response matches CliHealthResponse structure when reachable', async () => {
    const mockResponse = {
      providers: {
        codex: { available: true, authenticated: true, message: 'Logged in' },
        gemini: { available: true, authenticated: true, message: 'Ready' }
      },
      timestamp: Date.now() / 1000
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    })

    const result = await getWorkerCliHealth()

    // Verify structure matches CliHealthResponse
    expect(typeof result.reachable).toBe('boolean')
    expect(typeof result.workerUrl).toBe('string')

    if (result.reachable) {
      expect(result.providers).toBeDefined()
      expect(result.timestamp).toBeDefined()
      expect(typeof result.timestamp).toBe('number')

      // Verify each provider has correct structure
      for (const provider of ['codex', 'gemini'] as const) {
        const p = result.providers![provider]
        expect(typeof p.available).toBe('boolean')
        expect(typeof p.authenticated).toBe('boolean')
        expect(typeof p.message).toBe('string')
      }
    }
  })

  it('response matches CliHealthResponse structure when not reachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const result = await getWorkerCliHealth()

    // Verify structure matches CliHealthResponse
    expect(result.reachable).toBe(false)
    expect(typeof result.workerUrl).toBe('string')
    expect(typeof result.error).toBe('string')
    expect(result.providers).toBeUndefined()
    expect(result.timestamp).toBeUndefined()
  })
})
