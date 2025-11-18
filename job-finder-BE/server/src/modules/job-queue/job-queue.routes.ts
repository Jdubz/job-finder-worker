import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../utils/async-handler'
import { JobQueueService } from './job-queue.service'

const submitJobSchema = z.object({
  url: z.string().url(),
  companyName: z.string().optional(),
  companyId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  generationId: z.string().optional(),
  source: z
    .enum([
      'user_submission',
      'automated_scan',
      'scraper',
      'webhook',
      'email',
      'manual_submission',
      'user_request'
    ])
    .optional(),
  metadata: z.record(z.unknown()).optional()
})

const submitCompanySchema = z.object({
  companyName: z.string().min(1),
  websiteUrl: z.string().url(),
  userId: z.string().nullable().optional(),
  source: z
    .enum([
      'user_submission',
      'automated_scan',
      'scraper',
      'webhook',
      'email',
      'manual_submission',
      'user_request'
    ])
    .optional()
})

const submitScrapeSchema = z.object({
  userId: z.string().nullable().optional(),
  scrapeConfig: z.record(z.unknown()).optional()
})

export function buildJobQueueRouter() {
  const router = Router()
  const service = new JobQueueService()

  router.get(
    '/stats',
    asyncHandler((_req, res) => {
      const stats = service.getStats()
      res.json({ stats })
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const item = service.getItem(req.params.id)
      if (!item) {
        res.status(404).json({ message: 'Queue item not found' })
        return
      }
      res.json({ item })
    })
  )

  router.post(
    '/jobs',
    asyncHandler((req, res) => {
      const payload = submitJobSchema.parse(req.body)
      const item = service.submitJob(payload)
      res.status(201).json({ item })
    })
  )

  router.post(
    '/companies',
    asyncHandler((req, res) => {
      const payload = submitCompanySchema.parse(req.body)
      const item = service.submitCompany(payload)
      res.status(201).json({ item })
    })
  )

  router.post(
    '/scrape',
    asyncHandler((req, res) => {
      const payload = submitScrapeSchema.parse(req.body)
      const item = service.submitScrape(payload)
      res.status(201).json({ item })
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      service.delete(req.params.id)
      res.status(204).end()
    })
  )

  return router
}
