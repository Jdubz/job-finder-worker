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

type RunCliProviderFn = (
  prompt: string,
  provider: 'codex' | 'gemini' | 'claude',
  options?: { model?: string; timeoutMs?: number }
) => Promise<{ success: boolean; output: string; error?: string; errorType?: string }>

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

  describe('codex provider CLI arguments', () => {
    it('builds correct command for codex without model', async () => {
      await runCliProvider('test prompt', 'codex')

      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0].cmd).toBe('codex')
      expect(spawnCalls[0].args).toEqual([
        'exec',
        '--skip-git-repo-check',
        '--cd',
        process.cwd(),
        '--dangerously-bypass-approvals-and-sandbox',
        'test prompt'
      ])
    })

    it('builds correct command for codex with model (model is ignored for codex)', async () => {
      await runCliProvider('test prompt', 'codex', { model: 'gpt-4o' })

      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0].cmd).toBe('codex')
      // Codex doesn't use model flag - prompt is passed directly
      expect(spawnCalls[0].args).toEqual([
        'exec',
        '--skip-git-repo-check',
        '--cd',
        process.cwd(),
        '--dangerously-bypass-approvals-and-sandbox',
        'test prompt'
      ])
    })

    it('includes prompt as last argument for codex', async () => {
      const longPrompt = 'Generate a detailed resume for a software engineer with 10 years of experience'
      await runCliProvider(longPrompt, 'codex')

      expect(spawnCalls[0].args[spawnCalls[0].args.length - 1]).toBe(longPrompt)
    })
  })

  describe('gemini provider CLI arguments', () => {
    it('builds correct command for gemini without model', async () => {
      await runCliProvider('test prompt', 'gemini')

      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0].cmd).toBe('gemini')
      expect(spawnCalls[0].args).toEqual([
        '--print',
        '--output',
        'json',
        '--prompt',
        'test prompt'
      ])
    })

    it('builds correct command for gemini with model', async () => {
      await runCliProvider('test prompt', 'gemini', { model: 'gemini-2.0-flash' })

      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0].cmd).toBe('gemini')
      expect(spawnCalls[0].args).toEqual([
        '--print',
        '--output',
        'json',
        '--model',
        'gemini-2.0-flash',
        '--prompt',
        'test prompt'
      ])
    })

    it('uses --prompt flag for gemini CLI', async () => {
      await runCliProvider('my prompt here', 'gemini')

      expect(spawnCalls[0].args).toContain('--prompt')
      const promptIndex = spawnCalls[0].args.indexOf('--prompt')
      expect(spawnCalls[0].args[promptIndex + 1]).toBe('my prompt here')
    })

    it('includes --print and --output json flags for gemini', async () => {
      await runCliProvider('test', 'gemini')

      expect(spawnCalls[0].args).toContain('--print')
      expect(spawnCalls[0].args).toContain('--output')
      expect(spawnCalls[0].args).toContain('json')
    })
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
      expect(spawnCalls[0].args).toEqual([
        '--print',
        '--output-format',
        'json',
        '--dangerously-skip-permissions',
        '-p',
        'test prompt'
      ])
    })

    it('builds correct command for claude with model', async () => {
      delete process.env.CLAUDE_SKIP_PERMISSIONS
      await runCliProvider('test prompt', 'claude', { model: 'claude-sonnet-4-20250514' })

      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0].cmd).toBe('claude')
      expect(spawnCalls[0].args).toEqual([
        '--print',
        '--output-format',
        'json',
        '--model',
        'claude-sonnet-4-20250514',
        '--dangerously-skip-permissions',
        '-p',
        'test prompt'
      ])
    })

    it('uses -p flag (not --prompt) for claude CLI', async () => {
      await runCliProvider('my prompt here', 'claude')

      // Verify -p is used, not --prompt
      expect(spawnCalls[0].args).toContain('-p')
      expect(spawnCalls[0].args).not.toContain('--prompt')

      const promptIndex = spawnCalls[0].args.indexOf('-p')
      expect(spawnCalls[0].args[promptIndex + 1]).toBe('my prompt here')
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

  describe('unknown provider fallback', () => {
    it('falls back to codex for unknown providers', async () => {
      await runCliProvider('test prompt', 'unknown-provider' as any)

      expect(spawnCalls).toHaveLength(1)
      expect(spawnCalls[0].cmd).toBe('codex')
    })
  })

  describe('CLI command structure validation', () => {
    it('passes shell: false to prevent shell injection', async () => {
      await runCliProvider('test', 'codex')

      expect(spawnCalls[0].options).toMatchObject({ shell: false })
    })

    it('passes environment variables to child process', async () => {
      await runCliProvider('test', 'codex')

      expect(spawnCalls[0].options).toMatchObject({ env: process.env })
    })

    it('handles prompts with special characters', async () => {
      const specialPrompt = 'Test with "quotes" and $variables and `backticks`'
      await runCliProvider(specialPrompt, 'claude')

      const promptIndex = spawnCalls[0].args.indexOf('-p')
      expect(spawnCalls[0].args[promptIndex + 1]).toBe(specialPrompt)
    })

    it('handles multiline prompts', async () => {
      const multilinePrompt = 'Line 1\nLine 2\nLine 3'
      await runCliProvider(multilinePrompt, 'gemini')

      const promptIndex = spawnCalls[0].args.indexOf('--prompt')
      expect(spawnCalls[0].args[promptIndex + 1]).toBe(multilinePrompt)
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

    it('adds --model flag when model is provided for gemini', async () => {
      await runCliProvider('test', 'gemini', { model: 'gemini-1.5-pro' })

      expect(spawnCalls[0].args).toContain('--model')
      expect(spawnCalls[0].args).toContain('gemini-1.5-pro')
    })

    it('model flag appears before prompt for claude', async () => {
      await runCliProvider('test', 'claude', { model: 'claude-sonnet-4-20250514' })

      const modelIndex = spawnCalls[0].args.indexOf('--model')
      const promptIndex = spawnCalls[0].args.indexOf('-p')
      expect(modelIndex).toBeLessThan(promptIndex)
    })

    it('model flag appears before prompt for gemini', async () => {
      await runCliProvider('test', 'gemini', { model: 'gemini-2.0-flash' })

      const modelIndex = spawnCalls[0].args.indexOf('--model')
      const promptIndex = spawnCalls[0].args.indexOf('--prompt')
      expect(modelIndex).toBeLessThan(promptIndex)
    })
  })
})
