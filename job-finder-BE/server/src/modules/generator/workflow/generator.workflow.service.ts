import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'
import type {
  ResumeContent,
  CoverLetterContent,
  PersonalInfo,
  ContentItem,
  JobMatchWithListing,
  DraftContentResponse,
  ReviewDocumentType
} from '@shared/types'
import { logger } from '../../../logger'
import { PersonalInfoStore } from '../personal-info.store'
import { ContentItemRepository } from '../../content-items/content-item.repository'
import { JobMatchRepository } from '../../job-matches/job-match.repository'
import { storageService, type ArtifactMetadata } from './services/storage.service'
import { networkStorageService } from './services/network-storage.service'
import { HtmlPdfService } from './services/html-pdf.service'
import { generateRequestId } from './request-id'
import { createInitialSteps, startStep, completeStep } from './generation-steps'
import { GeneratorWorkflowRepository } from '../generator.workflow.repository'
import { buildCoverLetterPrompt, buildResumePrompt, buildRefitPrompt } from './prompts'
import { AgentManager } from '../ai/agent-manager'
import { ConfigRepository } from '../../config/config.repository'
import { validateResumeContent, validateCoverLetterContent } from './services/ai-output-schema'
import { estimateContentFit, getContentBudget } from './services/content-fit.service'

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

// Using DraftContentResponse from @shared/types

export class GeneratorWorkflowService {
  private readonly userFriendlyError =
    'AI generation failed. Please retry in a moment or contact support if it keeps happening.'
  private readonly agentManager: AgentManager

  constructor(
    private readonly htmlPdf = new HtmlPdfService(),
    private readonly workflowRepo = new GeneratorWorkflowRepository(),
    private readonly personalInfoStore = new PersonalInfoStore(),
    private readonly contentItemRepo = new ContentItemRepository(),
    private readonly jobMatchRepo = new JobMatchRepository(),
    private readonly configRepo = new ConfigRepository(),
    private readonly log: Logger = logger
  ) {
    this.agentManager = new AgentManager(this.configRepo, this.log)
  }

  /**
   * Get draft content for review.
   * Returns the content waiting for user review along with its type.
   */
  getDraftContent(requestId: string): DraftContentResponse | null {
    const request = this.workflowRepo.getRequest(requestId)
    if (!request || request.status !== 'awaiting_review') {
      return null
    }

    // Determine which document type is awaiting review based on steps
    const steps = request.steps ?? []
    const reviewResumeStep = steps.find((s) => s.id === 'review-resume')
    const reviewCoverLetterStep = steps.find((s) => s.id === 'review-cover-letter')
    const renderPdfStep = steps.find((s) => s.id === 'render-pdf')

    // If review-resume is completed but render-pdf hasn't started, we're reviewing resume
    // If review-cover-letter is completed but render-pdf hasn't started, we're reviewing cover letter
    // Check which review step was most recently completed
    if (reviewCoverLetterStep?.status === 'completed' && renderPdfStep?.status === 'pending') {
      const content = request.intermediateResults?.coverLetterContent
      if (content) {
        return {
          requestId,
          documentType: 'coverLetter',
          content,
          status: 'awaiting_review'
        }
      }
    }

    if (reviewResumeStep?.status === 'completed') {
      // Check if we're still waiting for resume review (cover letter step pending or not exists)
      const generateCoverLetterStep = steps.find((s) => s.id === 'generate-cover-letter')
      if (!generateCoverLetterStep || generateCoverLetterStep.status === 'pending') {
        const content = request.intermediateResults?.resumeContent
        if (content) {
          return {
            requestId,
            documentType: 'resume',
            content,
            status: 'awaiting_review'
          }
        }
      }
    }

    return null
  }

  /**
   * Submit reviewed/edited content and continue the workflow.
   * Returns the next step result.
   */
  async submitReview(
    requestId: string,
    documentType: ReviewDocumentType,
    content: ResumeContent | CoverLetterContent
  ): Promise<StepExecutionResult | null> {
    const request = this.workflowRepo.getRequest(requestId)
    if (!request || request.status !== 'awaiting_review') {
      return null
    }

    // Update the intermediate results with the edited content
    if (documentType === 'resume') {
      this.workflowRepo.updateRequest(requestId, {
        status: 'processing',
        intermediateResults: {
          ...request.intermediateResults,
          resumeContent: content as ResumeContent
        }
      })
    } else {
      this.workflowRepo.updateRequest(requestId, {
        status: 'processing',
        intermediateResults: {
          ...request.intermediateResults,
          coverLetterContent: content as CoverLetterContent
        }
      })
    }

    // Continue to the next step
    return this.runNextStep(requestId)
  }

  private async ensureProviderAvailable(): Promise<void> {
    this.agentManager.ensureAvailable('document')
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
          await this.generateResumeContent(payload, requestId, personalInfo)
          // No URL yet - content is stored for review
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
          await this.generateCoverLetterContent(payload, requestId, personalInfo)
          // No URL yet - content is stored for review
        },
        'Cover letter generation'
      )
    }

    // Review steps: pause workflow and wait for user to review/edit content
    if (pendingStep.id === 'review-resume' || pendingStep.id === 'review-cover-letter') {
      const updated = completeStep(startStep(steps, pendingStep.id), pendingStep.id, 'completed')
      this.workflowRepo.updateRequest(requestId, { status: 'awaiting_review', steps: updated })
      const finalRequest = this.workflowRepo.getRequest(requestId)
      return {
        requestId,
        status: 'awaiting_review',
        steps: updated,
        nextStep: steps.find((s) => s.status === 'pending' && s.id !== pendingStep.id)?.id,
        stepCompleted: pendingStep.id,
        resumeUrl: finalRequest?.resumeUrl ?? undefined,
        coverLetterUrl: finalRequest?.coverLetterUrl ?? undefined
      }
    }

    // render-pdf step: Render PDFs from intermediateResults content
    if (pendingStep.id === 'render-pdf') {
      return this.executeStep(
        'render-pdf',
        requestId,
        request.status,
        steps,
        async () => {
          let resumeUrl: string | undefined
          let coverLetterUrl: string | undefined

          // Render resume if content exists
          if (request.intermediateResults?.resumeContent) {
            resumeUrl = await this.renderResumePdf(payload, requestId, personalInfo)
            this.workflowRepo.updateRequest(requestId, { resumeUrl })
          }

          // Render cover letter if content exists
          if (request.intermediateResults?.coverLetterContent) {
            coverLetterUrl = await this.renderCoverLetterPdf(payload, requestId, personalInfo)
            this.workflowRepo.updateRequest(requestId, { coverLetterUrl })
          }

          // Return URLs (the executeStep will handle updating the request)
          return resumeUrl
            ? { urlField: 'resumeUrl' as const, url: resumeUrl }
            : coverLetterUrl
              ? { urlField: 'coverLetterUrl' as const, url: coverLetterUrl }
              : undefined
        },
        'PDF rendering'
      )
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

  /**
   * Generate resume content and store it in intermediateResults for review.
   * Does NOT render PDF - that happens in renderResumePdf after review.
   */
  private async generateResumeContent(
    payload: GenerateDocumentPayload,
    requestId: string,
    personalInfo: PersonalInfo
  ): Promise<void> {
    const resume = await this.buildResumeContent(payload, personalInfo)
    // Store content for review
    const request = this.workflowRepo.getRequest(requestId)
    this.workflowRepo.updateRequest(requestId, {
      intermediateResults: {
        ...request?.intermediateResults,
        resumeContent: resume
      }
    })
  }

  /**
   * Render resume PDF from intermediateResults content.
   * Called after user has reviewed and approved the content.
   */
  private async renderResumePdf(
    payload: GenerateDocumentPayload,
    requestId: string,
    personalInfo: PersonalInfo
  ): Promise<string | undefined> {
    const request = this.workflowRepo.getRequest(requestId)
    const resume = request?.intermediateResults?.resumeContent
    if (!resume) {
      throw new Error('No resume content found in intermediateResults. Run generate-resume step first.')
    }

    const pdf = await this.htmlPdf.renderResume(resume, personalInfo)
    const metadata: ArtifactMetadata = {
      name: personalInfo.name,
      company: payload.job.company,
      role: payload.job.role,
      type: 'resume'
    }
    const saved = await storageService.saveArtifactWithMetadata(pdf, metadata, { runId: requestId })
    this.workflowRepo.addArtifact({
      id: randomUUID(),
      requestId,
      artifactType: 'resume',
      filename: saved.filename,
      storagePath: saved.storagePath,
      sizeBytes: saved.size,
      createdAt: new Date().toISOString()
    })
    
    // Copy to network storage (non-blocking, errors logged internally)
    const absolutePath = storageService.getAbsolutePath(saved.storagePath)
    networkStorageService.copyToNetwork(absolutePath, saved.filename, 'Resume')
    
    return storageService.createPublicUrl(saved.storagePath)
  }

  /**
   * Generate cover letter content and store it in intermediateResults for review.
   * Does NOT render PDF - that happens in renderCoverLetterPdf after review.
   */
  private async generateCoverLetterContent(
    payload: GenerateDocumentPayload,
    requestId: string,
    personalInfo: PersonalInfo
  ): Promise<void> {
    const coverLetter = await this.buildCoverLetterContent(payload, personalInfo)
    // Store content for review
    const request = this.workflowRepo.getRequest(requestId)
    this.workflowRepo.updateRequest(requestId, {
      intermediateResults: {
        ...request?.intermediateResults,
        coverLetterContent: coverLetter
      }
    })
  }

  /**
   * Render cover letter PDF from intermediateResults content.
   * Called after user has reviewed and approved the content.
   */
  private async renderCoverLetterPdf(
    payload: GenerateDocumentPayload,
    requestId: string,
    personalInfo: PersonalInfo
  ): Promise<string | undefined> {
    const request = this.workflowRepo.getRequest(requestId)
    const coverLetter = request?.intermediateResults?.coverLetterContent
    if (!coverLetter) {
      throw new Error('No cover letter content found in intermediateResults. Run generate-cover-letter step first.')
    }

    const title = personalInfo.title || payload.job.role
    const pdf = await this.htmlPdf.renderCoverLetter(coverLetter, {
      name: personalInfo.name,
      email: personalInfo.email,
      location: personalInfo.location,
      phone: personalInfo.phone,
      date: payload.date,
      logo: personalInfo.logo,
      avatar: personalInfo.avatar,
      title,
      website: personalInfo.website,
      linkedin: personalInfo.linkedin,
      github: personalInfo.github
    })
    const metadata: ArtifactMetadata = {
      name: personalInfo.name,
      company: payload.job.company,
      role: payload.job.role,
      type: 'cover-letter'
    }
    const saved = await storageService.saveArtifactWithMetadata(pdf, metadata, { runId: requestId })
    this.workflowRepo.addArtifact({
      id: randomUUID(),
      requestId,
      artifactType: 'cover-letter',
      filename: saved.filename,
      storagePath: saved.storagePath,
      sizeBytes: saved.size,
      createdAt: new Date().toISOString()
    })
    
    // Copy to network storage (non-blocking, errors logged internally)
    const absolutePath = storageService.getAbsolutePath(saved.storagePath)
    networkStorageService.copyToNetwork(absolutePath, saved.filename, 'CoverLetter')
    
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

  /**
   * Ground AI-generated resume content against authoritative content items and personal info.
   * Ensures factual accuracy by replacing hallucinated data with source-of-truth data.
   */
  private groundResumeContent(
    parsed: ResumeContent,
    contentItems: ContentItem[],
    personalInfo: PersonalInfo,
    payload: GenerateDocumentPayload
  ): ResumeContent {
    const workItems = contentItems.filter((item) => item.aiContext === 'work')
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
          // Let AI select a subset of source technologies (for relevance/space), but only allow known ones
          technologies: Array.isArray(aiExp.technologies) && aiExp.technologies.length > 0
            ? source.technologies.filter((t) =>
                aiExp.technologies!.some((ait) => (ait || '').toLowerCase() === t.toLowerCase())
              )
            : source.technologies
        }
      })
      .filter(Boolean) as ResumeContent['experience']

    // If AI dropped everything or returned none, fall back to full mapped list
    parsed.experience = validatedExperience.length ? validatedExperience : mappedExperience

    // Hard-validate skills: only allow skills that exist in the candidate's source content items.
    // This prevents the AI from inventing technologies like AWS, Kafka, etc.
    // Include skills from both item.skills[] and description text of skills-context items,
    // since both are presented to the model as authoritative data.
    const allSourceSkills = new Set<string>(
      contentItems.flatMap((item) => {
        const skillsFromField = (item.skills || []).map((s) => s.toLowerCase().trim())
        const skillsFromDescription: string[] =
          item.aiContext === 'skills' && typeof item.description === 'string'
            ? item.description.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).map((s) => s.toLowerCase())
            : []
        return [...skillsFromField, ...skillsFromDescription]
      })
    )

    const validateSkills = (skills: ResumeContent['skills']): NonNullable<ResumeContent['skills']> => {
      if (!Array.isArray(skills)) return []

      return skills
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map(({ category, items }) => ({
          category: (category || '').toString().trim() || 'Skills',
          items: (Array.isArray(items) ? items : [])
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .filter((item) => allSourceSkills.has(item.toLowerCase().trim())),
        }))
        .filter((s) => s.items.length > 0)
    }

    // Validate AI skills, then fall back to source skills if validation removed everything
    // (e.g., due to aliasing like "JS" vs "JavaScript")
    const validatedSkills = validateSkills(parsed.skills || [])
    if (validatedSkills.length > 0) {
      parsed.skills = validatedSkills
    } else {
      // Rebuild skills from authoritative skills-context content items
      const skillsItems = contentItems.filter((item) => item.aiContext === 'skills')
      if (skillsItems.length > 0) {
        parsed.skills = skillsItems
          .map((item) => {
            const category = (item.title || '').trim() || 'Skills'
            const items = item.description
              ? item.description.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
              : item.skills || []
            return { category, items }
          })
          .filter((s) => s.items.length > 0)
      } else {
        // Last resort: flatten all source skills into a single category
        const flatSkills = Array.from(allSourceSkills).filter(Boolean).sort()
        parsed.skills = flatSkills.length ? [{ category: 'Skills', items: flatSkills }] : []
      }
    }

    // Enhance education data: use AI output but fill in missing fields from content items
    if (Array.isArray(parsed.education) && parsed.education.length > 0) {
      const educationLookup = new Map(
        mappedEducation.map((edu) => [normalizeKey(edu.institution), edu])
      )

      parsed.education = parsed.education.map((aiEdu) => {
        const instKey = normalizeKey(aiEdu.institution)
        const contentEdu = educationLookup.get(instKey)
        if (contentEdu) {
          return {
            institution: contentEdu.institution || aiEdu.institution || '',
            degree: contentEdu.degree || aiEdu.degree || '',
            field: aiEdu.field || '',
            startDate: contentEdu.startDate || aiEdu.startDate || '',
            endDate: contentEdu.endDate || aiEdu.endDate || ''
          }
        }
        return aiEdu
      })
    } else {
      parsed.education = mappedEducation
    }

    // Ground projects against actual content items (drop hallucinated projects).
    // Projects must exist in content items — AI selects which to include, not invents new ones.
    const projectItems = contentItems.filter((item) => item.aiContext === 'project')
    if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
      if (projectItems.length === 0) {
        // No project content items — AI cannot include projects it doesn't have source data for
        parsed.projects = []
      } else {
        const projectLookup = new Map(
          projectItems.map((item) => [normalizeKey(item.title), item])
        )

        parsed.projects = parsed.projects
          .map((aiProject) => {
            const key = normalizeKey(aiProject.name)
            const source = projectLookup.get(key)
            if (!source) return null // drop hallucinated projects

            return {
              name: source.title || aiProject.name,
              description: aiProject.description || '',
              highlights: Array.isArray(aiProject.highlights)
                ? aiProject.highlights.filter((h: unknown) => typeof h === 'string' && h.trim())
                : [],
              technologies: source.skills?.length ? source.skills : (aiProject.technologies || []),
              ...(source.website ? { link: source.website } : {})
            }
          })
          .filter(Boolean) as NonNullable<ResumeContent['projects']>
      }
    } else {
      parsed.projects = []
    }

    parsed.professionalSummary = parsed.professionalSummary || personalInfo.summary || ''

    return parsed
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
    const agentResult = await this.agentManager.execute('document', prompt)

    this.log.info(
      { outputPreview: agentResult.output.slice(0, 400), agentId: agentResult.agentId, model: agentResult.model },
      'AI resume raw output preview'
    )

    // Validate and recover AI output using schema validation
    const validation = validateResumeContent(agentResult.output, this.log)
    if (!validation.success) {
      this.log.error(
        { errors: validation.errors, output: agentResult.output.slice(0, 500), recoveryActions: validation.recoveryActions },
        'Resume validation failed even after recovery attempts'
      )
      throw new Error(`AI returned invalid resume content: ${validation.errors?.join(', ')}`)
    }

    if (validation.recovered) {
      this.log.info({ recoveryActions: validation.recoveryActions }, 'Resume content recovered from malformed AI output')
    }

    try {
      let parsed = validation.data as ResumeContent
      parsed = this.groundResumeContent(parsed, contentItems, personalInfo, payload)

      // Post-generation single-page fit check with LLM-powered refit
      const fitCheck = estimateContentFit(parsed)
      if (!fitCheck.fits) {
        this.log.info(
          { overflow: fitCheck.overflow, mainLines: fitCheck.mainColumnLines, suggestions: fitCheck.suggestions },
          'Resume content exceeds single-page estimate, requesting LLM refit'
        )

        try {
          const contentBudget = getContentBudget()
          const refitPrompt = buildRefitPrompt(parsed, fitCheck, contentBudget, payload, jobMatch)
          const refitResult = await this.agentManager.execute('document', refitPrompt)

          this.log.info(
            { outputPreview: refitResult.output.slice(0, 400) },
            'AI refit raw output preview'
          )

          const refitValidation = validateResumeContent(refitResult.output, this.log)
          if (refitValidation.success) {
            let refitParsed = refitValidation.data as ResumeContent
            refitParsed = this.groundResumeContent(refitParsed, contentItems, personalInfo, payload)

            const refitFitCheck = estimateContentFit(refitParsed)
            if (refitFitCheck.fits) {
              this.log.info('LLM refit resolved overflow successfully')
            } else {
              this.log.warn(
                { overflow: refitFitCheck.overflow, mainLines: refitFitCheck.mainColumnLines },
                'LLM refit still overflows — returning refit result (closer to fitting)'
              )
            }
            parsed = refitParsed
          } else {
            this.log.warn(
              { errors: refitValidation.errors, recoveryActions: refitValidation.recoveryActions },
              'LLM refit validation failed — keeping original content'
            )
          }
        } catch (refitError) {
          this.log.warn(
            { err: refitError },
            'LLM refit call failed — keeping original content'
          )
        }
      }

      return parsed
    } catch (error) {
      this.log.error({ err: error, output: agentResult.output.slice(0, 500) }, 'Failed to parse AI resume output as JSON')
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
    const agentResult = await this.agentManager.execute('document', prompt)

    // Validate and recover AI output using schema validation
    const validation = validateCoverLetterContent(agentResult.output, this.log)
    if (!validation.success) {
      this.log.error(
        { errors: validation.errors, output: agentResult.output.slice(0, 500), recoveryActions: validation.recoveryActions },
        'Cover letter validation failed even after recovery attempts'
      )
      throw new Error(`AI returned invalid cover letter content: ${validation.errors?.join(', ')}`)
    }

    if (validation.recovered) {
      this.log.info({ recoveryActions: validation.recoveryActions }, 'Cover letter content recovered from malformed AI output')
    }

    const parsed = validation.data as CoverLetterContent

    // Validate cover letter content against source data to catch potential hallucinations
    this.warnOnPotentialHallucinations(parsed, contentItems, payload)

    return parsed
  }

  /**
   * Check cover letter content for potential hallucinations.
   * Logs warnings but doesn't reject content (cover letters need more creative freedom than resumes).
   */
  private warnOnPotentialHallucinations(
    content: CoverLetterContent,
    contentItems: Array<{ title?: string | null; skills?: string[] | null; aiContext?: string | null }>,
    payload: GenerateDocumentPayload
  ): void {
    // Build set of allowed company names (target company + work experience companies + project names)
    const workItems = contentItems.filter((item) => item.aiContext === 'work')
    const projectItems = contentItems.filter((item) => item.aiContext === 'project')
    const allowedCompanies = new Set<string>([
      payload.job.company.toLowerCase().trim(),
      ...workItems.map((item) => (item.title || '').toLowerCase().trim()).filter(Boolean),
      ...projectItems.map((item) => (item.title || '').toLowerCase().trim()).filter(Boolean)
    ])

    // Build set of allowed skills from content items
    const allowedSkills = new Set<string>(
      contentItems.flatMap((item) => (item.skills || []).map((s) => s.toLowerCase().trim()))
    )

    // Combine all text content for analysis once (DRY)
    // Defensive: ensure content.bodyParagraphs is an array before spreading
    const bodyParagraphs = Array.isArray(content.bodyParagraphs) ? content.bodyParagraphs : []
    const combinedContent = [
      content.openingParagraph || '',
      ...bodyParagraphs,
      content.closingParagraph || ''
    ].join(' ')
    const allText = combinedContent.toLowerCase()

    // Check for company name mentions that aren't in allowed list
    // This is a heuristic - we look for patterns like "at [Company]" or "with [Company]"
    const companyMentionPatterns = /(?:at|with|for|joined|worked at)\s+([a-z][a-z0-9\s&]+?)(?:\s+(?:as|where|and|,|\.|$))/gi
    let match: RegExpExecArray | null
    const mentionedCompanies: string[] = []

    while ((match = companyMentionPatterns.exec(combinedContent)) !== null) {
      const company = match[1].trim().toLowerCase()
      if (company && !allowedCompanies.has(company) && company.length > 2) {
        mentionedCompanies.push(match[1].trim())
      }
    }

    if (mentionedCompanies.length > 0) {
      this.log.warn(
        { mentionedCompanies, allowedCompanies: Array.from(allowedCompanies) },
        'Cover letter may mention companies not in source data (potential hallucination)'
      )
    }

    // Check for technology/skill mentions that aren't in allowed list
    // Only log if we have skills to compare against
    if (allowedSkills.size > 0) {
      const commonTechTerms = [
        'javascript', 'typescript', 'python', 'java', 'react', 'node', 'aws', 'docker',
        'kubernetes', 'sql', 'mongodb', 'postgresql', 'redis', 'graphql', 'rest',
        'microservices', 'ci/cd', 'agile', 'scrum', 'git', 'linux', 'cloud'
      ]

      const mentionedUnknownSkills = commonTechTerms.filter(
        (term) => allText.includes(term) && !allowedSkills.has(term)
      )

      if (mentionedUnknownSkills.length > 0) {
        this.log.warn(
          { mentionedUnknownSkills },
          'Cover letter mentions technologies not in source content items (potential hallucination)'
        )
      }
    }
  }
}
