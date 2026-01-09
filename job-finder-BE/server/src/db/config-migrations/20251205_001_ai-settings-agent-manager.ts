/**
 * Migration: ai-settings to AgentManager structure
 *
 * Converts the old ai-settings structure (worker/documentGenerator sections)
 * to the new structure (agents map, taskFallbacks, modelRates).
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

export const description = 'Convert ai-settings to AgentManager structure'

type OldAISettings = {
  worker?: {
    selected?: { provider: AIProviderType; interface: AIInterfaceType; model: string }
    tasks?: {
      jobMatch?: { provider: AIProviderType; interface: AIInterfaceType; model: string }
      companyDiscovery?: { provider: AIProviderType; interface: AIInterfaceType; model: string }
      sourceDiscovery?: { provider: AIProviderType; interface: AIInterfaceType; model: string }
    }
  }
  documentGenerator?: {
    selected?: { provider: AIProviderType; interface: AIInterfaceType; model: string }
  }
  options?: unknown[]
}

type NewAISettings = {
  agents: Partial<Record<AgentId, AgentConfig>>
  taskFallbacks: Record<AgentTaskType, AgentId[]>
  modelRates: Record<string, number>
  /** @deprecated - kept for backwards compatibility with frontend */
  documentGenerator?: {
    selected?: { provider: AIProviderType; interface: AIInterfaceType; model: string }
  }
  options: unknown[]
}

/**
 * Model rates for budget tracking.
 * Uses -latest aliases where available to support organic model improvements.
 * Rates are relative costs per request (1.0 = baseline).
 */
const DEFAULT_MODEL_RATES: Record<string, number> = {
  // "default" = CLI uses its configured default (cost 1.0)
  'default': 1.0,
  // Claude - short aliases (auto-update within version, not across versions)
  'claude-opus-4-5': 1.0,
  'claude-sonnet-4-5': 1.0,
  'claude-haiku-4-5': 0.3,
  'claude-opus-4-1': 1.5,
  'claude-sonnet-4-0': 1.0,
  // Gemini - use current production models
  'gemini-2.0-flash': 0.5,
  'gemini-2.5-flash': 0.5,
  'gemini-2.5-pro': 1.0,
  'gemini-1.5-pro': 1.0,
  'gemini-1.5-flash': 0.3,
}

/**
 * Default provider options with available models.
 * CLI interfaces include "default" option to use CLI's configured default model.
 * Models are ordered newest/most-capable first within each category.
 *
 * Supported agents: claude.cli, gemini.api
 */
const DEFAULT_PROVIDER_OPTIONS = [
  {
    value: 'claude',
    interfaces: [
      {
        value: 'cli',
        // "default" = CLI uses its configured default (auto-updates with CLI)
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
        // API requires explicit model - no "default" option
        models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
        enabled: true,
      },
    ],
  },
]

function isAlreadyMigrated(payload: unknown): payload is NewAISettings {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  return 'agents' in p && typeof p.agents === 'object' && 'taskFallbacks' in p && typeof p.taskFallbacks === 'object'
}

function makeAgentId(provider: AIProviderType, iface: AIInterfaceType): AgentId {
  return `${provider}.${iface}` as AgentId
}

function authRequirementsFor(provider: AIProviderType, iface: AIInterfaceType): AgentAuthRequirements {
  // Supported agents: claude.cli, gemini.api
  const map: Partial<Record<AgentId, AgentAuthRequirements>> = {
    'claude.cli': { type: 'cli', requiredEnv: ['CLAUDE_CODE_OAUTH_TOKEN'] },
    'gemini.api': { type: 'api', requiredEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
  }
  const key = makeAgentId(provider, iface)
  if (!map[key]) {
    throw new Error(`authRequirements not defined for provider/interface: ${key}`)
  }
  return map[key] as AgentAuthRequirements
}

function migrateToNew(old: OldAISettings): NewAISettings {
  const agents: Partial<Record<AgentId, AgentConfig>> = {}
  const extractionFallbacks: AgentId[] = []
  const analysisFallbacks: AgentId[] = []
  const documentFallbacks: AgentId[] = []

  const ensureAgent = (provider: AIProviderType, iface: AIInterfaceType, model: string): AgentId => {
    const agentId = makeAgentId(provider, iface)
    if (!agents[agentId]) {
      agents[agentId] = {
        provider,
        interface: iface,
        defaultModel: model,
        dailyBudget: 100,
        dailyUsage: 0,
        runtimeState: {
          worker: { enabled: true, reason: null },
          backend: { enabled: true, reason: null },
        },
        authRequirements: authRequirementsFor(provider, iface),
      }
    }
    return agentId
  }

  const workerSelected = old.worker?.selected
  const tasks = old.worker?.tasks

  if (workerSelected) {
    const agentId = ensureAgent(workerSelected.provider, workerSelected.interface, workerSelected.model)
    if (!extractionFallbacks.includes(agentId)) extractionFallbacks.push(agentId)
    if (!analysisFallbacks.includes(agentId)) analysisFallbacks.push(agentId)
    if (!documentFallbacks.includes(agentId)) documentFallbacks.push(agentId)
  }

  if (tasks?.jobMatch) {
    const agentId = ensureAgent(tasks.jobMatch.provider, tasks.jobMatch.interface, tasks.jobMatch.model)
    if (!analysisFallbacks.includes(agentId)) analysisFallbacks.unshift(agentId)
  }

  if (tasks?.companyDiscovery) {
    const agentId = ensureAgent(tasks.companyDiscovery.provider, tasks.companyDiscovery.interface, tasks.companyDiscovery.model)
    if (!extractionFallbacks.includes(agentId)) extractionFallbacks.unshift(agentId)
  }

  if (tasks?.sourceDiscovery) {
    const agentId = ensureAgent(tasks.sourceDiscovery.provider, tasks.sourceDiscovery.interface, tasks.sourceDiscovery.model)
    if (!extractionFallbacks.includes(agentId)) extractionFallbacks.unshift(agentId)
  }

  if (old.documentGenerator?.selected) {
    const docSel = old.documentGenerator.selected
    const agentId = ensureAgent(docSel.provider, docSel.interface, docSel.model)
    if (!documentFallbacks.includes(agentId)) documentFallbacks.unshift(agentId)
  }

  return {
    agents,
    taskFallbacks: {
      extraction: extractionFallbacks,
      analysis: analysisFallbacks,
      document: documentFallbacks.length ? documentFallbacks : extractionFallbacks,
    },
    modelRates: DEFAULT_MODEL_RATES,
    // documentGenerator is deprecated - provider selection uses taskFallbacks['document']
    // Always use default options to ensure correct model lists
    options: DEFAULT_PROVIDER_OPTIONS,
  }
}

export function up(db: Database.Database): void {
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('ai-settings') as { payload_json: string } | undefined

  if (!row) {
    // Create default new structure
    // Supported agents: claude.cli, gemini.api
    const defaultSettings: NewAISettings = {
      agents: {
        'claude.cli': {
          provider: 'claude',
          interface: 'cli',
          defaultModel: 'default',
          dailyBudget: 100,
          dailyUsage: 0,
          runtimeState: {
            worker: { enabled: true, reason: null },
            backend: { enabled: true, reason: null },
          },
          authRequirements: authRequirementsFor('claude', 'cli'),
        },
        'gemini.api': {
          provider: 'gemini',
          interface: 'api',
          defaultModel: 'gemini-2.5-flash',
          dailyBudget: 100,
          dailyUsage: 0,
          runtimeState: {
            worker: { enabled: true, reason: null },
            backend: { enabled: true, reason: null },
          },
          authRequirements: authRequirementsFor('gemini', 'api'),
        },
      },
      taskFallbacks: {
        extraction: ['claude.cli', 'gemini.api'],
        analysis: ['claude.cli', 'gemini.api'],
        document: ['claude.cli', 'gemini.api'],
      },
      modelRates: DEFAULT_MODEL_RATES,
      // documentGenerator is deprecated - provider selection uses taskFallbacks['document']
      options: DEFAULT_PROVIDER_OPTIONS,
    }

    db.prepare(
      `INSERT INTO job_finder_config (id, payload_json, updated_at, updated_by) VALUES (?, ?, ?, ?)`
    ).run('ai-settings', JSON.stringify(defaultSettings), new Date().toISOString(), 'config-migration')
    return
  }

  const parsed = JSON.parse(row.payload_json)

  if (isAlreadyMigrated(parsed)) {
    // Already migrated, nothing to do
    return
  }

  const newSettings = migrateToNew(parsed as OldAISettings)

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(newSettings), new Date().toISOString(), 'config-migration', 'ai-settings')
}

export function down(db: Database.Database): void {
  // Rollback is not fully reversible - task-specific agent assignments (jobMatch,
  // companyDiscovery, sourceDiscovery) are lost and cannot be recovered. We convert
  // the first available agent back to worker.selected as a best effort.
  const row = db
    .prepare('SELECT payload_json FROM job_finder_config WHERE id = ?')
    .get('ai-settings') as { payload_json: string } | undefined

  if (!row) return

  const parsed = JSON.parse(row.payload_json) as NewAISettings

  // Convert back to old structure (best effort)
  const firstAgent = Object.values(parsed.agents ?? {})[0]
  const oldSettings: OldAISettings = {
    worker: firstAgent
      ? {
          selected: {
            provider: firstAgent.provider,
            interface: firstAgent.interface,
            model: firstAgent.defaultModel,
          },
        }
      : undefined,
    options: parsed.options,
  }

  db.prepare(
    `UPDATE job_finder_config SET payload_json = ?, updated_at = ?, updated_by = ? WHERE id = ?`
  ).run(JSON.stringify(oldSettings), new Date().toISOString(), 'config-migration-rollback', 'ai-settings')
}
