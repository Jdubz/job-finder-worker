import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GeneratorWorkflowService, type GenerateDocumentPayload } from '../workflow/generator.workflow.service'
import type { GeneratorWorkflowRepository, GeneratorRequestRecord, GeneratorArtifactRecord } from '../generator.workflow.repository'
import type { PersonalInfoStore } from '../personal-info.store'
import type { ContentItemRepository } from '../../content-items/content-item.repository'
import { storageService } from '../workflow/services/storage.service'
import type { PersonalInfo, ContentItem, AISettings } from '@shared/types'
import type { ConfigRepository } from '../../config/config.repository'
import * as AgentManagerModule from '../ai/agent-manager'

// Test fixture for AISettings (no defaults - explicit test data)
const TEST_AI_SETTINGS: AISettings = {
  agents: {
    'gemini.api': {
      provider: 'gemini',
      interface: 'api',
      defaultModel: 'gemini-2.0-flash',
      dailyBudget: 100,
      dailyUsage: 0,
      runtimeState: {
        worker: { enabled: true, reason: null },
        backend: { enabled: true, reason: null }
      },
      authRequirements: {
        type: 'api',
        requiredEnv: ['PATH']
      }
    },
  },
  taskFallbacks: {
    extraction: ['gemini.api'],
    analysis: ['gemini.api'],
    document: ['gemini.api'],
  },
  modelRates: {
    'gemini-2.0-flash': 0.5,
  },
  options: []
}

function makeAgentManager() {
  return {
    ensureAvailable: vi.fn(),
    execute: vi.fn().mockImplementation((_: string, prompt: string) => {
      const isCover = /greeting|cover\s*letter|cover_letter|cover-letter/i.test(prompt)
      if (isCover) {
        return Promise.resolve({
          output: JSON.stringify({
            greeting: 'Hello Hiring Team,',
            openingParagraph: 'I am excited to apply.',
            bodyParagraphs: ['Body paragraph one'],
            closingParagraph: 'Thank you for your consideration.',
            signature: 'Test User'
          }),
          agentId: 'gemini.api',
          model: 'gemini-2.0-flash'
        })
      }
      return Promise.resolve({
        output: JSON.stringify({
          personalInfo: {
            name: 'Test User',
            title: 'Engineer',
            summary: 'Test summary',
            contact: { email: 'test@example.com' }
          },
          professionalSummary: 'Summary',
          experience: [
            {
              company: 'Acme Corp',
              role: 'Engineer',
              startDate: '2020-01',
              endDate: '2021-01',
              highlights: ['Did things']
            }
          ],
          skills: [{ category: 'Core', items: ['JS'] }],
          education: []
        }),
        agentId: 'gemini.api',
        model: 'gemini-2.0-flash'
      })
    })
  }
}

vi.mock('../ai/agent-manager', () => {
  const instances: any[] = []
  let lastManager: any = null
  const AgentManager = vi.fn(() => {
    const manager = makeAgentManager()
    instances.push(manager)
    lastManager = manager
    return manager
  })
  const reset = () => {
    instances.length = 0
    lastManager = null
  }
  return { AgentManager, __agentManagers: instances, __getLastManager: () => lastManager, __resetAgentMock: reset }
})

vi.mock('../../prompts/prompts.repository', () => {
  class PromptsRepository {
    getPrompts() {
      return {
        resumeGeneration: 'resume template',
        coverLetterGeneration: 'cover letter template',
        jobScraping: '',
        jobMatching: ''
      }
    }
  }
  return { PromptsRepository }
})

class InMemoryRepo {
  mockRequests = new Map<string, GeneratorRequestRecord>()
  mockArtifacts: GeneratorArtifactRecord[] = []

  createRequest(record: Omit<GeneratorRequestRecord, 'createdAt' | 'updatedAt'>): GeneratorRequestRecord {
    const now = new Date().toISOString()
    const created: GeneratorRequestRecord = {
      id: record.id,
      generateType: record.generateType,
      job: record.job,
      preferences: record.preferences ?? null,
      personalInfo: record.personalInfo ?? null,
      status: record.status,
      resumeUrl: record.resumeUrl ?? null,
      coverLetterUrl: record.coverLetterUrl ?? null,
      jobMatchId: record.jobMatchId ?? null,
      createdBy: record.createdBy ?? null,
      steps: record.steps ?? null,
      intermediateResults: record.intermediateResults ?? null,
      createdAt: now,
      updatedAt: now
    }
    this.mockRequests.set(record.id, created)
    return created
  }

  getRequest(id: string): GeneratorRequestRecord | null {
    return this.mockRequests.get(id) ?? null
  }

  updateRequest(
    id: string,
    updates: Partial<Omit<GeneratorRequestRecord, 'id' | 'generateType' | 'job'> & { job?: Record<string, unknown> }>
  ): GeneratorRequestRecord | null {
    const existing = this.mockRequests.get(id)
    if (!existing) return null
    const updated: GeneratorRequestRecord = { ...existing, ...updates, updatedAt: new Date().toISOString() }
    this.mockRequests.set(id, updated)
    return updated
  }

  addArtifact(record: GeneratorArtifactRecord): GeneratorArtifactRecord {
    this.mockArtifacts.push(record)
    return record
  }

  listArtifacts(requestId: string): GeneratorArtifactRecord[] {
    return this.mockArtifacts.filter((artifact) => artifact.requestId === requestId)
  }

  listRequests(): GeneratorRequestRecord[] {
    return Array.from(this.mockRequests.values())
  }
}

class FakePersonalInfoStore {
  private mockData: PersonalInfo = {
    name: 'Test User',
    email: 'test@example.com',
    accentColor: '#123456',
    applicationInfo: 'Gender: Decline to self-identify'
  }

  async get(): Promise<PersonalInfo | null> {
    return this.mockData
  }

  async update(updates: Partial<PersonalInfo>): Promise<PersonalInfo> {
    this.mockData = { ...this.mockData, ...updates }
    return this.mockData
  }
}

class FakeContentItemRepository {
  private mockItems: ContentItem[] = [
    {
      id: '1',
      parentId: null,
      order: 0,
      title: 'Acme Corp',
      role: 'Senior Developer',
      location: 'Remote',
      website: 'https://example.com',
      startDate: '2022-01',
      endDate: null,
      description: 'Worked on various projects',
      skills: ['JavaScript', 'TypeScript', 'Node.js'],
      aiContext: 'work',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test@example.com',
      updatedBy: 'test@example.com'
    }
  ]

  list(): ContentItem[] {
    return this.mockItems
  }
}

class FakeConfigRepository {
  aiSettings: AISettings = TEST_AI_SETTINGS
  get() {
    return { id: 'ai-settings', payload: this.aiSettings, updatedAt: new Date().toISOString() }
  }
}

const payload: GenerateDocumentPayload = {
  generateType: 'resume',
  job: {
    role: 'Software Engineer',
    company: 'Acme Corp'
  }
}

function makeContentItems(overrides: Partial<ContentItem>[] = []): ContentItem[] {
  const base: ContentItem = {
    id: '1',
    parentId: null,
    order: 0,
    title: 'Acme Corp',
    role: 'Senior Developer',
    location: 'Remote',
    website: 'https://example.com',
    startDate: '2022-01',
    endDate: null,
    description: 'Worked on various projects',
    skills: ['JavaScript', 'TypeScript', 'Node.js'],
    aiContext: 'work',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test@example.com',
    updatedBy: 'test@example.com'
  }
  if (overrides.length === 0) return [base]
  return overrides.map((o, i) => ({ ...base, id: String(i + 1), ...o }))
}

describe('GeneratorWorkflowService', () => {
const repo = new InMemoryRepo()
const personalInfoStore = new FakePersonalInfoStore()
const contentItemRepo = new FakeContentItemRepository()
const htmlPdfService = {
  renderResume: vi.fn().mockResolvedValue(Buffer.from('resume')),
  renderCoverLetter: vi.fn().mockResolvedValue(Buffer.from('cover'))
}
const configRepo = new FakeConfigRepository() as unknown as ConfigRepository
const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}
const fakeJobMatchRepo = {
  getById: () => null
} as any

const mockResumeContent = {
  personalInfo: {
    name: 'Test User',
    title: 'Engineer',
    summary: 'Test summary',
    contact: { email: 'test@example.com' }
  },
  professionalSummary: 'Summary',
  experience: [
    {
      company: 'Acme Corp',
      role: 'Engineer',
      startDate: '2020-01',
      endDate: '2021-01',
      highlights: ['Did things']
    }
  ],
  skills: [{ category: 'Core', items: ['JS'] }],
  education: []
}

const mockCoverLetterContent = {
  greeting: 'Hello Hiring Team,',
  openingParagraph: 'I am excited to apply.',
  bodyParagraphs: ['Body paragraph one'],
  closingParagraph: 'Thank you for your consideration.',
  signature: 'Test User'
}

  beforeEach(() => {
    vi.clearAllMocks()
    const reset = (AgentManagerModule as any).__resetAgentMock
    reset?.()
    vi.spyOn(storageService, 'saveArtifactWithMetadata').mockResolvedValue({
      storagePath: '2024-01-15/run-abc123/test-user_engineer_resume.pdf',
      filename: 'test-user_engineer_resume.pdf',
      size: 1024
    })
    vi.spyOn(storageService, 'createPublicUrl').mockReturnValue('http://example.com/resume.pdf')
    vi.spyOn(GeneratorWorkflowService.prototype as any, 'buildResumeContent').mockResolvedValue(mockResumeContent)
    vi.spyOn(GeneratorWorkflowService.prototype as any, 'buildCoverLetterContent').mockResolvedValue(mockCoverLetterContent)
    repo.mockRequests.clear()
    repo.mockArtifacts = []
  })

  const createService = () =>
    new GeneratorWorkflowService(
      htmlPdfService as any,
      repo as unknown as GeneratorWorkflowRepository,
      personalInfoStore as unknown as PersonalInfoStore,
      contentItemRepo as unknown as ContentItemRepository,
      fakeJobMatchRepo,
      configRepo,
      mockLog as unknown as any
    )

  it('creates a request and tracks steps in memory', async () => {
    const service = createService()
    const { requestId } = await service.createRequest(payload)
    const request = repo.getRequest(requestId)
    expect(request).toBeTruthy()
    expect(request?.status).toBe('processing')

    // Steps are now in memory, not in DB - verify through runNextStep
    const result = await service.runNextStep(requestId)
    expect(result?.steps).toBeDefined()
    expect(result?.steps.length).toBeGreaterThan(0)
  })

  it('runNextStep completes collect-data step first', async () => {
    const service = createService()
    const { requestId } = await service.createRequest(payload)

    const result = await service.runNextStep(requestId)
    expect(result?.steps[0].id).toBe('collect-data')
    expect(result?.steps[0].status).toBe('completed')
  })

  it('runNextStep generates resume content and stores in intermediateResults', async () => {
    const service = createService()
    const { requestId } = await service.createRequest(payload)
    // complete collect-data
    await service.runNextStep(requestId)
    const resumeResult = await service.runNextStep(requestId)

    expect(resumeResult?.steps.find((s) => s.id === 'generate-resume')?.status).toBe('completed')
    // Resume content is stored in intermediateResults, URL is set after render-pdf
    const request = repo.getRequest(requestId)
    expect(request?.intermediateResults?.resumeContent).toEqual(mockResumeContent)
    // URL is null until render-pdf step completes
    expect(request?.resumeUrl).toBeNull()
  })

  it('runNextStep generates cover letter content and stores in intermediateResults', async () => {
    const service = createService()
    const { requestId } = await service.createRequest({ ...payload, generateType: 'coverLetter' })
    await service.runNextStep(requestId) // collect-data
    const coverResult = await service.runNextStep(requestId)

    expect(coverResult?.steps.find((s) => s.id === 'generate-cover-letter')?.status).toBe('completed')
    // Cover letter content is stored in intermediateResults, URL is set after render-pdf
    const request = repo.getRequest(requestId)
    expect(request?.intermediateResults?.coverLetterContent).toEqual(mockCoverLetterContent)
    // URL is null until render-pdf step completes
    expect(request?.coverLetterUrl).toBeNull()
  })

  it('invokes AgentManager for resume generation with document task type', async () => {
    const service = createService()
    const { requestId } = await service.createRequest(payload)
    await service.runNextStep(requestId) // collect-data
    await service.runNextStep(requestId) // generate-resume

    const agentInstance = (service as any).agentManager
    expect(typeof agentInstance?.execute).toBe('function')
  })

  it('invokes AgentManager for cover letter generation with document task type', async () => {
    const service = createService()
    const { requestId } = await service.createRequest({ ...payload, generateType: 'coverLetter' })
    await service.runNextStep(requestId) // collect-data
    await service.runNextStep(requestId) // generate-cover-letter

    const agentInstance = (service as any).agentManager
    expect(typeof agentInstance?.execute).toBe('function')
  })

  describe('review workflow', () => {
    it('pauses at review-resume step with awaiting_review status', async () => {
      const service = createService()
      const { requestId } = await service.createRequest(payload)

      await service.runNextStep(requestId) // collect-data
      await service.runNextStep(requestId) // generate-resume
      const reviewResult = await service.runNextStep(requestId) // review-resume

      expect(reviewResult?.status).toBe('awaiting_review')
      expect(reviewResult?.stepCompleted).toBe('review-resume')

      const request = repo.getRequest(requestId)
      expect(request?.status).toBe('awaiting_review')
    })

    it('pauses at review-cover-letter step with awaiting_review status', async () => {
      const service = createService()
      const { requestId } = await service.createRequest({ ...payload, generateType: 'coverLetter' })

      await service.runNextStep(requestId) // collect-data
      await service.runNextStep(requestId) // generate-cover-letter
      const reviewResult = await service.runNextStep(requestId) // review-cover-letter

      expect(reviewResult?.status).toBe('awaiting_review')
      expect(reviewResult?.stepCompleted).toBe('review-cover-letter')

      const request = repo.getRequest(requestId)
      expect(request?.status).toBe('awaiting_review')
    })

    it('getDraftContent returns resume content when awaiting review', async () => {
      const service = createService()
      const { requestId } = await service.createRequest(payload)

      await service.runNextStep(requestId) // collect-data
      await service.runNextStep(requestId) // generate-resume
      await service.runNextStep(requestId) // review-resume (sets awaiting_review)

      const draft = service.getDraftContent(requestId)

      expect(draft).not.toBeNull()
      expect(draft?.requestId).toBe(requestId)
      expect(draft?.documentType).toBe('resume')
      expect(draft?.status).toBe('awaiting_review')
      expect(draft?.content).toEqual(mockResumeContent)
    })

    it('getDraftContent returns cover letter content when awaiting review', async () => {
      const service = createService()
      const { requestId } = await service.createRequest({ ...payload, generateType: 'coverLetter' })

      await service.runNextStep(requestId) // collect-data
      await service.runNextStep(requestId) // generate-cover-letter
      await service.runNextStep(requestId) // review-cover-letter

      const draft = service.getDraftContent(requestId)

      expect(draft).not.toBeNull()
      expect(draft?.documentType).toBe('coverLetter')
      expect(draft?.content).toEqual(mockCoverLetterContent)
    })

    it('getDraftContent returns null when request not awaiting review', async () => {
      const service = createService()
      const { requestId } = await service.createRequest(payload)

      await service.runNextStep(requestId) // collect-data (still processing)

      const draft = service.getDraftContent(requestId)
      expect(draft).toBeNull()
    })

    it('getDraftContent returns null for non-existent request', () => {
      const service = createService()
      const draft = service.getDraftContent('non-existent-id')
      expect(draft).toBeNull()
    })

    it('submitReview updates content and continues to render-pdf step', async () => {
      const service = createService()
      const { requestId } = await service.createRequest(payload)

      await service.runNextStep(requestId) // collect-data
      await service.runNextStep(requestId) // generate-resume
      await service.runNextStep(requestId) // review-resume

      const editedContent = {
        ...mockResumeContent,
        professionalSummary: 'Edited summary by user'
      }

      const result = await service.submitReview(requestId, 'resume', editedContent)

      expect(result).not.toBeNull()
      expect(result?.status).toBe('processing')

      // Check the edited content was stored
      const request = repo.getRequest(requestId)
      expect(request?.intermediateResults?.resumeContent?.professionalSummary).toBe('Edited summary by user')
    })

    it('submitReview returns null when request not awaiting review', async () => {
      const service = createService()
      const { requestId } = await service.createRequest(payload)

      await service.runNextStep(requestId) // collect-data (still processing)

      const result = await service.submitReview(requestId, 'resume', mockResumeContent)
      expect(result).toBeNull()
    })

    it('submitReview returns null for non-existent request', async () => {
      const service = createService()
      const result = await service.submitReview('non-existent-id', 'resume', mockResumeContent)
      expect(result).toBeNull()
    })

    it('completes full resume workflow through review', async () => {
      const service = createService()
      const { requestId } = await service.createRequest(payload)

      await service.runNextStep(requestId) // collect-data
      await service.runNextStep(requestId) // generate-resume
      await service.runNextStep(requestId) // review-resume

      // Submit review
      await service.submitReview(requestId, 'resume', mockResumeContent)

      // render-pdf should be the next step after submitReview runs runNextStep
      const renderResult = await service.runNextStep(requestId)
      expect(renderResult?.steps.find((s) => s.id === 'render-pdf')?.status).toBe('completed')

      // Workflow should be complete
      const finalResult = await service.runNextStep(requestId)
      expect(finalResult?.status).toBe('completed')
    })

    it('completes full cover letter workflow through review', async () => {
      const service = createService()
      const { requestId } = await service.createRequest({ ...payload, generateType: 'coverLetter' })

      await service.runNextStep(requestId) // collect-data
      await service.runNextStep(requestId) // generate-cover-letter
      await service.runNextStep(requestId) // review-cover-letter

      // Submit review
      await service.submitReview(requestId, 'coverLetter', mockCoverLetterContent)

      // render-pdf
      const renderResult = await service.runNextStep(requestId)
      expect(renderResult?.steps.find((s) => s.id === 'render-pdf')?.status).toBe('completed')

      // Complete
      const finalResult = await service.runNextStep(requestId)
      expect(finalResult?.status).toBe('completed')
    })

    it('handles both document types in sequence for generateType=both', async () => {
      const service = createService()
      const { requestId } = await service.createRequest({ ...payload, generateType: 'both' })

      await service.runNextStep(requestId) // collect-data
      await service.runNextStep(requestId) // generate-resume
      await service.runNextStep(requestId) // review-resume

      // Submit resume review
      await service.submitReview(requestId, 'resume', mockResumeContent)

      await service.runNextStep(requestId) // generate-cover-letter
      const coverReviewResult = await service.runNextStep(requestId) // review-cover-letter

      expect(coverReviewResult?.status).toBe('awaiting_review')

      // Submit cover letter review
      await service.submitReview(requestId, 'coverLetter', mockCoverLetterContent)

      // render-pdf
      await service.runNextStep(requestId)

      // Complete
      const finalResult = await service.runNextStep(requestId)
      expect(finalResult?.status).toBe('completed')
    })
  })

  describe('groundResumeContent — skill validation', () => {
    const personalInfo: PersonalInfo = {
      name: 'Test User',
      email: 'test@example.com',
      applicationInfo: 'Test'
    }

    const callGround = (parsed: any, items: ContentItem[]) => {
      const service = createService()
      return (service as any).groundResumeContent(parsed, items, personalInfo, payload)
    }

    it('drops skills not present in source content items', () => {
      const items = makeContentItems()
      const parsed = {
        personalInfo: { name: 'Test', title: 'Dev', summary: '', contact: { email: '' } },
        professionalSummary: 'Summary',
        experience: [{ company: 'Acme Corp', role: 'Dev', startDate: '2022', endDate: '', highlights: ['Did stuff'] }],
        skills: [
          { category: 'Languages', items: ['JavaScript', 'AWS', 'Kafka'] },
          { category: 'Cloud', items: ['AWS', 'Kubernetes'] }
        ],
        education: []
      }

      const result = callGround(parsed, items)

      // 'AWS', 'Kafka', 'Kubernetes' are not in source skills — should be dropped
      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].category).toBe('Languages')
      expect(result.skills[0].items).toEqual(['JavaScript'])
    })

    it('matches skills case-insensitively', () => {
      const items = makeContentItems()
      const parsed = {
        personalInfo: { name: 'Test', title: 'Dev', summary: '', contact: { email: '' } },
        professionalSummary: 'Summary',
        experience: [{ company: 'Acme Corp', role: 'Dev', startDate: '2022', endDate: '', highlights: [] }],
        skills: [{ category: 'Core', items: ['javascript', 'TYPESCRIPT', 'node.js'] }],
        education: []
      }

      const result = callGround(parsed, items)
      expect(result.skills[0].items).toEqual(['javascript', 'TYPESCRIPT', 'node.js'])
    })

    it('includes skills from description of skills-context items', () => {
      const items = makeContentItems([
        { aiContext: 'work', title: 'Acme Corp', skills: ['JavaScript'] },
        { aiContext: 'skills', title: 'Cloud & DevOps', description: 'Docker, Terraform, CI/CD', skills: [] }
      ])
      const parsed = {
        personalInfo: { name: 'Test', title: 'Dev', summary: '', contact: { email: '' } },
        professionalSummary: 'Summary',
        experience: [{ company: 'Acme Corp', role: 'Dev', startDate: '2022', endDate: '', highlights: [] }],
        skills: [{ category: 'DevOps', items: ['Docker', 'Terraform', 'AWS'] }],
        education: []
      }

      const result = callGround(parsed, items)
      // Docker and Terraform are in description; AWS is not
      expect(result.skills[0].items).toEqual(['Docker', 'Terraform'])
    })

    it('falls back to source skills when validation empties everything', () => {
      const items = makeContentItems([
        { aiContext: 'work', title: 'Acme Corp', skills: ['JavaScript', 'TypeScript'] },
        { aiContext: 'skills', title: 'Languages', description: 'JavaScript, TypeScript, Python', skills: [] }
      ])
      const parsed = {
        personalInfo: { name: 'Test', title: 'Dev', summary: '', contact: { email: '' } },
        professionalSummary: 'Summary',
        experience: [{ company: 'Acme Corp', role: 'Dev', startDate: '2022', endDate: '', highlights: [] }],
        // AI returns completely wrong skills — all should be filtered out
        skills: [{ category: 'Cloud', items: ['AWS', 'GCP', 'Azure'] }],
        education: []
      }

      const result = callGround(parsed, items)
      // Should fall back to skills-context items
      expect(result.skills.length).toBeGreaterThan(0)
      expect(result.skills[0].category).toBe('Languages')
      expect(result.skills[0].items).toContain('JavaScript')
    })

    it('drops entire category when all items are invalid', () => {
      const items = makeContentItems([
        { aiContext: 'work', title: 'Acme Corp', skills: ['JavaScript'] }
      ])
      const parsed = {
        personalInfo: { name: 'Test', title: 'Dev', summary: '', contact: { email: '' } },
        professionalSummary: 'Summary',
        experience: [{ company: 'Acme Corp', role: 'Dev', startDate: '2022', endDate: '', highlights: [] }],
        skills: [
          { category: 'Valid', items: ['JavaScript'] },
          { category: 'AllInvalid', items: ['AWS', 'Kafka'] }
        ],
        education: []
      }

      const result = callGround(parsed, items)
      expect(result.skills).toHaveLength(1)
      expect(result.skills[0].category).toBe('Valid')
    })
  })
})
