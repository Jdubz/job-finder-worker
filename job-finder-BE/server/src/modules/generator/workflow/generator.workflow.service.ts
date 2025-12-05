import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'
import type { ResumeContent, CoverLetterContent, PersonalInfo, JobMatchWithListing } from '@shared/types'
import { logger } from '../../../logger'
import { PersonalInfoStore } from '../personal-info.store'
import { ContentItemRepository } from '../../content-items/content-item.repository'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { storageService, type ArtifactMetadata } from './services/storage.service'
import { HtmlPdfService } from './services/html-pdf.service'
import { generateRequestId } from './request-id'
import { createInitialSteps, startStep, completeStep } from './generation-steps'
import { GeneratorWorkflowRepository } from '../generator.workflow.repository'
import { buildCoverLetterPrompt, buildResumePrompt } from './prompts'
import { runCliProvider } from './services/cli-runner'
import type { CliProvider } from './services/cli-runner'
import { ensureCliProviderHealthy } from './services/provider-health.service'
import { ConfigRepository } from '../../config/config.repository'
import type { AISettings } from '@shared/types'

export class UserFacingError extends Error {}

/** Result type for step execution with explicit URL fields */
export interface StepExecutionResult {
  requestId: string
  status: string
  steps: ReturnType<typeof createInitialSteps>
  nextStep?: string
  stepCompleted: string
  resumeUrl?: string
  coverLetterUrl?: string
  error?: string
}

export interface GenerateDocumentPayload {
  generateType: 'resume' | 'coverLetter' | 'both'
  job: {
    role: string
    company: string
    companyWebsite?: string
    jobDescriptionUrl?: string
    jobDescriptionText?: string
    location?: string
  }
  preferences?: {
    style?: 'modern' | 'traditional' | 'technical' | 'executive'
    emphasize?: string[]
  }
  date?: string
  jobMatchId?: string
}

export class GeneratorWorkflowService {
  private readonly userFriendlyError =
    'AI generation failed. Please retry in a moment or contact support if it keeps happening.'

  constructor(
    private readonly htmlPdf = new HtmlPdfService(),
    private readonly workflowRepo = new GeneratorWorkflowRepository(),
    private readonly personalInfoStore = new PersonalInfoStore(),
    private readonly contentItemRepo = new ContentItemRepository(),
    private readonly jobMatchRepo = new JobMatchRepository(),
    private readonly configRepo = new ConfigRepository(),
    private readonly log: Logger = logger
  ) {}

  private async ensureProviderAvailable(): Promise<void> {
    const config = this.configRepo.get<AISettings>('ai-settings')
    if (!config?.payload?.documentGenerator?.selected) {
      throw new UserFacingError('AI settings not configured. Please configure ai-settings in the database.')
    }

    const selection = config.payload.documentGenerator.selected

    if (selection.interface !== 'cli') {
      // Only CLI providers need health checks here
      return
    }

    try {
      await ensureCliProviderHealthy(selection.provider as CliProvider)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI provider unavailable'
      throw new UserFacingError(message)
    }
  }

  async createRequest(payload: GenerateDocumentPayload) {
    const requestId = generateRequestId()
    const steps = createInitialSteps(payload.generateType)
    this.workflowRepo.createRequest({
      id: requestId,
      generateType: payload.generateType,
      job: payload.job,
      preferences: payload.preferences ?? null,
      personalInfo: null,
      status: 'processing',
      resumeUrl: null,
      coverLetterUrl: null,
      jobMatchId: payload.jobMatchId ?? null,
      createdBy: undefined,
      steps
    })
    const nextStep = steps.find((s) => s.status === 'pending')?.id
    return { requestId, steps, nextStep }
  }

  async runNextStep(requestId: string, _payload?: GenerateDocumentPayload): Promise<StepExecutionResult | null> {
    const request = this.workflowRepo.getRequest(requestId)
    if (!request) {
      return null
    }

    const steps = request.steps ?? createInitialSteps(request.generateType)
    const pendingStep = steps.find((step) => step.status === 'pending')
    if (!pendingStep) {
      if (request.status !== 'completed' && request.status !== 'failed') {
        this.workflowRepo.updateRequest(requestId, { status: 'completed', steps })
      }
      const finalReq = this.workflowRepo.getRequest(requestId)
      return {
        requestId,
        status: finalReq?.status ?? request.status,
        steps,
        nextStep: undefined,
        stepCompleted: 'completed',
        resumeUrl: finalReq?.resumeUrl ?? undefined,
        coverLetterUrl: finalReq?.coverLetterUrl ?? undefined
      }
    }

    const personalInfo = request.personalInfo ?? (await this.personalInfoStore.get()) ?? null
    if (!personalInfo) {
      const message =
        'Personal info is not configured. Please set your name, email, and other details in the config entry "personal-info" (e.g., via /api/config/personal-info) before generating documents.'
      this.workflowRepo.updateRequest(requestId, { status: 'failed' })
      throw new UserFacingError(message)
    }
    this.workflowRepo.updateRequest(requestId, { personalInfo, steps })

    // Build payload once for reuse
    const payload: GenerateDocumentPayload = {
      generateType: request.generateType,
      job: request.job as GenerateDocumentPayload['job'],
      preferences: request.preferences as GenerateDocumentPayload['preferences'],
      jobMatchId: request.jobMatchId ?? undefined
    }

    if (pendingStep.id === 'collect-data') {
      return this.executeStep(
        'collect-data',
        requestId,
        request.status,
        steps,
        async () => {
          await this.ensureProviderAvailable()
        },
        'AI provider health check'
      )
    }

    if (pendingStep.id === 'generate-resume') {
      return this.executeStep(
        'generate-resume',
        requestId,
        request.status,
        steps,
        async () => {
          const url = await this.generateResume(payload, requestId, personalInfo)
          return { urlField: 'resumeUrl' as const, url }
        },
        'Resume generation'
      )
    }

    if (pendingStep.id === 'generate-cover-letter') {
      return this.executeStep(
        'generate-cover-letter',
        requestId,
        request.status,
        steps,
        async () => {
          const url = await this.generateCoverLetter(payload, requestId, personalInfo)
          return { urlField: 'coverLetterUrl' as const, url }
        },
        'Cover letter generation'
      )
    }

    // render-pdf step: PDF rendering is done within generateResume/generateCoverLetter,
    // so just mark this step complete and finalize the request
    if (pendingStep.id === 'render-pdf') {
      const updated = completeStep(startStep(steps, 'render-pdf'), 'render-pdf', 'completed')
      this.workflowRepo.updateRequest(requestId, { status: 'completed', steps: updated })
      const finalRequest = this.workflowRepo.getRequest(requestId)
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
    this.workflowRepo.updateRequest(requestId, { status: 'failed', steps })
    return {
      requestId,
      status: 'failed',
      steps,
      nextStep: undefined,
      stepCompleted: pendingStep.id
    }
  }

  private buildUserMessage(error: unknown, fallback: string): string {
    if (error instanceof UserFacingError) return error.message
    return fallback
  }

  /** Result type for executeStep to ensure type-safe returns */
  private buildStepResult(
    requestId: string,
    status: string,
    steps: ReturnType<typeof createInitialSteps>,
    stepCompleted: string,
    urlResult?: { urlField: 'resumeUrl' | 'coverLetterUrl'; url?: string },
    error?: string
  ): StepExecutionResult {
    const base = {
      requestId,
      status,
      steps,
      nextStep: steps.find((s) => s.status === 'pending')?.id,
      stepCompleted
    }

    if (error) {
      return { ...base, error }
    }

    if (urlResult?.urlField === 'resumeUrl') {
      return { ...base, resumeUrl: urlResult.url }
    }
    if (urlResult?.urlField === 'coverLetterUrl') {
      return { ...base, coverLetterUrl: urlResult.url }
    }
    return base
  }

  /**
   * Generic step executor that handles the common try/catch pattern for workflow steps.
   *
   * @param stepId - The ID of the step being executed (e.g., 'generate-resume')
   * @param requestId - The unique request ID for this generation workflow
   * @param currentStatus - The current status of the request before this step
   * @param steps - The array of workflow steps with their current statuses
   * @param action - Async callback that performs the step's work; may return URL info
   * @param logContext - Human-readable context for error logging (e.g., 'Resume generation')
   * @returns Step execution result with updated steps, status, and any generated URLs
   */
  private async executeStep(
    stepId: string,
    requestId: string,
    currentStatus: string,
    steps: ReturnType<typeof createInitialSteps>,
    action: () => Promise<{ urlField: 'resumeUrl' | 'coverLetterUrl'; url?: string } | void>,
    logContext: string
  ): Promise<StepExecutionResult> {
    try {
      const result = await action()
      const updated = completeStep(startStep(steps, stepId), stepId, 'completed')

      // Build update object with steps and optional URL field (type-safe)
      const repoUpdate: Parameters<typeof this.workflowRepo.updateRequest>[1] = { steps: updated }
      if (result?.urlField === 'resumeUrl') {
        repoUpdate.resumeUrl = result.url ?? null
      } else if (result?.urlField === 'coverLetterUrl') {
        repoUpdate.coverLetterUrl = result.url ?? null
      }
      this.workflowRepo.updateRequest(requestId, repoUpdate)

      return this.buildStepResult(
        requestId,
        currentStatus,
        updated,
        stepId,
        result ? { urlField: result.urlField, url: result.url } : undefined
      )
    } catch (error) {
      this.log.error({ err: error, requestId }, `${logContext} failed`)
      const errorMessage = this.buildUserMessage(error, this.userFriendlyError)
      const updated = completeStep(startStep(steps, stepId), stepId, 'failed', undefined, {
        message: errorMessage
      })
      this.workflowRepo.updateRequest(requestId, { status: 'failed', steps: updated })

      return this.buildStepResult(requestId, 'failed', updated, stepId, undefined, errorMessage)
    }
  }

  private async generateResume(
    payload: GenerateDocumentPayload,
    requestId: string,
    personalInfo: PersonalInfo
  ): Promise<string | undefined> {
    const resume = await this.buildResumeContent(payload, personalInfo)
    const pdf = await this.htmlPdf.renderResume(resume, personalInfo)
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
    const pdf = await this.htmlPdf.renderCoverLetter(coverLetter, {
      name: personalInfo.name,
      email: personalInfo.email,
      location: personalInfo.location,
      phone: personalInfo.phone,
      date: payload.date,
      logo: personalInfo.logo,
      avatar: personalInfo.avatar
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

  private enrichPayloadWithJobMatch(payload: GenerateDocumentPayload): JobMatchWithListing | null {
    if (!payload.jobMatchId) {
      return null
    }

    const jobMatch = this.jobMatchRepo.getByIdWithListing(payload.jobMatchId)
    if (jobMatch) {
      // Enrich payload with job listing data
      payload.job.jobDescriptionText = payload.job.jobDescriptionText || jobMatch.listing.description
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
    const provider = this.getDocumentGeneratorCliProvider()
    const cliResult = await runCliProvider(prompt, provider)

    if (!cliResult.success) {
      this.log.error({ error: cliResult.error }, 'AI resume generation failed')
      throw new Error(`AI generation failed: ${cliResult.error || 'Unknown error'}`)
    }

    this.log.info({ outputPreview: cliResult.output.slice(0, 400) }, 'AI resume raw output preview')

    try {
      const parsed = JSON.parse(cliResult.output) as ResumeContent

      // Filter work experience items (new taxonomy: 'work')
      const workItems = contentItems.filter((item) => item.aiContext === 'work')

      // Filter education items
      const educationItems = contentItems.filter((item) => item.aiContext === 'education')

      const normalizeKey = (value?: string | null) => (value || '').toLowerCase().trim()

      const mappedExperience = workItems.map((item) => ({
        role: item.role ?? '',
        company: item.title ?? '',
        location: item.location ?? '',
        startDate: item.startDate ?? '',
        endDate: item.endDate ?? '',
        highlights: (item.description || '')
          .split(/\r?\n/)
          .map((l) => l.replace(/^[–\-•]\s*/, '').trim())
          .filter(Boolean),
        technologies: item.skills ?? []
      }))

      const mappedEducation = educationItems
        .filter((item) => item.title)
        .map((item) => ({
          institution: item.title ?? '',
          degree: item.role ?? '',
          field: '',
          startDate: item.startDate ?? '',
          endDate: item.endDate ?? ''
        }))

      // Normalize and fill missing data using authoritative content items and personal info
      parsed.personalInfo = {
        name: personalInfo.name,
        title: parsed.personalInfo?.title || payload.job.role,
        summary: parsed.personalInfo?.summary || parsed.professionalSummary || personalInfo.summary || '',
        contact: {
          email: personalInfo.email || parsed.personalInfo?.contact?.email || '',
          location: personalInfo.location || parsed.personalInfo?.contact?.location || '',
          website: personalInfo.website || parsed.personalInfo?.contact?.website || '',
          linkedin: personalInfo.linkedin || parsed.personalInfo?.contact?.linkedin || '',
          github: personalInfo.github || parsed.personalInfo?.contact?.github || ''
        }
      }

      // Create lookup for authoritative experience by company name (normalized)
      const contentExperienceLookup = new Map(
        mappedExperience.map((exp) => [normalizeKey(exp.company), exp])
      )

      // Allow AI to choose/reorder relevant experiences, but keep facts grounded in source data
      const validatedExperience = (parsed.experience || [])
        .map((aiExp) => {
          const key = normalizeKey(aiExp.company)
          const source = contentExperienceLookup.get(key)
          if (!source) return null // drop hallucinated or unknown companies

          const aiHighlights = Array.isArray(aiExp.highlights)
            ? aiExp.highlights.map((h) => (h || '').trim()).filter(Boolean)
            : []

          return {
            role: source.role || aiExp.role || '',
            company: source.company,
            location: source.location || aiExp.location || '',
            startDate: source.startDate || aiExp.startDate || '',
            endDate: source.endDate || aiExp.endDate || '',
            highlights: aiHighlights.length > 0 ? aiHighlights : source.highlights,
            technologies: source.technologies
          }
        })
        .filter(Boolean) as ResumeContent['experience']

      // If AI dropped everything or returned none, fall back to full mapped list
      parsed.experience = validatedExperience.length ? validatedExperience : mappedExperience

      // Normalize skills: accept [{category, items}] or string[]; remove hallucinated skills
      const allowedSkills = new Set<string>(contentItems.flatMap((item) => item.skills || []))

      const normalizeSkillsCategory = (skills: ResumeContent['skills']): ResumeContent['skills'] => {
        if (!skills || skills.length === 0) return []
        if (skills.length && typeof skills[0] === 'string') {
          const filteredSkills = (skills as unknown as string[]).filter(
            (s) => allowedSkills.size === 0 || allowedSkills.has(s)
          )
          return filteredSkills.length > 0 ? [{ category: 'Skills', items: filteredSkills }] : []
        }

        return (skills as Array<{ category?: string; items?: unknown[] }>)
          .map((s) => ({
            category: s.category || 'Skills',
            items: Array.isArray(s.items)
              ? s.items.filter(
                  (item): item is string => typeof item === 'string' && (allowedSkills.size === 0 || allowedSkills.has(item))
                )
              : []
          }))
          .filter((s) => s.items.length > 0)
      }

      parsed.skills = normalizeSkillsCategory(parsed.skills || [])

      if (!parsed.skills || parsed.skills.length === 0) {
        const techFromExperience = Array.from(new Set(parsed.experience.flatMap((e) => e.technologies || [])))
        parsed.skills = techFromExperience.length ? [{ category: 'Skills', items: techFromExperience }] : []
      }

      // Enhance education data: use AI output but fill in missing fields from content items
      if (Array.isArray(parsed.education) && parsed.education.length > 0) {
        // Create a lookup map from institution name (normalized) to content item education
        const educationLookup = new Map(
          mappedEducation.map((edu) => [normalizeKey(edu.institution), edu])
        )

        parsed.education = parsed.education.map((aiEdu) => {
          const instKey = normalizeKey(aiEdu.institution)
          const contentEdu = educationLookup.get(instKey)
          if (contentEdu) {
            // Merge: use content item data as authoritative, AI data as fallback
            return {
              institution: contentEdu.institution || aiEdu.institution || '',
              degree: contentEdu.degree || aiEdu.degree || '',
              field: aiEdu.field || contentEdu.field || '',
              startDate: contentEdu.startDate || aiEdu.startDate || '',
              endDate: contentEdu.endDate || aiEdu.endDate || ''
            }
          }
          return aiEdu
        })
      } else {
        // No AI education - use content items directly
        parsed.education = mappedEducation
      }

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
    const provider = this.getDocumentGeneratorCliProvider()
    const cliResult = await runCliProvider(prompt, provider)

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
  private getDocumentGeneratorCliProvider(): CliProvider {
    const config = this.configRepo.get<AISettings>('ai-settings')
    if (!config?.payload?.documentGenerator?.selected) {
      throw new UserFacingError('AI settings not configured. Please configure ai-settings in the database.')
    }
    const selection = config.payload.documentGenerator.selected

    const provider = selection.provider
    const interfaceType = selection.interface

    if (interfaceType !== 'cli') {
      this.log.warn(
        { provider, interface: interfaceType },
        'Document generator interface not supported in CLI runner; falling back to codex/cli'
      )
      return 'codex'
    }

    if (provider === 'codex' || provider === 'gemini' || provider === 'claude') {
      return provider
    }

    this.log.warn({ provider }, 'Document generator provider not supported; falling back to codex')
    return 'codex'
  }
}
