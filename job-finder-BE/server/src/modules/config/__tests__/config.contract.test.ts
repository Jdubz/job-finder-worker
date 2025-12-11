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
      agents: {
        'openai.api': {
          provider: 'openai',
          interface: 'api',
          defaultModel: 'gpt-4o',
          dailyBudget: 100,
          dailyUsage: 0,
          runtimeState: {
            worker: { enabled: true, reason: null },
            backend: { enabled: true, reason: null },
          },
          authRequirements: {
            type: 'api',
            requiredEnv: ['OPENAI_API_KEY'],
          },
        },
      },
      taskFallbacks: {
        extraction: ['openai.api'],
        analysis: ['openai.api'],
        document: ['openai.api'],
      },
      modelRates: { 'gpt-4o': 1 },
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
      expect(parsed.success).toBe(true)
      return
    }

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

    repo.upsert('personal-info', { name: 'Test User', email: 'user@example.com' })

    repo.upsert('prefilter-policy', {
      title: { requiredKeywords: ['engineer'], excludedKeywords: ['intern'] },
      freshness: { maxAgeDays: 30 },
      workArrangement: {
        allowRemote: true,
        allowHybrid: true,
        allowOnsite: false,
        willRelocate: false,
        userLocation: 'Portland, OR',
        maxTimezoneDiffHours: 4,
      },
      employmentType: { allowFullTime: true, allowPartTime: false, allowContract: true },
      salary: { minimum: 80000 },
    })

    repo.upsert('match-policy', {
      minScore: 60,
      seniority: {
        preferred: ['senior'],
        acceptable: ['mid'],
        rejected: ['junior'],
        preferredScore: 10,
        acceptableScore: 0,
        rejectedScore: -100,
      },
      location: {
        allowRemote: true,
        allowHybrid: true,
        allowOnsite: true,
        userTimezone: -8,
        maxTimezoneDiffHours: 4,
        perHourScore: -1,
        hybridSameCityScore: 5,
        userCity: 'Portland',
        remoteScore: 5,
        relocationScore: -50,
        unknownTimezoneScore: -5,
        relocationAllowed: false,
      },
      skillMatch: {
        baseMatchScore: 1,
        yearsMultiplier: 0.5,
        maxYearsBonus: 5,
        missingScore: -1,
        analogScore: 0,
        maxBonus: 25,
        maxPenalty: -15,
        missingIgnore: [],
      },
      skills: {
        bonusPerSkill: 2,
        maxSkillBonus: 15,
      },
      salary: {
        minimum: 90000,
        target: 150000,
        belowTargetScore: -2,
        belowTargetMaxPenalty: -20,
        missingSalaryScore: 0,
        meetsTargetScore: 0,
        equityScore: 0,
        contractScore: 0,
      },
      experience: {},
      freshness: {
        freshDays: 7,
        freshScore: 5,
        staleDays: 30,
        staleScore: -5,
        veryStaleDays: 60,
        veryStaleScore: -10,
        repostScore: -3,
      },
      roleFit: {
        preferred: ['backend'],
        acceptable: ['fullstack'],
        penalized: ['frontend'],
        rejected: ['management'],
        preferredScore: 5,
        penalizedScore: -5,
      },
      company: {
        preferredCityScore: 5,
        preferredCity: 'Portland',
        remoteFirstScore: 3,
        aiMlFocusScore: 2,
        largeCompanyScore: 1,
        smallCompanyScore: -1,
        largeCompanyThreshold: 1000,
        smallCompanyThreshold: 50,
        startupScore: 2,
      },
    })

    repo.upsert('worker-settings', {
      scraping: { requestTimeoutSeconds: 30, maxHtmlSampleLength: 20000 },
      textLimits: {
        minCompanyPageLength: 200,
        minSparseCompanyInfoLength: 100,
        maxIntakeTextLength: 500,
        maxIntakeDescriptionLength: 2000,
        maxIntakeFieldLength: 400,
        maxDescriptionPreviewLength: 500,
        maxCompanyInfoTextLength: 1000,
      },
      runtime: {
        processingTimeoutSeconds: 60,
        isProcessingEnabled: true,
        taskDelaySeconds: 1,
        pollIntervalSeconds: 5,
      },
    })

    repo.upsert('cron-config', {
      jobs: {
        scrape: { enabled: true, hours: [0], lastRun: null },
        maintenance: { enabled: true, hours: [1], lastRun: null },
        logrotate: { enabled: true, hours: [2], lastRun: null },
        agentReset: { enabled: true, hours: [3], lastRun: null },
      },
    })

    const fetchAndValidate = async (id: string, schema: any) => {
      const res = await request(app).get(`/config/${id}`)
      expect(res.status).toBe(200)
      const parsed = configEntrySchema.safeParse(res.body.data.config)
      if (!parsed.success) {
        console.error(parsed.error.format())
        expect(parsed.success).toBe(true)
        return
      }

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
