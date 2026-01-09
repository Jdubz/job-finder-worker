import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChildProcess } from 'node:child_process'

// Capture spawn calls for assertion
let spawnCalls: { cmd: string; args: string[]; options: object }[] = []

// Mock child_process before importing the module
vi.mock('node:child_process', () => {
  return {
    spawn: vi.fn((cmd: string, args: string[], options: object) => {
      spawnCalls.push({ cmd, args, options })

      // Create a mock child process that immediately succeeds
      const mockProcess = {
        stdout: {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') {
              // Emit valid JSON output
              setTimeout(() => cb(Buffer.from('{"result": "success"}')), 0)
            }
          })
        },
        stderr: {
          on: vi.fn()
        },
        on: vi.fn((event: string, cb: (code: number | Error) => void) => {
          if (event === 'close') {
            setTimeout(() => cb(0), 10)
          }
        }),
        kill: vi.fn(),
        killed: false
      }
      return mockProcess as unknown as ChildProcess
    })
  }
})

// Mock logger to prevent console noise
vi.mock('../../../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

type CliResult = { success: boolean; output: string; error?: string; errorType?: string }
type RunCliProviderFn = (
  prompt: string,
  provider: 'claude',
  options?: { model?: string; timeoutMs?: number }
) => Promise<CliResult>

describe('cli-runner', () => {
  let runCliProvider: RunCliProviderFn

  beforeEach(async () => {
    spawnCalls = []
    vi.resetModules()
    const module = await import('../cli-runner')
    runCliProvider = module.runCliProvider
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('claude provider CLI arguments', () => {
    const originalEnv = process.env.CLAUDE_SKIP_PERMISSIONS

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.CLAUDE_SKIP_PERMISSIONS
      } else {
        process.env.CLAUDE_SKIP_PERMISSIONS = originalEnv
      }
    })

    it('builds correct command for claude without model', async () => {
      delete process.env.CLAUDE_SKIP_PERMISSIONS
      await runCliProvider('test prompt', 'claude')

      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0].cmd).toBe('claude')
      // Claude CLI uses positional prompt argument (not -p or --prompt)
      expect(spawnCalls[0].args).toEqual([
        '--print',
        '--output-format',
        'json',
        '--dangerously-skip-permissions',
        'test prompt'
      ])
    })

    it('builds correct command for claude with model', async () => {
      delete process.env.CLAUDE_SKIP_PERMISSIONS
      await runCliProvider('test prompt', 'claude', { model: 'claude-sonnet-4-20250514' })

      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0].cmd).toBe('claude')
      // Claude CLI uses positional prompt argument (not -p or --prompt)
      expect(spawnCalls[0].args).toEqual([
        '--print',
        '--output-format',
        'json',
        '--model',
        'claude-sonnet-4-20250514',
        '--dangerously-skip-permissions',
        'test prompt'
      ])
    })

    it('uses positional argument for claude CLI prompt (not -p or --prompt)', async () => {
      await runCliProvider('my prompt here', 'claude')

      // Verify neither -p nor --prompt is used - prompt is positional
      expect(spawnCalls[0].args).not.toContain('-p')
      expect(spawnCalls[0].args).not.toContain('--prompt')
      expect(spawnCalls[0].args[spawnCalls[0].args.length - 1]).toBe('my prompt here')
    })

    it('includes --print and --output-format json flags for claude', async () => {
      await runCliProvider('test', 'claude')

      expect(spawnCalls[0].args).toContain('--print')
      expect(spawnCalls[0].args).toContain('--output-format')
      expect(spawnCalls[0].args).toContain('json')
    })

    it('includes --dangerously-skip-permissions by default', async () => {
      delete process.env.CLAUDE_SKIP_PERMISSIONS
      await runCliProvider('test', 'claude')

      expect(spawnCalls[0].args).toContain('--dangerously-skip-permissions')
    })

    it('omits --dangerously-skip-permissions when CLAUDE_SKIP_PERMISSIONS=false', async () => {
      process.env.CLAUDE_SKIP_PERMISSIONS = 'false'
      vi.resetModules()
      const module = await import('../cli-runner')
      await module.runCliProvider('test', 'claude')

      expect(spawnCalls[0].args).not.toContain('--dangerously-skip-permissions')
    })

    it('includes --dangerously-skip-permissions when CLAUDE_SKIP_PERMISSIONS=true', async () => {
      process.env.CLAUDE_SKIP_PERMISSIONS = 'true'
      vi.resetModules()
      const module = await import('../cli-runner')
      await module.runCliProvider('test', 'claude')

      expect(spawnCalls[0].args).toContain('--dangerously-skip-permissions')
    })
  })

  describe('CLI command structure validation', () => {
    it('passes shell: false to prevent shell injection', async () => {
      await runCliProvider('test', 'claude')

      expect(spawnCalls[0].options).toMatchObject({ shell: false })
    })

    it('passes environment variables to child process', async () => {
      await runCliProvider('test', 'claude')

      expect(spawnCalls[0].options).toMatchObject({ env: process.env })
    })

    it('handles prompts with special characters', async () => {
      const specialPrompt = 'Test with "quotes" and $variables and `backticks`'
      await runCliProvider(specialPrompt, 'claude')

      // Prompt is last positional argument
      expect(spawnCalls[0].args[spawnCalls[0].args.length - 1]).toBe(specialPrompt)
    })

    it('handles multiline prompts', async () => {
      const multilinePrompt = 'Line 1\nLine 2\nLine 3'
      await runCliProvider(multilinePrompt, 'claude')

      // Prompt is last positional argument
      expect(spawnCalls[0].args[spawnCalls[0].args.length - 1]).toBe(multilinePrompt)
    })
  })

  describe('model parameter handling', () => {
    it('does not add --model flag when model is undefined', async () => {
      await runCliProvider('test', 'claude', { model: undefined })

      expect(spawnCalls[0].args).not.toContain('--model')
    })

    it('adds --model flag when model is provided for claude', async () => {
      await runCliProvider('test', 'claude', { model: 'claude-opus-4-20250514' })

      expect(spawnCalls[0].args).toContain('--model')
      expect(spawnCalls[0].args).toContain('claude-opus-4-20250514')
    })

    it('model flag appears before prompt for claude', async () => {
      await runCliProvider('test', 'claude', { model: 'claude-sonnet-4-20250514' })

      const modelIndex = spawnCalls[0].args.indexOf('--model')
      // Prompt is last positional argument
      const promptIndex = spawnCalls[0].args.length - 1
      expect(modelIndex).toBeLessThan(promptIndex)
    })
  })
})
