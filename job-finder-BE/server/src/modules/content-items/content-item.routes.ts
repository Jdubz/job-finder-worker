import { Router, type Response } from 'express'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ContentItem,
  ContentItemNode,
  CreateContentItemRequest,
  CreateContentItemResponse,
  DeleteContentItemResponse,
  GetContentItemResponse,
  ListContentItemsResponse,
  ReorderContentItemResponse,
  UpdateContentItemRequest,
  UpdateContentItemResponse
} from '@shared/types'
import { ContentItemRepository, ContentItemInvalidParentError, ContentItemNotFoundError } from './content-item.repository'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'

const nullableIdSchema = z.string().min(1).or(z.literal(null)).optional()
const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Date must be in YYYY-MM format')
  .optional()

const itemFieldsSchema = z.object({
  parentId: nullableIdSchema,
  order: z.number().int().min(0).optional(),
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
  parentId: nullableIdSchema,
  orderIndex: z.number().int().min(0),
  userEmail: z.string().email()
})

const ROOT_PARENT_SENTINEL = '__root__'

const listQuerySchema = z.object({
  parentId: nullableIdSchema,
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0)
})

function buildTree(items: ContentItem[]): ContentItemNode[] {
  const map = new Map<string, ContentItemNode>()
  const roots: ContentItemNode[] = []

  items.forEach((item) => {
    map.set(item.id, { ...item, children: [] })
  })

  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)?.children?.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

export function buildContentItemRouter() {
  const router = Router()
  const repo = new ContentItemRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const query = listQuerySchema.parse(req.query)
      const items = repo.list({
        parentId:
          query.parentId === undefined
            ? undefined
            : query.parentId === '' || query.parentId === ROOT_PARENT_SENTINEL
              ? null
              : query.parentId,
        limit: query.limit,
        offset: query.offset
      })

      const response: ListContentItemsResponse = {
        items: buildTree(items),
        total: items.length,
        hasMore: items.length === query.limit
      }

      res.json(success(response))
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const item = repo.getById(req.params.id)
      if (!item) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Content item not found'))
        return
      }
      const response: GetContentItemResponse = { item }
      res.json(success(response))
    })
  )

  router.post(
    '/',
    asyncHandler((req, res) => {
      const payload = createRequestSchema.parse(req.body) as CreateContentItemRequest
      const item = repo.create({ ...payload.itemData, userEmail: payload.userEmail })
      const response: CreateContentItemResponse = { item, message: 'Content item created' }
      res.status(201).json(success(response))
    })
  )

  router.patch(
    '/:id',
    asyncHandler((req, res) => {
      try {
        const payload = updateRequestSchema.parse(req.body) as UpdateContentItemRequest
        const item = repo.update(req.params.id, { ...payload.itemData, userEmail: payload.userEmail })
        const response: UpdateContentItemResponse = { item, message: 'Content item updated' }
        res.json(success(response))
      } catch (err) {
        if (handleRepoError(err, res)) return
        throw err
      }
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      try {
        repo.delete(req.params.id)
        const response: DeleteContentItemResponse = {
          itemId: req.params.id,
          deleted: true,
          message: 'Content item deleted'
        }
        res.json(success(response))
      } catch (err) {
        if (handleRepoError(err, res)) return
        throw err
      }
    })
  )

  router.post(
    '/:id/reorder',
    asyncHandler((req, res) => {
      try {
        const payload = reorderRequestSchema.parse(req.body)
        const item = repo.reorder(req.params.id, payload.parentId ?? null, payload.orderIndex, payload.userEmail)
        const response: ReorderContentItemResponse = { item }
        res.json(success(response))
      } catch (err) {
        if (handleRepoError(err, res)) return
        throw err
      }
    })
  )

  return router
}

function handleRepoError(err: unknown, res: Response): boolean {
  if (err instanceof ContentItemNotFoundError) {
    res.status(404).json(failure(ApiErrorCode.NOT_FOUND, err.message))
    return true
  }
  if (err instanceof ContentItemInvalidParentError) {
    res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, err.message))
    return true
  }
  return false
}
