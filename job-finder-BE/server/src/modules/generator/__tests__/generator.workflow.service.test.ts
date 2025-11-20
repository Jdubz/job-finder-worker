import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GeneratorWorkflowService, type GenerateDocumentPayload } from '../workflow/generator.workflow.service'
import type { GeneratorWorkflowRepository, GeneratorRequestRecord, GeneratorArtifactRecord } from '../generator.workflow.repository'
import type { PersonalInfoStore } from '../personal-info.store'
import type { PDFService } from '../workflow/services/pdf.service'
import { storageService } from '../workflow/services/storage.service'
import type { GenerationStep, PersonalInfo } from '@shared/types'

vi.mock('../workflow/services/cli-runner', () => ({
  runCliProvider: vi.fn().mockResolvedValue({
    success: true,
    output: JSON.stringify({
      personalInfo: {
        name: 'Test User',
        title: 'Engineer',
        summary: 'Test summary',
        contact: { email: 'test@example.com' }
      },
      professionalSummary: 'Summary',
      experience: []
    })
  })
}))

vi.mock('../workflow/services/storage.service', () => {
  const saveArtifact = vi.fn().mockResolvedValue({
    storagePath: 'req/resume.pdf',
    filename: 'resume.pdf',
    size: 1024
  })
  return {
    storageService: {
      saveArtifact,
      createPublicUrl: vi.fn().mockReturnValue('http://example.com/resume.pdf')
    }
  }
})

class InMemoryRepo {
  mockRequests = new Map<string, GeneratorRequestRecord>()
  mockSteps = new Map<string, GenerationStep[]>()
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

  saveSteps(requestId: string, steps: GenerationStep[]): void {
    this.mockSteps.set(requestId, steps)
  }

  listSteps(requestId: string): GenerationStep[] {
    return this.mockSteps.get(requestId) ?? []
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
const pdfService: PDFService = {
  generateResumePDF: vi.fn().mockResolvedValue(Buffer.from('resume')),
  generateCoverLetterPDF: vi.fn().mockResolvedValue(Buffer.from('cover'))
} as unknown as PDFService
const storageMock = vi.mocked(storageService)

  beforeEach(() => {
    repo.mockRequests.clear()
    repo.mockSteps.clear()
    repo.mockArtifacts = []
    storageMock.saveArtifact.mockClear()
    storageMock.createPublicUrl.mockClear()
  })

  it('creates a request with initial pending steps', async () => {
    const service = new GeneratorWorkflowService(pdfService, repo as unknown as GeneratorWorkflowRepository, personalInfoStore as unknown as PersonalInfoStore)
    const requestId = await service.createRequest(payload)
    const request = repo.getRequest(requestId)
    expect(request).toBeTruthy()
    const steps = repo.listSteps(requestId)
    expect(steps.length).toBeGreaterThan(0)
    expect(steps[0].status).toBe('pending')
  })

  it('runNextStep completes collect-data step first', async () => {
    const service = new GeneratorWorkflowService(pdfService, repo as unknown as GeneratorWorkflowRepository, personalInfoStore as unknown as PersonalInfoStore)
    const requestId = await service.createRequest(payload)
    const stepsBefore = repo.listSteps(requestId)
    expect(stepsBefore[0].status).toBe('pending')

    const result = await service.runNextStep(requestId)
    expect(result?.steps[0].status).toBe('completed')
  })

  it('runNextStep generates resume and stores artifact/url', async () => {
    const service = new GeneratorWorkflowService(pdfService, repo as unknown as GeneratorWorkflowRepository, personalInfoStore as unknown as PersonalInfoStore)
    const requestId = await service.createRequest(payload)
    // complete collect-data
    await service.runNextStep(requestId)
    const resumeResult = await service.runNextStep(requestId)

    expect(resumeResult?.steps.find((s) => s.id === 'generate-resume')?.status).toBe('completed')
    const request = repo.getRequest(requestId)
    expect(request?.resumeUrl).toBe('http://example.com/resume.pdf')
    expect(repo.listArtifacts(requestId)).toHaveLength(1)
  })
})
