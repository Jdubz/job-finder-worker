import { Router } from 'express'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ListJobListingsResponse,
  GetJobListingResponse,
  CreateJobListingResponse,
  UpdateJobListingResponse,
  DeleteJobListingResponse,
  GetJobListingStatsResponse
} from '@shared/types'
import { JobListingRepository } from './job-listing.repository'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'

const limitSchema = z.coerce.number().int().min(1).max(200).default(50)

const listQuerySchema = z.object({
  limit: limitSchema,
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['pending', 'analyzing', 'analyzed', 'skipped', 'matched']).optional(),
  sourceId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  sortBy: z.enum(['date', 'title', 'company', 'status', 'updated', 'score']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
})

const createSchema = z.object({
  url: z.string().url(),
  sourceId: z.string().optional(),
  companyId: z.string().optional(),
  title: z.string().min(1),
  companyName: z.string().min(1),
  location: z.string().optional(),
  salaryRange: z.string().optional(),
  description: z.string().min(1),
  postedDate: z.string().datetime().optional(),
  status: z.enum(['pending', 'analyzing', 'analyzed', 'skipped', 'matched']).optional(),
  filterResult: z.record(z.unknown()).optional()
})

const updateSchema = z.object({
  status: z.enum(['pending', 'analyzing', 'analyzed', 'skipped', 'matched']).optional(),
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
    '/stats',
    asyncHandler((_req, res) => {
      const stats = repo.getStats()
      const response: GetJobListingStatsResponse = { stats }
      res.json(success(response))
    })
  )

  router.post(
    '/',
    asyncHandler((req, res) => {
      const payload = createSchema.parse(req.body)

      // Check for existing listing with the same URL
      const existing = repo.getByUrl(payload.url)
      if (existing) {
        res.status(409).json(failure(ApiErrorCode.RESOURCE_CONFLICT, 'Job listing with this URL already exists', { listingId: existing.id }))
        return
      }

      try {
        const listing = repo.create({
          url: payload.url,
          sourceId: payload.sourceId ?? null,
          companyId: payload.companyId ?? null,
          title: payload.title,
          companyName: payload.companyName,
          location: payload.location ?? null,
          salaryRange: payload.salaryRange ?? null,
          description: payload.description,
          postedDate: payload.postedDate ?? null,
          status: payload.status ?? 'pending',
          filterResult: payload.filterResult ?? null,
          matchScore: null
        })
        const response: CreateJobListingResponse = { listing }
        res.status(201).json(success(response))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create listing'
        if (message.includes('UNIQUE constraint')) {
          res.status(409).json(failure(ApiErrorCode.RESOURCE_CONFLICT, 'Job listing with this URL already exists'))
          return
        }
        throw err
      }
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
