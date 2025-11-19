import { Router } from 'express'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ListJobMatchesResponse,
  GetJobMatchResponse,
  SaveJobMatchRequest,
  SaveJobMatchResponse,
  DeleteJobMatchResponse
} from '@shared/types'
import { JobMatchRepository } from './job-match.repository'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'

const jobMatchSchema = z.object({
  id: z.string().optional(),
  url: z.string().url(),
  companyName: z.string(),
  companyId: z.string().nullable().optional(),
  jobTitle: z.string(),
  location: z.string().nullable().optional(),
  salaryRange: z.string().nullable().optional(),
  jobDescription: z.string(),
  companyInfo: z.string().nullable().optional(),
  matchScore: z.number().min(0).max(100),
  matchedSkills: z.array(z.string()).optional(),
  missingSkills: z.array(z.string()).optional(),
  matchReasons: z.array(z.string()).optional(),
  keyStrengths: z.array(z.string()).optional(),
  potentialConcerns: z.array(z.string()).optional(),
  experienceMatch: z.number().min(0).max(100),
  applicationPriority: z.enum(['High', 'Medium', 'Low']),
  customizationRecommendations: z.array(z.string()).optional(),
  resumeIntakeData: z.record(z.unknown()).optional(),
  analyzedAt: z.union([z.string(), z.date()]).optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  submittedBy: z.string().nullable().optional(),
  queueItemId: z.string().optional()
})

const limitSchema = z.coerce.number().int().min(1).max(200).default(50)
const listQuerySchema = z.object({
  limit: limitSchema,
  offset: z.coerce.number().int().min(0).default(0),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  companyName: z.string().min(1).optional(),
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
  sortBy: z.enum(['score', 'date', 'company']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
})

export function buildJobMatchRouter() {
  const router = Router()
  const repo = new JobMatchRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const filters = listQuerySchema.parse(req.query)
      const matches = repo.list(filters)
      const response: ListJobMatchesResponse = { matches, count: matches.length }
      res.json(success(response))
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const match = repo.getById(req.params.id)
      if (!match) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Job match not found'))
        return
      }
      const response: GetJobMatchResponse = { match }
      res.json(success(response))
    })
  )

  router.post(
    '/',
    asyncHandler((req, res) => {
      const payload = jobMatchSchema.parse(req.body)
      const matchRequest: SaveJobMatchRequest = {
        ...payload,
        matchedSkills: payload.matchedSkills ?? [],
        missingSkills: payload.missingSkills ?? [],
        matchReasons: payload.matchReasons ?? [],
        keyStrengths: payload.keyStrengths ?? [],
        potentialConcerns: payload.potentialConcerns ?? [],
        customizationRecommendations: payload.customizationRecommendations ?? [],
        analyzedAt: payload.analyzedAt ?? new Date(),
        createdAt: payload.createdAt ?? new Date(),
        submittedBy: payload.submittedBy ?? null,
        queueItemId: payload.queueItemId ?? payload.id ?? 'manual'
      }

      const match = repo.upsert(matchRequest)
      const response: SaveJobMatchResponse = { match }
      res.status(201).json(success(response))
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      repo.delete(req.params.id)
      const response: DeleteJobMatchResponse = { matchId: req.params.id, deleted: true }
      res.json(success(response))
    })
  )

  return router
}
