import { Router } from 'express'
import { z } from 'zod'
import { ConfigRepository } from './config.repository'
import { asyncHandler } from '../../utils/async-handler'

const updateSchema = z.object({ payload: z.record(z.unknown()) })

export function buildConfigRouter() {
  const router = Router()
  const repo = new ConfigRepository()

  router.get(
    '/',
    asyncHandler((_req, res) => {
      res.json({ configs: repo.list() })
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const entry = repo.get(req.params.id)
      if (!entry) {
        res.status(404).json({ message: 'Config not found' })
        return
      }
      res.json({ config: entry })
    })
  )

  router.put(
    '/:id',
    asyncHandler((req, res) => {
      const body = updateSchema.parse(req.body)
      const entry = repo.upsert(req.params.id, body.payload)
      res.json({ config: entry })
    })
  )

  return router
}
