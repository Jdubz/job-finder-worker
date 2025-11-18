import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../../utils/async-handler'
import { ContactRepository } from './contact.repository'

const statusSchema = z.object({ status: z.enum(['new', 'read', 'replied', 'spam']) })

export function buildContactRouter() {
  const router = Router()
  const repo = new ContactRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const limit = req.query.limit ? Number(req.query.limit) : 50
      const submissions = repo.list(isNaN(limit) ? 50 : limit)
      res.json({ submissions, count: submissions.length })
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const submission = repo.getById(req.params.id)
      if (!submission) {
        res.status(404).json({ message: 'Submission not found' })
        return
      }
      res.json({ submission })
    })
  )

  router.patch(
    '/:id/status',
    asyncHandler((req, res) => {
      const body = statusSchema.parse(req.body)
      const submission = repo.updateStatus(req.params.id, body.status)
      res.json({ submission })
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
