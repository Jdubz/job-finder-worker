/**
 * Resume & Cover Letter Generator Cloud Function
 *
 * Supports both OpenAI and Gemini AI providers with optional authentication
 * for tiered rate limiting.
 *
 * Features:
 * - Multi-provider AI (OpenAI GPT-4o, Google Gemini 2.0 Flash)
 * - PDF generation with custom branding
 * - GCS storage with signed URLs
 * - Firestore tracking and document history
 * - Rate limiting (10 viewer / 20 editor requests per 15min)
 * - Custom AI prompt management
 * - Avatar/logo upload with image validation
 *
 * Documentation:
 * - Overview: docs/development/generator/README.md
 * - Schema: docs/development/generator/SCHEMA.md
 * - Common Mistakes: docs/development/COMMON_MISTAKES.md
 */

import { https } from "firebase-functions/v2"
import type { Request, Response } from "express"
import Joi from "joi"
import busboy from "busboy"
import type { Readable } from "stream"
import { Firestore } from "@google-cloud/firestore"
import { GeneratorService } from "./services/generator.service"
import { ContentItemService } from "./services/content-item.service"
import type { ContentItem } from "./types/content-item.types"
import { createAIProvider } from "./services/ai-provider.factory"
import { PDFService } from "./services/pdf.service"
import { StorageService } from "./services/storage.service"
import {
  createInitialSteps,
  startStep,
  completeStep,
} from "./utils/generation-steps"
import { verifyAuthenticatedUser, checkOptionalAuth, type AuthenticatedRequest } from "./middleware/auth.middleware"
import { generatorRateLimiter, generatorEditorRateLimiter } from "./middleware/rate-limit.middleware"
import { verifyAppCheck } from "./middleware/app-check.middleware"
import type { GenerationType, GeneratorResponse, GeneratorRequest, GenerationStep } from "./types/generator.types"
import { timestampToMillis } from "./types/generator.types"
import { logger } from "./utils/logger"
import { generateRequestId } from "./utils/request-id"
import { corsHandler } from "./config/cors"
import { PACKAGE_VERSION } from "./config/versions"
import { DATABASE_ID } from "./config/database"
import {
  sendErrorResponse,
  sendValidationError,
  sendNotFoundError,
  sendInternalError,
} from "./utils/response-helpers"

// Initialize services
const generatorService = new GeneratorService(logger)
const contentItemService = new ContentItemService(logger)
const pdfService = new PDFService(logger)
const storageService = new StorageService(undefined, logger) // Use environment-aware bucket selection

// Initialize Firestore client for job-match updates
const firestore = new Firestore({
  databaseId: DATABASE_ID,
})

/**
 * Helper function to fetch job match data for prompt customization
 */
async function fetchJobMatchData(jobMatchId: string): Promise<import("./types/generator.types").JobMatchData | undefined> {
  try {
    const jobMatchRef = firestore.collection("job-matches").doc(jobMatchId)
    const jobMatchDoc = await jobMatchRef.get()

    if (!jobMatchDoc.exists) {
      logger.warning("Job match not found", { jobMatchId })
      return undefined
    }

    const jobMatch = jobMatchDoc.data()
    if (!jobMatch) {
      return undefined
    }

    // Extract relevant job match data for prompt customization
    return {
      matchScore: jobMatch.matchScore,
      matchedSkills: jobMatch.matchedSkills,
      missingSkills: jobMatch.missingSkills,
      keyStrengths: jobMatch.keyStrengths,
      potentialConcerns: jobMatch.potentialConcerns,
      keywords: jobMatch.keywords,
      customizationRecommendations: jobMatch.customizationRecommendations,
      resumeIntakeData: jobMatch.resumeIntakeData,
    }
  } catch (error) {
    logger.error("Failed to fetch job match data", { error, jobMatchId })
    // Return undefined rather than failing - generation can proceed without it
    return undefined
  }
}

/**
 * Helper function to update job-match record after successful generation
 */
async function updateJobMatchAfterGeneration(jobMatchId: string, generationRequestId: string): Promise<void> {
  try {
    const jobMatchRef = firestore.collection("job-matches").doc(jobMatchId)

    await jobMatchRef.update({
      documentGenerated: true,
      generationId: generationRequestId,
      updatedAt: new Date().toISOString(),
    })

    logger.info("Job match updated after successful generation", {
      jobMatchId,
      generationId: generationRequestId,
    })
  } catch (error) {
    // Log error but don't fail the generation - the documents were already created successfully
    logger.error("Failed to update job match after generation", {
      error,
      jobMatchId,
      generationId: generationRequestId,
    })
  }
}

// Validation schemas
const generateRequestSchema = Joi.object({
  generateType: Joi.string().valid("resume", "coverLetter", "both").required(),
  provider: Joi.string().valid("openai", "gemini").optional().default("gemini"),
  job: Joi.object({
    role: Joi.string().trim().min(1).max(200).required(),
    company: Joi.string().trim().min(1).max(200).required(),
    companyWebsite: Joi.string().uri().optional().allow(""),
    jobDescriptionUrl: Joi.string().uri().optional().allow(""),
    jobDescriptionText: Joi.string().trim().max(10000).optional().allow(""),
  }).required(),
  preferences: Joi.object({
    style: Joi.string().valid("modern", "traditional", "technical", "executive").optional(),
    emphasize: Joi.array().items(Joi.string()).optional(),
  }).optional(),
  date: Joi.string().optional(), // Client's local date string for cover letter
  jobMatchId: Joi.string().optional(), // Reference to job-match document ID
})

const updatePersonalInfoSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().trim().max(50).optional().allow(""),
  location: Joi.string().trim().max(100).optional().allow(""),
  website: Joi.string().uri().optional().allow(""),
  github: Joi.string().uri().optional().allow(""),
  linkedin: Joi.string().uri().optional().allow(""),
  avatar: Joi.string().uri().optional().allow(""),
  logo: Joi.string().uri().optional().allow(""),
  accentColor: Joi.string()
    .pattern(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  defaultStyle: Joi.string().valid("modern", "traditional", "technical", "executive").optional(),
})

const updateJobMatchSchema = Joi.object({
  applied: Joi.boolean().optional(),
  documentGenerated: Joi.boolean().optional(),
  generationId: Joi.string().optional(),
  notes: Joi.string().trim().max(5000).optional().allow(""),
})

/**
 * Main handler for generator requests
 */
const handleGeneratorRequest = async (req: Request, res: Response): Promise<void> => {
  const requestId = generateRequestId()

  try {
    // Handle CORS
    await new Promise<void>((resolve, reject) => {
      corsHandler(req, res, async () => {
        try {
          // Handle OPTIONS preflight
          if (req.method === "OPTIONS") {
            res.status(204).send("")
            resolve()
            return
          }

          const path = req.path || req.url

          if (req.method !== "OPTIONS" && path !== "/health") {
            await verifyAppCheck(req, res, () => {})
            if (res.headersSent) {
              resolve()
              return
            }
          }

          // Route: GET /health - Health check (public)
          if (req.method === "GET" && path === "/health") {
            res.status(200).json({
              success: true,
              service: "manageGenerator",
              status: "healthy",
              version: PACKAGE_VERSION,
              timestamp: new Date().toISOString(),
            })
            resolve()
            return
          }

          // Route: POST /generator/generate - Generate documents (public, rate limited)
          if (req.method === "POST" && path === "/generator/generate") {
            // Check if user is authenticated (optional, doesn't reject if not)
            const isAuthenticated = await checkOptionalAuth(req as AuthenticatedRequest, logger)

            // Apply appropriate rate limiting based on auth status
            const rateLimiter = isAuthenticated ? generatorEditorRateLimiter : generatorRateLimiter
            await new Promise<void>((resolveRateLimit, rejectRateLimit) => {
              rateLimiter(req, res, (err) => {
                if (err) rejectRateLimit(err)
                else resolveRateLimit()
              })
            })

            await handleGenerate(req, res, requestId)
            resolve()
            return
          }

          // Route: POST /generator/start - Initialize generation (public, rate limited)
          if (req.method === "POST" && path === "/generator/start") {
            // Check if user is authenticated (optional, doesn't reject if not)
            const isAuthenticated = await checkOptionalAuth(req as AuthenticatedRequest, logger)

            // Apply appropriate rate limiting based on auth status
            const rateLimiter = isAuthenticated ? generatorEditorRateLimiter : generatorRateLimiter
            await new Promise<void>((resolveRateLimit, rejectRateLimit) => {
              rateLimiter(req, res, (err) => {
                if (err) rejectRateLimit(err)
                else resolveRateLimit()
              })
            })

            await handleStartGeneration(req, res, requestId)
            resolve()
            return
          }

          // Route: POST /generator/step/:requestId - Execute next step (public, no additional rate limit)
          if (req.method === "POST" && path.startsWith("/generator/step/")) {
            await handleExecuteStep(req, res, requestId)
            resolve()
            return
          }

          // Route: GET /generator/personal-info - Get personal info (public)
          if (req.method === "GET" && path === "/generator/personal-info") {
            await handleGetPersonalInfo(req, res, requestId)
            resolve()
            return
          }

          // Legacy route for backward compatibility
          if (req.method === "GET" && path === "/generator/defaults") {
            await handleGetPersonalInfo(req, res, requestId)
            resolve()
            return
          }

          // Route: GET /generator/requests/:id - Get request status (public for polling)
          if (req.method === "GET" && path.startsWith("/generator/requests/")) {
            await handleGetRequest(req, res, requestId)
            resolve()
            return
          }

          // All other routes require authentication
          await new Promise<void>((resolveAuth, rejectAuth) => {
            verifyAuthenticatedUser(logger)(req as AuthenticatedRequest, res, (err) => {
              if (err) rejectAuth(err)
              else resolveAuth()
            })
          })

          // Route: PUT /generator/personal-info - Update personal info (auth required)
          if (req.method === "PUT" && path === "/generator/personal-info") {
            await handleUpdatePersonalInfo(req as AuthenticatedRequest, res, requestId)
            resolve()
            return
          }

          // Legacy route for backward compatibility
          if (req.method === "PUT" && path === "/generator/defaults") {
            await handleUpdatePersonalInfo(req as AuthenticatedRequest, res, requestId)
            resolve()
            return
          }

          // Route: POST /generator/upload-image - Upload avatar/logo (auth required)
          if (req.method === "POST" && path === "/generator/upload-image") {
            await handleUploadImage(req as AuthenticatedRequest, res, requestId)
            resolve()
            return
          }

          // Route: GET /generator/requests - List requests (auth required)
          if (req.method === "GET" && path === "/generator/requests") {
            await handleListRequests(req as AuthenticatedRequest, res, requestId)
            resolve()
            return
          }

          // Route: GET /generator/job-matches - List job matches (auth required)
          if (req.method === "GET" && path === "/generator/job-matches") {
            await handleListJobMatches(req as AuthenticatedRequest, res, requestId)
            resolve()
            return
          }

          // Route: PUT /generator/job-matches/:id - Update job match (auth required)
          if (req.method === "PUT" && path.startsWith("/generator/job-matches/")) {
            await handleUpdateJobMatch(req as AuthenticatedRequest, res, requestId)
            resolve()
            return
          }

          // Unknown route
          sendErrorResponse(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED", {
            logger,
            requestId,
            logContext: { method: req.method, path },
          })
          resolve()
        } catch (err) {
          reject(err)
        }
      })
    })
  } catch (error) {
    sendInternalError(res, "Unexpected error in generator handler", error instanceof Error ? error : undefined, {
      logger,
      requestId,
    })
  }
}

/**
 * POST /generator/generate - Generate documents
 */
async function handleGenerate(req: Request, res: Response, requestId: string): Promise<void> {
  const startTime = Date.now()

  try {
    // Validate request body
    const { error, value } = generateRequestSchema.validate(req.body)

    if (error) {
      sendValidationError(res, error.details[0].message, {
        logger,
        requestId,
        logContext: { details: error.details },
      })
      return
    }

    const generateType: GenerationType = value.generateType
    const job = value.job
    const preferences = value.preferences
    const provider = value.provider // AI provider selection (openai or gemini)
    const clientDate = value.date // Client's local date for cover letter
    const jobMatchId = value.jobMatchId // Optional job-match ID for tracking

    logger.info("Processing generation request", {
      requestId,
      generateType,
      role: job.role,
      company: job.company,
      jobMatchId,
    })

    // Step 1: Fetch personal info
    const personalInfo = await generatorService.getPersonalInfo()
    if (!personalInfo) {
      throw new Error("Personal info not found. Please seed the personal-info document.")
    }

    // Step 2: Fetch content items and job match data if provided
    const [contentItems, jobMatchData] = await Promise.all([
      contentItemService.listItems({ visibility: "published" }),
      jobMatchId ? fetchJobMatchData(jobMatchId) : Promise.resolve(undefined),
    ])

    logger.info("Fetched content data", {
      contentItemsCount: contentItems.length,
      hasJobMatchData: !!jobMatchData,
    })

    // Step 3: Create request document with initial steps
    const generationRequestId = await generatorService.createRequest(
      generateType,
      job,
      personalInfo,
      {
        contentItems, // Pass all content items instead of separate entries/blurbs
      },
      preferences,
      requestId, // Use HTTP request ID as viewer session ID for now
      undefined, // editorEmail (undefined for now)
      provider, // AI provider selection (openai or gemini, defaults to gemini)
      jobMatchId // Job match ID for tracking
    )

    // Initialize step tracking
    let steps = createInitialSteps(generateType)
    await generatorService.updateSteps(generationRequestId, steps)
    await generatorService.updateStatus(generationRequestId, "processing")

    // Step 1: Start fetch_data
    steps = startStep(steps, "fetch_data")

    // Step 4: Initialize AI provider (OpenAI or Gemini)
    const aiProvider = await createAIProvider(provider || "gemini", logger)

    logger.info("AI provider initialized", {
      provider: aiProvider.providerType,
      model: aiProvider.model,
      requestId,
    })

    // Complete fetch_data step
    steps = completeStep(steps, "fetch_data")
    await generatorService.updateSteps(generationRequestId, steps)

    // Step 5: Generate documents based on type
    let resumeResult: Awaited<ReturnType<typeof aiProvider.generateResume>> | undefined
    let coverLetterResult: Awaited<ReturnType<typeof aiProvider.generateCoverLetter>> | undefined
    let resumePDF: Buffer | undefined
    let coverLetterPDF: Buffer | undefined

    try {
      // Prepare job description
      const jobDescription =
        job.jobDescriptionText || job.jobDescriptionUrl
          ? `${job.jobDescriptionText || ""}\n${job.jobDescriptionUrl ? `Job URL: ${job.jobDescriptionUrl}` : ""}`.trim()
          : undefined

      // Generate resume if requested
      if (generateType === "resume" || generateType === "both") {
        // Start generate_resume step
        steps = startStep(steps, "generate_resume")
        await generatorService.updateSteps(generationRequestId, steps)

        logger.info("Generating resume", { requestId })

        resumeResult = await aiProvider.generateResume({
          personalInfo: {
            name: personalInfo.name,
            email: personalInfo.email,
            phone: personalInfo.phone,
            location: personalInfo.location,
            website: personalInfo.website,
            github: personalInfo.github,
            linkedin: personalInfo.linkedin,
          },
          job: {
            role: job.role,
            company: job.company,
            companyWebsite: job.companyWebsite,
            jobDescription,
          },
          contentItems,
          emphasize: preferences?.emphasize,
          jobMatchData, // Include job match insights for prompt customization
          customPrompts: personalInfo.aiPrompts?.resume,
        })

        // Complete generate_resume step
        steps = completeStep(steps, "generate_resume")
        await generatorService.updateSteps(generationRequestId, steps)

        // Start create_resume_pdf step
        steps = startStep(steps, "create_resume_pdf")
        await generatorService.updateSteps(generationRequestId, steps)

        // Generate PDF (always use "modern" style)
        resumePDF = await pdfService.generateResumePDF(resumeResult.content, "modern", personalInfo.accentColor)

        logger.info("Resume generated", {
          tokenUsage: resumeResult.tokenUsage,
          pdfSize: resumePDF.length,
        })
      }

      // Generate cover letter if requested
      if (generateType === "coverLetter" || generateType === "both") {
        // Start generate_cover_letter step
        steps = startStep(steps, "generate_cover_letter")
        await generatorService.updateSteps(generationRequestId, steps)

        logger.info("Generating cover letter", { requestId })

        const jobDescription =
          job.jobDescriptionText || job.jobDescriptionUrl
            ? `${job.jobDescriptionText || ""}\n${job.jobDescriptionUrl ? `Job URL: ${job.jobDescriptionUrl}` : ""}`.trim()
            : undefined

        coverLetterResult = await aiProvider.generateCoverLetter({
          personalInfo: {
            name: personalInfo.name,
            email: personalInfo.email,
          },
          job: {
            role: job.role,
            company: job.company,
            companyWebsite: job.companyWebsite,
            jobDescription,
          },
          contentItems,
          jobMatchData, // Include job match insights for prompt customization
          customPrompts: personalInfo.aiPrompts?.coverLetter,
        })

        // Complete generate_cover_letter step
        steps = completeStep(steps, "generate_cover_letter")
        await generatorService.updateSteps(generationRequestId, steps)

        // Start create_cover_letter_pdf step
        steps = startStep(steps, "create_cover_letter_pdf")
        await generatorService.updateSteps(generationRequestId, steps)

        // Generate PDF
        coverLetterPDF = await pdfService.generateCoverLetterPDF(
          coverLetterResult.content,
          personalInfo.name,
          personalInfo.email,
          personalInfo.accentColor,
          clientDate
        )

        logger.info("Cover letter generated", {
          tokenUsage: coverLetterResult.tokenUsage,
          pdfSize: coverLetterPDF.length,
        })
      }

      // Step 5: Upload PDFs to GCS
      type UploadResult = Awaited<ReturnType<typeof storageService.uploadPDF>>
      let resumeUploadResult: UploadResult | undefined
      let coverLetterUploadResult: UploadResult | undefined
      let resumePublicUrl: string | undefined
      let coverLetterPublicUrl: string | undefined

      // Generate filename-safe strings
      const companySafe = job.company.replace(/[^a-z0-9]/gi, "_").toLowerCase()
      const roleSafe = job.role.replace(/[^a-z0-9]/gi, "_").toLowerCase()
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")

      // Start upload_documents step
      steps = startStep(steps, "upload_documents")
      await generatorService.updateSteps(generationRequestId, steps)

      if (resumePDF) {
        const filename = `${companySafe}_${roleSafe}_resume_${timestamp}.pdf`
        resumeUploadResult = await storageService.uploadPDF(resumePDF, filename, "resume")

        // Generate public URL
        resumePublicUrl = await storageService.generatePublicUrl(resumeUploadResult.gcsPath)

        logger.info("Resume uploaded to GCS", { gcsPath: resumeUploadResult.gcsPath })

        // Complete create_resume_pdf step with download URL (enables early download!)
        steps = completeStep(steps, "create_resume_pdf", { resumeUrl: resumePublicUrl })
        await generatorService.updateSteps(generationRequestId, steps)
      }

      if (coverLetterPDF) {
        const filename = `${companySafe}_${roleSafe}_cover_letter_${timestamp}.pdf`
        coverLetterUploadResult = await storageService.uploadPDF(coverLetterPDF, filename, "cover-letter")

        // Generate public URL
        coverLetterPublicUrl = await storageService.generatePublicUrl(coverLetterUploadResult.gcsPath)

        logger.info("Cover letter uploaded to GCS", { gcsPath: coverLetterUploadResult.gcsPath })

        // Complete create_cover_letter_pdf step with download URL (enables early download!)
        steps = completeStep(steps, "create_cover_letter_pdf", { coverLetterUrl: coverLetterPublicUrl })
        await generatorService.updateSteps(generationRequestId, steps)
      }

      // Complete upload_documents step
      steps = completeStep(steps, "upload_documents")
      await generatorService.updateSteps(generationRequestId, steps)

      // Calculate total metrics
      const durationMs = Date.now() - startTime
      const totalTokens =
        (resumeResult?.tokenUsage.totalTokens || 0) + (coverLetterResult?.tokenUsage.totalTokens || 0)
      const costUsd =
        (resumeResult ? aiProvider.calculateCost(resumeResult.tokenUsage) : 0) +
        (coverLetterResult ? aiProvider.calculateCost(coverLetterResult.tokenUsage) : 0)

      // Step 6: Create response document
      // Build result object without undefined values (Firestore doesn't allow them)
      const result: GeneratorResponse["result"] = {
        success: true,
      }

      if (resumeResult) {
        result.resume = resumeResult.content
      }

      if (coverLetterResult) {
        result.coverLetter = coverLetterResult.content
      }

      // Build metrics object without undefined values (Firestore doesn't allow them)
      const tokenUsage: {
        resumePrompt?: number
        resumeCompletion?: number
        coverLetterPrompt?: number
        coverLetterCompletion?: number
        total: number
      } = {
        total: totalTokens,
      }

      if (resumeResult) {
        tokenUsage.resumePrompt = resumeResult.tokenUsage.promptTokens
        tokenUsage.resumeCompletion = resumeResult.tokenUsage.completionTokens
      }

      if (coverLetterResult) {
        tokenUsage.coverLetterPrompt = coverLetterResult.tokenUsage.promptTokens
        tokenUsage.coverLetterCompletion = coverLetterResult.tokenUsage.completionTokens
      }

      // Build files object for GCS storage information
      const files: GeneratorResponse["files"] = {}

      if (resumeUploadResult && resumePublicUrl) {
        files.resume = {
          gcsPath: resumeUploadResult.gcsPath,
          signedUrl: resumePublicUrl,
          size: resumeUploadResult.size,
          storageClass: resumeUploadResult.storageClass,
        }
      }

      if (coverLetterUploadResult && coverLetterPublicUrl) {
        files.coverLetter = {
          gcsPath: coverLetterUploadResult.gcsPath,
          signedUrl: coverLetterPublicUrl,
          size: coverLetterUploadResult.size,
          storageClass: coverLetterUploadResult.storageClass,
        }
      }

      await generatorService.createResponse(
        generationRequestId,
        result,
        {
          durationMs,
          tokenUsage,
          costUsd,
          model: resumeResult?.model || coverLetterResult?.model || aiProvider.model,
        },
        files
      )

      // Update request status to completed
      await generatorService.updateStatus(generationRequestId, "completed")

      // Update job-match record if jobMatchId was provided
      if (jobMatchId) {
        await updateJobMatchAfterGeneration(jobMatchId, generationRequestId)
      }

      logger.info("Generation completed successfully", {
        requestId,
        generationRequestId,
        durationMs,
        totalTokens,
        costUsd,
      })

      // Step 6: Return public URLs for GCS downloads
      res.status(200).json({
        success: true,
        data: {
          generationId: generationRequestId,
          responseId: generationRequestId.replace("request", "response"),
          metadata: {
            generatedAt: new Date().toISOString(),
            role: job.role,
            company: job.company,
            generateType,
            tokenUsage: {
              total: totalTokens,
            },
            costUsd,
            model: resumeResult?.model || coverLetterResult?.model || aiProvider.model,
            durationMs,
          },
          // Return public URLs for downloads
          resumeUrl: resumePublicUrl,
          coverLetterUrl: coverLetterPublicUrl,
        },
        requestId, // HTTP request ID for tracking
      })
    } catch (generationError) {
      // Generation failed - update status and create error response
      await generatorService.updateStatus(generationRequestId, "failed")

      await generatorService.createResponse(
        generationRequestId,
        {
          success: false,
          error: {
            message: generationError instanceof Error ? generationError.message : String(generationError),
            stage: (provider === "openai" ? "openai_generation" : "gemini_generation") as
              | "openai_generation"
              | "gemini_generation",
          },
        },
        {
          durationMs: Date.now() - startTime,
          model: aiProvider.model,
        }
      )

      throw generationError
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isAIError = errorMessage.includes("OpenAI") || errorMessage.includes("Gemini") || errorMessage.includes("AI")

    sendInternalError(res, errorMessage, error instanceof Error ? error : undefined, {
      logger,
      requestId,
      logContext: { isAIError },
    })
  }
}

/**
 * POST /generator/start - Initialize generation request
 */
async function handleStartGeneration(req: Request, res: Response, requestId: string): Promise<void> {
  try {
    // Validate request body (same schema as /generate)
    const { error, value } = generateRequestSchema.validate(req.body)

    if (error) {
      sendValidationError(res, error.details[0].message, {
        logger,
        requestId,
        logContext: { details: error.details },
      })
      return
    }

    const generateType: GenerationType = value.generateType
    const job = value.job
    const preferences = value.preferences
    const provider = value.provider
    const jobMatchId = value.jobMatchId // Optional job-match ID for tracking

    logger.info("Starting generation request", {
      requestId,
      generateType,
      role: job.role,
      company: job.company,
      provider,
      jobMatchId,
    })

    // Fetch personal info
    const personalInfo = await generatorService.getPersonalInfo()
    if (!personalInfo) {
      throw new Error("Personal info not found. Please seed the personal-info document.")
    }

    // Fetch content items
    const contentItems = await contentItemService.listItems({ visibility: "published" })

    logger.info("Fetched content data", {
      contentItemsCount: contentItems.length,
    })

    // Create request document with initial steps
    const generationRequestId = await generatorService.createRequest(
      generateType,
      job,
      personalInfo,
      {
        contentItems,
      },
      preferences,
      requestId, // Use HTTP request ID as viewer session ID
      undefined, // editorEmail (undefined for now)
      provider,
      jobMatchId // Job match ID for tracking
    )

    // Initialize steps
    const steps = createInitialSteps(generateType)
    await generatorService.updateSteps(generationRequestId, steps)
    await generatorService.updateStatus(generationRequestId, "pending")

    // Find first pending step
    const nextStep = steps.find((s) => s.status === "pending")

    logger.info("Generation request initialized", {
      requestId,
      generationRequestId,
      nextStep: nextStep?.id,
    })

    res.status(200).json({
      success: true,
      data: {
        requestId: generationRequestId,
        status: "pending",
        nextStep: nextStep?.id,
      },
      requestId,
    })
  } catch (error) {
    sendInternalError(res, error instanceof Error ? error.message : "Failed to start generation", error instanceof Error ? error : undefined, {
      logger,
      requestId,
    })
  }
}

/**
 * POST /generator/step/:requestId - Execute next pending step
 */
async function handleExecuteStep(req: Request, res: Response, requestId: string): Promise<void> {
  try {
    // Extract generation request ID from path
    const path = req.path || req.url
    const generationRequestId = path.split("/").pop()

    if (!generationRequestId) {
      sendValidationError(res, "Request ID is required", { logger, requestId })
      return
    }

    logger.info("Executing next step", { requestId, generationRequestId })

    // Get request document
    const request = await generatorService.getRequest(generationRequestId)
    if (!request) {
      sendNotFoundError(res, "Generation request", { logger, requestId })
      return
    }

    // Find next pending step
    const nextStep = request.steps?.find((s: GenerationStep) => s.status === "pending")
    if (!nextStep) {
      // All steps complete
      res.status(200).json({
        success: true,
        data: {
          status: "completed",
          message: "All steps complete",
        },
        requestId,
      })
      return
    }

    logger.info("Executing step", {
      requestId,
      generationRequestId,
      stepId: nextStep.id,
    })

    // Update request status to processing if it was pending
    if (request.status === "pending") {
      await generatorService.updateStatus(generationRequestId, "processing")
    }

    // Execute the step (this may throw if step fails)
    try {
      await executeStepById(request, nextStep.id, requestId)
    } catch (stepError) {
      // Step failed - mark request as failed and abort pipeline
      await generatorService.updateStatus(generationRequestId, "failed")

      logger.error("Step execution failed", {
        requestId,
        generationRequestId,
        stepId: nextStep.id,
        error: stepError,
      })

      res.status(500).json({
        success: false,
        error: "STEP_EXECUTION_FAILED",
        code: "STEP_EXECUTION_FAILED",
        message: stepError instanceof Error ? stepError.message : "Step execution failed",
        data: {
          failedStep: nextStep.id,
          requestId: generationRequestId,
        },
        timestamp: new Date().toISOString(),
        requestId,
      })
      return
    }

    // Get updated request to find next step and extract URLs
    const updatedRequest = await generatorService.getRequest(generationRequestId)
    const nextPendingStep = updatedRequest?.steps?.find((s: GenerationStep) => s.status === "pending")

    // If no more pending steps, mark request as completed
    if (!nextPendingStep) {
      await generatorService.updateStatus(generationRequestId, "completed")

      // Update job-match record if jobMatchId was provided
      if (updatedRequest?.jobMatchId) {
        await updateJobMatchAfterGeneration(updatedRequest.jobMatchId, generationRequestId)
      }
    }

    // Extract download URLs from completed steps
    let resumeUrl: string | undefined
    let coverLetterUrl: string | undefined

    if (updatedRequest?.steps) {
      for (const step of updatedRequest.steps) {
        if (step.status === "completed" && step.result) {
          if (step.result.resumeUrl) {
            resumeUrl = step.result.resumeUrl
          }
          if (step.result.coverLetterUrl) {
            coverLetterUrl = step.result.coverLetterUrl
          }
        }
      }
    }

    // Build response data with URLs and steps
    const responseData: {
      stepCompleted: string
      nextStep?: string
      status: string
      resumeUrl?: string
      coverLetterUrl?: string
      steps?: Array<{
        id: string
        name: string
        description: string
        status: string
        result?: {
          resumeUrl?: string
          coverLetterUrl?: string
        }
      }>
    } = {
      stepCompleted: nextStep.id,
      nextStep: nextPendingStep?.id,
      status: nextPendingStep ? "processing" : "completed",
    }

    // Include URLs if present
    if (resumeUrl) {
      responseData.resumeUrl = resumeUrl
    }
    if (coverLetterUrl) {
      responseData.coverLetterUrl = coverLetterUrl
    }

    // Include steps for UI progress tracking
    if (updatedRequest?.steps) {
      responseData.steps = updatedRequest.steps
    }

    res.status(200).json({
      success: true,
      data: responseData,
      requestId,
    })
  } catch (error) {
    sendInternalError(res, error instanceof Error ? error.message : "Failed to execute step", error instanceof Error ? error : undefined, {
      logger,
      requestId,
    })
  }
}

/**
 * Execute a specific step by ID
 */
async function executeStepById(request: GeneratorRequest, stepId: string, requestId: string): Promise<void> {
  switch (stepId) {
    case "fetch_data":
      await executeFetchData(request, requestId)
      break
    case "generate_resume":
      await executeGenerateResume(request, requestId)
      break
    case "generate_cover_letter":
      await executeGenerateCoverLetter(request, requestId)
      break
    case "create_resume_pdf":
      await executeCreateResumePDF(request, requestId)
      break
    case "create_cover_letter_pdf":
      await executeCreateCoverLetterPDF(request, requestId)
      break
    case "upload_documents":
      await executeUploadDocuments(request, requestId)
      break
    default:
      throw new Error(`Unknown step ID: ${stepId}`)
  }
}

/**
 * Step: fetch_data - Data already fetched during /start, just complete the step
 */
async function executeFetchData(request: GeneratorRequest, requestId: string): Promise<void> {
  // Update step to in_progress
  let steps = startStep(request.steps!, "fetch_data")
  await generatorService.updateSteps(request.id, steps)

  // Data was already fetched during /start, so just mark complete
  steps = completeStep(steps, "fetch_data")
  await generatorService.updateSteps(request.id, steps)

  logger.info("Step completed: fetch_data", { requestId, generationRequestId: request.id })
}

/**
 * Step: generate_resume - AI generates resume content
 */
async function executeGenerateResume(request: GeneratorRequest, requestId: string): Promise<void> {
  // Update step to in_progress
  let steps = startStep(request.steps!, "generate_resume")
  await generatorService.updateSteps(request.id, steps)

  // Fetch full personal info (includes aiPrompts which aren't in the snapshot)
  const personalInfo = await generatorService.getPersonalInfo()
  if (!personalInfo) {
    throw new Error("Personal info not found")
  }

  // Initialize AI provider
  const aiProvider = await createAIProvider(request.provider || "gemini", logger)

  // Fetch job match data if jobMatchId is provided
  const jobMatchData = request.jobMatchId ? await fetchJobMatchData(request.jobMatchId) : undefined

  // Prepare job description
  const jobDescription =
    request.job.jobDescriptionText || request.job.jobDescriptionUrl
      ? `${request.job.jobDescriptionText || ""}\n${
          request.job.jobDescriptionUrl ? `Job URL: ${request.job.jobDescriptionUrl}` : ""
        }`.trim()
      : undefined

  // Generate resume content
  const result = await aiProvider.generateResume({
    personalInfo: {
      name: request.personalInfo.name || "",
      email: request.personalInfo.email || "",
      phone: request.personalInfo.phone || "",
      location: request.personalInfo.location || "",
      website: request.personalInfo.website || "",
      github: request.personalInfo.github || "",
      linkedin: request.personalInfo.linkedin || "",
    },
    job: {
      role: request.job.role,
      company: request.job.company,
      companyWebsite: request.job.companyWebsite,
      jobDescription,
    },
    contentItems: (request.contentData?.items || []) as ContentItem[],
    emphasize: request.preferences?.emphasize,
    jobMatchData, // Include job match insights for prompt customization
    customPrompts: personalInfo.aiPrompts?.resume,
  })

  // Clean the result content to remove undefined values before saving
  const cleanContent = typeof result.content === 'object' && result.content !== null 
    ? JSON.parse(JSON.stringify(result.content, (key, value) => value === undefined ? null : value))
    : result.content

  // Save intermediate results to Firestore
  await generatorService.updateIntermediateResults(request.id, {
    resumeContent: cleanContent,
    resumeTokenUsage: result.tokenUsage,
    model: result.model,
  })

  // Complete step
  steps = completeStep(steps, "generate_resume")
  await generatorService.updateSteps(request.id, steps)

  logger.info("Step completed: generate_resume", {
    requestId,
    generationRequestId: request.id,
    tokenUsage: result.tokenUsage,
  })
}

/**
 * Step: generate_cover_letter - AI generates cover letter content
 */
async function executeGenerateCoverLetter(request: GeneratorRequest, requestId: string): Promise<void> {
  // Update step to in_progress
  let steps = startStep(request.steps!, "generate_cover_letter")
  await generatorService.updateSteps(request.id, steps)

  // Fetch full personal info (includes aiPrompts which aren't in the snapshot)
  const personalInfo = await generatorService.getPersonalInfo()
  if (!personalInfo) {
    throw new Error("Personal info not found")
  }

  // Initialize AI provider
  const aiProvider = await createAIProvider(request.provider || "gemini", logger)

  // Fetch job match data if jobMatchId is provided
  const jobMatchData = request.jobMatchId ? await fetchJobMatchData(request.jobMatchId) : undefined

  // Prepare job description
  const jobDescription =
    request.job.jobDescriptionText || request.job.jobDescriptionUrl
      ? `${request.job.jobDescriptionText || ""}\n${
          request.job.jobDescriptionUrl ? `Job URL: ${request.job.jobDescriptionUrl}` : ""
        }`.trim()
      : undefined

  // Generate cover letter content
  const result = await aiProvider.generateCoverLetter({
    personalInfo: {
      name: request.personalInfo.name || "",
      email: request.personalInfo.email || "",
    },
    job: {
      role: request.job.role,
      company: request.job.company,
      companyWebsite: request.job.companyWebsite,
      jobDescription,
    },
    contentItems: (request.contentData?.items || []) as ContentItem[],
    jobMatchData, // Include job match insights for prompt customization
    customPrompts: personalInfo.aiPrompts?.coverLetter,
  })

  // Clean the result content to remove undefined values before saving
  const cleanContent = typeof result.content === 'object' && result.content !== null 
    ? JSON.parse(JSON.stringify(result.content, (key, value) => value === undefined ? null : value))
    : result.content

  // Save intermediate results to Firestore
  await generatorService.updateIntermediateResults(request.id, {
    coverLetterContent: cleanContent,
    coverLetterTokenUsage: result.tokenUsage,
    model: result.model,
  })

  // Complete step
  steps = completeStep(steps, "generate_cover_letter")
  await generatorService.updateSteps(request.id, steps)

  logger.info("Step completed: generate_cover_letter", {
    requestId,
    generationRequestId: request.id,
    tokenUsage: result.tokenUsage,
  })
}

/**
 * Step: create_resume_pdf - Generate PDF and upload to GCS
 */
async function executeCreateResumePDF(request: GeneratorRequest, requestId: string): Promise<void> {
  // Update step to in_progress
  let steps = startStep(request.steps!, "create_resume_pdf")
  await generatorService.updateSteps(request.id, steps)

  // Load resume content from intermediateResults
  const resumeContent = request.intermediateResults?.resumeContent
  if (!resumeContent) {
    throw new Error("Resume content not found in intermediate results")
  }

  // Generate PDF
  const pdf = await pdfService.generateResumePDF(resumeContent, "modern", request.personalInfo.accentColor)

  logger.info("Resume PDF generated", {
    requestId,
    generationRequestId: request.id,
    pdfSize: pdf.length,
  })

  // Upload to GCS immediately
  const companySafe = request.job.company.replace(/[^a-z0-9]/gi, "_").toLowerCase()
  const roleSafe = request.job.role.replace(/[^a-z0-9]/gi, "_").toLowerCase()
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const filename = `${companySafe}_${roleSafe}_resume_${timestamp}.pdf`

  const uploadResult = await storageService.uploadPDF(pdf, filename, "resume")
  const publicUrl = await storageService.generatePublicUrl(uploadResult.gcsPath)

  logger.info("Resume uploaded to GCS", {
    requestId,
    generationRequestId: request.id,
    gcsPath: uploadResult.gcsPath,
  })

  // Complete step with URL
  steps = completeStep(steps, "create_resume_pdf", { resumeUrl: publicUrl })
  await generatorService.updateSteps(request.id, steps)
}

/**
 * Step: create_cover_letter_pdf - Generate PDF and upload to GCS
 */
async function executeCreateCoverLetterPDF(request: GeneratorRequest, requestId: string): Promise<void> {
  // Update step to in_progress
  let steps = startStep(request.steps!, "create_cover_letter_pdf")
  await generatorService.updateSteps(request.id, steps)

  // Load cover letter content from intermediateResults
  const coverLetterContent = request.intermediateResults?.coverLetterContent
  if (!coverLetterContent) {
    throw new Error("Cover letter content not found in intermediate results")
  }

  // Generate PDF
  // Note: Step-based generation doesn't have access to client date, so it uses server date
  // This is acceptable since step-based generation is less common than synchronous generation
  const pdf = await pdfService.generateCoverLetterPDF(
    coverLetterContent,
    request.personalInfo.name,
    request.personalInfo.email,
    request.personalInfo.accentColor
    // date parameter omitted - will use server date as fallback
  )

  logger.info("Cover letter PDF generated", {
    requestId,
    generationRequestId: request.id,
    pdfSize: pdf.length,
  })

  // Upload to GCS immediately
  const companySafe = request.job.company.replace(/[^a-z0-9]/gi, "_").toLowerCase()
  const roleSafe = request.job.role.replace(/[^a-z0-9]/gi, "_").toLowerCase()
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const filename = `${companySafe}_${roleSafe}_cover_letter_${timestamp}.pdf`

  const uploadResult = await storageService.uploadPDF(pdf, filename, "cover-letter")
  const publicUrl = await storageService.generatePublicUrl(uploadResult.gcsPath)

  logger.info("Cover letter uploaded to GCS", {
    requestId,
    generationRequestId: request.id,
    gcsPath: uploadResult.gcsPath,
  })

  // Complete step with URL
  steps = completeStep(steps, "create_cover_letter_pdf", { coverLetterUrl: publicUrl })
  await generatorService.updateSteps(request.id, steps)
}

/**
 * Step: upload_documents - Finalize and create response document
 */
async function executeUploadDocuments(request: GeneratorRequest, requestId: string): Promise<void> {
  // Update step to in_progress
  let steps = startStep(request.steps!, "upload_documents")
  await generatorService.updateSteps(request.id, steps)

  // Calculate metrics
  const resumeTokenUsage = request.intermediateResults?.resumeTokenUsage
  const coverLetterTokenUsage = request.intermediateResults?.coverLetterTokenUsage
  const totalTokens = (resumeTokenUsage?.totalTokens || 0) + (coverLetterTokenUsage?.totalTokens || 0)

  // Calculate cost (need to recreate AI provider for cost calculation)
  const aiProvider = await createAIProvider(request.provider || "gemini", logger)
  const costUsd =
    (resumeTokenUsage ? aiProvider.calculateCost(resumeTokenUsage) : 0) +
    (coverLetterTokenUsage ? aiProvider.calculateCost(coverLetterTokenUsage) : 0)

  // Build result object
  const result: GeneratorResponse["result"] = {
    success: true,
  }

  if (request.intermediateResults?.resumeContent) {
    result.resume = request.intermediateResults.resumeContent
  }

  if (request.intermediateResults?.coverLetterContent) {
    result.coverLetter = request.intermediateResults.coverLetterContent
  }

  // Build token usage object
  const tokenUsage: {
    resumePrompt?: number
    resumeCompletion?: number
    coverLetterPrompt?: number
    coverLetterCompletion?: number
    total: number
  } = {
    total: totalTokens,
  }

  if (resumeTokenUsage) {
    tokenUsage.resumePrompt = resumeTokenUsage.promptTokens
    tokenUsage.resumeCompletion = resumeTokenUsage.completionTokens
  }

  if (coverLetterTokenUsage) {
    tokenUsage.coverLetterPrompt = coverLetterTokenUsage.promptTokens
    tokenUsage.coverLetterCompletion = coverLetterTokenUsage.completionTokens
  }

  // Create response document
  const durationMs = Date.now() - timestampToMillis(request.createdAt)
  await generatorService.createResponse(
    request.id,
    result,
    {
      durationMs,
      tokenUsage,
      costUsd,
      model: request.intermediateResults?.model || "unknown",
    }
  )

  // Complete step
  steps = completeStep(steps, "upload_documents")
  await generatorService.updateSteps(request.id, steps)

  logger.info("Step completed: upload_documents", {
    requestId,
    generationRequestId: request.id,
    durationMs,
    totalTokens,
    costUsd,
  })
}

/**
 * GET /generator/personal-info - Get personal info
 */
async function handleGetPersonalInfo(req: Request, res: Response, requestId: string): Promise<void> {
  try {
    logger.info("Getting personal info", { requestId })

    const personalInfo = await generatorService.getPersonalInfo()

    if (!personalInfo) {
      sendNotFoundError(res, "Personal info", { logger, requestId })
      return
    }

    res.status(200).json({
      success: true,
      data: personalInfo,
      requestId,
    })
  } catch (error) {
    sendInternalError(res, "Database error", error instanceof Error ? error : undefined, { logger, requestId })
  }
}

/**
 * GET /generator/requests/:id - Get request status (public for polling)
 */
async function handleGetRequest(req: Request, res: Response, requestId: string): Promise<void> {
  try {
    const path = req.path || req.url
    const generationRequestId = path.split("/").pop()

    if (!generationRequestId) {
      sendValidationError(res, "Request ID is required", { logger, requestId })
      return
    }

    logger.info("Getting generation request", { requestId, generationRequestId })

    const request = await generatorService.getRequest(generationRequestId)

    if (!request) {
      sendNotFoundError(res, "Generation request", { logger, requestId })
      return
    }

    // Return only status and progress information (don't leak full request details)
    res.status(200).json({
      success: true,
      data: {
        id: request.id,
        status: request.status,
        steps: request.steps,
        createdAt: request.createdAt,
      },
      requestId,
    })
  } catch (error) {
    sendInternalError(res, "Database error", error instanceof Error ? error : undefined, { logger, requestId })
  }
}

/**
 * PUT /generator/personal-info - Update personal info (auth required)
 */
async function handleUpdatePersonalInfo(req: AuthenticatedRequest, res: Response, requestId: string): Promise<void> {
  try {
    // Validate request body
    const { error, value } = updatePersonalInfoSchema.validate(req.body)

    if (error) {
      sendValidationError(res, error.details[0].message, {
        logger,
        requestId,
        logContext: { details: error.details },
      })
      return
    }

    const userEmail = req.user!.email

    logger.info("Updating personal info", {
      requestId,
      userEmail,
      fieldsToUpdate: Object.keys(value),
    })

    const personalInfo = await generatorService.updatePersonalInfo(value, userEmail)

    res.status(200).json({
      success: true,
      data: personalInfo,
      requestId,
    })
  } catch (error) {
    sendInternalError(res, "Database error", error instanceof Error ? error : undefined, { logger, requestId })
  }
}

/**
 * GET /generator/requests - List requests (auth required)
 */
async function handleListRequests(req: AuthenticatedRequest, res: Response, requestId: string): Promise<void> {
  try {
    logger.info("Listing generation requests", { requestId })

    const requests = await generatorService.listRequests({
      limit: 50,
    })

    res.status(200).json({
      success: true,
      data: {
        requests,
        count: requests.length,
      },
      requestId,
    })
  } catch (error) {
    sendInternalError(res, "Database error", error instanceof Error ? error : undefined, { logger, requestId })
  }
}

/**
 * POST /generator/upload-image - Upload avatar or logo image (auth required)
 */
async function handleUploadImage(req: AuthenticatedRequest & { rawBody?: Buffer }, res: Response, requestId: string): Promise<void> {
  try {
    // Parse multipart/form-data
    const bb = busboy({ headers: req.headers })

    let imageType: "avatar" | "logo" | null = null
    let fileBuffer: Buffer | null = null
    let filename: string | null = null
    let contentType: string | null = null

    await new Promise<void>((resolve, reject) => {
      let finished = false
      const filePromises: Promise<void>[] = []

      const cleanup = () => {
        bb.removeListener("close", onClose)
        bb.removeListener("error", onBbError)
      }

      bb.on("field", (fieldname: string, val: string) => {
        if (fieldname === "imageType" && (val === "avatar" || val === "logo")) {
          imageType = val
        }
      })

      bb.on("file", (fieldname: string, file: Readable, info: { filename: string; mimeType: string }) => {
        const chunks: Buffer[] = []

        // Create promise for this file that resolves when file stream ends
        const filePromise = new Promise<void>((resolveFile, rejectFile) => {
          file.on("data", (chunk: Buffer) => {
            chunks.push(chunk)
          })

          file.on("end", () => {
            fileBuffer = Buffer.concat(chunks)
            filename = info.filename
            contentType = info.mimeType
            resolveFile()
          })

          file.on("error", (err: Error) => {
            rejectFile(err)
          })
        })

        filePromises.push(filePromise)
      })

      // Use 'close' instead of 'finish' - it fires after all streams are done
      const onClose = () => {
        if (!finished) {
          finished = true
          cleanup()

          // Wait for all file streams to complete before resolving
          Promise.all(filePromises)
            .then(() => resolve())
            .catch((err) => reject(err))
        }
      }

      const onBbError = (err: Error) => {
        if (!finished) {
          finished = true
          cleanup()
          reject(err)
        }
      }

      bb.on("close", onClose)
      bb.on("error", onBbError)

      // Firebase Functions v2 buffers the request body into req.rawBody
      // We need to feed this buffer to busboy instead of piping the request stream
      const rawBody = req.rawBody
      if (rawBody) {
        bb.end(rawBody)
      } else {
        // Fallback: stream directly from request (shouldn't happen with Firebase Functions v2)
        req.pipe(bb)
      }
    })

    // Validate inputs
    if (!imageType || !fileBuffer || !filename || !contentType) {
      sendValidationError(res, "Missing required fields: imageType, file", { logger, requestId })
      return
    }

    const userEmail = req.user!.email

    // TypeScript needs help understanding these are not null after validation
    const validFileBuffer = fileBuffer as Buffer
    const validFilename = filename as string
    const validContentType = contentType as string
    const validImageType = imageType as "avatar" | "logo"

    logger.info("Uploading image", {
      requestId,
      userEmail,
      imageType: validImageType,
      filename: validFilename,
      contentType: validContentType,
      size: validFileBuffer.length,
    })

    // Generate unique filename
    const timestamp = Date.now()
    const ext = validFilename.split(".").pop() || "jpg"
    const uniqueFilename = `${validImageType}-${timestamp}.${ext}`

    // Upload to GCS
    const uploadResult = await storageService.uploadImage(validFileBuffer, uniqueFilename, validImageType, validContentType)

    // Generate public URL
    const publicUrl = await storageService.generatePublicUrl(uploadResult.gcsPath)

    // Update personal info with new image URL
    const updateData = validImageType === "avatar" ? { avatar: publicUrl } : { logo: publicUrl }
    await generatorService.updatePersonalInfo(updateData, userEmail)

    res.status(200).json({
      success: true,
      data: {
        imageType: validImageType,
        url: publicUrl,
        gcsPath: uploadResult.gcsPath,
        size: uploadResult.size,
      },
      requestId,
    })
  } catch (error) {
    sendInternalError(res, error instanceof Error ? error.message : "Failed to upload image", error instanceof Error ? error : undefined, {
      logger,
      requestId,
    })
  }
}

/**
 * GET /generator/job-matches - List job matches (auth required)
 */
async function handleListJobMatches(req: AuthenticatedRequest, res: Response, requestId: string): Promise<void> {
  try {
    logger.info("Listing job matches", { requestId })

    const jobMatchesRef = firestore.collection("job-matches")
    const snapshot = await jobMatchesRef.orderBy("createdAt", "desc").limit(500).get()

    const jobMatches = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    res.status(200).json({
      success: true,
      data: {
        jobMatches,
        count: jobMatches.length,
      },
      requestId,
    })
  } catch (error) {
    sendInternalError(res, "Database error", error instanceof Error ? error : undefined, { logger, requestId })
  }
}

/**
 * PUT /generator/job-matches/:id - Update job match (auth required)
 */
async function handleUpdateJobMatch(req: AuthenticatedRequest, res: Response, requestId: string): Promise<void> {
  try {
    // Extract job match ID from path
    const path = req.path || req.url
    const jobMatchId = path.split("/").pop()

    if (!jobMatchId) {
      sendValidationError(res, "Job match ID is required", { logger, requestId })
      return
    }

    // Validate request body
    const { error, value } = updateJobMatchSchema.validate(req.body)

    if (error) {
      sendValidationError(res, error.details[0].message, {
        logger,
        requestId,
        logContext: { details: error.details },
      })
      return
    }

    logger.info("Updating job match", {
      requestId,
      jobMatchId,
      fieldsToUpdate: Object.keys(value),
    })

    const jobMatchRef = firestore.collection("job-matches").doc(jobMatchId)
    await jobMatchRef.update({
      ...value,
      updatedAt: new Date().toISOString(),
    })

    // Fetch updated document
    const updated = await jobMatchRef.get()
    const jobMatch = {
      id: updated.id,
      ...updated.data(),
    }

    res.status(200).json({
      success: true,
      data: jobMatch,
      requestId,
    })
  } catch (error) {
    sendInternalError(res, "Database error", error instanceof Error ? error : undefined, { logger, requestId })
  }
}

/**
 * Export as Firebase HTTP Function (v2)
 */
export const manageGenerator = https.onRequest(
  {
    region: "us-central1",
    memory: "1GiB", // Higher for Puppeteer
    maxInstances: 10,
    timeoutSeconds: 300, // 5 minutes for generation
    secrets: ["openai-api-key", "gemini-api-key"],
    serviceAccount: "firebase-admin@static-sites-257923.iam.gserviceaccount.com",
  },
  handleGeneratorRequest
)
