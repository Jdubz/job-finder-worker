/**
 * Gemini API provider for job extraction.
 * Uses the same pattern as job-finder-worker for consistency.
 * 
 * Supports two authentication modes:
 * 1. API Key: Set GEMINI_API_KEY environment variable (simple, recommended for dev)
 * 2. Vertex AI: Set GOOGLE_CLOUD_PROJECT + use Application Default Credentials (production)
 */

import { GoogleGenerativeAI } from "@google/generative-ai"
import { logger } from "./logger.js"
import type { JobExtraction } from "./types.js"
import { parseCliObjectOutput } from "./utils.js"

export interface GeminiConfig {
  apiKey?: string
  project?: string
  location?: string
  model?: string
  maxOutputTokens?: number
  temperature?: number
}

export class GeminiProvider {
  private client: GoogleGenerativeAI
  private model: string
  private authMode: "api_key" | "vertex_ai"

  constructor(config: GeminiConfig) {
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    const project = config.project || process.env.GOOGLE_CLOUD_PROJECT
    const location = config.location || process.env.GOOGLE_CLOUD_LOCATION || "us-central1"

    // Try API key first (simpler), then fall back to Vertex AI
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey)
      this.authMode = "api_key"
      logger.info("[Gemini] Using API key authentication")
    } else if (project) {
      this.client = new GoogleGenerativeAI({
        vertexai: true,
        project,
        location,
      })
      this.authMode = "vertex_ai"
      logger.info(`[Gemini] Using Vertex AI authentication (project: ${project}, location: ${location})`)
    } else {
      throw new Error(
        "Gemini requires either GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT. " +
        "Set GEMINI_API_KEY for API key auth, or GOOGLE_CLOUD_PROJECT for Vertex AI."
      )
    }

    this.model = config.model || process.env.GEMINI_DEFAULT_MODEL || "gemini-2.0-flash-exp"

    logger.info(`[Gemini] Initialized with model: ${this.model} (auth: ${this.authMode})`)
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
      const model = this.client.getGenerativeModel({
        model: this.model,
      })

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens,
          temperature,
        },
      })

      const response = result.response

      // Check if response was blocked by safety filters
      if (!response.candidates || response.candidates.length === 0) {
        const blockReason = response.promptFeedback?.blockReason
        if (blockReason) {
          throw new Error(`Content blocked by safety filters: ${blockReason}`)
        }
        throw new Error("No response candidates generated")
      }

      let text: string
      try {
        text = response.text()
      } catch (err) {
        // response.text() can throw if content was filtered
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`Failed to get response text: ${message}`)
      }

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

      // Check for API key errors
      if (message.toLowerCase().includes("api key") || message.toLowerCase().includes("authentication")) {
        throw new Error("Invalid Gemini API key. Check your GEMINI_API_KEY in .env file.")
      }

      // Re-throw our formatted errors
      if (message.startsWith("Content blocked") || 
          message.startsWith("Failed to get response text") ||
          message.startsWith("No response candidates")) {
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
