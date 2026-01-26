/**
 * Gemini provider for job extraction using Google Cloud Vertex AI.
 *
 * This implementation uses the `@google-cloud/vertexai` client with
 * service account / Google Cloud ADC-based authentication (via
 * GOOGLE_CLOUD_PROJECT / GOOGLE_CLOUD_LOCATION and standard GCP creds)
 * to call Gemini models.
 *
 * NOTE: This is an intentional deviation from the original migration plan
 * in PLAN-claude-to-gemini-migration.md, which proposed using the
 * `@google/generative-ai` SDK with GEMINI_API_KEY authentication.
 * We switched to Vertex AI because only service account credentials are
 * available (no API key), matching the worker's authentication approach.
 */

import { VertexAI } from "@google-cloud/vertexai"
import { logger } from "./logger.js"
import type { JobExtraction } from "./types.js"
import { parseCliObjectOutput } from "./utils.js"

export interface GeminiConfig {
  project?: string
  location?: string
  model?: string
  maxOutputTokens?: number
  temperature?: number
}

export class GeminiProvider {
  private vertexAI: VertexAI
  private model: string
  private project: string
  private location: string

  constructor(config: GeminiConfig) {
    this.project = config.project || process.env.GOOGLE_CLOUD_PROJECT || ""
    this.location = config.location || process.env.GOOGLE_CLOUD_LOCATION || "us-central1"

    if (!this.project) {
      throw new Error(
        "GOOGLE_CLOUD_PROJECT environment variable is required. " +
        "Set it in your .env file or pass as config.project"
      )
    }

    this.vertexAI = new VertexAI({
      project: this.project,
      location: this.location,
    })

    this.model = config.model || process.env.GEMINI_DEFAULT_MODEL || "gemini-2.0-flash-001"

    logger.info(`[Gemini] Initialized with Vertex AI (project: ${this.project}, location: ${this.location}, model: ${this.model})`)
  }

  async generateContent(
    prompt: string,
    options?: {
      maxOutputTokens?: number
      temperature?: number
    }
  ): Promise<string> {
    const maxOutputTokens = options?.maxOutputTokens || 1000
    const temperature = options?.temperature || 0.7

    try {
      const generativeModel = this.vertexAI.getGenerativeModel({
        model: this.model,
        generationConfig: {
          maxOutputTokens,
          temperature,
        },
      })

      const result = await generativeModel.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      })

      const response = result.response

      // Check if response was blocked by safety filters
      if (!response.candidates || response.candidates.length === 0) {
        throw new Error("No response candidates generated (possibly blocked by safety filters)")
      }

      const candidate = response.candidates[0]
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error("Response candidate has no content")
      }

      const text = candidate.content.parts.map(part => part.text).join("")

      if (!text || text.trim().length === 0) {
        throw new Error("Vertex AI returned empty response")
      }

      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`[Gemini] Vertex AI error: ${message}`)

      // Check for quota/rate limit errors
      if (message.toLowerCase().includes("quota") || message.toLowerCase().includes("rate limit")) {
        throw new Error("Vertex AI quota exceeded. Please try again later.")
      }

      // Check for authentication errors
      if (message.toLowerCase().includes("authentication") || message.toLowerCase().includes("permission")) {
        throw new Error("Vertex AI authentication failed. Ensure service account is properly configured.")
      }

      // Re-throw our formatted errors
      if (message.startsWith("No response candidates") || 
          message.startsWith("Response candidate has no content")) {
        throw error
      }

      throw new Error(`Vertex AI error: ${message}`)
    }
  }

  async extractJobDetails(prompt: string): Promise<JobExtraction> {
    logger.info("[Gemini] Extracting job details...")

    const response = await this.generateContent(prompt, {
      maxOutputTokens: 2000,
      temperature: 0.3, // Lower temperature for more consistent JSON
    })

    logger.debug(`[Gemini] Raw response: ${response.slice(0, 500)}...`)

    try {
      // Use existing parser that handles markdown code blocks and extra text
      const jobData = parseCliObjectOutput(response)

      logger.info("[Gemini] Parsed job data successfully")

      // Ensure type safety by checking each field at runtime
      return {
        title: typeof jobData.title === "string" ? jobData.title : null,
        description: typeof jobData.description === "string" ? jobData.description : null,
        location: typeof jobData.location === "string" ? jobData.location : null,
        techStack: typeof jobData.techStack === "string" ? jobData.techStack : null,
        companyName: typeof jobData.companyName === "string" ? jobData.companyName : null,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error(`[Gemini] Failed to parse response: ${message}`)
      throw new Error(`Failed to parse Gemini response: ${message}`)
    }
  }
}

// Singleton instance
let geminiInstance: GeminiProvider | null = null

/**
 * Get the shared GeminiProvider instance.
 *
 * Note: Configuration (including environment variables like GOOGLE_CLOUD_PROJECT)
 * is captured when the instance is first created. If you change relevant
 * environment variables at runtime and want those changes to take effect,
 * call resetGeminiProvider() before calling this function again, or restart
 * the application.
 */
export function getGeminiProvider(): GeminiProvider {
  if (!geminiInstance) {
    geminiInstance = new GeminiProvider({})
  }
  return geminiInstance
}

/**
 * Reset the shared GeminiProvider instance.
 *
 * After calling this, the next call to getGeminiProvider() will create
 * a new GeminiProvider using the current environment variables.
 */
export function resetGeminiProvider(): void {
  geminiInstance = null
}
