import express from 'express'
import request from 'supertest'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import {
  draftContentResponseSchema,
  submitReviewResponseSchema,
  resumeContentSchema,
  coverLetterContentSchema
} from '@shared/types'
import { buildGeneratorWorkflowRouter, _setGeneratorWorkflowServiceForTests } from '../generator.workflow.routes'
import type { ResumeContent, CoverLetterContent, DraftContentResponse } from '@shared/types'

const mockResumeContent: ResumeContent = {
  personalInfo: {
    name: 'Test User',
    title: 'Software Engineer',
    summary: 'Experienced developer',
    contact: {
      email: 'test@example.com',
      location: 'San Francisco, CA'
    }
  },
  professionalSummary: 'Experienced software engineer with expertise in TypeScript and React.',
  experience: [
    {
      company: 'Acme Corp',
      role: 'Senior Engineer',
      startDate: '2020-01',
      endDate: null,
      highlights: ['Led team of 5 engineers', 'Improved performance by 40%']
    }
  ],
  skills: [{ category: 'Languages', items: ['TypeScript', 'JavaScript', 'Python'] }],
  education: [{ institution: 'MIT', degree: 'BS', field: 'Computer Science' }]
}

const mockCoverLetterContent: CoverLetterContent = {
  greeting: 'Dear Hiring Manager,',
  openingParagraph: 'I am excited to apply for the Software Engineer position.',
  bodyParagraphs: [
    'I have extensive experience in building scalable applications.',
    'My background aligns well with your team\'s needs.'
  ],
  closingParagraph: 'I look forward to discussing how I can contribute to your team.',
  signature: 'Best regards,\nTest User'
}

class MockService {
  private draftContent: DraftContentResponse | null = null

  setDraftContent(content: DraftContentResponse | null) {
    this.draftContent = content
  }

  getDraftContent(_requestId: string): DraftContentResponse | null {
    return this.draftContent
  }

  async submitReview(
    _requestId: string,
    _documentType: 'resume' | 'coverLetter',
    _content: ResumeContent | CoverLetterContent
  ) {
    return {
      nextStep: 'render-pdf',
      status: 'processing' as const,
      steps: [
        { id: 'review-resume', name: 'Review Resume', description: 'Review content', status: 'completed' as const },
        { id: 'render-pdf', name: 'Render PDF', description: 'Create PDF', status: 'pending' as const }
      ],
      resumeUrl: null,
      coverLetterUrl: null
    }
  }
}

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/generator', buildGeneratorWorkflowRouter())
  return app
}

describe('generator review contract', () => {
  let app: express.Express
  let mockService: MockService

  beforeAll(() => {
    mockService = new MockService()
    _setGeneratorWorkflowServiceForTests(mockService as any)
    app = createApp()
  })

  afterAll(() => {
    _setGeneratorWorkflowServiceForTests(null as any)
  })

  describe('GET /generator/requests/:id/draft', () => {
    it('responds with shared schema for resume draft', async () => {
      mockService.setDraftContent({
        requestId: 'req-123',
        documentType: 'resume',
        content: mockResumeContent,
        status: 'awaiting_review'
      })

      const res = await request(app).get('/generator/requests/req-123/draft')

      expect(res.status).toBe(200)
      const parsed = draftContentResponseSchema.safeParse(res.body.data)
      if (!parsed.success) {
        console.error('Draft response validation failed:', parsed.error.format())
      }
      expect(parsed.success).toBe(true)
      expect(parsed.data?.documentType).toBe('resume')
    })

    it('responds with shared schema for cover letter draft', async () => {
      mockService.setDraftContent({
        requestId: 'req-456',
        documentType: 'coverLetter',
        content: mockCoverLetterContent,
        status: 'awaiting_review'
      })

      const res = await request(app).get('/generator/requests/req-456/draft')

      expect(res.status).toBe(200)
      const parsed = draftContentResponseSchema.safeParse(res.body.data)
      if (!parsed.success) {
        console.error('Draft response validation failed:', parsed.error.format())
      }
      expect(parsed.success).toBe(true)
      expect(parsed.data?.documentType).toBe('coverLetter')
    })

    it('returns 404 when no draft is available', async () => {
      mockService.setDraftContent(null)

      const res = await request(app).get('/generator/requests/non-existent/draft')

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('resume content matches shared resumeContentSchema', async () => {
      mockService.setDraftContent({
        requestId: 'req-789',
        documentType: 'resume',
        content: mockResumeContent,
        status: 'awaiting_review'
      })

      const res = await request(app).get('/generator/requests/req-789/draft')

      expect(res.status).toBe(200)
      const contentParsed = resumeContentSchema.safeParse(res.body.data.content)
      if (!contentParsed.success) {
        console.error('Resume content validation failed:', contentParsed.error.format())
      }
      expect(contentParsed.success).toBe(true)
    })

    it('cover letter content matches shared coverLetterContentSchema', async () => {
      mockService.setDraftContent({
        requestId: 'req-abc',
        documentType: 'coverLetter',
        content: mockCoverLetterContent,
        status: 'awaiting_review'
      })

      const res = await request(app).get('/generator/requests/req-abc/draft')

      expect(res.status).toBe(200)
      const contentParsed = coverLetterContentSchema.safeParse(res.body.data.content)
      if (!contentParsed.success) {
        console.error('Cover letter content validation failed:', contentParsed.error.format())
      }
      expect(contentParsed.success).toBe(true)
    })
  })

  describe('POST /generator/requests/:id/submit-review', () => {
    it('responds with shared schema for submit-review response', async () => {
      const res = await request(app)
        .post('/generator/requests/req-123/submit-review')
        .send({
          documentType: 'resume',
          content: mockResumeContent
        })

      expect(res.status).toBe(200)
      const parsed = submitReviewResponseSchema.safeParse(res.body.data)
      if (!parsed.success) {
        console.error('Submit review response validation failed:', parsed.error.format())
      }
      expect(parsed.success).toBe(true)
    })

    it('accepts and validates resume content', async () => {
      const res = await request(app)
        .post('/generator/requests/req-123/submit-review')
        .send({
          documentType: 'resume',
          content: mockResumeContent
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('accepts and validates cover letter content', async () => {
      const res = await request(app)
        .post('/generator/requests/req-456/submit-review')
        .send({
          documentType: 'coverLetter',
          content: mockCoverLetterContent
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('rejects invalid document type', async () => {
      const res = await request(app)
        .post('/generator/requests/req-123/submit-review')
        .send({
          documentType: 'invalid',
          content: mockResumeContent
        })

      expect(res.status).toBe(400)
    })

    it('rejects malformed resume content', async () => {
      const res = await request(app)
        .post('/generator/requests/req-123/submit-review')
        .send({
          documentType: 'resume',
          content: { invalid: 'content' }
        })

      expect(res.status).toBe(400)
    })

    it('rejects malformed cover letter content', async () => {
      const res = await request(app)
        .post('/generator/requests/req-123/submit-review')
        .send({
          documentType: 'coverLetter',
          content: { greeting: 'Hello' } // missing required fields
        })

      expect(res.status).toBe(400)
    })

    it('rejects missing content field', async () => {
      const res = await request(app)
        .post('/generator/requests/req-123/submit-review')
        .send({
          documentType: 'resume'
          // content is missing
        })

      expect(res.status).toBe(400)
    })

    it('rejects missing document type', async () => {
      const res = await request(app)
        .post('/generator/requests/req-123/submit-review')
        .send({
          content: mockResumeContent
          // documentType is missing
        })

      expect(res.status).toBe(400)
    })
  })
})
