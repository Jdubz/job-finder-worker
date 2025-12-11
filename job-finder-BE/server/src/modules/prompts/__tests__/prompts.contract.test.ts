import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { promptConfigSchema } from '@shared/types'
import { ConfigRepository } from '../../config/config.repository'
import { buildPromptsRouter } from '../prompts.routes'

const createApp = () => {
  const configRepo = new ConfigRepository()
  configRepo.upsert('ai-prompts', {
    resumeGeneration: 'resume template',
    coverLetterGeneration: 'cover letter template',
    jobScraping: 'job scraping template',
    jobMatching: 'job matching template',
  })

  const app = express()
  app.use(express.json())
  app.use('/prompts', buildPromptsRouter())
  return app
}

describe('prompts contract', () => {
  const app = createApp()

  it('serializes GET response according to shared schema', async () => {
    const res = await request(app).get('/prompts')
    expect(res.status).toBe(200)
    const parsed = promptConfigSchema.safeParse(res.body.data.prompts)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
