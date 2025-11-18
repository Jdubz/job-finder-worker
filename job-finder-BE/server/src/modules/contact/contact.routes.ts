import { Router } from 'express'
import { z } from 'zod'
import { ApiErrorCode } from '@shared/types'
import type {
  ListContactSubmissionsResponse,
  GetContactSubmissionResponse,
  UpdateContactSubmissionStatusResponse,
  DeleteContactSubmissionResponse
} from '@shared/types'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import { ContactRepository } from './contact.repository'

const statusSchema = z.object({
  status: z.enum(['new', 'read', 'replied', 'spam'])
})

const limitSchema = z.coerce.number().int().min(1).max(200).default(50)

export function buildContactRouter() {
  const router = Router()
  const repo = new ContactRepository()

  router.get(
    '/',
    asyncHandler((req, res) => {
      const limit = limitSchema.parse(req.query.limit)
      const submissions = repo.list(limit)
      const response: ListContactSubmissionsResponse = { submissions, count: submissions.length }
      res.json(success(response))
    })
  )

  router.get(
    '/:id',
    asyncHandler((req, res) => {
      const submission = repo.getById(req.params.id)
      if (!submission) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Submission not found'))
        return
      }
      const response: GetContactSubmissionResponse = { submission }
      res.json(success(response))
    })
  )

  router.patch(
    '/:id/status',
    asyncHandler((req, res) => {
      const body = statusSchema.parse(req.body)
      const submission = repo.updateStatus(req.params.id, body.status)
      const response: UpdateContactSubmissionStatusResponse = { submission }
      res.json(success(response))
    })
  )

  router.delete(
    '/:id',
    asyncHandler((req, res) => {
      repo.delete(req.params.id)
      const response: DeleteContactSubmissionResponse = { submissionId: req.params.id, deleted: true }
      res.json(success(response))
    })
  )

  return router
}
