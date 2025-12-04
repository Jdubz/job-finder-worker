import { createReadStream, createWriteStream } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { pipeline } from 'stream/promises'
import { createGzip } from 'zlib'
import cron from 'node-cron'
import { logger } from '../logger'
import { env } from '../config/env'
import { JobQueueService } from '../modules/job-queue/job-queue.service'
import { ConfigRepository } from '../modules/config/config.repository'
import { isWorkerSettings, type WorkerSettings } from '@shared/types'

const getQueueService = (() => {
  let svc: JobQueueService | null = null
  return () => {
    if (!svc) svc = new JobQueueService()
    return svc
  }
})()

const getConfigRepo = (() => {
  let repo: ConfigRepository | null = null
  return () => {
    if (!repo) repo = new ConfigRepository()
    return repo
  }
})()

function utcNowIso() {
  return new Date().toISOString()
}

function coalesceNumber(...values: Array<number | null | undefined>): number | null | undefined {
  for (const v of values) {
    // In scrapeConfig, 0 is our explicit "no limit" signal (stored as null downstream)
    if (v === 0) return null
    if (v !== undefined && v !== null) return v
  }
  return undefined
}

function loadScrapeConfig() {
  const entry = getConfigRepo().get<WorkerSettings>('worker-settings')
  if (!entry || !isWorkerSettings(entry.payload)) {
    throw new Error('worker-settings config missing or invalid')
  }

  const raw = (entry.payload as any).runtime?.scrapeConfig || (entry.payload as any).runtime?.scrape_config
  if (!raw || typeof raw !== 'object') {
    throw new Error('worker-settings.runtime.scrapeConfig is required for cron scrapes')
  }

  const targetMatches = coalesceNumber(raw.target_matches, raw.targetMatches)
  const maxSources = coalesceNumber(raw.max_sources, raw.maxSources)
  const sourceIdsRaw = raw.source_ids ?? raw.sourceIds
  const sourceIds = Array.isArray(sourceIdsRaw)
    ? sourceIdsRaw
    : typeof sourceIdsRaw === 'string'
      ? sourceIdsRaw.split(',').map((s: string) => s.trim()).filter(Boolean)
      : undefined

  if (targetMatches === undefined && maxSources === undefined && sourceIds === undefined) {
    throw new Error('worker-settings.runtime.scrapeConfig must specify at least one of target_matches, max_sources, or source_ids')
  }

  return {
    target_matches: targetMatches ?? null,
    max_sources: maxSources ?? null,
    source_ids: sourceIds
  }
}

export async function enqueueScrapeJob() {
  try {
    logger.info({ at: utcNowIso() }, 'Cron scrape job starting')
    const scrapeConfig = loadScrapeConfig()
    logger.info({ scrapeConfig, at: utcNowIso() }, 'Cron loaded scrape config')
    const item = getQueueService().submitScrape({ scrapeConfig })
    logger.info({ queueItemId: item.id, at: utcNowIso() }, 'Cron enqueued scrape job')
    return { success: true, queueItemId: item.id }
  } catch (error) {
    logger.error({ error, at: utcNowIso() }, 'Cron failed to enqueue scrape job')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function triggerMaintenance() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    logger.info({ url: env.WORKER_MAINTENANCE_URL, at: utcNowIso() }, 'Cron maintenance starting')
    const res = await fetch(env.WORKER_MAINTENANCE_URL, { method: 'POST', signal: controller.signal })
    if (!res.ok) {
      throw new Error(`Maintenance HTTP ${res.status}`)
    }
    logger.info({ status: res.status, at: utcNowIso() }, 'Cron triggered worker maintenance')
    return { success: true, status: res.status }
  } catch (error) {
    logger.error({ error, at: utcNowIso() }, 'Cron failed to trigger maintenance')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
  }
}

async function gzipFile(sourcePath: string) {
  const destPath = `${sourcePath}.gz`
  await pipeline(createReadStream(sourcePath), createGzip({ level: 9 }), createWriteStream(destPath))
  await fs.unlink(sourcePath)
}

async function rotateLogs() {
  try {
    const logDir = env.LOG_DIR
    await fs.mkdir(logDir, { recursive: true })

    const entries = await fs.readdir(logDir)
    const now = Date.now()

    for (const entry of entries) {
      if (!entry.endsWith('.log')) continue
      const fullPath = path.join(logDir, entry)
      try {
        const stat = await fs.stat(fullPath)
        if (stat.size > env.LOG_ROTATE_MAX_BYTES) {
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-')
          const rotated = `${fullPath}.${stamp}`
          // copy-truncate to avoid descriptor loss
          await fs.copyFile(fullPath, rotated)
          await fs.truncate(fullPath, 0)
          logger.info({ file: fullPath, originalSize: stat.size, at: utcNowIso() }, 'Log rotated')
          await gzipFile(rotated)
        }
      } catch (error) {
        logger.error({ error, file: fullPath }, 'Failed to rotate log file')
      }
    }

    const cutoff = now - env.LOG_ROTATE_RETENTION_DAYS * 24 * 60 * 60 * 1000
    for (const entry of await fs.readdir(logDir)) {
      if (!entry.endsWith('.gz')) continue
      const fullPath = path.join(logDir, entry)
      try {
        const stat = await fs.stat(fullPath)
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(fullPath)
          logger.info({ file: fullPath, at: utcNowIso() }, 'Pruned old rotated log')
        }
      } catch (error) {
        logger.error({ error, file: fullPath }, 'Failed to prune rotated log')
      }
    }
  } catch (error) {
    logger.error({ error, at: utcNowIso() }, 'Log rotation failed')
  }
}

let schedulerStarted = false

export function getCronStatus() {
  return {
    enabled: env.CRON_ENABLED,
    started: schedulerStarted,
    nodeEnv: env.NODE_ENV,
    expressions: {
      scrape: env.CRON_SCRAPE_EXPRESSION,
      maintenance: env.CRON_MAINTENANCE_EXPRESSION,
      logrotate: env.CRON_LOGROTATE_EXPRESSION
    },
    workerMaintenanceUrl: env.WORKER_MAINTENANCE_URL,
    logDir: env.LOG_DIR
  }
}

export async function getWorkerHealth() {
  const workerBaseUrl = env.WORKER_MAINTENANCE_URL.replace('/maintenance', '')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)

  try {
    const [healthRes, statusRes] = await Promise.all([
      fetch(`${workerBaseUrl}/health`, { signal: controller.signal }),
      fetch(`${workerBaseUrl}/status`, { signal: controller.signal })
    ])

    if (!healthRes.ok || !statusRes.ok) {
      throw new Error(`Worker responded with health=${healthRes.status}, status=${statusRes.status}`)
    }

    const health = await healthRes.json()
    const status = await statusRes.json()

    return {
      reachable: true,
      health,
      status,
      workerUrl: workerBaseUrl
    }
  } catch (error) {
    logger.error({ error, workerUrl: workerBaseUrl }, 'Failed to fetch worker health')
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
      workerUrl: workerBaseUrl
    }
  } finally {
    clearTimeout(timeout)
  }
}

export function startCronScheduler() {
  // Debug: log cron-related env vars at startup to diagnose configuration issues
  logger.info({
    NODE_ENV: env.NODE_ENV,
    CRON_ENABLED: env.CRON_ENABLED,
    CRON_ENABLED_RAW: process.env.CRON_ENABLED,
    CRON_SCRAPE_EXPRESSION: env.CRON_SCRAPE_EXPRESSION,
    CRON_MAINTENANCE_EXPRESSION: env.CRON_MAINTENANCE_EXPRESSION,
    CRON_LOGROTATE_EXPRESSION: env.CRON_LOGROTATE_EXPRESSION
  }, 'Cron scheduler config')

  if (env.NODE_ENV !== 'production') {
    logger.info('Cron scheduler skipped outside production environment')
    return
  }

  if (!env.CRON_ENABLED) {
    logger.info('Cron scheduler disabled; set CRON_ENABLED=true to enable')
    return
  }

  // Validate expressions early to fail fast
  const expressions = [
    ['CRON_SCRAPE_EXPRESSION', env.CRON_SCRAPE_EXPRESSION],
    ['CRON_MAINTENANCE_EXPRESSION', env.CRON_MAINTENANCE_EXPRESSION],
    ['CRON_LOGROTATE_EXPRESSION', env.CRON_LOGROTATE_EXPRESSION]
  ] as const

  for (const [name, expr] of expressions) {
    if (!cron.validate(expr)) {
      throw new Error(`Invalid ${name}: ${expr}`)
    }
  }

  // Enqueue scrape every 6h (UTC by default)
  cron.schedule(
    env.CRON_SCRAPE_EXPRESSION,
    () => {
      void enqueueScrapeJob()
    },
    { timezone: 'UTC' }
  )

  // Daily maintenance (delegated to worker HTTP endpoint)
  cron.schedule(
    env.CRON_MAINTENANCE_EXPRESSION,
    () => {
      void triggerMaintenance()
    },
    { timezone: 'UTC' }
  )

  // Log rotation
  cron.schedule(
    env.CRON_LOGROTATE_EXPRESSION,
    () => {
      void rotateLogs()
    },
    { timezone: 'UTC' }
  )

  schedulerStarted = true
  logger.info({
    scrape: env.CRON_SCRAPE_EXPRESSION,
    maintenance: env.CRON_MAINTENANCE_EXPRESSION,
    logrotate: env.CRON_LOGROTATE_EXPRESSION,
    logDir: env.LOG_DIR
  }, 'Cron scheduler started')
}
