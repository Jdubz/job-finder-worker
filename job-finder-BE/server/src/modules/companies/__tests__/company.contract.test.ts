import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { companySchema } from '@shared/types'
import { buildCompanyRouter } from '../company.routes'
import { CompanyRepository } from '../company.repository'
import { getDb } from '../../../db/sqlite'

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use('/companies', buildCompanyRouter())
  return app
}

describe('company contract', () => {
  const db = getDb()
  const repo = new CompanyRepository()
  const app = createApp()

  beforeEach(() => {
    db.prepare('DELETE FROM companies').run()
  })

  it('serializes list responses according to shared schema', async () => {
    repo.create({
      id: 'company-contract-1',
      name: 'Contract Co',
      website: 'https://contract.co',
      about: null,
      culture: null,
      mission: null,
      industry: 'tech',
      headquartersLocation: null,
      companySizeCategory: 'small',
      techStack: ['typescript'],
      // timestamps set by repository
    })

    const res = await request(app).get('/companies')
    expect(res.status).toBe(200)
    const parsed = companySchema.array().safeParse(res.body.data.items)
    if (!parsed.success) {
      console.error(parsed.error.format())
    }
    expect(parsed.success).toBe(true)
  })
})
