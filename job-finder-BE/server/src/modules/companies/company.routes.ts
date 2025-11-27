import { Router } from 'express'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ListCompaniesResponse,
  GetCompanyResponse,
  UpdateCompanyResponse,
  DeleteCompanyResponse
} from '@shared/types'
import { CompanyRepository } from './company.repository'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'

const limitSchema = z.coerce.number().int().min(1).max(200).default(50)

const listQuerySchema = z.object({
  limit: limitSchema,
  offset: z.coerce.number().int().min(0).default(0),
  industry: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
  sortBy: z.enum(['name', 'created_at', 'updated_at']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
})

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  website: z.string().url().optional(),
  about: z.string().nullable().optional(),
  culture: z.string().nullable().optional(),
  mission: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  headquartersLocation: z.string().nullable().optional(),
  companySizeCategory: z.enum(['large', 'medium', 'small']).nullable().optional(),
  techStack: z.array(z.string()).optional()
})

export function buildCompanyRouter() {
  const router = Router()
  const repo = new CompanyRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const filters = listQuerySchema.parse(req.query)
      const { items, total } = repo.list(filters)
      const response: ListCompaniesResponse = {
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
    '/:id',
    asyncHandler((req, res) => {
      const company = repo.getById(req.params.id)
      if (!company) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Company not found'))
        return
      }
      const response: GetCompanyResponse = { company }
      res.json(success(response))
    })
  )

  router.patch(
    '/:id',
    asyncHandler((req, res) => {
      const updates = updateSchema.parse(req.body)
      const company = repo.update(req.params.id, updates)
      if (!company) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Company not found'))
        return
      }
      const response: UpdateCompanyResponse = { company, message: 'Company updated successfully' }
      res.json(success(response))
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      const existing = repo.getById(req.params.id)
      if (!existing) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Company not found'))
        return
      }
      repo.delete(req.params.id)
      const response: DeleteCompanyResponse = { message: 'Company deleted successfully' }
      res.json(success(response))
    })
  )

  return router
}
