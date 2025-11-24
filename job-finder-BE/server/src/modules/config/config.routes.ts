import { Router } from 'express'
import { z } from 'zod'
import type {
  ListConfigEntriesResponse,
  GetConfigEntryResponse,
  UpsertConfigEntryResponse,
  StopList,
  QueueSettings,
  AISettings,
  JobFiltersConfig,
  TechnologyRanksConfig,
  SchedulerSettings,
  JobFinderConfigId,
} from '@shared/types'
import {
  ApiErrorCode,
  DEFAULT_STOP_LIST,
  DEFAULT_QUEUE_SETTINGS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_JOB_FILTERS,
  DEFAULT_TECH_RANKS,
  DEFAULT_SCHEDULER_SETTINGS,
  isStopList,
  isQueueSettings,
  isAISettings,
  isJobFiltersConfig,
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
  | TechnologyRanksConfig
  | SchedulerSettings
  | Record<string, unknown>

function toCamelCaseKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function normalizeKeys<T extends Record<string, any>>(obj: Record<string, any>): T {
  const entries = Object.entries(obj).map(([k, v]) => [toCamelCaseKey(k), v])
  return Object.fromEntries(entries) as T
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
      const normalized = normalizeKeys<AISettings>(payload)
      return {
        ...DEFAULT_AI_SETTINGS,
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
      return { ...DEFAULT_TECH_RANKS, ...normalized }
    }
    case 'scheduler-settings': {
      const normalized = normalizeKeys<SchedulerSettings>(payload)
      return { ...DEFAULT_SCHEDULER_SETTINGS, ...normalized }
    }
    case 'ai-prompts':
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
      const entry = repo.get(req.params.id)
      if (!entry) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Config not found'))
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
