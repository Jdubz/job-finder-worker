import { Router } from 'express'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ListJobListingsResponse,
  GetJobListingResponse,
  UpdateJobListingResponse,
  DeleteJobListingResponse
} from '@shared/types'
import { JobListingRepository } from './job-listing.repository'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'

const limitSchema = z.coerce.number().int().min(1).max(200).default(50)

const listQuerySchema = z.object({
  limit: limitSchema,
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'filtered', 'analyzing', 'analyzed', 'skipped', 'matched']).optional(),
  sourceId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  sortBy: z.enum(['date', 'title', 'company', 'status', 'updated', 'score']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
})

const updateSchema = z.object({
  status: z.enum(['pending', 'filtered', 'analyzing', 'analyzed', 'skipped', 'matched']).optional(),
  filterResult: z.record(z.unknown()).nullable().optional(),
  companyId: z.string().nullable().optional()
})

export function buildJobListingRouter() {
  const router = Router()
  const repo = new JobListingRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const filters = listQuerySchema.parse(req.query)
      const { items, total } = repo.list(filters)
      const response: ListJobListingsResponse = {
        listings: items,
        count: total
      }
      res.json(success(response))
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const listing = repo.getById(req.params.id)
      if (!listing) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Job listing not found'))
        return
      }
      const response: GetJobListingResponse = { listing }
      res.json(success(response))
    })
  )

  router.patch(
    '/:id',
    asyncHandler((req, res) => {
      const updates = updateSchema.parse(req.body)
      const listing = repo.update(req.params.id, updates)
      if (!listing) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Job listing not found'))
        return
      }
      const response: UpdateJobListingResponse = { listing }
      res.json(success(response))
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      const existing = repo.getById(req.params.id)
      if (!existing) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Job listing not found'))
        return
      }
      repo.delete(req.params.id)
      const response: DeleteJobListingResponse = { listingId: req.params.id, deleted: true }
      res.json(success(response))
    })
  )

  return router
}
