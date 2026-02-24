import { Router } from 'express'
import { z, ZodError } from 'zod'
import { asyncHandler } from '../../utils/async-handler'
import { success, failure } from '../../utils/api-response'
import {
  ApiErrorCode,
  resumeContentSchema,
  coverLetterContentSchema,
  reviewDocumentTypeSchema
} from '@shared/types'
import { GeneratorWorkflowService } from './workflow/generator.workflow.service'
import { GeneratorWorkflowRepository, type GeneratorRequestRecord } from './generator.workflow.repository'

// Shared schema for generator endpoints
const generatorRequestSchema = z.object({
  generateType: z.enum(['resume', 'coverLetter', 'both']),
  job: z.object({
    role: z.string().min(1),
    company: z.string().min(1),
    companyWebsite: z.string().url().nullish().transform(v => v ?? undefined),
    jobDescriptionUrl: z.string().url().nullish().transform(v => v ?? undefined),
    jobDescriptionText: z.string().nullish().transform(v => v ?? undefined),
    location: z.string().nullish().transform(v => v ?? undefined)
  }),
  preferences: z
    .object({
      style: z.enum(['modern', 'traditional', 'technical', 'executive']).optional(),
      emphasize: z.array(z.string()).optional()
    })
    .nullish()
    .transform(v => v ?? undefined),
  date: z.string().nullish().transform(v => v ?? undefined),
  jobMatchId: z.string().nullish().transform(v => v ?? undefined)
})

// Singleton service instance so generation uses shared dependencies
let serviceInstance: GeneratorWorkflowService | null = null

// Test hook: allow unit tests to inject/reset the service singleton
export function _setGeneratorWorkflowServiceForTests(instance: GeneratorWorkflowService | null) {
  serviceInstance = instance
}

function getService(): GeneratorWorkflowService {
  if (!serviceInstance) {
    serviceInstance = new GeneratorWorkflowService()
  }
  return serviceInstance
}

export function buildGeneratorWorkflowRouter() {
  const router = Router()
  const service = getService()
  const repo = new GeneratorWorkflowRepository()

  const attachArtifacts = (requests: GeneratorRequestRecord[]) =>
    requests.map((request) => ({
      ...request,
      artifacts: repo.listArtifacts(request.id)
    }))

  router.get(
    '/requests',
    asyncHandler((req, res) => {
      const jobMatchId = typeof req.query.jobMatchId === 'string' ? req.query.jobMatchId : undefined
      const documents = attachArtifacts(repo.listRequests(50, jobMatchId))
      res.json(
        success({
          requests: documents,
          count: documents.length
        })
      )
    })
  )

  router.post(
    '/start',
    asyncHandler(async (req, res) => {
      const payload = generatorRequestSchema.parse(req.body ?? {})

      try {
        const { requestId, steps } = await service.createRequest(payload)

        // Execute the first step synchronously
        const stepResult = await service.runNextStep(requestId, payload)
        if (!stepResult) {
          res.status(500).json(failure(ApiErrorCode.INTERNAL_ERROR, 'Failed to execute first step'))
          return
        }

        res.json(
          success({
            requestId,
            status: stepResult.status,
            steps: stepResult.steps,
            nextStep: stepResult.nextStep,
            stepCompleted: steps[0]?.id, // First step that was completed
            resumeUrl: stepResult.resumeUrl,
            coverLetterUrl: stepResult.coverLetterUrl
          })
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Generation failed'
        // Check for user-facing errors vs internal errors
        if (err instanceof Error && err.name === 'UserFacingError') {
          res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, message))
          return
        }
        res.status(500).json(failure(ApiErrorCode.GENERATION_FAILED, message))
      }
    })
  )

  router.post(
    '/step/:id',
    asyncHandler(async (req, res) => {
      const requestId = req.params.id
      const stepResult = await service.runNextStep(requestId)
      if (!stepResult) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Generator request not found or already completed'))
        return
      }
      res.json(success(stepResult))
    })
  )

  router.get(
    '/job-matches/:id/documents',
    asyncHandler((req, res) => {
      const jobMatchId = req.params.id
      const documents = attachArtifacts(repo.listRequests(50, jobMatchId))
      res.json(success({ requests: documents, count: documents.length }))
    })
  )

  // Get draft content for review
  router.get(
    '/requests/:id/draft',
    asyncHandler((req, res) => {
      const requestId = req.params.id
      const draft = service.getDraftContent(requestId)
      if (!draft) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'No draft content awaiting review'))
        return
      }
      res.json(success(draft))
    })
  )

  // Submit reviewed/edited content - uses shared schemas from @shared/types
  router.post(
    '/requests/:id/submit-review',
    asyncHandler(async (req, res) => {
      const requestId = req.params.id
      const body = req.body ?? {}

      // Validate document type and content using shared schemas
      let documentType: 'resume' | 'coverLetter'
      let content: z.infer<typeof resumeContentSchema> | z.infer<typeof coverLetterContentSchema>

      try {
        documentType = reviewDocumentTypeSchema.parse(body.documentType)
        content = documentType === 'resume'
          ? resumeContentSchema.parse(body.content)
          : coverLetterContentSchema.parse(body.content)
      } catch (err) {
        if (err instanceof ZodError) {
          const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
          res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, `Validation error: ${message}`))
          return
        }
        throw err
      }

      const stepResult = await service.submitReview(requestId, documentType, content)
      if (!stepResult) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Request not found or not awaiting review'))
        return
      }

      res.json(
        success({
          nextStep: stepResult.nextStep,
          status: stepResult.status,
          steps: stepResult.steps,
          resumeUrl: stepResult.resumeUrl,
          coverLetterUrl: stepResult.coverLetterUrl
        })
      )
    })
  )

  // Reject review with feedback — AI regenerates the document
  router.post(
    '/requests/:id/reject-review',
    asyncHandler(async (req, res) => {
      const requestId = req.params.id
      const body = req.body ?? {}

      // Validate document type
      let documentType: 'resume' | 'coverLetter'
      try {
        documentType = reviewDocumentTypeSchema.parse(body.documentType)
      } catch (err) {
        if (err instanceof ZodError) {
          const message = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
          res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, `Validation error: ${message}`))
          return
        }
        throw err
      }

      const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : ''
      if (!feedback) {
        res.status(400).json(failure(ApiErrorCode.INVALID_REQUEST, 'Feedback is required'))
        return
      }

      const result = await service.rejectReview(requestId, documentType, feedback)
      if (!result) {
        res.status(404).json(failure(ApiErrorCode.NOT_FOUND, 'Request not found or not awaiting review'))
        return
      }

      res.json(success({ content: result.content }))
    })
  )

  return router
}
