import express from 'express'
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
import { verifyAuth, requireRole } from './middleware/auth'
import { queuePublicJobSubmit } from './middleware/optional-auth'
import { buildLifecycleRouter } from './modules/lifecycle/lifecycle.routes'
import { buildMaintenanceRouter } from './modules/maintenance'
import { ApiErrorCode } from '@shared/types'
import { ApiHttpError, apiErrorHandler } from './middleware/api-error'
import { buildAuthRouter } from './routes/auth.routes'
import { buildApplicatorRouter } from './routes/applicator.routes'
import { buildOriginGuard } from './middleware/origin-guard'
import { buildChatWidgetRouter } from './modules/chat-widget/chat.routes'
import { buildResumeVersionRouter } from './modules/resume-versions/resume-version.routes'
import { buildUserConfigRouter } from './modules/user-config/user-config.routes'

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
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
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

  const originGuard = buildOriginGuard(allowedOrigins)

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

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true }))

  // Generator pipeline uses larger body limit
  const generatorPipeline = express.Router()
  generatorPipeline.use(express.json({ limit: '10mb' }))
  generatorPipeline.use(express.urlencoded({ extended: true }))
  generatorPipeline.use('/assets', buildGeneratorAssetsRouter())
  generatorPipeline.use(buildGeneratorWorkflowRouter())

  // Basic CSRF mitigation: block cross-site mutations when Origin is present and disallowed
  app.use('/api', originGuard)

  // ── Public routes (no auth) ──────────────────────────────────
  app.use('/api/prompts', buildPromptsRouter())
  app.use('/api/logs', buildLoggingRouter())
  app.use('/api/lifecycle', buildLifecycleRouter())
  app.use('/api/chat', buildChatWidgetRouter())
  app.use('/api/auth', buildAuthRouter())

  // Worker routes use worker token auth (not Google OAuth)
  app.use('/api/queue/worker', buildWorkerRouter())

  // Queue: public POST /jobs, auth required for everything else
  app.use('/api/queue', queuePublicJobSubmit, buildJobQueueRouter())

  // ── All remaining API routes require authentication ──────────
  app.use('/api', verifyAuth)

  // Per-user data routes (owner-only, scoped by user_id)
  app.use('/api/content-items', buildContentItemRouter())
  app.use('/api/resume-versions', buildResumeVersionRouter())
  app.use('/api/job-matches', buildJobMatchRouter())
  app.use('/api/generator/artifacts/assets', buildGeneratorAssetsServeRouter())
  app.use('/api/generator/artifacts', buildGeneratorArtifactsRouter())
  app.use('/api/generator', generatorPipeline)
  app.use('/api/user-config', buildUserConfigRouter())
  app.use('/api/applicator', buildApplicatorRouter())

  // Shared data routes (auth required, no user scoping)
  app.use('/api/job-listings', buildJobListingRouter())
  app.use('/api/companies', buildCompanyRouter())

  // Admin-only routes
  app.use('/api/job-sources', requireRole('admin'), buildJobSourceRouter())
  app.use('/api/config', requireRole('admin'), buildConfigRouter())
  app.use('/api/maintenance', requireRole('admin'), buildMaintenanceRouter())

  app.get('/healthz', healthHandler)
  app.get('/readyz', healthHandler)

  app.use((req, _res, next) => {
    next(new ApiHttpError(ApiErrorCode.NOT_FOUND, 'Resource not found', { status: 404, details: { path: req.path } }))
  })

  app.use(apiErrorHandler)

  return app
}
