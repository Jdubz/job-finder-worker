import { Router } from 'express'
import { z } from 'zod'
import { execSync } from 'child_process'
import type {
  ListConfigEntriesResponse,
  GetConfigEntryResponse,
  UpsertConfigEntryResponse,
  StopList,
  QueueSettings,
  AISettings,
  AIProviderStatus,
  JobFiltersConfig,
  JobMatchConfig,
  TechnologyRanksConfig,
  SchedulerSettings,
  JobFinderConfigId,
  PromptConfig,
} from '@shared/types'
import {
  ApiErrorCode,
  DEFAULT_STOP_LIST,
  DEFAULT_QUEUE_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_JOB_FILTERS,
  DEFAULT_JOB_MATCH,
  DEFAULT_TECH_RANKS,
  DEFAULT_SCHEDULER_SETTINGS,
  DEFAULT_PROMPTS,
  AI_PROVIDER_MODELS,
  isStopList,
  isQueueSettings,
  isAISettings,
  isJobFiltersConfig,
  isJobMatchConfig,
  isTechnologyRanksConfig,
  isSchedulerSettings,
  isPersonalInfo,
} from '@shared/types'
import { ConfigRepository } from './config.repository'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { env } from '../../config/env'
import { logger } from '../../logger'

const updateSchema = z.object({
  payload: z.record(z.unknown())
})

type KnownPayload =
  | StopList
  | QueueSettings
  | AISettings
  | JobFiltersConfig
  | JobMatchConfig
  | TechnologyRanksConfig
  | SchedulerSettings
  | PromptConfig
  | Record<string, unknown>

/**
 * Check provider availability based on API keys and CLI auth status
 */
function getProviderAvailability(): AIProviderStatus[] {
  const providers: AIProviderStatus[] = []

  // Codex CLI - check login status
  let codexEnabled = false
  let codexReason = 'CLI not installed or not authenticated'
  try {
    const result = execSync('codex login status 2>&1', { encoding: 'utf-8', timeout: 5000 })
    codexEnabled = result.toLowerCase().includes('logged in')
    if (!codexEnabled) {
      codexReason = 'Not logged in - run `codex login`'
    }
  } catch {
    codexReason = 'Codex CLI not available'
  }
  providers.push({
    provider: 'codex',
    interface: 'cli',
    enabled: codexEnabled,
    reason: codexEnabled ? undefined : codexReason,
    models: [...AI_PROVIDER_MODELS.codex.cli],
  })

  // Claude API - check ANTHROPIC_API_KEY
  const claudeEnabled = !!process.env.ANTHROPIC_API_KEY
  providers.push({
    provider: 'claude',
    interface: 'api',
    enabled: claudeEnabled,
    reason: claudeEnabled ? undefined : 'ANTHROPIC_API_KEY not set',
    models: [...AI_PROVIDER_MODELS.claude.api],
  })

  // OpenAI API - check OPENAI_API_KEY
  const openaiEnabled = !!process.env.OPENAI_API_KEY
  providers.push({
    provider: 'openai',
    interface: 'api',
    enabled: openaiEnabled,
    reason: openaiEnabled ? undefined : 'OPENAI_API_KEY not set',
    models: [...AI_PROVIDER_MODELS.openai.api],
  })

  // Gemini API - check GOOGLE_API_KEY or GEMINI_API_KEY
  const geminiEnabled = !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)
  providers.push({
    provider: 'gemini',
    interface: 'api',
    enabled: geminiEnabled,
    reason: geminiEnabled ? undefined : 'GOOGLE_API_KEY or GEMINI_API_KEY not set',
    models: [...AI_PROVIDER_MODELS.gemini.api],
  })

  return providers
}

function toCamelCaseKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function normalizeKeys<T extends Record<string, any>>(obj: Record<string, any>): T {
  const entries = Object.entries(obj).map(([k, v]) => [toCamelCaseKey(k), v])
  return Object.fromEntries(entries) as T
}

function seedDefaults(repo: ConfigRepository) {
  const seeds: Array<[JobFinderConfigId, KnownPayload]> = [
    ['stop-list', DEFAULT_STOP_LIST],
    ['queue-settings', DEFAULT_QUEUE_SETTINGS],
    ['ai-settings', DEFAULT_AI_SETTINGS],
    ['job-filters', DEFAULT_JOB_FILTERS],
    ['job-match', DEFAULT_JOB_MATCH],
    ['technology-ranks', DEFAULT_TECH_RANKS],
    ['scheduler-settings', DEFAULT_SCHEDULER_SETTINGS],
    ['ai-prompts', DEFAULT_PROMPTS],
  ]

  for (const [id, payload] of seeds) {
    if (!repo.get(id)) {
      repo.upsert(id, payload)
    }
  }
}

function coercePayload(id: JobFinderConfigId, payload: Record<string, unknown>): KnownPayload {
  switch (id) {
    case 'stop-list':
      return { ...DEFAULT_STOP_LIST, ...normalizeKeys<StopList>(payload) }
    case 'queue-settings': {
      const normalized = normalizeKeys<QueueSettings>(payload)
      return {
        ...DEFAULT_QUEUE_SETTINGS,
        ...normalized,
      }
    }
    case 'ai-settings': {
      const normalized = normalizeKeys<Partial<AISettings>>(payload)
      // Merge selected configuration, providers are populated on GET
      return {
        selected: {
          ...DEFAULT_AI_SETTINGS.selected,
          ...(normalized.selected ?? {}),
        },
        providers: [], // Always populated dynamically on GET
      }
    }
    case 'job-match': {
      const normalized = normalizeKeys<JobMatchConfig>(payload)
      return {
        ...DEFAULT_JOB_MATCH,
        ...normalized,
      }
    }
    case 'job-filters': {
      const normalized = normalizeKeys<JobFiltersConfig>(payload)
      return {
        ...DEFAULT_JOB_FILTERS,
        ...normalized,
        hardRejections: {
          ...DEFAULT_JOB_FILTERS.hardRejections,
          ...(normalized.hardRejections ?? {}),
        },
        remotePolicy: { ...DEFAULT_JOB_FILTERS.remotePolicy, ...(normalized.remotePolicy ?? {}) },
        salaryStrike: { ...DEFAULT_JOB_FILTERS.salaryStrike, ...(normalized.salaryStrike ?? {}) },
        experienceStrike: {
          ...DEFAULT_JOB_FILTERS.experienceStrike,
          ...(normalized.experienceStrike ?? {}),
        },
        qualityStrikes: {
          ...DEFAULT_JOB_FILTERS.qualityStrikes,
          ...(normalized.qualityStrikes ?? {}),
        },
        ageStrike: { ...DEFAULT_JOB_FILTERS.ageStrike, ...(normalized.ageStrike ?? {}) },
      }
    }
    case 'technology-ranks': {
      const normalized = normalizeKeys<TechnologyRanksConfig>(payload)
      return {
        ...DEFAULT_TECH_RANKS,
        ...normalized,
        strikes: {
          ...DEFAULT_TECH_RANKS.strikes,
          ...(normalized.strikes ?? {}),
        },
      }
    }
    case 'scheduler-settings': {
      const normalized = normalizeKeys<SchedulerSettings>(payload)
      return { ...DEFAULT_SCHEDULER_SETTINGS, ...normalized }
    }
    case 'ai-prompts':
      return payload
    case 'personal-info':
    default:
      return payload
  }
}

function validatePayload(id: JobFinderConfigId, payload: KnownPayload): boolean {
  switch (id) {
    case 'stop-list':
      return isStopList(payload)
    case 'queue-settings':
      return isQueueSettings(payload)
    case 'ai-settings':
      return isAISettings(payload)
    case 'job-filters':
      return isJobFiltersConfig(payload)
    case 'job-match':
      return isJobMatchConfig(payload)
    case 'technology-ranks':
      return isTechnologyRanksConfig(payload)
    case 'scheduler-settings':
      return isSchedulerSettings(payload)
    case 'ai-prompts':
      return true
    case 'personal-info':
      return isPersonalInfo(payload)
    default:
      return false
  }
}

async function triggerWorkerReload(id: string) {
  if (!env.WORKER_RELOAD_URL) return
  try {
    const res = await fetch(env.WORKER_RELOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configId: id }),
    })
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Worker reload endpoint responded with non-200')
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to call worker reload endpoint')
  }
}

export function buildConfigRouter() {
  const router = Router()
  const repo = new ConfigRepository()

  // Ensure required configs exist with sensible defaults
  seedDefaults(repo)

  router.get(
    '/',
    asyncHandler((_req, res) => {
      const response: ListConfigEntriesResponse = { configs: repo.list() }
      res.json(success(response))
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const id = req.params.id as JobFinderConfigId
      const userEmail = (req as typeof req & { user?: { email?: string } }).user?.email ?? null

      let entry = repo.get(id)

      // Auto-create personal-info with defaults to avoid 404s in settings UI
      if (!entry && id === 'personal-info') {
        entry = repo.upsert(id, { name: '', email: userEmail ?? '', accentColor: '#3b82f6' }, { updatedBy: userEmail ?? undefined, name: 'Personal Info' })
      }

      if (!entry) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Config not found'))
        return
      }

      // For ai-settings, populate provider availability dynamically
      if (id === 'ai-settings') {
        const aiPayload = entry.payload as AISettings
        entry = {
          ...entry,
          payload: {
            ...aiPayload,
            providers: getProviderAvailability(),
          },
        }
      }

      const response: GetConfigEntryResponse = { config: entry }
      res.json(success(response))
    })
  )

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const body = updateSchema.parse(req.body)
      const id = req.params.id as JobFinderConfigId

      const coerced = coercePayload(id, body.payload)
      if (!validatePayload(id, coerced)) {
        res.status(400).json(failure(ApiErrorCode.VALIDATION_FAILED, 'Invalid config payload'))
        return
      }

      const userEmail = (req as typeof req & { user?: { email?: string } }).user?.email ?? null

      const entry = repo.upsert(id, coerced, { updatedBy: userEmail ?? undefined })
      const response: UpsertConfigEntryResponse = { config: entry }

      // Fire-and-forget reload to the worker so it rehydrates in-memory settings
      await triggerWorkerReload(id).catch(() => undefined)

      res.json(success(response))
    })
  )

  return router
}
