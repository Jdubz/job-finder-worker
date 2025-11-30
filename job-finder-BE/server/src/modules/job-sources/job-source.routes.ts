import { Router } from 'express'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ListJobSourcesResponse,
  GetJobSourceResponse,
  UpdateJobSourceResponse,
  DeleteJobSourceResponse,
  GetJobSourceStatsResponse
} from '@shared/types'
import { JobSourceRepository } from './job-source.repository'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'

const limitSchema = z.coerce.number().int().min(1).max(200).default(50)

const listQuerySchema = z.object({
  limit: limitSchema,
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['active', 'paused', 'disabled', 'error']).optional(),
  sourceType: z.string().min(1).optional(),
  companyId: z.string().uuid().optional(),
  search: z.string().min(1).optional(),
  sortBy: z.enum(['name', 'created_at', 'updated_at', 'last_scraped_at']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  sourceType: z.string().min(1).optional(),
  status: z.enum(['active', 'paused', 'disabled', 'error']).optional(),
  configJson: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).nullable().optional(),
  companyId: z.string().nullable().optional(),
  aggregatorDomain: z.string().nullable().optional()
})

export function buildJobSourceRouter() {
  const router = Router()
  const repo = new JobSourceRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const filters = listQuerySchema.parse(req.query)
      const { items, total } = repo.list(filters)
      const response: ListJobSourcesResponse = {
        items,
        pagination: {
          limit: filters.limit,
          offset: filters.offset,
          total,
          hasMore: filters.offset + items.length < total
        }
      }
      res.json(success(response))
    })
  )

  router.get(
    '/stats',
    asyncHandler((_req, res) => {
      const stats = repo.getStats()
      const response: GetJobSourceStatsResponse = {
        stats: {
          total: stats.total,
          byStatus: stats.byStatus as Record<'active' | 'paused' | 'disabled' | 'error', number>
        }
      }
      res.json(success(response))
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const source = repo.getById(req.params.id)
      if (!source) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Job source not found'))
        return
      }
      const response: GetJobSourceResponse = { source }
      res.json(success(response))
    })
  )

  router.patch(
    '/:id',
    asyncHandler((req, res) => {
      const updates = updateSchema.parse(req.body)
      const source = repo.update(req.params.id, updates)
      if (!source) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Job source not found'))
        return
      }
      const response: UpdateJobSourceResponse = { source, message: 'Job source updated successfully' }
      res.json(success(response))
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      const existing = repo.getById(req.params.id)
      if (!existing) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Job source not found'))
        return
      }
      repo.delete(req.params.id)
      const response: DeleteJobSourceResponse = { message: 'Job source deleted successfully' }
      res.json(success(response))
    })
  )

  return router
}
