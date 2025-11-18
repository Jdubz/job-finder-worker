import { Router } from 'express'
import { z } from 'zod'
import { ContentItemRepository } from './content-item.repository'
import { asyncHandler } from '../../utils/async-handler'

const querySchema = z.object({
  type: z.string().optional(),
  parentId: z.string().optional(),
  visibility: z.enum(['published', 'draft', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  tags: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined))
})

const baseItemSchema = z
  .object({
    type: z.string(),
    userId: z.string().min(1),
    userEmail: z.string().email(),
    parentId: z.string().nullable().optional(),
    order: z.number().int().optional(),
    visibility: z.enum(['published', 'draft', 'archived']).optional(),
    tags: z.array(z.string()).optional(),
    aiContext: z.record(z.unknown()).optional()
  })
  .passthrough()

const updateSchema = z
  .object({
    userEmail: z.string().email(),
    parentId: z.string().nullable().optional(),
    order: z.number().int().optional(),
    visibility: z.enum(['published', 'draft', 'archived']).optional(),
    tags: z.array(z.string()).optional(),
    aiContext: z.record(z.unknown()).optional()
  })
  .passthrough()

export function buildContentItemRouter() {
  const router = Router()
  const repo = new ContentItemRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const query = querySchema.parse(req.query)
      const items = repo.list({
        type: query.type as any,
        parentId: query.parentId === undefined ? undefined : query.parentId || null,
        visibility: query.visibility as any,
        limit: query.limit,
        offset: query.offset,
        tags: query.tags
      })

      res.json({ items, count: items.length })
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const item = repo.getById(req.params.id)
      if (!item) {
        res.status(404).json({ message: 'Content item not found' })
        return
      }
      res.json({ item })
    })
  )

  router.post(
    '/',
    asyncHandler((req, res) => {
      const payload = baseItemSchema.parse(req.body)
      const item = repo.create(payload as any)
      res.status(201).json({ item })
    })
  )

  router.patch(
    '/:id',
    asyncHandler((req, res) => {
      const payload = updateSchema.parse(req.body)
      const item = repo.update(req.params.id, payload as any)
      res.json({ item })
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      repo.delete(req.params.id)
      res.status(204).end()
    })
  )

  return router
}
