/**
 * Migration: Simplify agents to only claude.cli and gemini.api
 *
 * Removes all agents except claude.cli and gemini.api from ai-settings.
 * Updates taskFallbacks to only reference the supported agents.
 * Cleans up modelRates to only include claude and gemini models.
 */

import type Database from 'better-sqlite3'
import type {
  AIProviderType,
  AIInterfaceType,
  AgentId,
  AgentConfig,
  AgentTaskType,
  AgentAuthRequirements,
} from '@shared/types'

export const description = 'Simplify agents to only claude.cli and gemini.api'

type AISettings = {
  agents: Partial<Record<AgentId, AgentConfig>>
  taskFallbacks: Record<AgentTaskType, AgentId[]>
  modelRates: Record<string, number>
  documentGenerator?: {
    selected?: { provider: AIProviderType; interface: AIInterfaceType; model: string }
  }
  options: unknown[]
}

// Supported agents after migration
const SUPPORTED_AGENTS: AgentId[] = ['claude.cli', 'gemini.api']

// Default model rates (only claude and gemini models)
const DEFAULT_MODEL_RATES: Record<string, number> = {
  'default': 1.0,
  // Claude models
  'claude-opus-4-5': 1.0,
  'claude-sonnet-4-5': 1.0,
  'claude-haiku-4-5': 0.3,
  'claude-opus-4-1': 1.5,
  'claude-sonnet-4-0': 1.0,
  // Gemini models
  'gemini-2.0-flash': 0.5,
  'gemini-2.5-flash': 0.5,
  'gemini-2.5-pro': 1.0,
  'gemini-1.5-pro': 1.0,
  'gemini-1.5-flash': 0.3,
}

// Default provider options (only claude.cli and gemini.api)
const DEFAULT_PROVIDER_OPTIONS = [
  {
    value: 'claude',
    interfaces: [
      {
        value: 'cli',
        models: ['default', 'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1', 'claude-sonnet-4-0'],
        enabled: true,
      },
    ],
  },
  {
    value: 'gemini',
    interfaces: [
      {
        value: 'api',
        models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
        enabled: true,
      },
    ],
  },
]

// Default auth requirements
const AUTH_REQUIREMENTS: Record<AgentId, AgentAuthRequirements> = {
  'claude.cli': { type: 'cli', requiredEnv: ['CLAUDE_CODE_OAUTH_TOKEN'] },
  'gemini.api': { type: 'api', requiredEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
} as Record<AgentId, AgentAuthRequirements>

function createDefaultAgent(agentId: AgentId): AgentConfig {
  const [provider, iface] = agentId.split('.') as [AIProviderType, AIInterfaceType]

  const defaultModels: Record<AgentId, string> = {
    'claude.cli': 'default',
    'gemini.api': 'gemini-2.5-flash',
  } as Record<AgentId, string>

  return {
    provider,
    interface: iface,
    defaultModel: defaultModels[agentId] || 'default',
    dailyBudget: 100,
    dailyUsage: 0,
    runtimeState: {
      worker: { enabled: true, reason: null },
      backend: { enabled: true, reason: null },
    },
    authRequirements: AUTH_REQUIREMENTS[agentId],
  }
}

export function up(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('ai-settings') as { payload_json: string } | undefined

  if (!row) {
    // No ai-settings exist - create fresh with only supported agents
    const newSettings: AISettings = {
      agents: {
        'claude.cli': createDefaultAgent('claude.cli' as AgentId),
        'gemini.api': createDefaultAgent('gemini.api' as AgentId),
      },
      taskFallbacks: {
        extraction: ['claude.cli', 'gemini.api'],
        analysis: ['claude.cli', 'gemini.api'],
        document: ['claude.cli', 'gemini.api'],
      },
      modelRates: DEFAULT_MODEL_RATES,
      options: DEFAULT_PROVIDER_OPTIONS,
    }

    db.prepare(
      `INSERT INTO job_finder_config (id, payload_json, updated_at, updated_by) VALUES (?, ?, ?, ?)`
    ).run('ai-settings', JSON.stringify(newSettings), new Date().toISOString(), 'config-migration')
    return
  }

  const parsed = JSON.parse(row.payload_json) as AISettings

  // Filter agents to only supported ones
  const newAgents: Partial<Record<AgentId, AgentConfig>> = {}
  for (const agentId of SUPPORTED_AGENTS) {
    if (parsed.agents?.[agentId]) {
      // Keep existing agent config but update auth requirements
      newAgents[agentId] = {
        ...parsed.agents[agentId],
        authRequirements: AUTH_REQUIREMENTS[agentId],
      }
    } else {
      // Create default agent config
      newAgents[agentId] = createDefaultAgent(agentId)
    }
  }

  // Update taskFallbacks to only reference supported agents
  const newTaskFallbacks: Record<AgentTaskType, AgentId[]> = {
    extraction: [],
    analysis: [],
    document: [],
  }

  for (const taskType of ['extraction', 'analysis', 'document'] as AgentTaskType[]) {
    const existingChain = parsed.taskFallbacks?.[taskType] || []
    // Filter to only supported agents, preserving order
    const filteredChain = existingChain.filter((agentId) => SUPPORTED_AGENTS.includes(agentId))
    // If no agents remain, use default order
    newTaskFallbacks[taskType] = filteredChain.length > 0 ? filteredChain : ['claude.cli', 'gemini.api']
  }

  // Build updated settings
  const newSettings: AISettings = {
    agents: newAgents,
    taskFallbacks: newTaskFallbacks,
    modelRates: DEFAULT_MODEL_RATES,
    options: DEFAULT_PROVIDER_OPTIONS,
  }

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(newSettings), new Date().toISOString(), 'config-migration', 'ai-settings')
}

export function down(db: Database.Database): void {
  // Rollback is not possible - removed agents cannot be restored
  // This is a one-way migration
  console.warn('Rollback not supported for agent simplification migration')
}
