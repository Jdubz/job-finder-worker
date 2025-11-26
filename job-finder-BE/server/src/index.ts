import { env } from './config/env'
import { buildApp } from './app'
import { logger } from './logger'
import { getDb } from './db/sqlite'
import { initWorkerSocket } from './modules/job-queue/worker-socket'

async function main() {
  // Touch DB early to surface migration issues fast
  getDb()

  const app = buildApp()
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Job Finder API listening')
  })

  // Attach worker WebSocket for bi-directional commands/events
  initWorkerSocket(server)

  const shutdown = () => {
    logger.info('Shutting down Job Finder API')
    server.close(() => {
      process.exit(0)
    })
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start Job Finder API')
  process.exit(1)
})
