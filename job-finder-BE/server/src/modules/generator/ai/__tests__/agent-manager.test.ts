import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AISettings, AgentConfig, AgentId } from '@shared/types'

// Mock the cli-runner module before importing AgentManager
vi.mock('../../workflow/services/cli-runner', () => ({
  runCliProvider: vi.fn()
}))

// Mock the config repository
vi.mock('../../../config/config.repository', () => ({
  ConfigRepository: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    upsert: vi.fn()
  }))
}))

// Mock logger
vi.mock('../../../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

// Import after mocks are set up
import { AgentManager } from '../agent-manager'
import { runCliProvider } from '../../workflow/services/cli-runner'
import { ConfigRepository } from '../../../config/config.repository'

function createMockAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    provider: 'claude',
    interface: 'cli',
    defaultModel: 'claude-sonnet-4-20250514',
    dailyBudget: 100,
    dailyUsage: 0,
    runtimeState: {
      worker: { enabled: true, reason: null },
      backend: { enabled: true, reason: null }
    },
    authRequirements: {
      type: 'cli',
      requiredEnv: ['PATH']
    },
    ...overrides
  }
}

function createMockAISettings(agents: Record<string, AgentConfig>, taskFallbacks?: Record<string, AgentId[]>): AISettings {
  return {
    options: [],
    agents,
    taskFallbacks: taskFallbacks ?? {
      extraction: Object.keys(agents) as AgentId[],
      analysis: Object.keys(agents) as AgentId[],
      document: Object.keys(agents) as AgentId[]
    },
    modelRates: {
      'claude-sonnet-4-20250514': 1.0
    }
  }
}

describe('AgentManager timeout retry logic', () => {
  let mockConfigRepo: { get: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  let agentManager: AgentManager

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset the runCliProvider mock to ensure fresh state
    vi.mocked(runCliProvider).mockReset()
    vi.mocked(runCliProvider).mockResolvedValue({ success: true, output: '', error: undefined, errorType: undefined })

    // Set up mock config repository
    mockConfigRepo = {
      get: vi.fn(),
      upsert: vi.fn()
    }
    vi.mocked(ConfigRepository).mockImplementation(() => mockConfigRepo as any)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries on timeout then succeeds on second attempt', async () => {
    const mockAgent = createMockAgent()
    const aiSettings = createMockAISettings({ 'claude.cli': mockAgent as AgentConfig })

    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    // First call times out, second succeeds
    vi.mocked(runCliProvider)
      .mockResolvedValueOnce({ success: false, output: '', error: 'timeout', errorType: 'timeout' })
      .mockResolvedValueOnce({ success: true, output: '{"result": "success"}', error: undefined, errorType: undefined })

    agentManager = new AgentManager(mockConfigRepo as any)
    const result = await agentManager.execute('extraction', 'test prompt')

    expect(result.output).toBe('{"result": "success"}')
    expect(result.agentId).toBe('claude.cli')
    expect(runCliProvider).toHaveBeenCalledTimes(2)
    // Agent should NOT be disabled since it succeeded on retry
    expect(mockConfigRepo.upsert).toHaveBeenCalledTimes(1) // Only usage update
  })

  it('retries twice then disables agent after 3 timeout failures', async () => {
    const mockAgent = createMockAgent()
    const aiSettings = createMockAISettings({ 'claude.cli': mockAgent as AgentConfig })

    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    // All 3 attempts timeout
    vi.mocked(runCliProvider)
      .mockResolvedValue({ success: false, output: '', error: 'timeout after 30s', errorType: 'timeout' })

    agentManager = new AgentManager(mockConfigRepo as any)

    await expect(agentManager.execute('extraction', 'test prompt'))
      .rejects.toThrow('No agents available')

    expect(runCliProvider).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
    // Agent should be disabled after all retries exhausted
    expect(mockConfigRepo.upsert).toHaveBeenCalled()
    const lastUpsertCall = mockConfigRepo.upsert.mock.calls[mockConfigRepo.upsert.mock.calls.length - 1]
    const updatedSettings = lastUpsertCall[1] as AISettings
    expect(updatedSettings.agents?.['claude.cli']?.runtimeState?.backend?.enabled).toBe(false)
    expect(updatedSettings.agents?.['claude.cli']?.runtimeState?.backend?.reason).toContain('error:')
  })

  it('timeout on first agent does not break fallback chain', async () => {
    const mockAgent1 = createMockAgent({ provider: 'claude' })
    const mockAgent2 = createMockAgent({ provider: 'gemini' })
    const aiSettings = createMockAISettings(
      {
        'claude.cli': mockAgent1 as AgentConfig,
        'gemini.cli': mockAgent2 as AgentConfig
      },
      {
        extraction: ['claude.cli', 'gemini.cli'] as AgentId[],
        analysis: ['claude.cli', 'gemini.cli'] as AgentId[],
        document: ['claude.cli', 'gemini.cli'] as AgentId[]
      }
    )

    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    // First agent (claude) times out all 3 times, second agent (gemini) succeeds
    vi.mocked(runCliProvider)
      .mockResolvedValueOnce({ success: false, output: '', error: 'timeout', errorType: 'timeout' })
      .mockResolvedValueOnce({ success: false, output: '', error: 'timeout', errorType: 'timeout' })
      .mockResolvedValueOnce({ success: false, output: '', error: 'timeout', errorType: 'timeout' })
      .mockResolvedValueOnce({ success: true, output: '{"result": "from gemini"}', error: undefined, errorType: undefined })

    agentManager = new AgentManager(mockConfigRepo as any)
    const result = await agentManager.execute('extraction', 'test prompt')

    expect(result.output).toBe('{"result": "from gemini"}')
    expect(result.agentId).toBe('gemini.cli')
    expect(runCliProvider).toHaveBeenCalledTimes(4) // 3 for claude + 1 for gemini
  })

  it('does not retry on quota exhausted error', async () => {
    const mockAgent = createMockAgent()
    const mockAgent2 = createMockAgent({ provider: 'gemini' })
    const aiSettings = createMockAISettings(
      {
        'claude.cli': mockAgent as AgentConfig,
        'gemini.cli': mockAgent2 as AgentConfig
      },
      {
        extraction: ['claude.cli', 'gemini.cli'] as AgentId[],
        analysis: ['claude.cli', 'gemini.cli'] as AgentId[],
        document: ['claude.cli', 'gemini.cli'] as AgentId[]
      }
    )

    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    // First agent returns quota error, second succeeds
    vi.mocked(runCliProvider)
      .mockResolvedValueOnce({ success: false, output: '', error: 'rate limit exceeded', errorType: 'quota' })
      .mockResolvedValueOnce({ success: true, output: '{"result": "success"}', error: undefined, errorType: undefined })

    agentManager = new AgentManager(mockConfigRepo as any)
    const result = await agentManager.execute('extraction', 'test prompt')

    expect(result.output).toBe('{"result": "success"}')
    // Should only call once for first agent (no retries for quota errors)
    expect(runCliProvider).toHaveBeenCalledTimes(2) // 1 for claude (quota) + 1 for gemini
  })

  it('stops fallback chain on auth errors', async () => {
    const mockAgent = createMockAgent()
    const mockAgent2 = createMockAgent({ provider: 'gemini' })
    const aiSettings = createMockAISettings(
      {
        'claude.cli': mockAgent as AgentConfig,
        'gemini.cli': mockAgent2 as AgentConfig
      },
      {
        extraction: ['claude.cli', 'gemini.cli'] as AgentId[],
        analysis: ['claude.cli', 'gemini.cli'] as AgentId[],
        document: ['claude.cli', 'gemini.cli'] as AgentId[]
      }
    )

    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    // First agent returns auth error - this should stop the chain
    vi.mocked(runCliProvider)
      .mockResolvedValueOnce({ success: false, output: '', error: 'not authenticated', errorType: 'auth' })

    agentManager = new AgentManager(mockConfigRepo as any)

    await expect(agentManager.execute('extraction', 'test prompt'))
      .rejects.toThrow('AI generation failed')

    // Should only try first agent - auth errors stop the chain
    expect(runCliProvider).toHaveBeenCalledTimes(1)
  })
})
