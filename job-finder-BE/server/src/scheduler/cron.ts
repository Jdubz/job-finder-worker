import { createReadStream, createWriteStream } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { pipeline } from 'stream/promises'
import { createGzip } from 'zlib'
import { logger } from '../logger'
import { env } from '../config/env'
import { JobQueueService } from '../modules/job-queue/job-queue.service'
import { ConfigRepository } from '../modules/config/config.repository'
import { isWorkerSettings, isCronConfig, type WorkerSettings, type CronConfig, type AISettings } from '@shared/types'
import { MaintenanceService } from '../modules/maintenance'

type CronJobKey = keyof CronConfig['jobs']

const DEFAULT_CRON_CONFIG: CronConfig = {
  jobs: {
    scrape: { enabled: true, hours: [0, 6, 12, 18], lastRun: null },
    maintenance: { enabled: true, hours: [0], lastRun: null },
    logrotate: { enabled: true, hours: [0], lastRun: null },
    agentReset: { enabled: true, hours: [0], lastRun: null }
  }
}

const TICK_INTERVAL_MS = 60_000 // check every minute, run on matching hours

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

const getMaintenanceService = (() => {
  let svc: MaintenanceService | null = null
  return () => {
    if (!svc) svc = new MaintenanceService()
    return svc
  }
})()

function utcNowIso() {
  return new Date().toISOString()
}

function coalesceNumber(...values: Array<number | null | undefined>): number | null | undefined {
  for (const v of values) {
    // In scrapeConfig, 0 is our explicit "no limit" signal; downstream stores this as null
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
  try {
    logger.info({ at: utcNowIso() }, 'Cron maintenance starting')
    const result = getMaintenanceService().runMaintenance()
    logger.info({ result, at: utcNowIso() }, 'Cron maintenance completed')
    return result
  } catch (error) {
    logger.error({ error, at: utcNowIso() }, 'Cron maintenance failed')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
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

export async function triggerLogRotation() {
  try {
    await rotateLogs()
    return { success: true }
  } catch (error) {
    logger.error({ error, at: utcNowIso() }, 'Cron failed to rotate logs')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function triggerAgentReset() {
  try {
    logger.info({ at: utcNowIso() }, 'Agent reset starting')
    const repo = getConfigRepo()
    const entry = repo.get<AISettings>('ai-settings')

    if (!entry?.payload?.agents) {
      logger.info({ at: utcNowIso() }, 'No agents configured, nothing to reset')
      return { success: true, message: 'No agents to reset' }
    }

    const agents = entry.payload.agents
    let resetCount = 0
    let reenabledCount = 0

    // Reset daily usage and re-enable quota-exhausted agents
    for (const [agentId, config] of Object.entries(agents)) {
      if (!config) continue

      config.dailyUsage = 0

      const runtime = config.runtimeState
      if (runtime) {
        for (const scope of Object.keys(runtime)) {
          const scopeState = runtime[scope as keyof typeof runtime]
          if (scopeState && !scopeState.enabled && scopeState.reason?.startsWith('quota_exhausted:')) {
            scopeState.enabled = true
            scopeState.reason = null
            reenabledCount++
            logger.info({ agentId, scope, at: utcNowIso() }, 'Re-enabling agent after quota reset')
          }
        }
      }

      resetCount++
    }

    repo.upsert('ai-settings', entry.payload, { updatedBy: 'cron-agent-reset' })
    logger.info({ resetCount, reenabledCount, at: utcNowIso() }, 'Agent reset completed')

    // Attempt to restart queue if it was stopped due to agent unavailability
    if (reenabledCount > 0) {
      try {
        const workerEntry = repo.get<WorkerSettings>('worker-settings')
        const runtime = workerEntry?.payload?.runtime
        if (runtime?.stopReason?.startsWith('No agents available')) {
          // Clear the stopReason to allow queue restart
          runtime.stopReason = null
          repo.upsert('worker-settings', workerEntry!.payload, { updatedBy: 'cron-agent-reset' })
          logger.info({ at: utcNowIso() }, 'Cleared stopReason after re-enabling agents')
        }
      } catch (restartError) {
        logger.warn({ error: restartError, at: utcNowIso() }, 'Failed to clear queue stopReason')
      }
    }

    return { success: true, resetCount, reenabledCount }
  } catch (error) {
    logger.error({ error, at: utcNowIso() }, 'Agent reset failed')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

let schedulerStarted = false
const lastRunHourKey: Record<CronJobKey, string | null> = {
  scrape: null,
  maintenance: null,
  logrotate: null,
  agentReset: null
}

function getContainerTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || 'UTC'
}

function normalizeHours(hours: number[]): number[] {
  const unique = Array.from(new Set(hours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)))
  return unique.sort((a, b) => a - b)
}

function loadCronConfig(): CronConfig {
  const entry = getConfigRepo().get<CronConfig>('cron-config')
  const payload = entry?.payload

  if (payload && isCronConfig(payload)) {
    return {
      jobs: {
        scrape: { ...payload.jobs.scrape, hours: normalizeHours(payload.jobs.scrape.hours) },
        maintenance: { ...payload.jobs.maintenance, hours: normalizeHours(payload.jobs.maintenance.hours) },
        logrotate: { ...payload.jobs.logrotate, hours: normalizeHours(payload.jobs.logrotate.hours) },
        agentReset: { ...payload.jobs.agentReset, hours: normalizeHours(payload.jobs.agentReset.hours) }
      }
    }
  }

  // Seed defaults if missing or invalid
  const defaults = {
    jobs: {
      scrape: { ...DEFAULT_CRON_CONFIG.jobs.scrape, hours: normalizeHours(DEFAULT_CRON_CONFIG.jobs.scrape.hours) },
      maintenance: { ...DEFAULT_CRON_CONFIG.jobs.maintenance, hours: normalizeHours(DEFAULT_CRON_CONFIG.jobs.maintenance.hours) },
      logrotate: { ...DEFAULT_CRON_CONFIG.jobs.logrotate, hours: normalizeHours(DEFAULT_CRON_CONFIG.jobs.logrotate.hours) },
      agentReset: { ...DEFAULT_CRON_CONFIG.jobs.agentReset, hours: normalizeHours(DEFAULT_CRON_CONFIG.jobs.agentReset.hours) }
    }
  }
  persistCronConfig(defaults, 'system-bootstrap')
  return defaults
}

function persistCronConfig(config: CronConfig, updatedBy: string = 'cron-service') {
  getConfigRepo().upsert<CronConfig>('cron-config', config, { updatedBy })
}

function buildHourKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}`
}

function hourKeyFromIso(iso?: string | null): string | null {
  if (!iso) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  return buildHourKey(dt)
}

async function maybeRunJob(jobKey: CronJobKey, config: CronConfig, now: Date) {
  return maybeRunJobWithState(jobKey, config, now, lastRunHourKey, {
    scrape: enqueueScrapeJob,
    maintenance: triggerMaintenance,
    logrotate: rotateLogs,
    agentReset: triggerAgentReset
  })
}

type JobActions = Record<CronJobKey, () => Promise<unknown>>

async function maybeRunJobWithState(
  jobKey: CronJobKey,
  config: CronConfig,
  now: Date,
  state: Record<CronJobKey, string | null>,
  actions: JobActions
) {
  const schedule = config.jobs[jobKey]
  if (!schedule.enabled) return false

  const currentHour = now.getHours()
  const hourKey = buildHourKey(now)
  if (!schedule.hours.includes(currentHour)) return false
  if (state[jobKey] === hourKey) return false

  await actions[jobKey]()

  const iso = now.toISOString()
  config.jobs[jobKey].lastRun = iso
  state[jobKey] = hourKey
  return true
}

async function schedulerTick() {
  const now = new Date()
  const config = loadCronConfig()

  // Prevent double-runs when service restarts within the same hour by priming lastRun map
  for (const key of Object.keys(config.jobs) as CronJobKey[]) {
    const priorHourKey = hourKeyFromIso(config.jobs[key].lastRun)
    const currentHourKey = buildHourKey(now)
    if (priorHourKey === currentHourKey) {
      lastRunHourKey[key] = priorHourKey
    }
  }

  let mutated = false
  for (const key of Object.keys(config.jobs) as CronJobKey[]) {
    const ran = await maybeRunJob(key, config, now)
    mutated = mutated || ran
  }

  if (mutated) {
    persistCronConfig(config)
  }
}

function scheduleNextTick() {
  const now = Date.now()
  const delay = TICK_INTERVAL_MS - (now % TICK_INTERVAL_MS)
  setTimeout(() => {
    void schedulerTick().catch((error) => {
      logger.error({ error }, 'Cron scheduler tick failed')
    })
    scheduleNextTick()
  }, delay)
}

export function startCronScheduler() {
  // CRON_ENABLED controls whether the scheduler runs. Defaults to true in
  // production, false otherwise. Set CRON_ENABLED=true in dev/staging to
  // enable cron jobs (e.g. agentReset) without changing NODE_ENV.
  const cronEnabled = env.CRON_ENABLED != null
    ? env.CRON_ENABLED === 'true'
    : env.NODE_ENV === 'production'

  logger.info({ NODE_ENV: env.NODE_ENV, cronEnabled, timezone: getContainerTimezone() }, 'Cron scheduler config')

  if (!cronEnabled) {
    logger.info('Cron scheduler disabled (set CRON_ENABLED=true to enable)')
    return
  }

  if (schedulerStarted) return

  schedulerStarted = true
  void schedulerTick()
  scheduleNextTick()

  logger.info({ defaults: DEFAULT_CRON_CONFIG, timezone: getContainerTimezone() }, 'Cron scheduler started')
}

// Test-only utilities (not used by runtime code)
export const __cronTestInternals = {
  normalizeHours,
  buildHourKey,
  hourKeyFromIso,
  maybeRunJobWithState
}

function getWorkerBaseUrl() {
  const workerUrl = process.env.WORKER_URL ?? env.WORKER_URL
  return workerUrl.replace(/\/$/, '')
}

export function getCronStatus() {
  const config = loadCronConfig()
  return {
    started: schedulerStarted,
    nodeEnv: env.NODE_ENV,
    timezone: getContainerTimezone(),
    jobs: config.jobs,
    workerUrl: env.WORKER_URL,
    logDir: env.LOG_DIR
  }
}

export async function getWorkerHealth() {
  const workerBaseUrl = getWorkerBaseUrl()
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

export async function getWorkerCliHealth() {
  const workerBaseUrl = getWorkerBaseUrl()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(`${workerBaseUrl}/cli/health`, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`Worker CLI health responded with ${res.status}`)
    }

    const payload = await res.json()
    const providers = payload?.providers ?? payload
    return {
      reachable: true,
      providers,
      workerUrl: workerBaseUrl
    }
  } catch (error) {
    logger.error({ error, workerUrl: workerBaseUrl }, 'Failed to fetch worker CLI health')
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
      workerUrl: workerBaseUrl
    }
  } finally {
    clearTimeout(timeout)
  }
}
