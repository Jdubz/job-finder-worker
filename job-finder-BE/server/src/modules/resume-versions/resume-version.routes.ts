import { Router, type Request, type RequestHandler, type Response } from 'express'
import fs from 'node:fs/promises'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ListResumeVersionsResponse,
  GetResumeVersionResponse,
  ListResumeItemsResponse,
  CreateResumeItemRequest,
  CreateResumeItemResponse,
  UpdateResumeItemRequest,
  UpdateResumeItemResponse,
  DeleteResumeItemResponse,
  ReorderResumeItemResponse,
  PublishResumeVersionResponse
} from '@shared/types'
import {
  ResumeVersionRepository,
  ResumeVersionNotFoundError,
  ResumeItemNotFoundError,
  ResumeItemInvalidParentError
} from './resume-version.repository'
import { buildItemTree, publishResumeVersion, getResumePdfAbsolutePath } from './resume-version.publish'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { ApiHttpError } from '../../middleware/api-error'
import type { AuthenticatedRequest, AuthenticatedUser } from '../../middleware/firebase-auth'

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
  order: z.number().int().min(0).optional(),
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
  itemData: itemFieldsSchema,
  userEmail: z.string().email()
})

const updateRequestSchema = z.object({
  itemData: itemFieldsSchema.partial(),
  userEmail: z.string().email()
})

const reorderRequestSchema = z.object({
  parentId: z.string().min(1).or(z.literal(null)).optional(),
  orderIndex: z.number().int().min(0),
  userEmail: z.string().email()
})

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
  return false
}

// ─── Router builder ──────────────────────────────────────────────────

interface ResumeVersionRouterOptions {
  mutationsMiddleware?: RequestHandler[]
}

export function buildResumeVersionRouter(options: ResumeVersionRouterOptions = {}) {
  const router = Router()
  const repo = new ResumeVersionRepository()

  const defaultMutationGuard: RequestHandler = (req, _res, next) => {
    try {
      getAuthenticatedUser(req)
      next()
    } catch (err) {
      next(err)
    }
  }
  const mutationsMiddleware = options.mutationsMiddleware ?? [defaultMutationGuard]

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

  // GET /:slug — get version detail + items tree
  router.get(
    '/:slug',
    asyncHandler((req, res) => {
      const slug = slugSchema.parse(req.params.slug)
      const version = repo.getVersionBySlug(slug)
      if (!version) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, `Resume version not found: ${slug}`))
        return
      }
      const items = repo.listItems(version.id)
      const tree = buildItemTree(items)
      const response: GetResumeVersionResponse = { version, items: tree }
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
      const fileBuffer = await fs.readFile(absolutePath)
      res.send(fileBuffer)
    })
  )

  // ── Item mutation endpoints (admin only) ───────────────────────

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
        const item = repo.updateItem(req.params.id, { ...payload.itemData, userEmail: user.email })
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
        repo.deleteItem(req.params.id)
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
        const item = repo.reorderItem(req.params.id, payload.parentId ?? null, payload.orderIndex, user.email)
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
