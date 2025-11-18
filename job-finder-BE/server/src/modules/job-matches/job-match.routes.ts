import { Router } from 'express'
import { z } from 'zod'
import type { JobMatch } from '@shared/types'
import { JobMatchRepository } from './job-match.repository'
import { asyncHandler } from '../../utils/async-handler'

const createSchema = z.object({
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
  analyzedAt: z.string().optional(),
  createdAt: z.string().optional(),
  submittedBy: z.string().nullable().optional(),
  queueItemId: z.string().optional()
})

export function buildJobMatchRouter() {
  const router = Router()
  const repo = new JobMatchRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const limit = req.query.limit ? Number(req.query.limit) : 50
      const items = repo.list(isNaN(limit) ? 50 : limit)
      res.json({ items, count: items.length })
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const match = repo.getById(req.params.id)
      if (!match) {
        res.status(404).json({ message: 'Job match not found' })
        return
      }
      res.json({ match })
    })
  )

  router.post(
    '/',
    asyncHandler((req, res) => {
      const payload = createSchema.parse(req.body)
      const now = new Date()
      const match = repo.upsert({
        ...payload,
        matchedSkills: payload.matchedSkills ?? [],
        missingSkills: payload.missingSkills ?? [],
        matchReasons: payload.matchReasons ?? [],
        keyStrengths: payload.keyStrengths ?? [],
        potentialConcerns: payload.potentialConcerns ?? [],
        customizationRecommendations: payload.customizationRecommendations ?? [],
        resumeIntakeData: payload.resumeIntakeData as JobMatch['resumeIntakeData'],
        analyzedAt: payload.analyzedAt ? new Date(payload.analyzedAt) : now,
        createdAt: payload.createdAt ? new Date(payload.createdAt) : now,
        submittedBy: payload.submittedBy ?? null,
        queueItemId: payload.queueItemId ?? payload.id ?? 'manual'
      })
      res.status(201).json({ match })
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
