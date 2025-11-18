import { Router } from 'express'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  CreateContentItemRequest,
  CreateContentItemResponse,
  DeleteContentItemResponse,
  GetContentItemResponse,
  ListContentItemsResponse,
  UpdateContentItemRequest,
  UpdateContentItemResponse
} from '@shared/types'
import { ContentItemRepository } from './content-item.repository'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'

const contentItemTypes = ['company', 'project', 'skill-group', 'education', 'profile-section', 'accomplishment'] as const
const visibilityValues = ['published', 'draft', 'archived'] as const

const listQuerySchema = z.object({
  type: z.enum(contentItemTypes).optional(),
  parentId: z.string().optional(),
  visibility: z.enum(visibilityValues).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  tags: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['order', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
})

const contentItemDataSchema = z
  .object({
    type: z.enum(contentItemTypes),
    userId: z.string().min(1),
    parentId: z.string().nullable().optional(),
    order: z.number().int().optional(),
    visibility: z.enum(visibilityValues).optional(),
    tags: z.array(z.string()).optional(),
    aiContext: z.record(z.unknown()).optional()
  })
  .passthrough()

const updateDataSchema = z
  .object({
    parentId: z.string().nullable().optional(),
    order: z.number().int().optional(),
    visibility: z.enum(visibilityValues).optional(),
    tags: z.array(z.string()).optional(),
    aiContext: z.record(z.unknown()).optional()
  })
  .passthrough()

const createRequestSchema = z.object({
  itemData: contentItemDataSchema,
  userEmail: z.string().email()
})

const updateRequestSchema = z.object({
  itemData: updateDataSchema,
  userEmail: z.string().email()
})

export function buildContentItemRouter() {
  const router = Router()
  const repo = new ContentItemRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const query = listQuerySchema.parse(req.query)
      const items = repo.list({
        type: query.type,
        parentId: query.parentId === undefined ? undefined : query.parentId || null,
        visibility: query.visibility,
        limit: query.limit,
        offset: query.offset,
        tags: query.tags ? query.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined
      })

      const response: ListContentItemsResponse = {
        items,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: items.length,
          hasMore: items.length === query.limit
        }
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
      const payload = updateRequestSchema.parse(req.body) as UpdateContentItemRequest
      const item = repo.update(req.params.id, { ...payload.itemData, userEmail: payload.userEmail })
      const response: UpdateContentItemResponse = { item, message: 'Content item updated' }
      res.json(success(response))
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      repo.delete(req.params.id)
      const response: DeleteContentItemResponse = {
        itemId: req.params.id,
        deleted: true,
        permanent: true,
        message: 'Content item deleted'
      }
      res.json(success(response))
    })
  )

  return router
}
