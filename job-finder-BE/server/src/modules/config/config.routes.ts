import { Router } from 'express'
import { z } from 'zod'
import type {
  ListConfigEntriesResponse,
  GetConfigEntryResponse,
  UpsertConfigEntryResponse
} from '@shared/types'
import { ApiErrorCode } from '@shared/types'
import { ConfigRepository } from './config.repository'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'

const updateSchema = z.object({
  payload: z.record(z.unknown())
})

export function buildConfigRouter() {
  const router = Router()
  const repo = new ConfigRepository()

  router.get(
    '/',
    asyncHandler((_req, res) => {
      const response: ListConfigEntriesResponse = { configs: repo.list() }
      res.json(success(response))
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const entry = repo.get(req.params.id)
      if (!entry) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Config not found'))
        return
      }
      const response: GetConfigEntryResponse = { config: entry }
      res.json(success(response))
    })
  )

  router.put(
    '/:id',
    asyncHandler((req, res) => {
      const body = updateSchema.parse(req.body)
      const entry = repo.upsert(req.params.id, body.payload)
      const response: UpsertConfigEntryResponse = { config: entry }
      res.json(success(response))
    })
  )

  return router
}
