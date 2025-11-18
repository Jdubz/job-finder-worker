import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../utils/async-handler'
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
      res.json({ documents: items, count: items.length })
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const doc = repo.get(req.params.id)
      if (!doc) {
        res.status(404).json({ message: 'Generator document not found' })
        return
      }
      res.json({ document: doc })
    })
  )

  router.put(
    '/:id',
    asyncHandler((req, res) => {
      const payload = upsertSchema.parse({ ...req.body, id: req.params.id })
      const doc = repo.save(payload.id, payload.documentType, payload.payload)
      res.json({ document: doc })
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
