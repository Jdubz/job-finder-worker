import { Router } from 'express'
import { z } from 'zod'
import { execSync } from 'child_process'
import type {
  ListConfigEntriesResponse,
  GetConfigEntryResponse,
  UpsertConfigEntryResponse,
  QueueSettings,
  AISettings,
  SchedulerSettings,
  JobFinderConfigId,
  PromptConfig,
  WorkerSettings,
  TitleFilterConfig,
  ScoringConfig,
} from '@shared/types'
import {
  ApiErrorCode,
  DEFAULT_QUEUE_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_SCHEDULER_SETTINGS,
  DEFAULT_PROMPTS,
  AI_PROVIDER_OPTIONS,
  DEFAULT_WORKER_SETTINGS,
  DEFAULT_TITLE_FILTER,
  DEFAULT_SCORING_CONFIG,
  isQueueSettings,
  isAISettings,
  isSchedulerSettings,
  isPersonalInfo,
  isWorkerSettings,
  isTitleFilterConfig,
  isScoringConfig,
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
  | QueueSettings
  | AISettings
  | TitleFilterConfig
  | ScoringConfig
  | SchedulerSettings
  | PromptConfig
  | WorkerSettings
  | Record<string, unknown>

/**
 * Check provider availability based on API keys and CLI auth status
 */
function buildProviderOptionsWithAvailability() {
  const availability: Record<string, { enabled: boolean; reason?: string }> = {}

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
  availability['codex/cli'] = { enabled: codexEnabled, reason: codexEnabled ? undefined : codexReason }

  // Claude API - check ANTHROPIC_API_KEY
  const claudeEnabled = !!process.env.ANTHROPIC_API_KEY
  availability['claude/api'] = { enabled: claudeEnabled, reason: claudeEnabled ? undefined : 'ANTHROPIC_API_KEY not set' }

  // OpenAI API - check OPENAI_API_KEY
  const openaiEnabled = !!process.env.OPENAI_API_KEY
  availability['openai/api'] = { enabled: openaiEnabled, reason: openaiEnabled ? undefined : 'OPENAI_API_KEY not set' }

  // Gemini API - check GOOGLE_API_KEY or GEMINI_API_KEY
  const geminiEnabled = !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)
  availability['gemini/api'] = { enabled: geminiEnabled, reason: geminiEnabled ? undefined : 'GOOGLE_API_KEY or GEMINI_API_KEY not set' }

  return AI_PROVIDER_OPTIONS.map((provider) => ({
    ...provider,
    interfaces: provider.interfaces.map((iface) => {
      const status = availability[`${provider.value}/${iface.value}`]
      return {
        ...iface,
        enabled: status?.enabled ?? false,
        reason: status?.reason,
      }
    }),
  }))
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
    ['queue-settings', DEFAULT_QUEUE_SETTINGS],
    ['ai-settings', DEFAULT_AI_SETTINGS],
    ['title-filter', DEFAULT_TITLE_FILTER],
    ['scoring-config', DEFAULT_SCORING_CONFIG],
    ['scheduler-settings', DEFAULT_SCHEDULER_SETTINGS],
    ['ai-prompts', DEFAULT_PROMPTS],
    // We deliberately do not seed worker-settings; prod DB already holds them.
  ]

  for (const [id, payload] of seeds) {
    if (!repo.get(id)) {
      repo.upsert(id, payload)
    }
  }
}

function coercePayload(id: JobFinderConfigId, payload: Record<string, unknown>): KnownPayload {
  switch (id) {
    case 'queue-settings': {
      const normalized = normalizeKeys<QueueSettings>(payload)
      return {
        ...DEFAULT_QUEUE_SETTINGS,
        ...normalized,
      }
    }
    case 'ai-settings': {
      const normalized = normalizeKeys<Partial<AISettings>>(payload)
      const legacySelected = (normalized as any).selected
      const mergedWorkerSelected = {
        ...DEFAULT_AI_SETTINGS.worker.selected,
        ...(normalized.worker?.selected ?? legacySelected ?? {}),
      }
      const mergedDocSelected = {
        ...DEFAULT_AI_SETTINGS.documentGenerator.selected,
        ...(normalized.documentGenerator?.selected ?? legacySelected ?? {}),
      }
      return {
        worker: { selected: mergedWorkerSelected },
        documentGenerator: { selected: mergedDocSelected },
        options: AI_PROVIDER_OPTIONS,
      }
    }
    case 'title-filter': {
      const normalized = normalizeKeys<TitleFilterConfig>(payload)
      return {
        ...DEFAULT_TITLE_FILTER,
        ...normalized,
      }
    }
    case 'scoring-config': {
      const normalized = normalizeKeys<ScoringConfig>(payload)
      return {
        ...DEFAULT_SCORING_CONFIG,
        ...normalized,
      }
    }
    case 'scheduler-settings': {
      const normalized = normalizeKeys<SchedulerSettings>(payload)
      return { ...DEFAULT_SCHEDULER_SETTINGS, ...normalized }
    }
    case 'ai-prompts':
      return payload
    case 'worker-settings': {
      const normalized = normalizeKeys<WorkerSettings>(payload)
      return { ...DEFAULT_WORKER_SETTINGS, ...normalized }
    }
    case 'personal-info':
    default:
      return payload
  }
}

function validatePayload(id: JobFinderConfigId, payload: KnownPayload): boolean {
  switch (id) {
    case 'queue-settings':
      return isQueueSettings(payload)
    case 'ai-settings':
      return isAISettings(payload)
    case 'title-filter':
      return isTitleFilterConfig(payload)
    case 'scoring-config':
      return isScoringConfig(payload)
    case 'scheduler-settings':
      return isSchedulerSettings(payload)
    case 'ai-prompts':
      return true
    case 'worker-settings':
      return isWorkerSettings(payload)
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
        entry = repo.upsert(id, { name: '', email: userEmail ?? '', accentColor: '#3b82f6' }, { updatedBy: userEmail ?? undefined })
      }

      if (!entry) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Config not found'))
        return
      }

      // For ai-settings, populate provider/interface availability dynamically
      if (id === 'ai-settings') {
        const aiPayload = entry.payload as AISettings
        entry = {
          ...entry,
          payload: {
            ...aiPayload,
            options: buildProviderOptionsWithAvailability(),
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