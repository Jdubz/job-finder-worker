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
 * Check provider availability via LiteLLM proxy health.
 *
 * All AI calls route through LiteLLM — provider credentials live in the
 * litellm container, not the API container. We check proxy reachability
 * and mark all configured providers as available if LiteLLM is healthy.
 */
async function buildProviderOptionsWithAvailability(configuredOptions?: AISettings['options']) {
  if (!configuredOptions) return []

  const baseUrl = (process.env.LITELLM_BASE_URL || 'http://litellm:4000').replace(/\/v1\/?$/, '')
  let litellmHealthy = false
  try {
    const res = await fetch(`${baseUrl}/health/readiness`, { signal: AbortSignal.timeout(5000) })
    litellmHealthy = res.ok
  } catch {
    // proxy unreachable
  }

  return configuredOptions.map((provider) => ({
    ...provider,
    interfaces: provider.interfaces.map((iface) => ({
      ...iface,
      enabled: litellmHealthy,
      reason: litellmHealthy ? undefined : 'LiteLLM proxy unreachable',
    })),
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
    asyncHandler(async (req, res) => {
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
              options: await buildProviderOptionsWithAvailability(aiPayload.options),
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
