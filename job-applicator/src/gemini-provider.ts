/**
 * Gemini provider for job extraction using Vertex AI.
 * Uses Google Cloud Vertex AI with service account authentication.
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

    this.model = config.model || process.env.GEMINI_DEFAULT_MODEL || "gemini-2.0-flash-exp"

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
        throw new Error("Gemini API returned empty response")
      }

      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`[Gemini] API error: ${message}`)

      // Check for quota/rate limit errors
      if (message.toLowerCase().includes("quota") || message.toLowerCase().includes("rate limit")) {
        throw new Error("Gemini API quota exceeded. Please try again later.")
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

      throw new Error(`Gemini API error: ${message}`)
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

export function getGeminiProvider(): GeminiProvider {
  if (!geminiInstance) {
    geminiInstance = new GeminiProvider({})
  }
  return geminiInstance
}
