import { Router } from 'express'
import { z } from 'zod'
import { execSync } from 'child_process'
import type {
  ListConfigEntriesResponse,
  GetConfigEntryResponse,
  UpsertConfigEntryResponse,
  AISettings,
  JobFinderConfigId,
  PromptConfig,
  WorkerSettings,
  MatchPolicy,
  PreFilterPolicy,
} from '@shared/types'
import {
  ApiErrorCode,
  DEFAULT_AI_SETTINGS,
  AI_PROVIDER_OPTIONS,
  isAISettings,
  isPersonalInfo,
  isWorkerSettings,
  isMatchPolicy,
  isPreFilterPolicy,
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
  | AISettings
  | MatchPolicy
  | PromptConfig
  | WorkerSettings
  | PreFilterPolicy
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

function coercePayload(id: JobFinderConfigId, payload: Record<string, unknown>): KnownPayload {
  switch (id) {
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
    case 'match-policy': {
      // No defaults for match-policy - it must be complete
      // Validation happens in validatePayload
      const normalized = normalizeKeys<MatchPolicy>(payload)
      return normalized
    }
    case 'prefilter-policy': {
      const normalized = normalizeKeys<PreFilterPolicy>(payload)
      return normalized
    }
    case 'ai-prompts':
      return payload
    case 'worker-settings': {
      const normalized = normalizeKeys<WorkerSettings>(payload)
      return normalized
    }
    case 'personal-info':
    default:
      return payload
  }
}

function validatePayload(id: JobFinderConfigId, payload: KnownPayload): boolean {
  switch (id) {
    case 'ai-settings':
      return isAISettings(payload)
    case 'match-policy':
      return isMatchPolicy(payload)
    case 'prefilter-policy':
      return isPreFilterPolicy(payload)
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
      let entry = repo.get(id)

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

      // Log AI settings changes for visibility
      if (id === 'ai-settings') {
        const aiPayload = coerced as AISettings
        logger.info({
          configId: id,
          workerProvider: `${aiPayload.worker?.selected?.provider ?? 'unknown'}/${aiPayload.worker?.selected?.interface ?? 'unknown'}`,
          workerModel: aiPayload.worker?.selected?.model ?? 'unknown',
          docGenProvider: `${aiPayload.documentGenerator?.selected?.provider ?? 'unknown'}/${aiPayload.documentGenerator?.selected?.interface ?? 'unknown'}`,
          docGenModel: aiPayload.documentGenerator?.selected?.model ?? 'unknown',
          updatedBy: userEmail,
        }, 'AI settings updated')
      }

      // Fire-and-forget reload to the worker so it rehydrates in-memory settings
      await triggerWorkerReload(id).catch(() => undefined)

      res.json(success(response))
    })
  )

  return router
}
