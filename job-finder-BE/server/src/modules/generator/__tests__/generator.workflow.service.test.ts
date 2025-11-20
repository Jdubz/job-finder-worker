import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GeneratorWorkflowService, type GenerateDocumentPayload } from '../workflow/generator.workflow.service'
import type { GeneratorWorkflowRepository } from '../generator.workflow.repository'
import type { PersonalInfoStore } from '../personal-info.store'
import type { PDFService } from '../workflow/services/pdf.service'
import { storageService } from '../workflow/services/storage.service'

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

class InMemoryRepo implements GeneratorWorkflowRepository {
  requests = new Map<
    string,
    {
      id: string
      generateType: 'resume' | 'coverLetter' | 'both'
      job: Record<string, unknown>
      preferences?: Record<string, unknown> | null
      personalInfo?: Record<string, unknown> | null
      status: 'pending' | 'processing' | 'completed' | 'failed'
      resumeUrl?: string | null
      coverLetterUrl?: string | null
      jobMatchId?: string | null
      createdBy?: string | null
      createdAt: string
      updatedAt: string
    }
  >()
  steps = new Map<string, GenerationStep[]>()
  artifacts: Record<string, unknown>[] = []

  createRequest(record: any) {
    const now = new Date().toISOString()
    const created = { ...record, createdAt: now, updatedAt: now }
    this.requests.set(record.id, created)
    return created
  }

  saveSteps(id: string, steps: GenerationStep[]) {
    this.steps.set(id, steps)
  }

  listSteps(id: string) {
    return this.steps.get(id) ?? []
  }

  getRequest(id: string) {
    return this.requests.get(id) ?? null
  }

  updateRequest(id: string, updates: Record<string, unknown>) {
    const existing = this.requests.get(id)
    if (!existing) return null
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() }
    this.requests.set(id, updated)
    return updated
  }

  addArtifact(record: any) {
    this.artifacts.push(record)
    return record
  }

  listArtifacts(id: string) {
    return this.artifacts.filter((artifact) => artifact.requestId === id)
  }
}

class FakePersonalInfoStore implements PersonalInfoStore {
  data = {
    name: 'Test User',
    email: 'test@example.com',
    accentColor: '#123456'
  }

  async get() {
    return this.data as any
  }

  async update() {
    return this.data as any
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
    repo.requests.clear()
    repo.steps.clear()
    repo.artifacts = []
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
