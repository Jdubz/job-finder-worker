import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApplicatorRouter } from '../applicator.routes'
import { type AuthenticatedRequest } from '../../middleware/firebase-auth'
import { getDb } from '../../db/sqlite'
import { ConfigRepository } from '../../modules/config/config.repository'
import { ContentItemRepository } from '../../modules/content-items/content-item.repository'
import type { PersonalInfo, GetApplicatorProfileResponse, ApiSuccessResponse } from '@shared/types'

const app = express()
app.use(express.json())

// Simulate authenticated user
app.use((req, _res, next) => {
  ;(req as AuthenticatedRequest).user = {
    uid: 'test-user',
    email: 'test@example.com',
    name: 'Test User',
    roles: ['viewer']
  }
  next()
})

app.use('/applicator', buildApplicatorRouter())

describe('applicator routes', () => {
  let configRepo: ConfigRepository
  let contentRepo: ContentItemRepository

  beforeEach(() => {
    const db = getDb()
    db.prepare('DELETE FROM job_finder_config').run()
    db.prepare('DELETE FROM content_items').run()

    configRepo = new ConfigRepository()
    contentRepo = new ContentItemRepository()
  })

  it('returns response matching GetApplicatorProfileResponse contract', async () => {
    // Setup minimal personal info
    const personalInfo: PersonalInfo = {
      name: 'Contract Test User',
      email: 'contract@test.com'
    }
    configRepo.upsert('personal-info', personalInfo)

    const response = await request(app).get('/applicator/profile').expect(200)

    // Type assertion to validate against shared API contract
    const body = response.body as ApiSuccessResponse<GetApplicatorProfileResponse>

    // Verify API wrapper structure (ApiSuccessResponse)
    expect(body.success).toBe(true)
    expect(body).toHaveProperty('data')

    // Verify GetApplicatorProfileResponse structure
    expect(body.data).toHaveProperty('profileText')
    expect(typeof body.data.profileText).toBe('string')

    // Ensure no unexpected properties in the response data
    const dataKeys = Object.keys(body.data)
    expect(dataKeys).toEqual(['profileText'])
  })

  it('returns formatted profile text with personal info', async () => {
    // Setup personal info
    const personalInfo: PersonalInfo = {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-0123',
      location: 'Portland, OR',
      website: 'https://johndoe.com',
      github: 'https://github.com/johndoe',
      linkedin: 'https://linkedin.com/in/johndoe',
      summary: 'Senior Backend Engineer with 8+ years of experience'
    }

    configRepo.upsert('personal-info', personalInfo)

    const response = await request(app).get('/applicator/profile').expect(200)

    // Type-safe access via shared types
    const body = response.body as ApiSuccessResponse<GetApplicatorProfileResponse>
    expect(body.success).toBe(true)

    const { profileText } = body.data

    // Verify personal info section
    expect(profileText).toContain('# Personal Information')
    expect(profileText).toContain('Name: John Doe')
    expect(profileText).toContain('Email: john@example.com')
    expect(profileText).toContain('Phone: 555-0123')
    expect(profileText).toContain('Location: Portland, OR')
    expect(profileText).toContain('Website: https://johndoe.com')
    expect(profileText).toContain('GitHub: https://github.com/johndoe')
    expect(profileText).toContain('LinkedIn: https://linkedin.com/in/johndoe')
    expect(profileText).toContain('Summary:\nSenior Backend Engineer')
  })

  it('includes EEO information when provided', async () => {
    const personalInfo: PersonalInfo = {
      name: 'Jane Smith',
      email: 'jane@example.com',
      eeo: {
        gender: 'female',
        race: 'asian',
        hispanicLatino: 'no',
        veteranStatus: 'not_protected_veteran',
        disabilityStatus: 'no'
      }
    }

    configRepo.upsert('personal-info', personalInfo)

    const response = await request(app).get('/applicator/profile').expect(200)
    const profileText = response.body.data.profileText as string

    expect(profileText).toContain('# EEO Information')
    expect(profileText).toContain('Gender: female')
    expect(profileText).toContain('Race: Asian')
    expect(profileText).toContain('Hispanic/Latino: no')
    expect(profileText).toContain('Veteran Status: Not Protected Veteran')
    expect(profileText).toContain('Disability Status: no')
  })

  it('excludes EEO fields marked as decline_to_identify', async () => {
    const personalInfo: PersonalInfo = {
      name: 'Test User',
      email: 'test@example.com',
      eeo: {
        gender: 'decline_to_identify',
        race: 'asian',
        hispanicLatino: 'decline_to_identify',
        veteranStatus: 'decline_to_identify',
        disabilityStatus: 'no'
      }
    }

    configRepo.upsert('personal-info', personalInfo)

    const response = await request(app).get('/applicator/profile').expect(200)
    const profileText = response.body.data.profileText as string

    // Should only include non-declined fields
    expect(profileText).not.toContain('Gender:')
    expect(profileText).toContain('Race: Asian')
    expect(profileText).not.toContain('Hispanic/Latino:')
    expect(profileText).not.toContain('Veteran Status:')
    expect(profileText).toContain('Disability Status: no')
  })

  it('formats work history with company, role, and highlights', async () => {
    const personalInfo: PersonalInfo = {
      name: 'Engineer',
      email: 'eng@example.com'
    }
    configRepo.upsert('personal-info', personalInfo)

    // Create work item
    const company = contentRepo.create({
      userEmail: 'test@example.com',
      title: 'Acme Corp',
      role: 'Senior Backend Engineer',
      location: 'Portland, OR',
      startDate: '2022-01',
      endDate: null,
      description: 'Lead backend development for high-traffic SaaS platform',
      skills: ['Node.js', 'TypeScript', 'PostgreSQL', 'Redis'],
      aiContext: 'work'
    })

    // Add highlights
    contentRepo.create({
      userEmail: 'test@example.com',
      parentId: company.id,
      description: 'Architected microservices migration reducing API latency by 40%',
      aiContext: 'highlight',
      order: 0
    })

    contentRepo.create({
      userEmail: 'test@example.com',
      parentId: company.id,
      description: 'Implemented event-driven architecture with Kafka',
      aiContext: 'highlight',
      order: 1
    })

    const response = await request(app).get('/applicator/profile').expect(200)
    const profileText = response.body.data.profileText as string

    expect(profileText).toContain('# Work Experience')
    expect(profileText).toContain('## Acme Corp - Senior Backend Engineer')
    expect(profileText).toContain('2022-01 - Present')
    expect(profileText).toContain('Portland, OR')
    expect(profileText).toContain('Lead backend development')
    expect(profileText).toContain('Skills: Node.js, TypeScript, PostgreSQL, Redis')
    expect(profileText).toContain('Highlights:')
    expect(profileText).toContain('- Architected microservices migration')
    expect(profileText).toContain('- Implemented event-driven architecture')
  })

  it('formats education history', async () => {
    const personalInfo: PersonalInfo = {
      name: 'Student',
      email: 'student@example.com'
    }
    configRepo.upsert('personal-info', personalInfo)

    contentRepo.create({
      userEmail: 'test@example.com',
      title: 'University of Technology',
      role: 'B.S. Computer Science',
      startDate: '2015-09',
      endDate: '2019-05',
      description: 'Focus on distributed systems and databases',
      aiContext: 'education'
    })

    const response = await request(app).get('/applicator/profile').expect(200)
    const profileText = response.body.data.profileText as string

    expect(profileText).toContain('# Education')
    expect(profileText).toContain('University of Technology - B.S. Computer Science')
    expect(profileText).toContain('2015-09 - 2019-05')
    expect(profileText).toContain('Focus on distributed systems')
  })

  it('aggregates skills from all content items', async () => {
    const personalInfo: PersonalInfo = {
      name: 'Engineer',
      email: 'eng@example.com'
    }
    configRepo.upsert('personal-info', personalInfo)

    // Create multiple work items with different skills
    contentRepo.create({
      userEmail: 'test@example.com',
      title: 'Company A',
      skills: ['Node.js', 'TypeScript', 'PostgreSQL'],
      aiContext: 'work'
    })

    contentRepo.create({
      userEmail: 'test@example.com',
      title: 'Company B',
      skills: ['Python', 'Django', 'PostgreSQL', 'Redis'],
      aiContext: 'work'
    })

    const response = await request(app).get('/applicator/profile').expect(200)
    const profileText = response.body.data.profileText as string

    expect(profileText).toContain('# Skills')
    // Skills should be deduplicated and sorted
    expect(profileText).toContain('Django')
    expect(profileText).toContain('Node.js')
    expect(profileText).toContain('PostgreSQL')
    expect(profileText).toContain('Python')
    expect(profileText).toContain('Redis')
    expect(profileText).toContain('TypeScript')

    // PostgreSQL should appear only once despite being in both work items
    const skillsSection = profileText.split('# Skills')[1]
    const postgresqlCount = (skillsSection.match(/PostgreSQL/g) || []).length
    expect(postgresqlCount).toBe(1)
  })

  it('sorts work history by start date descending (most recent first)', async () => {
    const personalInfo: PersonalInfo = {
      name: 'Engineer',
      email: 'eng@example.com'
    }
    configRepo.upsert('personal-info', personalInfo)

    contentRepo.create({
      userEmail: 'test@example.com',
      title: 'Old Company',
      startDate: '2018-01',
      endDate: '2020-12',
      aiContext: 'work'
    })

    contentRepo.create({
      userEmail: 'test@example.com',
      title: 'Recent Company',
      startDate: '2022-01',
      endDate: null,
      aiContext: 'work'
    })

    contentRepo.create({
      userEmail: 'test@example.com',
      title: 'Middle Company',
      startDate: '2021-01',
      endDate: '2021-12',
      aiContext: 'work'
    })

    const response = await request(app).get('/applicator/profile').expect(200)
    const profileText = response.body.data.profileText as string

    // Extract work experience section
    const workSection = profileText.split('# Work Experience')[1]?.split('---')[0] || ''

    // Recent Company should appear first
    const recentIdx = workSection.indexOf('Recent Company')
    const middleIdx = workSection.indexOf('Middle Company')
    const oldIdx = workSection.indexOf('Old Company')

    expect(recentIdx).toBeLessThan(middleIdx)
    expect(middleIdx).toBeLessThan(oldIdx)
  })

  it('handles empty profile gracefully', async () => {
    // No personal info, no content items

    const response = await request(app).get('/applicator/profile').expect(200)

    expect(response.body.success).toBe(true)
    // When there's no data, profileText is an empty string
    expect(response.body.data.profileText).toBeDefined()
    expect(typeof response.body.data.profileText).toBe('string')
  })

  it('includes section separators for readability', async () => {
    const personalInfo: PersonalInfo = {
      name: 'Test User',
      email: 'test@example.com'
    }
    configRepo.upsert('personal-info', personalInfo)

    contentRepo.create({
      userEmail: 'test@example.com',
      title: 'Company',
      aiContext: 'work'
    })

    const response = await request(app).get('/applicator/profile').expect(200)
    const profileText = response.body.data.profileText as string

    // Sections should be separated by ---
    expect(profileText).toMatch(/---/)
  })
})
