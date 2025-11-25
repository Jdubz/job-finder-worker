import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'
import type { ResumeContent, CoverLetterContent, PersonalInfo, JobMatch } from '@shared/types'
import { logger } from '../../../logger'
import { PersonalInfoStore } from '../personal-info.store'
import { ContentItemRepository } from '../../content-items/content-item.repository'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { storageService, type ArtifactMetadata } from './services/storage.service'
import { PdfMakeService } from './services/pdfmake.service'
import { generateRequestId } from './request-id'
import { createInitialSteps, startStep, completeStep } from './generation-steps'
import { GeneratorWorkflowRepository } from '../generator.workflow.repository'
import { buildCoverLetterPrompt, buildResumePrompt } from './prompts'
import { runCliProvider } from './services/cli-runner'

export interface GenerateDocumentPayload {
  generateType: 'resume' | 'coverLetter' | 'both'
  job: {
    role: string
    company: string
    companyWebsite?: string
    jobDescriptionUrl?: string
    jobDescriptionText?: string
  }
  preferences?: {
    style?: 'modern' | 'traditional' | 'technical' | 'executive'
    emphasize?: string[]
  }
  date?: string
  jobMatchId?: string
}

export interface GenerateDocumentResult {
  requestId: string
  resumeUrl?: string
  coverLetterUrl?: string
  success: boolean
  message?: string
}

const DEFAULT_PERSONAL_INFO: PersonalInfo = {
  name: 'Candidate',
  email: 'candidate@example.com',
  accentColor: '#2563eb',
  phone: undefined,
  github: undefined,
  linkedin: undefined,
  location: undefined,
  website: undefined,
  summary: undefined
}

interface ActiveRequestState {
  steps: ReturnType<typeof createInitialSteps>
  request: ReturnType<GeneratorWorkflowRepository['getRequest']>
  createdAt: number
}

// TTL for abandoned requests: 30 minutes
const REQUEST_TTL_MS = 30 * 60 * 1000

export class GeneratorWorkflowService {
  private readonly activeRequests = new Map<string, ActiveRequestState>()

  constructor(
    private readonly pdfService = new PdfMakeService(),
    private readonly workflowRepo = new GeneratorWorkflowRepository(),
    private readonly personalInfoStore = new PersonalInfoStore(),
    private readonly contentItemRepo = new ContentItemRepository(),
    private readonly jobMatchRepo = new JobMatchRepository(),
    private readonly log: Logger = logger
  ) {
    // Periodically clean up abandoned requests to prevent memory leaks
    // Run every 15 minutes (half of TTL) to ensure timely cleanup
    setInterval(() => this.cleanupAbandonedRequests(), REQUEST_TTL_MS / 2)
  }

  private cleanupAbandonedRequests(): void {
    const now = Date.now()
    for (const [requestId, state] of this.activeRequests.entries()) {
      if (now - state.createdAt > REQUEST_TTL_MS) {
        this.log.warn({ requestId }, 'Cleaning up abandoned generator request')
        this.workflowRepo.updateRequest(requestId, { status: 'failed' })
        this.activeRequests.delete(requestId)
      }
    }
  }

  async generate(payload: GenerateDocumentPayload): Promise<GenerateDocumentResult> {
    const { requestId } = await this.createRequest(payload)
    return this.runAllSteps(requestId, payload)
  }

  async createRequest(payload: GenerateDocumentPayload) {
    const requestId = generateRequestId()
    const steps = createInitialSteps(payload.generateType)
    const request = this.workflowRepo.createRequest({
      id: requestId,
      generateType: payload.generateType,
      job: payload.job,
      preferences: payload.preferences ?? null,
      personalInfo: null,
      status: 'processing',
      resumeUrl: null,
      coverLetterUrl: null,
      jobMatchId: payload.jobMatchId ?? null,
      createdBy: undefined
    })
    // Keep steps in memory only (with TTL for cleanup)
    this.activeRequests.set(requestId, { steps, request, createdAt: Date.now() })
    // Run cleanup on each new request to prevent unbounded growth
    this.cleanupAbandonedRequests()
    const nextStep = steps.find((s) => s.status === 'pending')?.id
    return { requestId, steps, nextStep }
  }

  async runAllSteps(requestId: string, payload: GenerateDocumentPayload): Promise<GenerateDocumentResult> {
    try {
      let result = await this.runNextStep(requestId, payload)
      while (result && result.steps.some((step) => step.status === 'pending')) {
        result = await this.runNextStep(requestId, payload)
      }

      const finalRequest = this.workflowRepo.getRequest(requestId)
      // Clean up in-memory state
      this.activeRequests.delete(requestId)

      return {
        requestId,
        resumeUrl: finalRequest?.resumeUrl ?? undefined,
        coverLetterUrl: finalRequest?.coverLetterUrl ?? undefined,
        success: finalRequest?.status === 'completed',
        message: finalRequest?.status === 'completed' ? undefined : 'Generation incomplete'
      }
    } catch (error) {
      this.log.error({ err: error }, 'Generator workflow failed')
      this.workflowRepo.updateRequest(requestId, { status: 'failed' })
      this.activeRequests.delete(requestId)
      return {
        requestId,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async runNextStep(requestId: string, _payload?: GenerateDocumentPayload) {
    const request = this.workflowRepo.getRequest(requestId)
    if (!request) {
      return null
    }

    const activeState = this.activeRequests.get(requestId)
    if (!activeState) {
      return null
    }

    const steps = activeState.steps
    const pendingStep = steps.find((step) => step.status === 'pending')
    if (!pendingStep) {
      if (request.status !== 'completed' && request.status !== 'failed') {
        this.workflowRepo.updateRequest(requestId, { status: 'completed' })
      }
      return {
        requestId,
        status: this.workflowRepo.getRequest(requestId)?.status ?? request.status,
        steps,
        nextStep: undefined
      }
    }

    const personalInfo = request.personalInfo ?? (await this.personalInfoStore.get()) ?? DEFAULT_PERSONAL_INFO
    this.workflowRepo.updateRequest(requestId, { personalInfo })

    if (pendingStep.id === 'collect-data') {
      const updated = completeStep(startStep(steps, 'collect-data'), 'collect-data', 'completed')
      activeState.steps = updated
      const nextStep = updated.find((s) => s.status === 'pending')?.id
      return {
        requestId,
        status: request.status,
        steps: updated,
        nextStep,
        stepCompleted: 'collect-data'
      }
    }

    if (pendingStep.id === 'generate-resume') {
      try {
        const resumeUrl = await this.generateResume(
          {
            generateType: request.generateType,
            job: request.job as GenerateDocumentPayload['job'],
            preferences: request.preferences as GenerateDocumentPayload['preferences']
          },
          requestId,
          personalInfo
        )
        this.workflowRepo.updateRequest(requestId, { resumeUrl: resumeUrl ?? null })
        const updated = completeStep(startStep(steps, 'generate-resume'), 'generate-resume', 'completed')
        activeState.steps = updated
        const nextStep = updated.find((s) => s.status === 'pending')?.id
        return { requestId, status: request.status, steps: updated, nextStep, resumeUrl, stepCompleted: 'generate-resume' }
      } catch (error) {
        this.log.error({ err: error, requestId }, 'Resume generation failed')
        const errorMessage = error instanceof Error ? error.message : 'Resume generation failed'
        const updated = completeStep(startStep(steps, 'generate-resume'), 'generate-resume', 'failed', undefined, {
          message: errorMessage
        })
        activeState.steps = updated
        this.workflowRepo.updateRequest(requestId, { status: 'failed' })
        this.activeRequests.delete(requestId)
        return {
          requestId,
          status: 'failed',
          steps: updated,
          nextStep: undefined,
          stepCompleted: 'generate-resume',
          error: error instanceof Error ? error.message : 'Resume generation failed'
        }
      }
    }

    if (pendingStep.id === 'generate-cover-letter') {
      try {
        const coverLetterUrl = await this.generateCoverLetter(
          {
            generateType: request.generateType,
            job: request.job as GenerateDocumentPayload['job'],
            preferences: request.preferences as GenerateDocumentPayload['preferences']
          },
          requestId,
          personalInfo
        )
        this.workflowRepo.updateRequest(requestId, { coverLetterUrl: coverLetterUrl ?? null })
        const updated = completeStep(startStep(steps, 'generate-cover-letter'), 'generate-cover-letter', 'completed')
        activeState.steps = updated
        const nextStep = updated.find((s) => s.status === 'pending')?.id
        return { requestId, status: request.status, steps: updated, nextStep, coverLetterUrl, stepCompleted: 'generate-cover-letter' }
      } catch (error) {
        this.log.error({ err: error, requestId }, 'Cover letter generation failed')
        const errorMessage = error instanceof Error ? error.message : 'Cover letter generation failed'
        const updated = completeStep(startStep(steps, 'generate-cover-letter'), 'generate-cover-letter', 'failed', undefined, {
          message: errorMessage
        })
        activeState.steps = updated
        this.workflowRepo.updateRequest(requestId, { status: 'failed' })
        this.activeRequests.delete(requestId)
        return {
          requestId,
          status: 'failed',
          steps: updated,
          nextStep: undefined,
          stepCompleted: 'generate-cover-letter',
          error: error instanceof Error ? error.message : 'Cover letter generation failed'
        }
      }
    }

    // render-pdf step: PDF rendering is done within generateResume/generateCoverLetter,
    // so just mark this step complete and finalize the request
    if (pendingStep.id === 'render-pdf') {
      const updated = completeStep(startStep(steps, 'render-pdf'), 'render-pdf', 'completed')
      activeState.steps = updated
      this.workflowRepo.updateRequest(requestId, { status: 'completed' })
      const finalRequest = this.workflowRepo.getRequest(requestId)
      // Clean up in-memory state now that generation is complete
      this.activeRequests.delete(requestId)
      return {
        requestId,
        status: 'completed',
        steps: updated,
        nextStep: undefined,
        resumeUrl: finalRequest?.resumeUrl ?? undefined,
        coverLetterUrl: finalRequest?.coverLetterUrl ?? undefined,
        stepCompleted: 'render-pdf'
      }
    }

    // Unknown step - mark request as failed to prevent infinite loop
    this.workflowRepo.updateRequest(requestId, { status: 'failed' })
    this.activeRequests.delete(requestId)
    return {
      requestId,
      status: 'failed',
      steps,
      nextStep: undefined
    }
  }

  private async generateResume(
    payload: GenerateDocumentPayload,
    requestId: string,
    personalInfo: PersonalInfo
  ): Promise<string | undefined> {
    const resume = await this.buildResumeContent(payload, personalInfo)
    const pdf = await this.pdfService.generateResumePDF(
      resume,
      payload.preferences?.style ?? 'modern',
      personalInfo.accentColor ?? '#2563eb',
      personalInfo
    )
    const metadata: ArtifactMetadata = {
      name: personalInfo.name,
      company: payload.job.company,
      role: payload.job.role,
      type: 'resume'
    }
    const saved = await storageService.saveArtifactWithMetadata(pdf, metadata)
    this.workflowRepo.addArtifact({
      id: randomUUID(),
      requestId,
      artifactType: 'resume',
      filename: saved.filename,
      storagePath: saved.storagePath,
      sizeBytes: saved.size,
      createdAt: new Date().toISOString()
    })
    return storageService.createPublicUrl(saved.storagePath)
  }

  private async generateCoverLetter(
    payload: GenerateDocumentPayload,
    requestId: string,
    personalInfo: PersonalInfo
  ): Promise<string | undefined> {
    const coverLetter = await this.buildCoverLetterContent(payload, personalInfo)
    const pdf = await this.pdfService.generateCoverLetterPDF(coverLetter, {
      name: personalInfo.name,
      email: personalInfo.email,
      accentColor: personalInfo.accentColor,
      date: payload.date,
      logo: personalInfo.logo
    })
    const metadata: ArtifactMetadata = {
      name: personalInfo.name,
      company: payload.job.company,
      role: payload.job.role,
      type: 'cover-letter'
    }
    const saved = await storageService.saveArtifactWithMetadata(pdf, metadata)
    this.workflowRepo.addArtifact({
      id: randomUUID(),
      requestId,
      artifactType: 'cover-letter',
      filename: saved.filename,
      storagePath: saved.storagePath,
      sizeBytes: saved.size,
      createdAt: new Date().toISOString()
    })
    return storageService.createPublicUrl(saved.storagePath)
  }

  private enrichPayloadWithJobMatch(payload: GenerateDocumentPayload): JobMatch | null {
    if (!payload.jobMatchId) {
      return null
    }

    const jobMatch = this.jobMatchRepo.getById(payload.jobMatchId)
    if (jobMatch) {
      // Enrich payload with job match data
      payload.job.jobDescriptionText = payload.job.jobDescriptionText || jobMatch.jobDescription
      // Add additional context from job match
      if (jobMatch.customizationRecommendations?.length) {
        payload.preferences = payload.preferences || {}
        payload.preferences.emphasize = [
          ...(payload.preferences.emphasize || []),
          ...jobMatch.customizationRecommendations
        ]
      }
    }
    return jobMatch
  }

  private async buildResumeContent(payload: GenerateDocumentPayload, personalInfo: PersonalInfo): Promise<ResumeContent> {
    // Fetch content items from the database
    const contentItems = this.contentItemRepo.list()

    if (!contentItems.length) {
      this.log.error('No content items found; cannot build resume without source experience data')
      throw new Error('Resume generation failed: no content items available. Import profile content before generating.')
    }

    // Fetch and enrich with job match data if available
    const jobMatch = this.enrichPayloadWithJobMatch(payload)

    const prompt = buildResumePrompt(payload, personalInfo, contentItems, jobMatch)
    const cliResult = await runCliProvider(prompt, 'codex')

    if (!cliResult.success) {
      this.log.error({ error: cliResult.error }, 'AI resume generation failed')
      throw new Error(`AI generation failed: ${cliResult.error || 'Unknown error'}`)
    }

    this.log.info({ outputPreview: cliResult.output.slice(0, 400) }, 'AI resume raw output preview')

    try {
      const parsed = JSON.parse(cliResult.output) as ResumeContent

      const mappedExperience = contentItems.map((item) => ({
        role: item.role ?? '',
        company: item.title ?? '',
        location: item.location ?? '',
        startDate: item.startDate ?? '',
        endDate: item.endDate ?? '',
        highlights: (item.description || '')
          .split(/\r?\n/)
          .map((l) => l.replace(/^[-•]\s*/, '').trim())
          .filter(Boolean),
        technologies: item.skills ?? []
      }))

      // Normalize and fill missing data using authoritative content items and personal info
      parsed.personalInfo = {
        name: personalInfo.name,
        title: parsed.personalInfo?.title || payload.job.role,
        summary: personalInfo.summary || parsed.personalInfo?.summary || '',
        contact: {
          email: personalInfo.email || parsed.personalInfo?.contact?.email || '',
          location: personalInfo.location || parsed.personalInfo?.contact?.location || '',
          website: personalInfo.website || parsed.personalInfo?.contact?.website || '',
          linkedin: personalInfo.linkedin || parsed.personalInfo?.contact?.linkedin || '',
          github: personalInfo.github || parsed.personalInfo?.contact?.github || ''
        }
      }

      parsed.experience = (Array.isArray(parsed.experience) && parsed.experience.length > 0
        ? parsed.experience
        : mappedExperience
      ).map((exp) => ({
        role: exp.role || '',
        company: exp.company || '',
        location: exp.location || '',
        startDate: exp.startDate || '',
        endDate: exp.endDate || '',
        highlights: Array.isArray(exp.highlights) ? exp.highlights : [],
        technologies: Array.isArray((exp as any).technologies) ? (exp as any).technologies : []
      }))

      // Normalize skills: accept [{category, items}] or string[]
      if (!Array.isArray(parsed.skills) || parsed.skills.length === 0) {
        parsed.skills = parsed.experience.length
          ? [{ category: 'Skills', items: Array.from(new Set(parsed.experience.flatMap((e) => e.technologies || []))) }]
          : []
      } else if (parsed.skills.length && typeof parsed.skills[0] === 'string') {
        parsed.skills = [{ category: 'Skills', items: parsed.skills as unknown as string[] }]
      } else {
        parsed.skills = (parsed.skills as any[]).map((s) => ({
          category: s.category || 'Skills',
          items: Array.isArray(s.items) ? s.items : []
        }))
      }

      parsed.education = Array.isArray(parsed.education) ? parsed.education : []
      parsed.professionalSummary = parsed.professionalSummary || personalInfo.summary || ''

      return parsed
    } catch (error) {
      this.log.error({ err: error, output: cliResult.output.slice(0, 500) }, 'Failed to parse AI resume output as JSON')
      throw new Error('AI returned invalid JSON for resume content', { cause: error })
    }
  }

  private async buildCoverLetterContent(
    payload: GenerateDocumentPayload,
    personalInfo: PersonalInfo
  ): Promise<CoverLetterContent> {
    // Fetch content items from the database
    const contentItems = this.contentItemRepo.list()

    // Fetch and enrich with job match data if available
    const jobMatch = this.enrichPayloadWithJobMatch(payload)

    const prompt = buildCoverLetterPrompt(payload, personalInfo, contentItems, jobMatch)
    const cliResult = await runCliProvider(prompt, 'codex')

    if (!cliResult.success) {
      this.log.error({ error: cliResult.error }, 'AI cover letter generation failed')
      throw new Error(`AI generation failed: ${cliResult.error || 'Unknown error'}`)
    }

    try {
      const parsed = JSON.parse(cliResult.output) as CoverLetterContent
      return parsed
    } catch (error) {
      this.log.error({ err: error, output: cliResult.output.slice(0, 500) }, 'Failed to parse AI cover letter output as JSON')
      throw new Error('AI returned invalid JSON for cover letter content', { cause: error })
    }
  }
}
