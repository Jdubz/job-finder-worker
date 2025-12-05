import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import {
  configEntrySchema,
  configListSchema,
  aiSettingsSchema,
  promptConfigSchema,
  personalInfoSchema,
  prefilterPolicySchema,
  matchPolicySchema,
  workerSettingsSchema,
  cronConfigSchema,
} from '@shared/types'
import { buildConfigRouter } from '../config.routes'
import { ConfigRepository } from '../config.repository'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/config', buildConfigRouter())
  return app
}

describe('config contract', () => {
  const app = createApp()
  const repo = new ConfigRepository()

  it('lists configs with shared schema', async () => {
    const res = await request(app).get('/config')
    expect(res.status).toBe(200)
    const parsed = configListSchema.safeParse(res.body.data)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })

  it('gets ai-settings config with shared schema', async () => {
    repo.upsert('ai-settings', {
      worker: {
        selected: { provider: 'openai', interface: 'api', model: 'gpt-4o' },
      },
      documentGenerator: {
        selected: { provider: 'openai', interface: 'api', model: 'gpt-4o' },
      },
      options: [
        {
          value: 'openai',
          interfaces: [{ value: 'api', models: ['gpt-4o'], enabled: true }],
        },
      ],
    })
    const res = await request(app).get('/config/ai-settings')
    expect(res.status).toBe(200)
    const parsed = configEntrySchema.safeParse(res.body.data.config)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)

    const payloadParse = aiSettingsSchema.safeParse(parsed.data.payload)
    if (!payloadParse.success) {
      console.error(payloadParse.error.format())
    }
    expect(payloadParse.success).toBe(true)
  })

  it('validates other config payloads against shared schemas', async () => {
    repo.upsert('ai-prompts', {
      resumeGeneration: 'a',
      coverLetterGeneration: 'b',
      jobScraping: 'c',
      jobMatching: 'd',
    })
    repo.upsert('personal-info', { name: 'Test User' })
    repo.upsert('prefilter-policy', { title: {}, freshness: {}, workArrangement: {}, employmentType: {}, salary: {}, technology: {} })
    repo.upsert('match-policy', { minScore: 50, weights: { skillMatch: 1, experienceMatch: 1, seniorityMatch: 1 }, seniority: {}, location: {}, technology: {}, salary: {}, experience: {}, freshness: {}, roleFit: {}, company: {} })
    repo.upsert('worker-settings', { scraping: {}, textLimits: {}, runtime: {} })
    repo.upsert('cron-config', { jobs: { scrape: { enabled: true, hours: [0] }, maintenance: { enabled: true, hours: [1] }, logrotate: { enabled: true, hours: [2] } } })

    const fetchAndValidate = async (id: string, schema: any) => {
      const res = await request(app).get(`/config/${id}`)
      expect(res.status).toBe(200)
      const parsed = configEntrySchema.safeParse(res.body.data.config)
      expect(parsed.success).toBe(true)
      const payloadParse = schema.safeParse(parsed.data.payload)
      if (!payloadParse.success) {
        console.error(payloadParse.error.format())
      }
      expect(payloadParse.success).toBe(true)
    }

    await fetchAndValidate('ai-prompts', promptConfigSchema)
    await fetchAndValidate('personal-info', personalInfoSchema)
    await fetchAndValidate('prefilter-policy', prefilterPolicySchema)
    await fetchAndValidate('match-policy', matchPolicySchema)
    await fetchAndValidate('worker-settings', workerSettingsSchema)
    await fetchAndValidate('cron-config', cronConfigSchema)
  })
})
