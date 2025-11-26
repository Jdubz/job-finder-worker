import { env } from './config/env'
import { buildApp } from './app'
import { logger } from './logger'
import { getDb } from './db/sqlite'
import { initWorkerSocket } from './modules/job-queue/worker-socket'
import { setLifecyclePhase, broadcastLifecycleEvent } from './modules/lifecycle/lifecycle.stream'
import { createDrainManager } from './modules/lifecycle/drain-manager'

async function main() {
  // Touch DB early to surface migration issues fast
  getDb()

  const app = buildApp()
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Job Finder API listening')
    setLifecyclePhase('ready', { port: env.PORT })
  })

  // Attach worker WebSocket for bi-directional commands/events
  initWorkerSocket(server)

  const { drain } = createDrainManager(server)

  const shutdown = async (reason: string) => {
    logger.info({ reason }, 'Shutting down Job Finder API')
    setLifecyclePhase('restarting', { reason })
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
