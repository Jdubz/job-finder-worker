import express, { type RequestHandler } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { httpLogger, logger } from './logger'
import { healthHandler } from './routes/health'
import { buildContentItemRouter } from './modules/content-items/content-item.routes'
import { buildJobQueueRouter } from './modules/job-queue/job-queue.routes'
import { buildWorkerRouter } from './modules/job-queue/worker.routes'
import { buildJobMatchRouter } from './modules/job-matches/job-match.routes'
import { buildJobListingRouter } from './modules/job-listings/job-listing.routes'
import { buildCompanyRouter } from './modules/companies/company.routes'
import { buildJobSourceRouter } from './modules/job-sources/job-source.routes'
import { buildConfigRouter } from './modules/config/config.routes'
import { buildGeneratorWorkflowRouter } from './modules/generator/generator.workflow.routes'
import { buildGeneratorArtifactsRouter } from './modules/generator/generator.artifacts.routes'
import { buildGeneratorAssetsRouter, buildGeneratorAssetsServeRouter } from './modules/generator/generator.assets.routes'
import { buildPromptsRouter } from './modules/prompts/prompts.routes'
import { buildLoggingRouter } from './modules/logging/logging.routes'
import { verifyFirebaseAuth, requireRole } from './middleware/firebase-auth'
import { buildLifecycleRouter } from './modules/lifecycle/lifecycle.routes'
import { ApiErrorCode } from '@shared/types'
import { ApiHttpError, apiErrorHandler } from './middleware/api-error'
import { buildAuthRouter } from './routes/auth.routes'

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
    : [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://job-finder.joshwentworth.com',
        'https://job-finder-api.joshwentworth.com'
      ]

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
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
      optionsSuccessStatus: 204
    })
  )
  app.use(httpLogger)

  const generatorPipeline = express.Router()
  generatorPipeline.use(express.json({ limit: '10mb' }))
  generatorPipeline.use(express.urlencoded({ extended: true }))
  generatorPipeline.use('/assets', buildGeneratorAssetsRouter())
  generatorPipeline.use(buildGeneratorWorkflowRouter())

  // Public asset serving (no auth). Upload stays behind /api/generator/assets within the auth pipeline.
  app.use('/api/generator/artifacts/assets', buildGeneratorAssetsServeRouter())
  // Artifacts route is public - URLs are unique/semi-secret paths for direct download
  app.use('/api/generator/artifacts', buildGeneratorArtifactsRouter())

  app.use('/api/generator', verifyFirebaseAuth, generatorPipeline)

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  // Prompts route - public GET, authenticated PUT/POST
  app.use('/api/prompts', buildPromptsRouter())

  // Logging route - accepts both authenticated and unauthenticated requests
  app.use('/api/logs', buildLoggingRouter())

  // Lifecycle events route - public by design so the frontend can detect deploys/restarts
  app.use('/api/lifecycle', buildLifecycleRouter())

  // Worker routes use worker token auth (not Google OAuth) for worker-to-API communication
  app.use('/api/queue/worker', buildWorkerRouter())

  // Auth/session utilities
  app.use('/api/auth', buildAuthRouter())

  // Content items should be publicly readable. Mutations require admin role.
  const contentItemMutationGuards: RequestHandler[] = [verifyFirebaseAuth, requireRole('admin')]
  app.use('/api/content-items', buildContentItemRouter({ mutationsMiddleware: contentItemMutationGuards }))

  // All other API routes require authentication
  app.use('/api', verifyFirebaseAuth)
  app.use('/api/queue', buildJobQueueRouter())
  app.use('/api/job-matches', buildJobMatchRouter())
  app.use('/api/job-listings', buildJobListingRouter())
  app.use('/api/companies', buildCompanyRouter())
  app.use('/api/job-sources', buildJobSourceRouter())
  app.use('/api/config', requireRole('admin'), buildConfigRouter())

  app.get('/healthz', healthHandler)
  app.get('/readyz', healthHandler)

  app.use((req, _res, next) => {
    next(new ApiHttpError(ApiErrorCode.NOT_FOUND, 'Resource not found', { status: 404, details: { path: req.path } }))
  })

  app.use(apiErrorHandler)

  return app
}
