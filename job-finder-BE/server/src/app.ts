import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { httpLogger, logger } from './logger'
import { healthHandler } from './routes/health'
import { buildContentItemRouter } from './modules/content-items/content-item.routes'
import { buildJobQueueRouter } from './modules/job-queue/job-queue.routes'
import { buildJobMatchRouter } from './modules/job-matches/job-match.routes'
import { buildConfigRouter } from './modules/config/config.routes'
import { buildGeneratorRouter } from './modules/generator/generator.routes'
import { buildGeneratorApiRouter } from './modules/generator/generator.api'
import { buildGeneratorWorkflowRouter } from './modules/generator/generator.workflow.routes'
import { buildGeneratorArtifactsRouter } from './modules/generator/generator.artifacts.routes'
import { buildPromptsRouter } from './modules/prompts/prompts.routes'
import { buildLoggingRouter } from './modules/logging/logging.routes'
import { verifyFirebaseAuth, requireRole } from './middleware/firebase-auth'

export function buildApp() {
  const app = express()

  // Prevent weak 304/ETag caching on API responses; data changes frequently.
  app.set('etag', false)
  app.use((_, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    next()
  })

  app.use(
    helmet({
      // Google Identity Services relies on popup postMessage, so loosen COOP accordingly.
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
    })
  )

  // Configure CORS with explicit allowed origins from environment or default for development
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:3000']

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) {
          return callback(null, true)
        }
        if (allowedOrigins.includes(origin)) {
          callback(null, true)
        } else {
          logger.warn({ origin, allowedOrigins }, 'CORS request from disallowed origin')
          callback(null, false)
        }
      },
      credentials: true
    })
  )
  app.use(httpLogger)

  const generatorPipeline = express.Router()
  generatorPipeline.use(express.json({ limit: '10mb' }))
  generatorPipeline.use(express.urlencoded({ extended: true }))
  generatorPipeline.use(buildGeneratorApiRouter())
  generatorPipeline.use(buildGeneratorWorkflowRouter())

  // Artifacts route is public - URLs are unique/semi-secret paths for direct download
  app.use('/api/generator/artifacts', buildGeneratorArtifactsRouter())

  app.use('/api/generator', verifyFirebaseAuth, generatorPipeline)

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  // Prompts route - public GET, authenticated PUT/POST
  app.use('/api/prompts', buildPromptsRouter())

  // Logging route - accepts both authenticated and unauthenticated requests
  app.use('/api/logs', buildLoggingRouter())

  // All other API routes require authentication
  app.use('/api', verifyFirebaseAuth)
  app.use('/api/content-items', buildContentItemRouter())
  app.use('/api/queue', buildJobQueueRouter())
  app.use('/api/job-matches', buildJobMatchRouter())
  app.use('/api/config', requireRole('admin'), buildConfigRouter())
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
