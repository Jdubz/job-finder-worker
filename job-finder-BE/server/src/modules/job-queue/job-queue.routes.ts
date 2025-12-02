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
  SubmitSourceDiscoveryRequest,
  SubmitSourceDiscoveryResponse,
  GetQueueStatsResponse,
  GetQueueItemResponse,
  ListQueueItemsResponse,
  UpdateJobStatusResponse
} from '@shared/types'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { JobQueueService } from './job-queue.service'
import {
  broadcastQueueEvent,
  handleQueueEventsSse,
  sendCommandToWorker
} from './queue-events'
import { requireRole } from '../../middleware/firebase-auth'

const queueStatuses = [
  'pending',
  'processing',
  'success',
  'failed',
  'skipped',
  'filtered'
] as const
const queueSources = [
  'user_submission',
  'automated_scan',
  'scraper',
  'webhook',
  'email',
  'manual_submission',
  'user_request'
] as const
const queueItemTypes = [
  'job',
  'company',
  'scrape',
  'source_discovery',
  'scrape_source'
] as const

const submitJobSchema = z.object({
  url: z.string().url(),
  companyName: z.string().optional(),
  companyId: z.string().nullable().optional(),
  companyUrl: z.string().url().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  techStack: z.string().optional(),
  bypassFilter: z.boolean().optional(),
  generationId: z.string().optional(),
  source: z.enum(queueSources).optional(),
  metadata: z.record(z.unknown()).optional()
})

const submitCompanySchema = z.object({
  companyName: z.string().min(1),
  websiteUrl: z.string().url().optional(),
  companyId: z.string().nullable().optional(),
  source: z.enum(queueSources).optional()
})

const scrapeConfigSchema = z
  .object({
    target_matches: z.number().int().nonnegative().nullable().optional(),
    max_sources: z.number().int().nonnegative().nullable().optional(),
    source_ids: z.array(z.string()).optional()
  })
  .strict()

const submitScrapeSchema = z.object({
  scrapeConfig: scrapeConfigSchema.optional(),
  scrape_config: scrapeConfigSchema.optional()
})

const sourceTypeHints = ['auto', 'greenhouse', 'ashby', 'workday', 'rss', 'generic'] as const

const submitSourceDiscoverySchema = z.object({
  url: z.string().url(),
  companyName: z.string().optional(),
  companyId: z.string().nullable().optional(),
  typeHint: z.enum(sourceTypeHints).optional()
})

const listQueueSchema = z.object({
  status: z.union([z.enum(queueStatuses), z.array(z.enum(queueStatuses))]).optional(),
  type: z.enum(queueItemTypes).optional(),
  source: z.enum(queueSources).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
})

const updateQueueItemSchema = z
  .object({
    status: z.enum(queueStatuses).optional(),
    result_message: z.string().optional(),
    error_details: z.string().optional(),
    processed_at: z.union([z.string().datetime(), z.coerce.date()]).optional(),
    completed_at: z.union([z.string().datetime(), z.coerce.date()]).optional(),
    metadata: z.record(z.unknown()).optional(),
    pipeline_state: z.record(z.unknown()).optional()
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields provided for update' })

export function buildJobQueueRouter() {
  const router = Router()
  const service = new JobQueueService()

  router.get(
    '/events',
    asyncHandler((req, res) => {
      const items = service.list({ limit: 100, offset: 0 })
      handleQueueEventsSse(req, res, items)
    })
  )

  router.get(
    '/',
    asyncHandler((req, res) => {
      const query = listQueueSchema.parse(req.query)
      const items = service.list({
        status: query.status,
        type: query.type,
        source: query.source,
        limit: query.limit,
        offset: query.offset
      })

      const response: ListQueueItemsResponse = {
        items,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total: items.length,
          hasMore: items.length === query.limit
        }
      }

      res.json(success(response))
    })
  )

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
      broadcastQueueEvent('item.created', { queueItem: item })
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
      broadcastQueueEvent('item.created', { queueItem: item })
      res.status(201).json(success(response))
    })
  )

  router.post(
    '/scrape',
    requireRole('admin'),
    asyncHandler((req, res) => {
      const payload = submitScrapeSchema.parse(req.body)
      const input: SubmitScrapeRequest = {
        scrapeConfig: payload.scrapeConfig ?? payload.scrape_config
      }
      const item = service.submitScrape(input)
      const response: SubmitScrapeResponse = {
        status: 'success',
        message: 'Scrape submission queued',
        queueItemId: item.id,
        queueItem: item
      }
      broadcastQueueEvent('item.created', { queueItem: item })
      res.status(201).json(success(response))
    })
  )

  router.post(
    '/sources/discover',
    asyncHandler((req, res) => {
      const payload = submitSourceDiscoverySchema.parse(req.body) as SubmitSourceDiscoveryRequest
      const item = service.submitSourceDiscovery(payload)
      const response: SubmitSourceDiscoveryResponse = {
        status: 'success',
        message: 'Source discovery queued',
        queueItemId: item.id,
        queueItem: item
      }
      broadcastQueueEvent('item.created', { queueItem: item })
      res.status(201).json(success(response))
    })
  )

  router.patch(
    '/:id',
    asyncHandler((req, res) => {
      const payload = updateQueueItemSchema.parse(req.body)
      const normalized = {
        ...payload,
        processed_at:
          typeof payload.processed_at === 'string'
            ? new Date(payload.processed_at)
            : payload.processed_at,
        completed_at:
          typeof payload.completed_at === 'string'
            ? new Date(payload.completed_at)
            : payload.completed_at,
        updated_at: new Date()
      }
      try {
        const queueItem = service.update(req.params.id, normalized)
        const response: UpdateJobStatusResponse = {
          queueItem,
          message: 'Queue item updated'
        }
        broadcastQueueEvent('item.updated', { queueItem })
        if (payload.status === 'skipped' && payload.result_message?.toLowerCase().includes('cancel')) {
          sendCommandToWorker({ command: 'cancel', itemId: req.params.id, workerId: req.body.workerId ?? 'default', ts: new Date().toISOString() })
        }
        res.json(success(response))
      } catch (error) {
        res
          .status(400)
          .json(
            failure(
              ApiErrorCode.INVALID_REQUEST,
              error instanceof Error ? error.message : 'Invalid queue update'
            )
          )
      }
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      service.delete(req.params.id)
      broadcastQueueEvent('item.deleted', { queueItemId: req.params.id })
      res.json(success({ deleted: true, queueItemId: req.params.id }))
    })
  )

  // Note: Worker bridge routes (/worker/commands, /worker/events) are now in worker.routes.ts
  // and mounted separately with worker token auth instead of Google OAuth

  return router
}
