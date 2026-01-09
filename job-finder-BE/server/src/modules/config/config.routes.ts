import { Router } from 'express'
import { z } from 'zod'
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
  CronConfig,
} from '@shared/types'
import {
  ApiErrorCode,
  isAISettings,
  isPersonalInfo,
  isWorkerSettings,
  isMatchPolicy,
  isPreFilterPolicy,
  isCronConfig,
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
  | CronConfig
  | Record<string, unknown>

/**
 * Check provider availability based on API keys and CLI auth status.
 * Takes the configured options from DB and adds availability info.
 *
 * Supported providers:
 * - claude.cli: Uses CLAUDE_CODE_OAUTH_TOKEN
 * - gemini.api: Uses GEMINI_API_KEY, GOOGLE_API_KEY, or Vertex AI ADC
 */
function buildProviderOptionsWithAvailability(configuredOptions?: AISettings['options']) {
  if (!configuredOptions) return []
  const availability: Record<string, { enabled: boolean; reason?: string }> = {}

  // Claude CLI - check CLAUDE_CODE_OAUTH_TOKEN
  const claudeCliEnabled = !!process.env.CLAUDE_CODE_OAUTH_TOKEN
  availability['claude/cli'] = {
    enabled: claudeCliEnabled,
    reason: claudeCliEnabled ? undefined : 'CLAUDE_CODE_OAUTH_TOKEN not set'
  }

  // Gemini API - check GEMINI_API_KEY, GOOGLE_API_KEY, or Vertex AI ADC (GOOGLE_APPLICATION_CREDENTIALS)
  const geminiApiEnabled = !!(
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  )
  availability['gemini/api'] = {
    enabled: geminiApiEnabled,
    reason: geminiApiEnabled ? undefined : 'GEMINI_API_KEY, GOOGLE_API_KEY, or GOOGLE_APPLICATION_CREDENTIALS not set'
  }

  return configuredOptions.map((provider) => ({
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
    case 'ai-settings':
      return normalizeKeys<AISettings>(payload)
    case 'match-policy':
      return normalizeKeys<MatchPolicy>(payload)
    case 'prefilter-policy':
      return normalizeKeys<PreFilterPolicy>(payload)
    case 'ai-prompts':
      return payload
    case 'worker-settings':
      return normalizeKeys<WorkerSettings>(payload)
    case 'cron-config':
      return payload as unknown as CronConfig
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
      // Prompts are intentionally free-form to allow owners to iterate quickly.
      // If we tighten this in the future, add a schema validator here.
      return true
    case 'worker-settings':
      return isWorkerSettings(payload)
    case 'cron-config':
      return isCronConfig(payload)
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
      const entry = repo.get(id)

      if (!entry) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Config '${id}' not found - must be configured before use`))
        return
      }

      // For ai-settings, populate provider/interface availability dynamically
      if (id === 'ai-settings') {
        const aiPayload = entry.payload as AISettings
        const response: GetConfigEntryResponse = {
          config: {
            ...entry,
            payload: {
              ...aiPayload,
              options: buildProviderOptionsWithAvailability(aiPayload.options),
            },
          },
        }
        res.json(success(response))
        return
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
        if (id === 'ai-settings') {
          logger.error({ payload: coerced }, 'ai-settings validation failed during upsert')
        }
        res.status(400).json(failure(ApiErrorCode.VALIDATION_FAILED, 'Invalid config payload'))
        return
      }

      const userEmail = (req as typeof req & { user?: { email?: string } }).user?.email ?? null

      const entry = repo.upsert(id, coerced, { updatedBy: userEmail ?? undefined })
      const response: UpsertConfigEntryResponse = { config: entry }

      // Log AI settings changes for visibility
      if (id === 'ai-settings') {
        const aiPayload = coerced as AISettings
        const configuredAgents = Object.keys(aiPayload.agents ?? {})
        const enabledAgentsWorker = Object.entries(aiPayload.agents ?? {})
          .filter(([, config]) => config?.runtimeState?.worker?.enabled)
          .map(([id]) => id)
        const enabledAgentsBackend = Object.entries(aiPayload.agents ?? {})
          .filter(([, config]) => config?.runtimeState?.backend?.enabled)
          .map(([id]) => id)
        logger.info({
          configId: id,
          configuredAgents,
          enabledAgentsWorker,
          enabledAgentsBackend,
          extractionFallbacks: aiPayload.taskFallbacks?.extraction ?? [],
          analysisFallbacks: aiPayload.taskFallbacks?.analysis ?? [],
          documentFallbacks: aiPayload.taskFallbacks?.document ?? [],
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
