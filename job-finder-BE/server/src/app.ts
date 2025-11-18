import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { httpLogger, logger } from './logger'
import { healthHandler } from './routes/health'
import { buildContentItemRouter } from './modules/content-items/content-item.routes'
import { buildJobQueueRouter } from './modules/job-queue/job-queue.routes'
import { buildJobMatchRouter } from './modules/job-matches/job-match.routes'
import { buildConfigRouter } from './modules/config/config.routes'
import { buildContactRouter } from './modules/contact/contact.routes'
import { buildGeneratorRouter } from './modules/generator/generator.routes'
import { verifyAppCheck } from './middleware/app-check'
import { verifyFirebaseAuth } from './middleware/firebase-auth'

export function buildApp() {
  const app = express()

  app.use(helmet())
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(httpLogger)

  app.use('/api', verifyAppCheck, verifyFirebaseAuth)
  app.use('/api/content-items', buildContentItemRouter())
  app.use('/api/queue', buildJobQueueRouter())
  app.use('/api/job-matches', buildJobMatchRouter())
  app.use('/api/config', buildConfigRouter())
  app.use('/api/contact-submissions', buildContactRouter())
  app.use('/api/generator-docs', buildGeneratorRouter())

  app.get('/healthz', healthHandler)
  app.get('/readyz', healthHandler)

  app.use((req, res) => {
    res.status(404).json({ message: 'Not Found', path: req.path })
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled error')
    res.status(500).json({ message: 'Internal Server Error', error: err instanceof Error ? err.message : 'Unknown error' })
  })

  return app
}
