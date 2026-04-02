import { Router, type Request, type RequestHandler, type Response } from 'express'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ContentFitEstimate,
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
  PoolHealthSummary,
  EstimateResumeResponse,
  BuildCustomResumeResponse
} from '@shared/types'
import {
  ResumeVersionRepository,
  ResumeVersionNotFoundError,
  ResumeVersionAlreadyExistsError,
  ResumeItemNotFoundError,
  ResumeItemInvalidParentError
} from './resume-version.repository'
import { buildItemTree, transformItemsToResumeContent, publishResumeVersion, getResumePdfAbsolutePath } from './resume-version.publish'
import { HtmlPdfService } from '../generator/workflow/services/html-pdf.service'
import { ResumeSelectionService, PoolNotFoundError, JobMatchNotFoundError, PersonalInfoMissingError, AISelectionError } from './resume-selection.service'
import { estimateContentFit, LAYOUT } from '../generator/workflow/services/content-fit.service'
import { PersonalInfoStore } from '../generator/personal-info.store'
import { env } from '../../config/env'
import { logger } from '../../logger'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { ApiHttpError } from '../../middleware/api-error'
import type { AuthenticatedRequest, AuthenticatedUser } from '../../middleware/firebase-auth'

// ─── Validation schemas ──────────────────────────────────────────────

const slugSchema = z.string().min(1)

const monthSchema = z.preprocess(
  (val) => (val === '' ? null : val),
  z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Date must be in YYYY-MM format')
    .or(z.literal(null))
    .optional()
)

const nullableString = z.string().min(1).or(z.literal(null)).optional()
const nullableUrl = z.string().url().or(z.literal(null)).optional()

const itemFieldsSchema = z.object({
  parentId: z.string().min(1).or(z.literal(null)).optional(),
  orderIndex: z.number().int().min(0).optional(),
  aiContext: z.enum(['work', 'highlight', 'project', 'education', 'skills', 'narrative', 'section']).or(z.literal(null)).optional(),
  title: nullableString,
  role: nullableString,
  location: nullableString,
  website: nullableUrl,
  startDate: monthSchema,
  endDate: monthSchema,
  description: nullableString,
  skills: z.array(z.string().min(1)).or(z.literal(null)).optional()
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

// ─── Helpers ─────────────────────────────────────────────────────────

function getAuthenticatedUser(req: Request): AuthenticatedUser & { email: string } {
  const user = (req as AuthenticatedRequest).user
  if (!user || !user.email) {
    throw new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Missing authenticated user', { status: 401 })
  }
  return user as AuthenticatedUser & { email: string }
}

const artifactsRoot = env.GENERATOR_ARTIFACTS_DIR ? path.resolve(env.GENERATOR_ARTIFACTS_DIR) : path.resolve('/data/artifacts')

/** Map internal FitEstimate to the shared ContentFitEstimate API shape. */
function toContentFitEstimate(fit: ReturnType<typeof estimateContentFit>): ContentFitEstimate {
  const usagePercent = Math.round((fit.mainColumnLines / LAYOUT.MAX_LINES) * 100)
  return {
    mainColumnLines: fit.mainColumnLines,
    maxLines: LAYOUT.MAX_LINES,
    usagePercent,
    pageCount: fit.fits ? 1 : Math.ceil(fit.mainColumnLines / LAYOUT.MAX_LINES),
    fits: fit.fits,
    overflow: fit.overflow,
    suggestions: fit.suggestions
  }
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

// ─── Router builder ──────────────────────────────────────────────────

interface ResumeVersionRouterOptions {
  mutationsMiddleware?: RequestHandler[]
  authMiddleware?: RequestHandler[] // auth-only (no admin role required) — used for tailor endpoint
}

export function buildResumeVersionRouter(options: ResumeVersionRouterOptions = {}) {
  const router = Router()
  const repo = new ResumeVersionRepository()
  const personalInfoStore = new PersonalInfoStore()
  const htmlPdf = new HtmlPdfService()

  const defaultMutationGuard: RequestHandler = (req, _res, next) => {
    try {
      getAuthenticatedUser(req)
      next()
    } catch (err) {
      next(err)
    }
  }
  const mutationsMiddleware = options.mutationsMiddleware ?? [defaultMutationGuard]
  const authMiddleware = options.authMiddleware ?? [defaultMutationGuard]

  // ── Version endpoints ──────────────────────────────────────────

  // GET / — list all versions
  router.get(
    '/',
    asyncHandler((_req, res) => {
      const versions = repo.listVersions()
      const response: ListResumeVersionsResponse = { versions }
      res.json(success(response))
    })
  )

  // ── Pool tailoring endpoints ──────────────────────────────────
  // These MUST be before /:slug routes to avoid being caught by the slug param.

  const tailorRequestSchema = z.object({
    jobMatchId: z.string().uuid('jobMatchId must be a valid UUID')
  })

  // POST /pool/tailor — trigger AI tailoring for a job match (auth only, not admin)
  router.post(
    '/pool/tailor',
    ...authMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const { jobMatchId } = tailorRequestSchema.parse(req.body)
        const force = req.query.force === 'true'

        const selectionService = new ResumeSelectionService(repo)
        const result = await selectionService.tailor(jobMatchId, force)

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

  // GET /pool/tailor/:jobMatchId/pdf — serve cached tailored PDF (auth required)
  router.get(
    '/pool/tailor/:jobMatchId/pdf',
    ...authMiddleware,
    asyncHandler(async (req, res) => {
      const jobMatchId = req.params.jobMatchId
      const pdfPath = repo.getTailoredResumePdfPath(jobMatchId)
      if (!pdfPath) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'No tailored resume found for this job match. Trigger tailoring first.'))
        return
      }

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
    asyncHandler((_req, res) => {
      const pool = repo.getPoolVersion()
      if (!pool) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Resume pool not found'))
        return
      }

      const items = repo.listItems(pool.id)
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

  // ── Custom resume builder endpoints ────────────────────────────

  const builderRequestSchema = z.object({
    selectedItemIds: z.array(z.string().min(1)).min(1, 'Select at least one item'),
    jobTitle: z.string().max(200).optional()
  })

  /**
   * Filter a flat item list to only the selected IDs, preserving parent-child
   * relationships by including any parent whose child is selected.
   */
  function filterItemsToSelected(allItems: ReturnType<typeof repo.listItems>, selectedIds: Set<string>) {
    // Collect all IDs we need: selected items + their ancestors
    const needed = new Set<string>()
    const byId = new Map(allItems.map((item) => [item.id, item]))

    for (const id of selectedIds) {
      let current = byId.get(id)
      while (current) {
        needed.add(current.id)
        current = current.parentId ? byId.get(current.parentId) : undefined
      }
    }

    return allItems.filter((item) => needed.has(item.id))
  }

  // POST /pool/estimate — estimate content fit for selected pool items
  router.post(
    '/pool/estimate',
    ...authMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const { selectedItemIds, jobTitle } = builderRequestSchema.parse(req.body)

        const pool = repo.getPoolVersion()
        if (!pool) {
          res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Resume pool not found'))
          return
        }

        const allItems = repo.listItems(pool.id)
        const selectedSet = new Set(selectedItemIds)
        const filtered = filterItemsToSelected(allItems, selectedSet)
        const tree = buildItemTree(filtered)

        const personalInfo = await personalInfoStore.get()
        if (!personalInfo) {
          res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Personal info not configured'))
          return
        }

        const resumeContent = transformItemsToResumeContent(tree, personalInfo, jobTitle)
        const response: EstimateResumeResponse = {
          contentFit: toContentFitEstimate(estimateContentFit(resumeContent)),
          selectedCount: selectedItemIds.length
        }
        res.json(success(response))
      } catch (err) {
        if (handleRouteError(err, res)) return
        throw err
      }
    })
  )

  // POST /pool/build — render PDF from selected pool items
  router.post(
    '/pool/build',
    ...authMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const { selectedItemIds, jobTitle } = builderRequestSchema.parse(req.body)
        const user = getAuthenticatedUser(req)

        const pool = repo.getPoolVersion()
        if (!pool) {
          res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Resume pool not found'))
          return
        }

        const allItems = repo.listItems(pool.id)
        const selectedSet = new Set(selectedItemIds)
        const filtered = filterItemsToSelected(allItems, selectedSet)

        if (filtered.length === 0) {
          res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'No valid pool items matched the selected IDs'))
          return
        }

        const tree = buildItemTree(filtered)

        const personalInfo = await personalInfoStore.get()
        if (!personalInfo) {
          res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Personal info not configured'))
          return
        }

        const resumeContent = transformItemsToResumeContent(tree, personalInfo, jobTitle)

        const pdfBuffer = await htmlPdf.renderResume(resumeContent, personalInfo)

        // Save per-user to avoid race conditions between concurrent builds
        const safeUid = user.uid.replace(/[^a-zA-Z0-9_-]/g, '_')
        const resumesDir = path.join(artifactsRoot, 'resumes')
        await fs.mkdir(resumesDir, { recursive: true })
        await fs.writeFile(path.join(resumesDir, `custom-build-${safeUid}.pdf`), pdfBuffer)

        const response: BuildCustomResumeResponse = {
          contentFit: toContentFitEstimate(estimateContentFit(resumeContent)),
          pdfSizeBytes: pdfBuffer.length
        }
        res.json(success(response))
      } catch (err) {
        if (handleRouteError(err, res)) return
        if (err instanceof Error) {
          logger.error({ err }, 'Custom resume build failed')
          res.status(500).json(failure(ApiErrorCode.INTERNAL_ERROR, 'Resume build failed'))
          return
        }
        throw err
      }
    })
  )

  // GET /pool/build/pdf — serve the authenticated user's most recent custom-build PDF
  router.get(
    '/pool/build/pdf',
    ...authMiddleware,
    asyncHandler(async (req, res) => {
      const user = getAuthenticatedUser(req)
      const safeUid = user.uid.replace(/[^a-zA-Z0-9_-]/g, '_')
      const absolutePath = path.join(artifactsRoot, 'resumes', `custom-build-${safeUid}.pdf`)

      try {
        await fs.access(absolutePath)
      } catch {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'No custom build PDF found. Generate one first.'))
        return
      }

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'inline; filename="custom-resume.pdf"')
      await pipeline(createReadStream(absolutePath), res)
    })
  )

  // ── Version endpoints ──────────────────────────────────────────

  // GET /:slug — get version detail + items tree + content fit estimate
  router.get(
    '/:slug',
    asyncHandler(async (req, res) => {
      const slug = slugSchema.parse(req.params.slug)
      const version = repo.getVersionBySlug(slug)
      if (!version) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Resume version not found: ${slug}`))
        return
      }
      const items = repo.listItems(version.id)
      const tree = buildItemTree(items)

      // Compute content fit estimate if there are items and personal info is available
      let contentFit: GetResumeVersionResponse['contentFit'] = null
      if (items.length > 0) {
        try {
          const personalInfo = await personalInfoStore.get()
          if (personalInfo) {
            const resumeContent = transformItemsToResumeContent(tree, personalInfo)
            contentFit = toContentFitEstimate(estimateContentFit(resumeContent))
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
      const slug = slugSchema.parse(req.params.slug)
      const version = repo.getVersionBySlug(slug)
      if (!version) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Resume version not found: ${slug}`))
        return
      }
      const items = repo.listItems(version.id)
      const tree = buildItemTree(items)
      const total = repo.countItems(version.id)
      const response: ListResumeItemsResponse = { items: tree, total }
      res.json(success(response))
    })
  )

  // GET /:slug/pdf — serve published PDF
  router.get(
    '/:slug/pdf',
    asyncHandler(async (req, res) => {
      const slug = slugSchema.parse(req.params.slug)
      const version = repo.getVersionBySlug(slug)
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
    ...mutationsMiddleware,
    asyncHandler((req, res) => {
      try {
        const payload = createVersionRequestSchema.parse(req.body)
        const version = repo.createVersion(payload)
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
    ...mutationsMiddleware,
    asyncHandler((req, res) => {
      try {
        const slug = slugSchema.parse(req.params.slug)
        repo.deleteVersion(slug)
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
  function invalidatePoolCacheIfNeeded(slug: string) {
    if (slug === 'pool') {
      const count = repo.invalidateAllTailoredResumes()
      if (count > 0) {
        logger.info({ count }, 'Invalidated tailored resume cache due to pool edit')
        // Clean up orphaned PDF files in background
        const orphanedPaths = repo.getOrphanedPdfPaths()
        if (orphanedPaths.length > 0) {
          for (const pdfPath of orphanedPaths) {
            fs.unlink(path.join(artifactsRoot, pdfPath)).catch(() => {})
          }
        }
      }
    }
  }

  // POST /:slug/items — create item
  router.post(
    '/:slug/items',
    ...mutationsMiddleware,
    asyncHandler((req, res) => {
      try {
        const slug = slugSchema.parse(req.params.slug)
        const version = repo.getVersionBySlug(slug)
        if (!version) {
          res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Resume version not found: ${slug}`))
          return
        }
        const payload = createRequestSchema.parse(req.body) as CreateResumeItemRequest
        const user = getAuthenticatedUser(req)
        const item = repo.createItem(version.id, { ...payload.itemData, userEmail: user.email })
        invalidatePoolCacheIfNeeded(slug)
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
    ...mutationsMiddleware,
    asyncHandler((req, res) => {
      try {
        const payload = updateRequestSchema.parse(req.body) as UpdateResumeItemRequest
        const user = getAuthenticatedUser(req)
        const slug = slugSchema.parse(req.params.slug)
        const item = repo.updateItem(req.params.id, { ...payload.itemData, userEmail: user.email })
        invalidatePoolCacheIfNeeded(slug)
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
    ...mutationsMiddleware,
    asyncHandler((req, res) => {
      try {
        const slug = slugSchema.parse(req.params.slug)
        repo.deleteItem(req.params.id)
        invalidatePoolCacheIfNeeded(slug)
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
    ...mutationsMiddleware,
    asyncHandler((req, res) => {
      try {
        const payload = reorderRequestSchema.parse(req.body)
        const user = getAuthenticatedUser(req)
        const slug = slugSchema.parse(req.params.slug)
        const item = repo.reorderItem(req.params.id, payload.parentId ?? null, payload.orderIndex, user.email)
        invalidatePoolCacheIfNeeded(slug)
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
    ...mutationsMiddleware,
    asyncHandler(async (req, res) => {
      try {
        const slug = slugSchema.parse(req.params.slug)
        const user = getAuthenticatedUser(req)
        await publishResumeVersion(slug, user.email, repo)
        const version = repo.getVersionBySlug(slug)!
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
