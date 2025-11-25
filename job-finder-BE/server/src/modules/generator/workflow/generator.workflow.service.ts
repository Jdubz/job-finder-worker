import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'
import type { ResumeContent, CoverLetterContent, PersonalInfo, JobMatch } from '@shared/types'
import { logger } from '../../../logger'
import { PersonalInfoStore } from '../personal-info.store'
import { ContentItemRepository } from '../../content-items/content-item.repository'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { storageService } from './services/storage.service'
import { PDFService } from './services/pdf.service'
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

export class GeneratorWorkflowService {
  private readonly activeRequests = new Map<string, { steps: any[]; request: any }>()

  constructor(
    private readonly pdfService = new PDFService(),
    private readonly workflowRepo = new GeneratorWorkflowRepository(),
    private readonly personalInfoStore = new PersonalInfoStore(),
    private readonly contentItemRepo = new ContentItemRepository(),
    private readonly jobMatchRepo = new JobMatchRepository(),
    private readonly log: Logger = logger
  ) {}

  async generate(payload: GenerateDocumentPayload): Promise<GenerateDocumentResult> {
    const requestId = await this.createRequest(payload)
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
    // Keep steps in memory only
    this.activeRequests.set(requestId, { steps, request })
    return requestId
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
        steps
      }
    }

    const personalInfo = request.personalInfo ?? (await this.personalInfoStore.get()) ?? DEFAULT_PERSONAL_INFO
    this.workflowRepo.updateRequest(requestId, { personalInfo })

    if (pendingStep.id === 'collect-data') {
      const updated = completeStep(startStep(steps, 'collect-data'), 'collect-data', 'completed')
      activeState.steps = updated
      return {
        requestId,
        status: request.status,
        steps: updated
      }
    }

    if (pendingStep.id === 'generate-resume') {
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
      return { requestId, status: request.status, steps: updated }
    }

    if (pendingStep.id === 'generate-cover-letter') {
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
      return { requestId, status: request.status, steps: updated }
    }

    return {
      requestId,
      status: request.status,
      steps
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
      personalInfo.accentColor ?? '#2563eb'
    )
    const saved = await storageService.saveArtifact(pdf, requestId, 'resume', `${requestId}-resume.pdf`)
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
      name: personalInfo.name ?? 'Candidate',
      email: personalInfo.email,
      accentColor: personalInfo.accentColor,
      date: payload.date
    })
    const saved = await storageService.saveArtifact(pdf, requestId, 'cover-letter', `${requestId}-cover-letter.pdf`)
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

    // Fetch and enrich with job match data if available
    const jobMatch = this.enrichPayloadWithJobMatch(payload)

    const prompt = buildResumePrompt(payload, personalInfo, contentItems, jobMatch)
    const cliResult = await runCliProvider(prompt, 'codex')
    if (cliResult.success) {
      try {
        const parsed = JSON.parse(cliResult.output) as ResumeContent
        return parsed
      } catch (error) {
        this.log.warn({ err: error }, 'Failed to parse resume JSON')
      }
    }

    // Fallback: Build resume from content items if AI generation fails
    return {
      personalInfo: {
        name: personalInfo.name ?? 'Candidate',
        title: `Aspiring ${payload.job.role}`,
        summary:
          personalInfo.summary ??
          `Motivated professional pursuing the ${payload.job.role} role at ${payload.job.company}.`,
        contact: {
          email: personalInfo.email,
          location: personalInfo.location,
          website: personalInfo.website,
          linkedin: personalInfo.linkedin,
          github: personalInfo.github
        }
      },
      professionalSummary:
        payload.job.jobDescriptionText ??
        `Seasoned professional seeking to contribute to ${payload.job.company} as a ${payload.job.role}.`,
      experience: [
        {
          company: payload.job.company,
          role: payload.job.role,
          highlights:
            payload.preferences?.emphasize?.length
              ? payload.preferences.emphasize
              : [
                  `Delivered measurable impact for ${payload.job.company}.`,
                  'Collaborated across teams to ship features rapidly.'
                ],
          startDate: '2022-01',
          endDate: null
        }
      ]
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
    if (cliResult.success) {
      try {
        const parsed = JSON.parse(cliResult.output) as CoverLetterContent
        return parsed
      } catch (error) {
        this.log.warn({ err: error }, 'Failed to parse cover letter JSON')
      }
    }

    // Fallback: Build cover letter if AI generation fails
    return {
      greeting: `Dear ${payload.job.company} Hiring Team,`,
      openingParagraph: `I am excited to apply for the ${payload.job.role} role at ${payload.job.company}.`,
      bodyParagraphs: [
        `My background aligns with your needs. I am eager to contribute to ${payload.job.company}'s mission.`,
        payload.job.jobDescriptionText
          ? payload.job.jobDescriptionText.slice(0, 400)
          : 'I have led cross-functional initiatives that delivered user-facing improvements.'
      ],
      closingParagraph: 'Thank you for your consideration. I would welcome the opportunity to discuss the role further.',
      signature: 'Sincerely'
    }
  }
}
