import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import type { getLocalCliHealth as GetLocalCliHealthFn } from './cli-health.service'

// Mock child_process before importing the module
vi.mock('node:child_process', () => ({
  execFile: vi.fn()
}))

vi.mock('node:util', () => ({
  promisify: vi.fn((fn) => fn)
}))

// Mock the logger to prevent console output during tests
vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

describe('cli-health.service', () => {
  let getLocalCliHealth: typeof GetLocalCliHealthFn
  let mockedExecFile: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    // Re-mock modules for fresh state
    vi.doMock('node:child_process', () => ({
      execFile: vi.fn()
    }))

    vi.doMock('node:util', () => ({
      promisify: vi.fn((fn) => fn)
    }))

    vi.doMock('../logger', () => ({
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
      }
    }))

    // Re-import the module to get fresh mocks
    const childProcess = await import('node:child_process')
    mockedExecFile = vi.mocked(childProcess.execFile)

    const module = await import('./cli-health.service')
    getLocalCliHealth = module.getLocalCliHealth
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('getLocalCliHealth', () => {
    it('should return healthy status when CLI commands succeed with authenticated output', async () => {
      // Mock successful authenticated responses for both CLIs
      mockedExecFile.mockImplementation((cmd: string, args: string[] = []) => {
        const joined = [cmd, ...args].join(' ')
        if (cmd === 'codex') {
          return Promise.resolve({ stdout: 'You are logged in as user@example.com', stderr: '' })
        }
        if (joined.includes('gemini auth status')) {
          return Promise.resolve({ stdout: 'Authenticated as user@example.com', stderr: '' })
        }
        return Promise.reject(new Error('Unknown command'))
      })

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(true)
      expect(result.codex.message.toLowerCase()).toContain('logged in')
      expect(result.gemini.healthy).toBe(true)
      expect(result.gemini.message.toLowerCase()).toContain('authenticated')
    })

    it('should return unhealthy status when CLI indicates not authenticated', async () => {
      mockedExecFile.mockImplementation((cmd: string, args: string[] = []) => {
        const joined = [cmd, ...args].join(' ')
        if (cmd === 'codex') {
          return Promise.resolve({ stdout: 'You are not logged in', stderr: '' })
        }
        if (joined.includes('gemini auth status')) {
          return Promise.resolve({ stdout: 'Not authenticated. Please run gemini auth login', stderr: '' })
        }
        return Promise.reject(new Error('Unknown command'))
      })

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(false)
      expect(result.gemini.healthy).toBe(false)
    })

    it('should return unhealthy status when CLI binary is not found', async () => {
      const notFoundError = new Error('spawn codex ENOENT') as Error & { code?: string }
      notFoundError.code = 'ENOENT'

      mockedExecFile.mockImplementation(() => Promise.reject(notFoundError))

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(false)
      expect(result.codex.message).toContain('ENOENT')
      expect(result.gemini.healthy).toBe(false)
    })

    it('should return unhealthy status when CLI command times out', async () => {
      const timeoutError = new Error('Command timed out')
      timeoutError.name = 'TimeoutError'

      mockedExecFile.mockImplementation(() => Promise.reject(timeoutError))

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(false)
      expect(result.codex.message).toContain('timed out')
      expect(result.gemini.healthy).toBe(false)
    })

    it('should handle CLI returning error in stderr', async () => {
      mockedExecFile.mockImplementation((cmd: string) => {
        if (cmd === 'codex') {
          return Promise.resolve({ stdout: '', stderr: 'Error: API key invalid' })
        }
        if (cmd === 'gemini') {
          return Promise.resolve({ stdout: '', stderr: 'Authentication failed' })
        }
        return Promise.reject(new Error('Unknown command'))
      })

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(false)
      expect(result.codex.message).toContain('API key invalid')
      expect(result.gemini.healthy).toBe(false)
    })

    it('should format error messages correctly when stderr is available', async () => {
      const errorWithStderr = new Error('Command failed') as Error & { stderr?: string }
      errorWithStderr.stderr = 'CLI not configured properly'

      mockedExecFile.mockImplementation(() => Promise.reject(errorWithStderr))

      const result = await getLocalCliHealth()

      expect(result.codex.healthy).toBe(false)
      expect(result.codex.message).toBe('CLI not configured properly')
    })

    it('should return default message when command succeeds with empty output', async () => {
      mockedExecFile.mockImplementation(() => Promise.resolve({ stdout: '', stderr: '' }))

      const result = await getLocalCliHealth()

      // Empty output without success terms means unhealthy
      expect(result.codex.healthy).toBe(false)
      expect(result.gemini.healthy).toBe(false)
    })
  })
})
