import { Router } from 'express'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ListJobMatchesResponse,
  GetJobMatchResponse,
  SaveJobMatchRequest,
  SaveJobMatchResponse,
  DeleteJobMatchResponse,
  ResumeIntakeData,
  GetJobMatchStatsResponse
} from '@shared/types'
import { JobMatchRepository } from './job-match.repository'
import { logger } from '../../logger'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'

const resumeIntakeDataSchema: z.ZodType<ResumeIntakeData> = z.object({
  jobId: z.string(),
  jobTitle: z.string(),
  company: z.string(),
  targetSummary: z.string(),
  skillsPriority: z.array(z.string()),
  experienceHighlights: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      pointsToEmphasize: z.array(z.string())
    })
  ),
  projectsToInclude: z.array(
    z.object({
      name: z.string(),
      whyRelevant: z.string(),
      pointsToHighlight: z.array(z.string())
    })
  ),
  achievementAngles: z.array(z.string()),
  atsKeywords: z.array(z.string()),
  gapMitigation: z
    .array(
      z.object({
        missingSkill: z.string(),
        mitigationStrategy: z.string(),
        coverLetterPoint: z.string()
      })
    )
    .optional()
})

const jobMatchSchema = z.object({
  id: z.string().optional(),
  jobListingId: z.string(),
  matchScore: z.number().min(0).max(100),
  matchedSkills: z.array(z.string()).optional(),
  missingSkills: z.array(z.string()).optional(),
  matchReasons: z.array(z.string()).optional(),
  keyStrengths: z.array(z.string()).optional(),
  potentialConcerns: z.array(z.string()).optional(),
  experienceMatch: z.number().min(0).max(100),
  customizationRecommendations: z.array(z.string()).optional(),
  resumeIntakeData: resumeIntakeDataSchema.optional(),
  analyzedAt: z.union([z.string(), z.date()]).optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  submittedBy: z.string().nullable().optional(),
  queueItemId: z.string(),
  status: z.enum(['active', 'ignored']).optional(),
  ignoredAt: z.union([z.string(), z.date()]).optional()
})

function toTimestamp(value?: string | Date) {
  if (!value) {
    return new Date()
  }
  return value instanceof Date ? value : new Date(value)
}

const limitSchema = z.coerce.number().int().min(1).max(200).default(50)
const listQuerySchema = z.object({
  limit: limitSchema,
  offset: z.coerce.number().int().min(0).default(0),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  jobListingId: z.string().min(1).optional(),
  sortBy: z.enum(['score', 'date', 'updated']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  status: z.enum(['active', 'ignored', 'all']).optional()
})

const statsQuerySchema = z.object({
  includeIgnored: z.coerce.boolean().optional().default(false)
})

export function buildJobMatchRouter() {
  const router = Router()
  const repo = new JobMatchRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const filters = listQuerySchema.parse(req.query)
      const matches = repo.listWithListings({ ...filters, status: filters.status ?? 'active' })
      const response: ListJobMatchesResponse = { matches, count: matches.length }
      res.json(success(response))
    })
  )

  router.get(
    '/stats',
    asyncHandler((req, res) => {
      const parsed = statsQuerySchema.safeParse(req.query)
      const includeIgnored = parsed.success ? parsed.data.includeIgnored : false
      try {
        const stats = repo.getStats(includeIgnored)
        const response: GetJobMatchStatsResponse = { stats }
        res.json(success(response))
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : error,
            includeIgnored
          },
          'Failed to fetch job match stats'
        )
        res.status(500).json(failure(ApiErrorCode.INTERNAL_ERROR, 'Failed to fetch job match stats'))
      }
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const match = repo.getByIdWithListing(req.params.id)
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
        analyzedAt: toTimestamp(payload.analyzedAt),
        createdAt: toTimestamp(payload.createdAt),
        updatedAt: toTimestamp(payload.updatedAt ?? payload.analyzedAt ?? payload.createdAt),
        keyStrengths: payload.keyStrengths ?? [],
        potentialConcerns: payload.potentialConcerns ?? [],
        customizationRecommendations: payload.customizationRecommendations ?? [],
        submittedBy: payload.submittedBy ?? null,
        status: payload.status ?? 'active',
        ignoredAt: payload.ignoredAt ? toTimestamp(payload.ignoredAt) : undefined
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

  router.patch(
    '/:id/status',
    asyncHandler((req, res) => {
      const statusSchema = z.object({ status: z.enum(['active', 'ignored']) })
      const { status } = statusSchema.parse(req.body)
      const updated = repo.updateStatus(req.params.id, status)
      if (!updated) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Job match not found'))
        return
      }
      res.json(success({ match: updated }))
    })
  )

  return router
}
