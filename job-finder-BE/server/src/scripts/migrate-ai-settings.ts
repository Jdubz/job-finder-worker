/**
 * Migration script: ai-settings to new AgentManager structure
 *
 * Converts the old ai-settings structure (worker/documentGenerator sections with per-task overrides)
 * to the new structure (agents map, taskFallbacks, modelRates).
 *
 * Old structure:
 * {
 *   worker: { selected: { provider, interface, model }, tasks: { jobMatch: {...}, ... } }
 *   documentGenerator: { selected: { provider, interface, model } }
 *   options: [...]
 * }
 *
 * New structure:
 * {
 *   agents: { "gemini.cli": AgentConfig, "codex.cli": AgentConfig, ... }
 *   taskFallbacks: { extraction: ["gemini.cli", "codex.cli"], analysis: [...] }
 *   modelRates: { "gpt-4o": 1.0, "gemini-2.0-flash": 0.5, ... }
 *   documentGenerator: { selected: { provider, interface, model } }
 *   options: [...]
 * }
 */

import path from 'node:path'
import sqlite3 from 'better-sqlite3'
import type {
  AIProviderType,
  AIInterfaceType,
  AgentId,
  AgentConfig,
  AgentTaskType,
  AgentAuthRequirements,
} from '@shared/types'

const DB_PATH =
  process.env.SQLITE_DB_PATH ??
  process.env.DATABASE_PATH ??
  path.resolve(process.cwd(), '../../infra/sqlite/jobfinder.db')

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
  documentGenerator: {
    selected: { provider: AIProviderType; interface: AIInterfaceType; model: string }
  }
  options: unknown[]
}

// Default model cost rates
const DEFAULT_MODEL_RATES: Record<string, number> = {
  'gpt-4o': 1.0,
  'gpt-4o-mini': 0.5,
  'gpt-4': 1.5,
  'claude-3-opus': 1.5,
  'claude-3-sonnet': 1.0,
  'claude-3-haiku': 0.3,
  'gemini-2.0-flash': 0.5,
  'gemini-1.5-pro': 1.0,
  'gemini-1.5-flash': 0.3,
}

function loadConfig(db: sqlite3.Database, id: string) {
  return db.prepare('SELECT payload_json, updated_at, updated_by FROM job_finder_config WHERE id = ?').get(id) as
    | { payload_json: string; updated_at: string; updated_by?: string | null }
    | undefined
}

function saveConfig(
  db: sqlite3.Database,
  id: string,
  payload: unknown,
  meta: { updatedBy?: string | null }
) {
  db.prepare(
    `UPDATE job_finder_config
     SET payload_json = ?, updated_at = ?, updated_by = ?
     WHERE id = ?`
  ).run(JSON.stringify(payload), new Date().toISOString(), meta.updatedBy ?? null, id)
}

function isAlreadyMigrated(payload: unknown): payload is NewAISettings {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  // Check for new structure markers
  return (
    'agents' in p &&
    typeof p.agents === 'object' &&
    'taskFallbacks' in p &&
    typeof p.taskFallbacks === 'object'
  )
}

function makeAgentId(provider: AIProviderType, iface: AIInterfaceType): AgentId {
  return `${provider}.${iface}` as AgentId
}

function authRequirementsFor(provider: AIProviderType, iface: AIInterfaceType): AgentAuthRequirements {
  const map: Partial<Record<AgentId, AgentAuthRequirements>> = {
    'codex.cli': { type: 'cli', requiredEnv: ['OPENAI_API_KEY'], requiredFiles: ['~/.codex/auth.json'] },
    'gemini.cli': { type: 'cli', requiredEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], requiredFiles: ['~/.gemini/settings.json'] },
    'gemini.api': { type: 'api', requiredEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
    'claude.cli': { type: 'cli', requiredEnv: ['CLAUDE_CODE_OAUTH_TOKEN'] },
    'claude.api': { type: 'api', requiredEnv: ['ANTHROPIC_API_KEY'] },
    'openai.api': { type: 'api', requiredEnv: ['OPENAI_API_KEY'] },
  }
  return map[makeAgentId(provider, iface)] ?? { type: iface, requiredEnv: ['PATH'] }
}

function migrateAISettings(old: OldAISettings): NewAISettings {
  const agents: Partial<Record<AgentId, AgentConfig>> = {}
  const extractionFallbacks: AgentId[] = []
  const analysisFallbacks: AgentId[] = []
  const documentFallbacks: AgentId[] = []

  // Helper to create or get agent config
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

  // Process worker selections to build agents and fallback chains
  const workerSelected = old.worker?.selected
  const tasks = old.worker?.tasks

  // The old task types map to new task types:
  // - jobMatch, companyDiscovery, sourceDiscovery all used "extraction" for data extraction
  // - jobMatch used "analysis" for the match analysis step

  // Create agents from existing selections
  if (workerSelected) {
    const agentId = ensureAgent(workerSelected.provider, workerSelected.interface, workerSelected.model)
    // Add to both fallback chains as the default
    if (!extractionFallbacks.includes(agentId)) extractionFallbacks.push(agentId)
    if (!analysisFallbacks.includes(agentId)) analysisFallbacks.push(agentId)
    if (!documentFallbacks.includes(agentId)) documentFallbacks.push(agentId)
  }

  // Add task-specific overrides to fallback chains (they get higher priority)
  if (tasks?.jobMatch) {
    const agentId = ensureAgent(tasks.jobMatch.provider, tasks.jobMatch.interface, tasks.jobMatch.model)
    // jobMatch was used for analysis
    if (!analysisFallbacks.includes(agentId)) {
      analysisFallbacks.unshift(agentId) // Higher priority
    }
  }

  if (tasks?.companyDiscovery) {
    const agentId = ensureAgent(tasks.companyDiscovery.provider, tasks.companyDiscovery.interface, tasks.companyDiscovery.model)
    if (!extractionFallbacks.includes(agentId)) {
      extractionFallbacks.unshift(agentId)
    }
  }

  if (tasks?.sourceDiscovery) {
    const agentId = ensureAgent(tasks.sourceDiscovery.provider, tasks.sourceDiscovery.interface, tasks.sourceDiscovery.model)
    if (!extractionFallbacks.includes(agentId)) {
      extractionFallbacks.unshift(agentId)
    }
  }

  if (old.documentGenerator?.selected) {
    const docSel = old.documentGenerator.selected
    const agentId = ensureAgent(docSel.provider, docSel.interface, docSel.model)
    if (!documentFallbacks.includes(agentId)) {
      documentFallbacks.unshift(agentId)
    }
  }

  // Ensure documentGenerator has valid defaults
  const docGen = old.documentGenerator?.selected ?? {
    provider: 'codex' as AIProviderType,
    interface: 'cli' as AIInterfaceType,
    model: 'gpt-4o',
  }

  return {
    agents,
    taskFallbacks: {
      extraction: extractionFallbacks,
      analysis: analysisFallbacks,
      document: documentFallbacks.length ? documentFallbacks : extractionFallbacks,
    },
    modelRates: DEFAULT_MODEL_RATES,
    documentGenerator: { selected: docGen },
    options: old.options ?? [],
  }
}

function main() {
  console.log(`[migrate-ai-settings] Using database: ${DB_PATH}`)

  const db = sqlite3(DB_PATH)
  const row = loadConfig(db, 'ai-settings')

  if (!row) {
    console.log('[migrate-ai-settings] No ai-settings config found; creating default structure.')

    // Create a default new structure
    const defaultSettings: NewAISettings = {
      agents: {
        'gemini.cli': {
          provider: 'gemini',
          interface: 'cli',
          defaultModel: 'gemini-2.0-flash',
          dailyBudget: 100,
          dailyUsage: 0,
          runtimeState: {
            worker: { enabled: true, reason: null },
            backend: { enabled: true, reason: null },
          },
          authRequirements: authRequirementsFor('gemini', 'cli'),
        },
        'codex.cli': {
          provider: 'codex',
          interface: 'cli',
          defaultModel: 'gpt-4o',
          dailyBudget: 100,
          dailyUsage: 0,
          runtimeState: {
            worker: { enabled: true, reason: null },
            backend: { enabled: true, reason: null },
          },
          authRequirements: authRequirementsFor('codex', 'cli'),
        },
        'claude.cli': {
          provider: 'claude',
          interface: 'cli',
          defaultModel: 'claude-sonnet-4-20250514',
          dailyBudget: 50,
          dailyUsage: 0,
          runtimeState: {
            worker: { enabled: true, reason: null },
            backend: { enabled: true, reason: null },
          },
          authRequirements: authRequirementsFor('claude', 'cli'),
        },
      },
      taskFallbacks: {
        extraction: ['gemini.cli', 'codex.cli', 'claude.cli'],
        analysis: ['gemini.cli', 'codex.cli', 'claude.cli'],
        document: ['codex.cli', 'claude.cli', 'gemini.cli'],
      },
      modelRates: DEFAULT_MODEL_RATES,
      documentGenerator: {
        selected: { provider: 'codex', interface: 'cli', model: 'gpt-4o' },
      },
      options: [
        {
          value: 'gemini',
          label: 'Google Gemini',
          interfaces: [
            { value: 'cli', enabled: true, models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
            { value: 'api', enabled: false, reason: 'API key not configured', models: [] },
          ],
        },
        {
          value: 'codex',
          label: 'Codex CLI (OpenAI)',
          interfaces: [
            { value: 'cli', enabled: true, models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4'] },
            { value: 'api', enabled: false, reason: 'API key not configured', models: [] },
          ],
        },
      ],
    }

    db.prepare(
      `INSERT INTO job_finder_config (id, payload_json, updated_at, updated_by)
       VALUES (?, ?, ?, ?)`
    ).run('ai-settings', JSON.stringify(defaultSettings), new Date().toISOString(), 'migration-ai-settings')

    db.close()
    console.log('[migrate-ai-settings] Created default ai-settings with new structure.')
    return
  }

  const parsed = JSON.parse(row.payload_json)

  if (isAlreadyMigrated(parsed)) {
    console.log('[migrate-ai-settings] ai-settings already in new structure; no migration needed.')
    db.close()
    return
  }

  console.log('[migrate-ai-settings] Migrating ai-settings to new AgentManager structure...')

  const newSettings = migrateAISettings(parsed as OldAISettings)

  saveConfig(db, 'ai-settings', newSettings, {
    updatedBy: 'migration-ai-settings',
  })

  db.close()
  console.log('[migrate-ai-settings] ai-settings migrated successfully.')
  console.log('[migrate-ai-settings] Agents created:', Object.keys(newSettings.agents))
  console.log('[migrate-ai-settings] Extraction fallback chain:', newSettings.taskFallbacks.extraction)
  console.log('[migrate-ai-settings] Analysis fallback chain:', newSettings.taskFallbacks.analysis)
}

main()
