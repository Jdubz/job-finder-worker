import { Router } from 'express'
import { z } from 'zod'
import { ApiErrorCode, type JobMatchStatus } from '@shared/types'
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
import { ApplicationEmailRepository } from '../gmail/application-email.repository'
import { StatusHistoryRepository } from '../gmail/status-history.repository'
import { verifyFirebaseAuth, requireRole } from '../../middleware/firebase-auth'
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
  status: z.enum(['active', 'ignored', 'applied', 'acknowledged', 'interviewing', 'denied']).optional(),
  ignoredAt: z.union([z.string(), z.date()]).optional()
})

function toTimestamp(value?: string | Date) {
  if (!value) {
    return new Date()
  }
  return value instanceof Date ? value : new Date(value)
}

const limitSchema = z.coerce.number().int().min(1).max(200).default(200)
const listQuerySchema = z.object({
  limit: limitSchema,
  offset: z.coerce.number().int().min(0).default(0),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  jobListingId: z.string().min(1).optional(),
  sortBy: z.enum(['score', 'date', 'updated']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  status: z.enum(['active', 'ignored', 'applied', 'acknowledged', 'interviewing', 'denied', 'all']).optional(),
  search: z.string().transform(s => s.trim()).pipe(z.string().min(1)).optional()
})

const statsQuerySchema = z.object({
  includeIgnored: z.coerce.boolean().optional().default(false)
})

export function buildJobMatchRouter() {
  const router = Router()
  const repo = new JobMatchRepository()
  const appEmailRepo = new ApplicationEmailRepository()
  const statusHistoryRepo = new StatusHistoryRepository()

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
      try {
        const { includeIgnored } = statsQuerySchema.parse(req.query)
        const stats = repo.getStats(includeIgnored)
        const response: GetJobMatchStatsResponse = { stats }
        res.json(success(response))
      } catch (error) {
        if (error instanceof z.ZodError) {
          res
            .status(400)
            .json(
              failure(ApiErrorCode.INVALID_REQUEST, 'Invalid query parameters', {
                issues: error.errors
              })
            )
          return
        }
        logger.error(
          {
            error: error instanceof Error ? error.message : error,
            query: req.query
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

      try {
        const match = repo.upsert(matchRequest)
        const response: SaveJobMatchResponse = { match }
        res.status(201).json(success(response))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save match'
        if (message.includes('FOREIGN KEY constraint')) {
          res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Invalid jobListingId - job listing does not exist'))
          return
        }
        throw err
      }
    })
  )

  router.post(
    '/ghost',
    asyncHandler((req, res) => {
      const ghostSchema = z.object({
        company: z.string().min(1),
        title: z.string().min(1),
        url: z.string().url().optional(),
        notes: z.string().optional()
      })
      const data = ghostSchema.parse(req.body)
      const match = repo.createGhost(data)
      if (!match) {
        res.status(500).json(failure(ApiErrorCode.INTERNAL_ERROR, 'Failed to create ghost match'))
        return
      }
      res.status(201).json(success({ match }))
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
      const statusSchema = z.object({
        status: z.enum(['active', 'ignored', 'applied', 'acknowledged', 'interviewing', 'denied']),
        statusNote: z.string().nullable().optional()
      })
      const { status, statusNote } = statusSchema.parse(req.body)
      const existing = repo.getById(req.params.id)
      if (!existing) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Job match not found'))
        return
      }
      const previousStatus = (existing.status ?? 'active') as JobMatchStatus
      const updated = repo.updateStatus(req.params.id, status, {
        updatedBy: 'user',
        note: statusNote
      })
      if (!updated) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Job match not found'))
        return
      }
      if (previousStatus !== status) {
        statusHistoryRepo.record({
          jobMatchId: req.params.id,
          fromStatus: previousStatus,
          toStatus: status,
          changedBy: 'user',
          note: statusNote ?? null
        })
      }
      res.json(success({ match: updated }))
    })
  )

  // Email activity and status history require admin role (sensitive cross-user data)
  router.get(
    '/:id/emails',
    verifyFirebaseAuth,
    requireRole('admin'),
    asyncHandler((req, res) => {
      const emails = appEmailRepo.listByJobMatch(req.params.id)
      res.json(success({ emails }))
    })
  )

  router.get(
    '/:id/status-history',
    verifyFirebaseAuth,
    requireRole('admin'),
    asyncHandler((req, res) => {
      const history = statusHistoryRepo.listByJobMatch(req.params.id)
      res.json(success({ history }))
    })
  )

  return router
}
