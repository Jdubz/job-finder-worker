import { Router } from 'express'
import { z } from 'zod'
import type {
  ListGeneratorDocumentsResponse,
  GetGeneratorDocumentResponse,
  UpsertGeneratorDocumentRequest,
  UpsertGeneratorDocumentResponse
} from '@shared/types'
import { ApiErrorCode } from '@shared/types'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { GeneratorRepository } from './generator.repository'

const upsertSchema = z.object({
  id: z.string(),
  documentType: z.string(),
  payload: z.record(z.unknown())
})

export function buildGeneratorRouter() {
  const router = Router()
  const repo = new GeneratorRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const items = repo.list(typeof req.query.type === 'string' ? req.query.type : undefined)
      const response: ListGeneratorDocumentsResponse = { documents: items, count: items.length }
      res.json(success(response))
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const doc = repo.get(req.params.id)
      if (!doc) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Generator document not found'))
        return
      }
      const response: GetGeneratorDocumentResponse = { document: doc }
      res.json(success(response))
    })
  )

  router.put(
    '/:id',
    asyncHandler((req, res) => {
      const payload = upsertSchema.parse({ ...req.body, id: req.params.id }) as UpsertGeneratorDocumentRequest
      const doc = repo.save(payload.id, payload.documentType, payload.payload)
      const response: UpsertGeneratorDocumentResponse = { document: doc }
      res.json(success(response))
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      repo.delete(req.params.id)
      res.json(success({ deleted: true, documentId: req.params.id }))
    })
  )

  return router
}
