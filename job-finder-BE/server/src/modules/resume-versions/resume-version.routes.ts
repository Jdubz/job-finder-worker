import { Router, type Request, type Response } from 'express'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ListResumeVersionsResponse,
  GetResumeVersionResponse,
  ListResumeItemsResponse,
  CreateResumeVersionResponse,
  DeleteResumeVersionResponse,
  CreateResumeItemRequest,
  CreateResumeItemResponse,
  UpdateResumeItemRequest,
  UpdateResumeItemResponse,
  DeleteResumeItemResponse,
  ReorderResumeItemResponse,
  PublishResumeVersionResponse,
  TailorResumeResponse,
  PoolHealthSummary
} from '@shared/types'
import {
  ResumeVersionRepository,
  ResumeVersionNotFoundError,
  ResumeVersionAlreadyExistsError,
  ResumeItemNotFoundError,
  ResumeItemInvalidParentError
} from './resume-version.repository'
import { buildItemTree, transformItemsToResumeContent, publishResumeVersion, getResumePdfAbsolutePath } from './resume-version.publish'
import { ResumeSelectionService, PoolNotFoundError, JobMatchNotFoundError, PersonalInfoMissingError, AISelectionError } from './resume-selection.service'
import { estimateContentFit, LAYOUT } from '../generator/workflow/services/content-fit.service'
import { PersonalInfoStore } from '../generator/personal-info.store'
import { env } from '../../config/env'
import { logger } from '../../logger'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { ApiHttpError } from '../../middleware/api-error'
import type { AuthenticatedRequest, AuthenticatedUser } from '../../middleware/auth'

// ─── Helpers ─────────────────────────────────────────────────────────

function getAuthenticatedUser(req: Request): AuthenticatedUser & { email: string } {
  const user = (req as AuthenticatedRequest).user
  if (!user || !user.email) {
    throw new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Missing authenticated user', { status: 401 })
  }
  return user as AuthenticatedUser & { email: string }
}

function handleRouteError(err: unknown, res: Response): boolean {
  if (err instanceof z.ZodError) {
    res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')))
    return true
  }
  if (err instanceof ResumeVersionNotFoundError) {
    res.status(404).json(failure(ApiErrorCode.NOT_FOUND, err.message))
    return true
  }
  if (err instanceof ResumeItemNotFoundError) {
    res.status(404).json(failure(ApiErrorCode.NOT_FOUND, err.message))
    return true
  }
  if (err instanceof ResumeItemInvalidParentError) {
    res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, err.message))
    return true
  }
  if (err instanceof ResumeVersionAlreadyExistsError) {
    res.status(409).json(failure(ApiErrorCode.ALREADY_EXISTS, err.message))
    return true
  }
  return false
}

// ─── Validation schemas ──────────────────────────────────────────────

const slugSchema = z.string().min(1)

const monthSchema = z.preprocess(
  (val) => (val === '' || val === null ? undefined : val),
  z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Date must be in YYYY-MM format')
    .optional()
)

const itemFieldsSchema = z.object({
  parentId: z.string().min(1).or(z.literal(null)).optional(),
  orderIndex: z.number().int().min(0).optional(),
  aiContext: z.enum(['work', 'highlight', 'project', 'education', 'skills', 'narrative', 'section']).optional(),
  title: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  website: z.string().url().optional(),
  startDate: monthSchema,
  endDate: monthSchema,
  description: z.string().min(1).optional(),
  skills: z.array(z.string().min(1)).optional()
})

const createRequestSchema = z.object({
  itemData: itemFieldsSchema
})

const updateRequestSchema = z.object({
  itemData: itemFieldsSchema.partial()
})

const reorderRequestSchema = z.object({
  parentId: z.string().min(1).or(z.literal(null)).optional(),
  orderIndex: z.number().int().min(0)
})

const createVersionRequestSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(500).optional().nullable()
})

// ─── Router builder ──────────────────────────────────────────────────

export function buildResumeVersionRouter() {
  const router = Router()
  const repo = new ResumeVersionRepository()

  // ── Version endpoints ──────────────────────────────────────────

  // GET / — list all versions
  router.get(
    '/',
    asyncHandler((req, res) => {
      const user = getAuthenticatedUser(req)
      const versions = repo.listVersions(user.uid)
      const response: ListResumeVersionsResponse = { versions }
      res.json(success(response))
    })
  )

  // ── Pool tailoring endpoints ──────────────────────────────────
  // These MUST be before /:slug routes to avoid being caught by the slug param.

  const tailorRequestSchema = z.object({
    jobMatchId: z.string().uuid('jobMatchId must be a valid UUID')
  })

  // POST /pool/tailor — trigger AI tailoring for a job match
  router.post(
    '/pool/tailor',
    asyncHandler(async (req, res) => {
      try {
        const user = getAuthenticatedUser(req)
        const { jobMatchId } = tailorRequestSchema.parse(req.body)
        const force = req.query.force === 'true'

        const selectionService = new ResumeSelectionService(repo)
        const result = await selectionService.tailor(user.uid, jobMatchId, force)

        const response: TailorResumeResponse = {
          id: result.id,
          jobMatchId: result.jobMatchId,
          contentFit: result.contentFit,
          pdfPath: result.pdfPath,
          reasoning: result.reasoning,
          selectedItemIds: result.selectedItemIds,
          createdAt: result.createdAt,
          cached: result.cached
        }
        res.json(success(response))
      } catch (err) {
        if (handleRouteError(err, res)) return
        if (err instanceof PoolNotFoundError || err instanceof JobMatchNotFoundError) {
          res.status(404).json(failure(ApiErrorCode.NOT_FOUND, err.message))
          return
        }
        if (err instanceof PersonalInfoMissingError) {
          res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, err.message))
          return
        }
        if (err instanceof AISelectionError) {
          logger.error({ err }, 'AI selection failed during tailoring')
          res.status(502).json(failure(ApiErrorCode.INTERNAL_ERROR, 'AI selection failed. Please try again.'))
          return
        }
        if (err instanceof Error) {
          logger.error({ err }, 'Tailoring failed')
          res.status(500).json(failure(ApiErrorCode.INTERNAL_ERROR, 'Resume tailoring failed'))
          return
        }
        throw err
      }
    })
  )

  // GET /pool/tailor/:jobMatchId/pdf — serve cached tailored PDF
  router.get(
    '/pool/tailor/:jobMatchId/pdf',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req)
      const jobMatchId = req.params.jobMatchId
      const pdfPath = repo.getTailoredResumePdfPath(user.uid, jobMatchId)
      if (!pdfPath) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'No tailored resume found for this job match. Trigger tailoring first.'))
        return
      }

      const defaultArtifactsDir = path.resolve('/data/artifacts')
      const artifactsRoot = env.GENERATOR_ARTIFACTS_DIR ? path.resolve(env.GENERATOR_ARTIFACTS_DIR) : defaultArtifactsDir
      const absolutePath = path.join(artifactsRoot, pdfPath)

      try {
        await fs.access(absolutePath)
      } catch {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Tailored PDF file not found on disk'))
        return
      }

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="tailored-resume-${jobMatchId}.pdf"`)
      await pipeline(createReadStream(absolutePath), res)
    })
  )

  // GET /pool/health — pool content summary
  router.get(
    '/pool/health',
    asyncHandler((req, res) => {
      const user = getAuthenticatedUser(req)
      const pool = repo.getPoolVersion(user.uid)
      if (!pool) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Resume pool not found'))
        return
      }

      const items = repo.listItems(user.uid, pool.id)
      const tree = buildItemTree(items)

      const summary: PoolHealthSummary = {
        narratives: 0,
        experiences: 0,
        highlights: 0,
        skillCategories: 0,
        projects: 0,
        education: 0,
        totalItems: items.length
      }

      function countNode(node: { aiContext?: string | null; children?: unknown[] }) {
        const typedNode = node as { aiContext?: string | null; children?: Array<{ aiContext?: string | null; children?: unknown[] }> }
        switch (typedNode.aiContext) {
          case 'narrative': summary.narratives++; break
          case 'work': summary.experiences++; break
          case 'highlight': summary.highlights++; break
          case 'skills': summary.skillCategories++; break
          case 'project': summary.projects++; break
          case 'education': summary.education++; break
        }
        for (const child of typedNode.children ?? []) countNode(child)
      }
      for (const node of tree) countNode(node)

      res.json(success(summary))
    })
  )

  // ── Version endpoints ──────────────────────────────────────────

  // GET /:slug — get version detail + items tree + content fit estimate
  router.get(
    '/:slug',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req)
      const slug = slugSchema.parse(req.params.slug)
      const version = repo.getVersionBySlug(user.uid, slug)
      if (!version) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Resume version not found: ${slug}`))
        return
      }
      const items = repo.listItems(user.uid, version.id)
      const tree = buildItemTree(items)

      // Compute content fit estimate if there are items and personal info is available
      let contentFit: GetResumeVersionResponse['contentFit'] = null
      if (items.length > 0) {
        try {
          const personalInfoStore = new PersonalInfoStore()
          const personalInfo = await personalInfoStore.get(user.uid)
          if (personalInfo) {
            const resumeContent = transformItemsToResumeContent(tree, personalInfo)
            const fit = estimateContentFit(resumeContent)
            const usagePercent = Math.round((fit.mainColumnLines / LAYOUT.MAX_LINES) * 100)
            contentFit = {
              mainColumnLines: fit.mainColumnLines,
              maxLines: LAYOUT.MAX_LINES,
              usagePercent,
              pageCount: fit.fits ? 1 : Math.ceil(fit.mainColumnLines / LAYOUT.MAX_LINES),
              fits: fit.fits,
              overflow: fit.overflow,
              suggestions: fit.suggestions
            }
          }
        } catch (err) {
          logger.warn({ err, slug }, 'Failed to compute content fit estimate for resume version')
        }
      }

      const response: GetResumeVersionResponse = { version, items: tree, contentFit }
      res.json(success(response))
    })
  )

  // GET /:slug/items — get items as nested tree
  router.get(
    '/:slug/items',
    asyncHandler((req, res) => {
      const user = getAuthenticatedUser(req)
      const slug = slugSchema.parse(req.params.slug)
      const version = repo.getVersionBySlug(user.uid, slug)
      if (!version) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Resume version not found: ${slug}`))
        return
      }
      const items = repo.listItems(user.uid, version.id)
      const tree = buildItemTree(items)
      const total = repo.countItems(user.uid, version.id)
      const response: ListResumeItemsResponse = { items: tree, total }
      res.json(success(response))
    })
  )

  // GET /:slug/pdf — serve published PDF
  router.get(
    '/:slug/pdf',
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req)
      const slug = slugSchema.parse(req.params.slug)
      const version = repo.getVersionBySlug(user.uid, slug)
      if (!version) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Resume version not found: ${slug}`))
        return
      }
      if (!version.pdfPath) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Resume version "${slug}" has not been published yet`))
        return
      }

      const absolutePath = getResumePdfAbsolutePath(version.pdfPath)
      try {
        await fs.access(absolutePath)
      } catch {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Published PDF file not found on disk'))
        return
      }

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${slug}-resume.pdf"`)
      await pipeline(createReadStream(absolutePath), res)
    })
  )

  // ── Version mutation endpoints (admin only) ────────────────────

  // POST / — create version
  router.post(
    '/',
    asyncHandler((req, res) => {
      try {
        const user = getAuthenticatedUser(req)
        const payload = createVersionRequestSchema.parse(req.body)
        const version = repo.createVersion(user.uid, payload)
        const response: CreateResumeVersionResponse = { version, message: `Resume version "${version.name}" created` }
        res.status(201).json(success(response))
      } catch (err) {
        if (handleRouteError(err, res)) return
        throw err
      }
    })
  )

  // DELETE /:slug — delete version
  router.delete(
    '/:slug',
    asyncHandler((req, res) => {
      try {
        const user = getAuthenticatedUser(req)
        const slug = slugSchema.parse(req.params.slug)
        repo.deleteVersion(user.uid, slug)
        const response: DeleteResumeVersionResponse = { slug, deleted: true, message: `Resume version "${slug}" deleted` }
        res.json(success(response))
      } catch (err) {
        if (handleRouteError(err, res)) return
        throw err
      }
    })
  )

  // ── Item mutation endpoints (admin only) ───────────────────────

  // Helper: invalidate tailored resume cache when pool items change
  function invalidatePoolCacheIfNeeded(userId: string, slug: string) {
    if (slug === 'pool') {
      const count = repo.invalidateAllTailoredResumes(userId)
      if (count > 0) {
        logger.info({ count }, 'Invalidated tailored resume cache due to pool edit')
        // Clean up orphaned PDF files in background
        const orphanedPaths = repo.getOrphanedPdfPaths()
        if (orphanedPaths.length > 0) {
          const defaultArtifactsDir = path.resolve('/data/artifacts')
          const root = env.GENERATOR_ARTIFACTS_DIR ? path.resolve(env.GENERATOR_ARTIFACTS_DIR) : defaultArtifactsDir
          for (const pdfPath of orphanedPaths) {
            fs.unlink(path.join(root, pdfPath)).catch(() => {})
          }
        }
      }
    }
  }

  // POST /:slug/items — create item
  router.post(
    '/:slug/items',
    asyncHandler((req, res) => {
      try {
        const user = getAuthenticatedUser(req)
        const slug = slugSchema.parse(req.params.slug)
        const version = repo.getVersionBySlug(user.uid, slug)
        if (!version) {
          res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Resume version not found: ${slug}`))
          return
        }
        const payload = createRequestSchema.parse(req.body) as CreateResumeItemRequest
        const item = repo.createItem(user.uid, version.id, { ...payload.itemData, userEmail: user.email })
        invalidatePoolCacheIfNeeded(user.uid, slug)
        const response: CreateResumeItemResponse = { item, message: 'Resume item created' }
        res.status(201).json(success(response))
      } catch (err) {
        if (handleRouteError(err, res)) return
        throw err
      }
    })
  )

  // PATCH /:slug/items/:id — update item
  router.patch(
    '/:slug/items/:id',
    asyncHandler((req, res) => {
      try {
        const user = getAuthenticatedUser(req)
        const payload = updateRequestSchema.parse(req.body) as UpdateResumeItemRequest
        const slug = slugSchema.parse(req.params.slug)
        const item = repo.updateItem(user.uid, req.params.id, { ...payload.itemData, userEmail: user.email })
        invalidatePoolCacheIfNeeded(user.uid, slug)
        const response: UpdateResumeItemResponse = { item, message: 'Resume item updated' }
        res.json(success(response))
      } catch (err) {
        if (handleRouteError(err, res)) return
        throw err
      }
    })
  )

  // DELETE /:slug/items/:id — delete item
  router.delete(
    '/:slug/items/:id',
    asyncHandler((req, res) => {
      try {
        const user = getAuthenticatedUser(req)
        const slug = slugSchema.parse(req.params.slug)
        repo.deleteItem(user.uid, req.params.id)
        invalidatePoolCacheIfNeeded(user.uid, slug)
        const response: DeleteResumeItemResponse = {
          itemId: req.params.id,
          deleted: true,
          message: 'Resume item deleted'
        }
        res.json(success(response))
      } catch (err) {
        if (handleRouteError(err, res)) return
        throw err
      }
    })
  )

  // POST /:slug/items/:id/reorder — reorder item
  router.post(
    '/:slug/items/:id/reorder',
    asyncHandler((req, res) => {
      try {
        const user = getAuthenticatedUser(req)
        const payload = reorderRequestSchema.parse(req.body)
        const slug = slugSchema.parse(req.params.slug)
        const item = repo.reorderItem(user.uid, req.params.id, payload.parentId ?? null, payload.orderIndex, user.email)
        invalidatePoolCacheIfNeeded(user.uid, slug)
        const response: ReorderResumeItemResponse = { item }
        res.json(success(response))
      } catch (err) {
        if (handleRouteError(err, res)) return
        throw err
      }
    })
  )

  // POST /:slug/publish — render PDF and publish
  router.post(
    '/:slug/publish',
    asyncHandler(async (req, res) => {
      try {
        const slug = slugSchema.parse(req.params.slug)
        const user = getAuthenticatedUser(req)
        await publishResumeVersion(user.uid, slug, user.email, repo)
        const version = repo.getVersionBySlug(user.uid, slug)!
        const response: PublishResumeVersionResponse = { version, message: `Resume "${version.name}" published successfully` }
        res.json(success(response))
      } catch (err) {
        if (handleRouteError(err, res)) return
        if (err instanceof Error && err.message.startsWith('Cannot publish')) {
          res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, err.message))
          return
        }
        throw err
      }
    })
  )

  return router
}
