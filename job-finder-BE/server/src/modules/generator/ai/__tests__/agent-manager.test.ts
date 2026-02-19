import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AISettings, AgentConfig, AgentId } from '@shared/types'

// Track GoogleGenAI constructor calls
const mockGenerateContent = vi.fn()

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn()
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
import { ConfigRepository } from '../../../config/config.repository'
import { GoogleGenAI } from '@google/genai'

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

describe('AgentManager Gemini API auth selection', () => {
  let mockConfigRepo: { get: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
  let agentManager: AgentManager
  const runProviderMock = vi.fn()
  const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any

  function createGeminiAgent(authOverride?: any): AgentConfig {
    return createMockAgent({
      provider: 'gemini',
      interface: 'api',
      defaultModel: 'gemini-2.5-flash',
      authRequirements: authOverride ?? { type: 'api', requiredEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_CLOUD_PROJECT'] }
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateContent.mockReset()
    runProviderMock.mockReset()

    // Re-apply GoogleGenAI mock (vi.clearAllMocks clears the implementation)
    vi.mocked(GoogleGenAI).mockImplementation((() => ({
      models: { generateContent: mockGenerateContent }
    })) as any)

    mockConfigRepo = { get: vi.fn(), upsert: vi.fn() }
    vi.mocked(ConfigRepository).mockImplementation(() => mockConfigRepo as any)

    // Clear Gemini-related env vars
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_API_KEY
    delete process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.GOOGLE_CLOUD_LOCATION
  })

  afterEach(() => {
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_API_KEY
    delete process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.GOOGLE_CLOUD_LOCATION
  })

  it('uses API key auth when GEMINI_API_KEY is set', async () => {
    process.env.GEMINI_API_KEY = 'test-api-key'

    const agent = createGeminiAgent()
    const aiSettings = createMockAISettings({ 'gemini.api': agent as AgentConfig })
    aiSettings.modelRates = { 'gemini-2.5-flash': 0.5 }
    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    mockGenerateContent.mockResolvedValue({ text: 'generated text' })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)
    const result = await agentManager.execute('extraction', 'test prompt')

    expect(result.output).toBe('generated text')
    expect(vi.mocked(GoogleGenAI)).toHaveBeenCalledWith({ apiKey: 'test-api-key' })
  })

  it('uses Vertex AI auth when GOOGLE_CLOUD_PROJECT is set (no API key)', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'my-project'

    const agent = createGeminiAgent()
    const aiSettings = createMockAISettings({ 'gemini.api': agent as AgentConfig })
    aiSettings.modelRates = { 'gemini-2.5-flash': 0.5 }
    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    mockGenerateContent.mockResolvedValue({ text: 'vertex response' })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)
    const result = await agentManager.execute('extraction', 'test prompt')

    expect(result.output).toBe('vertex response')
    expect(vi.mocked(GoogleGenAI)).toHaveBeenCalledWith({
      vertexai: true,
      project: 'my-project',
      location: 'us-central1',
    })
  })

  it('respects GOOGLE_CLOUD_LOCATION for Vertex AI', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'my-project'
    process.env.GOOGLE_CLOUD_LOCATION = 'europe-west1'

    const agent = createGeminiAgent()
    const aiSettings = createMockAISettings({ 'gemini.api': agent as AgentConfig })
    aiSettings.modelRates = { 'gemini-2.5-flash': 0.5 }
    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    mockGenerateContent.mockResolvedValue({ text: 'eu response' })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)
    await agentManager.execute('extraction', 'test prompt')

    expect(vi.mocked(GoogleGenAI)).toHaveBeenCalledWith({
      vertexai: true,
      project: 'my-project',
      location: 'europe-west1',
    })
  })

  it('prefers API key over Vertex AI when both are set', async () => {
    process.env.GEMINI_API_KEY = 'test-api-key'
    process.env.GOOGLE_CLOUD_PROJECT = 'my-project'

    const agent = createGeminiAgent()
    const aiSettings = createMockAISettings({ 'gemini.api': agent as AgentConfig })
    aiSettings.modelRates = { 'gemini-2.5-flash': 0.5 }
    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    mockGenerateContent.mockResolvedValue({ text: 'api key response' })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)
    await agentManager.execute('extraction', 'test prompt')

    // Should use API key, not Vertex AI
    expect(vi.mocked(GoogleGenAI)).toHaveBeenCalledWith({ apiKey: 'test-api-key' })
  })

  it('disables agent when no Gemini credentials are set', async () => {
    // No GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_CLOUD_PROJECT
    // checkAuth catches this before runApiAgent even runs

    const agent = createGeminiAgent()
    const aiSettings = createMockAISettings({ 'gemini.api': agent as AgentConfig })
    aiSettings.modelRates = { 'gemini-2.5-flash': 0.5 }
    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)

    await expect(agentManager.execute('extraction', 'test prompt'))
      .rejects.toThrow('No agents available')

    // Agent should be disabled due to missing auth
    expect(mockConfigRepo.upsert).toHaveBeenCalled()
    const updatedSettings = mockConfigRepo.upsert.mock.calls[0][1] as AISettings
    expect(updatedSettings.agents?.['gemini.api']?.runtimeState?.backend?.enabled).toBe(false)
    expect(vi.mocked(GoogleGenAI)).not.toHaveBeenCalled()
  })

  it('throws auth error from runApiAgent when checkAuth passes but no credentials', async () => {
    // Use permissive auth requirements so checkAuth passes, but runApiAgent detects no credentials
    const agent = createGeminiAgent({ type: 'api', requiredEnv: ['PATH'] })
    const aiSettings = createMockAISettings({ 'gemini.api': agent as AgentConfig })
    aiSettings.modelRates = { 'gemini-2.5-flash': 0.5 }
    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)

    await expect(agentManager.execute('extraction', 'test prompt'))
      .rejects.toThrow('AI generation failed: Gemini auth not configured')
  })

  it('disables thinking tokens in API calls', async () => {
    process.env.GEMINI_API_KEY = 'test-key'

    const agent = createGeminiAgent()
    const aiSettings = createMockAISettings({ 'gemini.api': agent as AgentConfig })
    aiSettings.modelRates = { 'gemini-2.5-flash': 0.5 }
    mockConfigRepo.get.mockReturnValue({ payload: aiSettings })

    mockGenerateContent.mockResolvedValue({ text: 'response' })

    agentManager = new AgentManager(mockConfigRepo as any, mockLog, runProviderMock as any)
    await agentManager.execute('extraction', 'test prompt')

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        contents: 'test prompt',
        config: { thinkingConfig: { thinkingBudget: 0 } },
      })
    )
  })
})
