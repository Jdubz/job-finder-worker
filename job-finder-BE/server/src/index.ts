import { env } from './config/env'
import { buildApp } from './app'
import { logger } from './logger'
import { getDb } from './db/sqlite'
import { initWorkerSocket } from './modules/job-queue/worker-socket'
import { setLifecyclePhase, broadcastLifecycleEvent, setReady } from './modules/lifecycle/lifecycle.stream'
import { createDrainManager } from './modules/lifecycle/drain-manager'
import { startCronScheduler } from './scheduler/cron'

async function main() {
  // Touch DB early to surface migration issues fast
  getDb()

  const app = buildApp()
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Job Finder API listening')
    setLifecyclePhase('ready', { port: env.PORT })
    setReady(true, { port: env.PORT })
    startCronScheduler()
  })

  // Attach worker WebSocket for bi-directional commands/events
  initWorkerSocket(server)

  const { drain } = createDrainManager(server, env.DRAIN_TIMEOUT_MS)

  const shutdown = async (reason: string) => {
    logger.info({ reason }, 'Shutting down Job Finder API')
    // Mark unready before we stop accepting new connections so healthchecks fail fast
    setReady(false, { reason })
    setLifecyclePhase('draining', { reason })
    broadcastLifecycleEvent('restarting', { reason })
    await drain()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start Job Finder API')
  process.exit(1)
})
