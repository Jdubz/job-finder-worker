import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GeneratorWorkflowService, type GenerateDocumentPayload } from '../workflow/generator.workflow.service'
import type { GeneratorWorkflowRepository, GeneratorRequestRecord, GeneratorArtifactRecord } from '../generator.workflow.repository'
import type { PersonalInfoStore } from '../personal-info.store'
import type { ContentItemRepository } from '../../content-items/content-item.repository'
import type { PdfMakeService } from '../workflow/services/pdfmake.service'
import { storageService } from '../workflow/services/storage.service'
import { runCliProvider } from '../workflow/services/cli-runner'
import type { PersonalInfo, ContentItem, AISettings } from '@shared/types'
import type { ConfigRepository } from '../../config/config.repository'

// Test fixture for AISettings (no defaults - explicit test data)
const TEST_AI_SETTINGS: AISettings = {
  worker: {
    selected: { provider: 'gemini', interface: 'api', model: 'gemini-2.0-flash' }
  },
  documentGenerator: {
    selected: { provider: 'gemini', interface: 'api', model: 'gemini-2.0-flash' }
  },
  options: []
}

vi.mock('../workflow/services/cli-runner', () => {
  const runCliProvider = vi.fn().mockImplementation((prompt: string) => {
    const isCover = /greeting|cover\s*letter|cover_letter|cover-letter/i.test(prompt)
    if (isCover) {
      return Promise.resolve({
        success: true,
        output: JSON.stringify({
          greeting: 'Hello Hiring Team,',
          openingParagraph: 'I am excited to apply.',
          bodyParagraphs: ['Body paragraph one'],
          closingParagraph: 'Thank you for your consideration.',
          signature: 'Test User'
        })
      })
    }
    return Promise.resolve({
      success: true,
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
      })
    })
  })
  return { runCliProvider }
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
    accentColor: '#123456'
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
      title: 'Previous Company',
      role: 'Senior Developer',
      location: 'Remote',
      website: 'https://example.com',
      startDate: '2022-01',
      endDate: null,
      description: 'Worked on various projects',
      skills: ['JavaScript', 'TypeScript', 'Node.js'],
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

describe('GeneratorWorkflowService', () => {
const repo = new InMemoryRepo()
const personalInfoStore = new FakePersonalInfoStore()
const contentItemRepo = new FakeContentItemRepository()
const pdfService: PdfMakeService = {
  generateResumePDF: vi.fn().mockResolvedValue(Buffer.from('resume')),
  generateCoverLetterPDF: vi.fn().mockResolvedValue(Buffer.from('cover'))
} as unknown as PdfMakeService
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
    vi.mocked(runCliProvider).mockImplementation((prompt: string) => {
      const isCover = /greeting|cover\s*letter|cover_letter|cover-letter/i.test(prompt)
      if (isCover) {
        return Promise.resolve({
          success: true,
          output: JSON.stringify({
            greeting: 'Hello Hiring Team,',
            openingParagraph: 'I am excited to apply.',
            bodyParagraphs: ['Body paragraph one'],
            closingParagraph: 'Thank you for your consideration.',
            signature: 'Test User'
          })
        })
      }
      return Promise.resolve({
        success: true,
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
        })
      })
    })
    vi.spyOn(storageService, 'saveArtifactWithMetadata').mockResolvedValue({
      storagePath: '2024-01-15/acme-corp_software-engineer_a1b2c3d4e5f6/test-user_acme-corp_software-engineer_resume.pdf',
      filename: 'test-user_acme-corp_software-engineer_resume.pdf',
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
      pdfService,
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

  it('runNextStep generates resume and stores artifact/url', async () => {
    const service = createService()
    const { requestId } = await service.createRequest(payload)
    // complete collect-data
    await service.runNextStep(requestId)
    const resumeResult = await service.runNextStep(requestId)

    expect(resumeResult?.steps.find((s) => s.id === 'generate-resume')?.status).toBe('completed')
    const request = repo.getRequest(requestId)
    expect(request?.resumeUrl).toBe('http://example.com/resume.pdf')
    expect(repo.listArtifacts(requestId)).toHaveLength(1)
  })

  it('runNextStep generates cover letter and stores artifact/url', async () => {
    const service = createService()
    const { requestId } = await service.createRequest({ ...payload, generateType: 'coverLetter' })
    await service.runNextStep(requestId) // collect-data
    const coverResult = await service.runNextStep(requestId)

    expect(coverResult?.steps.find((s) => s.id === 'generate-cover-letter')?.status).toBe('completed')
    const request = repo.getRequest(requestId)
    expect(request?.coverLetterUrl).toBe('http://example.com/resume.pdf')
    expect(repo.listArtifacts(requestId)).toHaveLength(1)
  })

  it('uses documentGenerator selection when provider is supported CLI', () => {
    const service = createService()
    ;(configRepo as any).aiSettings = {
      ...TEST_AI_SETTINGS,
      documentGenerator: { selected: { provider: 'claude', interface: 'cli', model: 'claude-sonnet-4-5-20250929' } },
    }

    const provider = (service as any).getDocumentGeneratorCliProvider()
    expect(provider).toBe('claude')
  })

  it('falls back to codex when documentGenerator interface is api', () => {
    const service = createService()
    ;(configRepo as any).aiSettings = {
      ...TEST_AI_SETTINGS,
      documentGenerator: { selected: { provider: 'claude', interface: 'api', model: 'claude-sonnet-4-5-20250929' } },
    }

    const provider = (service as any).getDocumentGeneratorCliProvider()
    expect(provider).toBe('codex')
  })
})
