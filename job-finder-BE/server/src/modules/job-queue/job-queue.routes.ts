import { Router } from 'express'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  SubmitJobRequest,
  SubmitJobResponse,
  SubmitCompanyRequest,
  SubmitCompanyResponse,
  SubmitScrapeRequest,
  SubmitScrapeResponse,
  GetQueueStatsResponse,
  GetQueueItemResponse
} from '@shared/types'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { JobQueueService } from './job-queue.service'

const queueSources = [
  'user_submission',
  'automated_scan',
  'scraper',
  'webhook',
  'email',
  'manual_submission',
  'user_request'
] as const

const submitJobSchema = z.object({
  url: z.string().url(),
  companyName: z.string().optional(),
  companyId: z.string().nullable().optional(),
  companyUrl: z.string().url().optional(),
  userId: z.string().nullable().optional(),
  generationId: z.string().optional(),
  source: z.enum(queueSources).optional(),
  metadata: z.record(z.unknown()).optional()
})

const submitCompanySchema = z.object({
  companyName: z.string().min(1),
  websiteUrl: z.string().url(),
  userId: z.string().nullable().optional(),
  source: z.enum(queueSources).optional()
})

const submitScrapeSchema = z.object({
  userId: z.string().nullable().optional(),
  scrapeConfig: z.record(z.unknown()).optional(),
  scrape_config: z.record(z.unknown()).optional()
})

export function buildJobQueueRouter() {
  const router = Router()
  const service = new JobQueueService()

  router.get(
    '/stats',
    asyncHandler((_req, res) => {
      const stats = service.getStats()
      const response: GetQueueStatsResponse = { stats }
      res.json(success(response))
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const item = service.getItem(req.params.id)
      if (!item) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Queue item not found'))
        return
      }

      const response: GetQueueItemResponse = { queueItem: item }
      res.json(success(response))
    })
  )

  router.post(
    '/jobs',
    asyncHandler((req, res) => {
      const payload = submitJobSchema.parse(req.body) as SubmitJobRequest
      const item = service.submitJob(payload)
      const response: SubmitJobResponse = {
        status: 'success',
        message: 'Job submitted',
        queueItemId: item.id,
        queueItem: item
      }
      res.status(201).json(success(response))
    })
  )

  router.post(
    '/companies',
    asyncHandler((req, res) => {
      const payload = submitCompanySchema.parse(req.body) as SubmitCompanyRequest
      const item = service.submitCompany(payload)
      const response: SubmitCompanyResponse = {
        status: 'success',
        message: 'Company submission queued',
        queueItemId: item.id,
        queueItem: item
      }
      res.status(201).json(success(response))
    })
  )

  router.post(
    '/scrape',
    asyncHandler((req, res) => {
      const payload = submitScrapeSchema.parse(req.body)
      const input: SubmitScrapeRequest = {
        userId: payload.userId ?? null,
        scrapeConfig: payload.scrapeConfig ?? payload.scrape_config
      }
      const item = service.submitScrape(input)
      const response: SubmitScrapeResponse = {
        status: 'success',
        message: 'Scrape submission queued',
        queueItemId: item.id,
        queueItem: item
      }
      res.status(201).json(success(response))
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      service.delete(req.params.id)
      res.json(success({ deleted: true, queueItemId: req.params.id }))
    })
  )

  return router
}
