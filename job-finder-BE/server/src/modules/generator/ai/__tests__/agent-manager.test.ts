import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AISettings, AgentConfig, AgentId } from '@shared/types'

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
  const runProviderMock = vi.fn()
  const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any

  beforeEach(() => {
    vi.clearAllMocks()

    runProviderMock.mockReset()
    runProviderMock.mockResolvedValue({ success: true, output: '', error: undefined, errorType: undefined })

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
    runProviderMock
      .mockResolvedValueOnce({ success: false, output: '', error: 'timeout', errorType: 'timeout' })
      .mockResolvedValueOnce({ success: true, output: '{"result": "success"}', error: undefined, errorType: undefined })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)
    const result = await agentManager.execute('extraction', 'test prompt')

    expect(result.output).toBe('{"result": "success"}')
    expect(result.agentId).toBe('claude.cli')
    expect(runProviderMock).toHaveBeenCalledTimes(2)
    // Agent should NOT be disabled since it succeeded on retry
    expect(mockConfigRepo.upsert).toHaveBeenCalledTimes(1) // Only usage update
  })

  it('retries twice then disables agent after 3 timeout failures', async () => {
    const mockAgent = createMockAgent()
    const aiSettings = createMockAISettings({ 'claude.cli': mockAgent as AgentConfig })

    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    // All 3 attempts timeout
    runProviderMock.mockResolvedValue({ success: false, output: '', error: 'timeout after 30s', errorType: 'timeout' })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)

    await expect(agentManager.execute('extraction', 'test prompt'))
      .rejects.toThrow('No agents available')

    expect(runProviderMock).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
    // Agent should be disabled after all retries exhausted
    expect(mockConfigRepo.upsert).toHaveBeenCalled()
    const lastUpsertCall = mockConfigRepo.upsert.mock.calls[mockConfigRepo.upsert.mock.calls.length - 1]
    const updatedSettings = lastUpsertCall[1] as AISettings
    expect(updatedSettings.agents?.['claude.cli']?.runtimeState?.backend?.enabled).toBe(false)
    expect(updatedSettings.agents?.['claude.cli']?.runtimeState?.backend?.reason).toContain('error:')
  })

  it('timeout on first agent does not break fallback chain', async () => {
    // Use two CLI agents to test fallback behavior without API mocking complexity
    const mockAgent1 = createMockAgent({ provider: 'claude' })
    const mockAgent2 = createMockAgent({ provider: 'claude', defaultModel: 'claude-backup' })
    const aiSettings = createMockAISettings(
      {
        'claude.cli': mockAgent1 as AgentConfig,
        'claude.backup': mockAgent2 as AgentConfig
      },
      {
        extraction: ['claude.cli', 'claude.backup'] as AgentId[],
        analysis: ['claude.cli', 'claude.backup'] as AgentId[],
        document: ['claude.cli', 'claude.backup'] as AgentId[]
      }
    )
    aiSettings.modelRates = { ...aiSettings.modelRates, 'claude-backup': 1.0 }

    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    // First agent (claude.cli) times out all 3 times, second agent (claude.backup) succeeds
    runProviderMock
      .mockResolvedValueOnce({ success: false, output: '', error: 'timeout', errorType: 'timeout' })
      .mockResolvedValueOnce({ success: false, output: '', error: 'timeout', errorType: 'timeout' })
      .mockResolvedValueOnce({ success: false, output: '', error: 'timeout', errorType: 'timeout' })
      .mockResolvedValueOnce({ success: true, output: '{"result": "from backup"}', error: undefined, errorType: undefined })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)
    const result = await agentManager.execute('extraction', 'test prompt')

    expect(result.output).toBe('{"result": "from backup"}')
    expect(result.agentId).toBe('claude.backup')
    expect(runProviderMock).toHaveBeenCalledTimes(4) // 3 for claude.cli + 1 for claude.backup
  })

  it('does not retry on quota exhausted error', async () => {
    // Use two CLI agents to test quota handling without API mocking complexity
    const mockAgent = createMockAgent()
    const mockAgent2 = createMockAgent({ provider: 'claude', defaultModel: 'claude-backup' })
    const aiSettings = createMockAISettings(
      {
        'claude.cli': mockAgent as AgentConfig,
        'claude.backup': mockAgent2 as AgentConfig
      },
      {
        extraction: ['claude.cli', 'claude.backup'] as AgentId[],
        analysis: ['claude.cli', 'claude.backup'] as AgentId[],
        document: ['claude.cli', 'claude.backup'] as AgentId[]
      }
    )
    aiSettings.modelRates = { ...aiSettings.modelRates, 'claude-backup': 1.0 }

    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    // First agent returns quota error, second succeeds
    runProviderMock
      .mockResolvedValueOnce({ success: false, output: '', error: 'rate limit exceeded', errorType: 'quota' })
      .mockResolvedValueOnce({ success: true, output: '{"result": "success"}', error: undefined, errorType: undefined })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)
    const result = await agentManager.execute('extraction', 'test prompt')

    expect(result.output).toBe('{"result": "success"}')
    // Should only call once for first agent (no retries for quota errors)
    expect(runProviderMock).toHaveBeenCalledTimes(2) // 1 for claude.cli (quota) + 1 for claude.backup
  })

  it('stops fallback chain on auth errors', async () => {
    // Use two CLI agents to test auth error handling
    const mockAgent = createMockAgent()
    const mockAgent2 = createMockAgent({ provider: 'claude', defaultModel: 'claude-backup' })
    const aiSettings = createMockAISettings(
      {
        'claude.cli': mockAgent as AgentConfig,
        'claude.backup': mockAgent2 as AgentConfig
      },
      {
        extraction: ['claude.cli', 'claude.backup'] as AgentId[],
        analysis: ['claude.cli', 'claude.backup'] as AgentId[],
        document: ['claude.cli', 'claude.backup'] as AgentId[]
      }
    )
    aiSettings.modelRates = { ...aiSettings.modelRates, 'claude-backup': 1.0 }

    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    // First agent returns auth error - this should stop the chain
    runProviderMock
      .mockResolvedValueOnce({ success: false, output: '', error: 'not authenticated', errorType: 'auth' })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)

    await expect(agentManager.execute('extraction', 'test prompt'))
      .rejects.toThrow('AI generation failed')

    // Should only try first agent - auth errors stop the chain
    expect(runProviderMock).toHaveBeenCalledTimes(1)
  })
})
