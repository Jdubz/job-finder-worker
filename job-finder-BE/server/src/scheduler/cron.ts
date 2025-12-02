import { createReadStream, createWriteStream } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { pipeline } from 'stream/promises'
import { createGzip } from 'zlib'
import cron from 'node-cron'
import { logger } from '../logger'
import { env } from '../config/env'
import { JobQueueService } from '../modules/job-queue/job-queue.service'

const queueService = new JobQueueService()

function utcNowIso() {
  return new Date().toISOString()
}

async function enqueueScrapeJob() {
  try {
    const item = queueService.submitScrape({})
    logger.info({ queueItemId: item.id, at: utcNowIso() }, 'Cron enqueued scrape job')
  } catch (error) {
    logger.error({ error, at: utcNowIso() }, 'Cron failed to enqueue scrape job')
  }
}

async function triggerMaintenance() {
  try {
    const res = await fetch(env.WORKER_MAINTENANCE_URL, { method: 'POST' })
    if (!res.ok) {
      throw new Error(`Maintenance HTTP ${res.status}`)
    }
    logger.info({ status: res.status, at: utcNowIso() }, 'Cron triggered worker maintenance')
  } catch (error) {
    logger.error({ error, at: utcNowIso() }, 'Cron failed to trigger maintenance')
  }
}

async function gzipFile(sourcePath: string) {
  const destPath = `${sourcePath}.gz`
  await pipeline(createReadStream(sourcePath), createGzip({ level: 9 }), createWriteStream(destPath))
  await fs.unlink(sourcePath)
}

async function rotateLogs() {
  const logDir = env.LOG_DIR
  await fs.mkdir(logDir, { recursive: true })

  const entries = await fs.readdir(logDir)
  const now = Date.now()

  for (const entry of entries) {
    if (!entry.endsWith('.log')) continue
    const fullPath = path.join(logDir, entry)
    const stat = await fs.stat(fullPath)
    if (stat.size > env.LOG_ROTATE_MAX_BYTES) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '-')
      const rotated = `${fullPath}.${stamp}`
      await fs.rename(fullPath, rotated)
      await gzipFile(rotated)
      await fs.truncate(fullPath, 0)
      logger.info({ file: fullPath, size: stat.size, at: utcNowIso() }, 'Log rotated')
    }
  }

  const cutoff = now - env.LOG_ROTATE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  for (const entry of await fs.readdir(logDir)) {
    if (!entry.endsWith('.gz')) continue
    const fullPath = path.join(logDir, entry)
    const stat = await fs.stat(fullPath)
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(fullPath)
      logger.info({ file: fullPath, at: utcNowIso() }, 'Pruned old rotated log')
    }
  }
}

export function startCronScheduler() {
  if (env.NODE_ENV !== 'production') {
    logger.info('Cron scheduler skipped outside production environment')
    return
  }

  if (!env.CRON_ENABLED) {
    logger.info('Cron scheduler disabled; set CRON_ENABLED=true to enable')
    return
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

  logger.info({
    scrape: env.CRON_SCRAPE_EXPRESSION,
    maintenance: env.CRON_MAINTENANCE_EXPRESSION,
    logrotate: env.CRON_LOGROTATE_EXPRESSION,
    logDir: env.LOG_DIR
  }, 'Cron scheduler started')
}
