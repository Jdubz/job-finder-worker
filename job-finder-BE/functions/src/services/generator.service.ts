import { Firestore, Timestamp, FieldValue } from "@google-cloud/firestore"
import { GENERATOR_COLLECTION } from "../config/database"
import { createFirestoreInstance } from "../config/firestore"
import { createDefaultLogger } from "../utils/logger"
import type { SimpleLogger } from "../types/logger.types"
import type {
  PersonalInfo,
  UpdatePersonalInfoData,
  GeneratorRequest,
  GeneratorResponse,
  GenerationType,
  AIProviderType,
  GenerationStep,
} from "../types/generator.types"
import type { ContentItem } from "../types/content-item.types"

const COLLECTION_NAME = GENERATOR_COLLECTION
const PERSONAL_INFO_COLLECTION = "job-finder-config"
const PERSONAL_INFO_DOC_ID = "personal-info"

export class GeneratorService {
  private db: Firestore
  private logger: SimpleLogger
  private collectionName = COLLECTION_NAME
  private personalInfoCollection = PERSONAL_INFO_COLLECTION

  constructor(logger?: SimpleLogger) {
    // Use shared Firestore factory for consistent configuration
    this.db = createFirestoreInstance()

    // Use shared logger factory
    this.logger = logger || createDefaultLogger()
  }

  /**
   * Get the personal info document
   * NOTE: Now stored in job-finder-config collection instead of generator
   */
  async getPersonalInfo(): Promise<PersonalInfo | null> {
    try {
      const docRef = this.db.collection(this.personalInfoCollection).doc(PERSONAL_INFO_DOC_ID)
      const doc = await docRef.get()

      if (!doc.exists) {
        this.logger.info("Personal info not found")
        return null
      }

      const personalInfo = {
        id: doc.id,
        ...(doc.data() as Omit<PersonalInfo, "id">),
      } as PersonalInfo

      this.logger.info("Retrieved personal info from job-finder-config")
      return personalInfo
    } catch (error) {
      this.logger.error("Failed to get personal info", { error })
      throw error
    }
  }

  /**
   * Update the personal info document (editor only)
   */
  async updatePersonalInfo(data: UpdatePersonalInfoData, userEmail: string): Promise<PersonalInfo> {
    try {
      const docRef = this.db.collection(this.personalInfoCollection).doc(PERSONAL_INFO_DOC_ID)
      const doc = await docRef.get()

      if (!doc.exists) {
        throw new Error("Personal info not found")
      }

      // Build updates object
      const updates: Record<string, unknown> = {
        updatedAt: Timestamp.now(),
        updatedBy: userEmail,
      }

      // Add provided fields
      if (data.name !== undefined) updates.name = data.name
      if (data.email !== undefined) updates.email = data.email
      if (data.phone !== undefined) updates.phone = data.phone || null
      if (data.location !== undefined) updates.location = data.location || null
      if (data.website !== undefined) updates.website = data.website || null
      if (data.github !== undefined) updates.github = data.github || null
      if (data.linkedin !== undefined) updates.linkedin = data.linkedin || null
      if (data.avatar !== undefined) updates.avatar = data.avatar || null
      if (data.logo !== undefined) updates.logo = data.logo || null
      if (data.accentColor !== undefined) updates.accentColor = data.accentColor
      if (data.aiPrompts !== undefined) updates.aiPrompts = data.aiPrompts || null

      await docRef.update(updates)

      // Fetch updated document
      const updatedDoc = await docRef.get()
      const updatedPersonalInfo: PersonalInfo = {
        id: updatedDoc.id,
        ...(updatedDoc.data() as Omit<PersonalInfo, "id">),
      } as PersonalInfo

      this.logger.info("Updated personal info in job-finder-config", {
        updatedBy: userEmail,
        fieldsUpdated: Object.keys(updates).filter((k) => k !== "updatedAt" && k !== "updatedBy"),
      })

      return updatedPersonalInfo
    } catch (error) {
      this.logger.error("Failed to update personal info", { error, userEmail })
      throw error
    }
  }

  /** @deprecated Use getPersonalInfo() instead */
  async getDefaults() {
    return this.getPersonalInfo()
  }

  /** @deprecated Use updatePersonalInfo() instead */
  async updateDefaults(data: UpdatePersonalInfoData, userEmail: string) {
    return this.updatePersonalInfo(data, userEmail)
  }

  /**
   * Create a new generation request document
   */
  async createRequest(
    generateType: GenerationType,
    job: {
      role: string
      company: string
      companyWebsite?: string
      jobDescriptionUrl?: string
      jobDescriptionText?: string
    },
    personalInfo: PersonalInfo,
    contentData: {
      contentItems: ContentItem[]
    },
    preferences?: {
      style?: string
      emphasize?: string[]
    },
    viewerSessionId?: string,
    editorEmail?: string,
    provider?: AIProviderType,
    jobMatchId?: string
  ): Promise<string> {
    try {
      const timestamp = Date.now()
      const randomId = Math.random().toString(36).slice(2, 11)
      const requestId = `resume-generator-request-${timestamp}-${randomId}`

      const request: Omit<GeneratorRequest, "createdAt"> = {
        id: requestId,
        type: "request",
        generateType,
        provider: provider || "gemini", // Default to Gemini (92% cheaper)
        personalInfo: {
          name: personalInfo.name,
          email: personalInfo.email,
          phone: personalInfo.phone,
          location: personalInfo.location,
          website: personalInfo.website,
          github: personalInfo.github,
          linkedin: personalInfo.linkedin,
          avatar: personalInfo.avatar,
          logo: personalInfo.logo,
          accentColor: personalInfo.accentColor,
        },
        job,
        ...(jobMatchId ? { jobMatchId } : {}), // Only include jobMatchId if provided (Firestore doesn't allow undefined)
        ...(preferences ? { preferences } : {}), // Only include preferences if provided (Firestore doesn't allow undefined)
        contentData: { items: contentData.contentItems },
        status: "pending",
        access: {
          viewerSessionId,
          isPublic: !editorEmail,
        },
        createdBy: editorEmail || null,
      }

      await this.db
        .collection(this.collectionName)
        .doc(requestId)
        .set({
          ...request,
          createdAt: FieldValue.serverTimestamp(),
        })

      this.logger.info("Created generation request", {
        requestId,
        generateType,
        role: job.role,
        company: job.company,
        isPublic: !editorEmail,
      })

      return requestId
    } catch (error) {
      this.logger.error("Failed to create generation request", { error })
      throw error
    }
  }

  /**
   * Get a generation request by ID
   */
  async getRequest(requestId: string): Promise<GeneratorRequest | null> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(requestId)
      const doc = await docRef.get()

      if (!doc.exists) {
        this.logger.info("Generation request not found", { requestId })
        return null
      }

      const request = {
        id: doc.id,
        ...(doc.data() as Omit<GeneratorRequest, "id">),
      } as GeneratorRequest

      this.logger.info("Retrieved generation request", { requestId })
      return request
    } catch (error) {
      this.logger.error("Failed to get generation request", { error, requestId })
      throw error
    }
  }

  /**
   * Update request status
   */

  /**
   * Create a generation response document
   */
  async createResponse(
    requestId: string,
    result: GeneratorResponse["result"],
    metrics: GeneratorResponse["metrics"],
    files?: GeneratorResponse["files"]
  ): Promise<string> {
    try {
      const responseId = requestId.replace("request", "response")

      const response: Omit<GeneratorResponse, "createdAt"> = {
        id: responseId,
        type: "response",
        requestId,
        result,
        files: files || {},
        metrics,
      }

      await this.db
        .collection(this.collectionName)
        .doc(responseId)
        .set({
          ...response,
          createdAt: FieldValue.serverTimestamp(),
        })

      this.logger.info("Created generation response", {
        responseId,
        requestId,
        success: result.success,
        durationMs: metrics.durationMs,
      })

      return responseId
    } catch (error) {
      this.logger.error("Failed to create generation response", { error, requestId })
      throw error
    }
  }

  /**
   * Get a generation response by ID
   */
  async getResponse(responseId: string): Promise<GeneratorResponse | null> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(responseId)
      const doc = await docRef.get()

      if (!doc.exists) {
        this.logger.info("Generation response not found", { responseId })
        return null
      }

      const response = {
        id: doc.id,
        ...(doc.data() as Omit<GeneratorResponse, "id">),
      } as GeneratorResponse

      this.logger.info("Retrieved generation response", { responseId })
      return response
    } catch (error) {
      this.logger.error("Failed to get generation response", { error, responseId })
      throw error
    }
  }

  /**
   * Get request and response together
   */
  async getRequestWithResponse(requestId: string): Promise<{
    request: GeneratorRequest
    response: GeneratorResponse
  } | null> {
    try {
      const responseId = requestId.replace("request", "response")

      const [requestDoc, responseDoc] = await Promise.all([
        this.db.collection(this.collectionName).doc(requestId).get(),
        this.db.collection(this.collectionName).doc(responseId).get(),
      ])

      if (!requestDoc.exists || !responseDoc.exists) {
        this.logger.info("Request or response not found", { requestId, responseId })
        return null
      }

      const request = {
        id: requestDoc.id,
        ...(requestDoc.data() as Omit<GeneratorRequest, "id">),
      } as GeneratorRequest

      const response = {
        id: responseDoc.id,
        ...(responseDoc.data() as Omit<GeneratorResponse, "id">),
      } as GeneratorResponse

      this.logger.info("Retrieved request with response", { requestId, responseId })
      return { request, response }
    } catch (error) {
      this.logger.error("Failed to get request with response", { error, requestId })
      throw error
    }
  }

  /**
   * List generation requests with optional filters
   */
  async listRequests(options?: {
    limit?: number
    startAfter?: string
    viewerSessionId?: string
  }): Promise<GeneratorRequest[]> {
    try {
      let query = this.db
        .collection(this.collectionName)
        .where("type", "==", "request")
        .orderBy("createdAt", "desc")

      // Filter by viewer session if provided
      if (options?.viewerSessionId) {
        query = query.where("access.viewerSessionId", "==", options.viewerSessionId)
      }

      // Pagination
      if (options?.limit) {
        query = query.limit(options.limit)
      }

      const snapshot = await query.get()

      const requests = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<GeneratorRequest, "id">),
      })) as GeneratorRequest[]

      this.logger.info("Retrieved generation requests", {
        count: requests.length,
        viewerSessionId: options?.viewerSessionId,
      })

      return requests
    } catch (error) {
      this.logger.error("Failed to list generation requests", { error })
      throw error
    }
  }

  /**
   * Update the steps array in a generation request
   * This enables real-time progress tracking on the frontend
   */
  async updateSteps(requestId: string, steps: GenerationStep[]): Promise<void> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(requestId)

      await docRef.update({
        steps,
        updatedAt: FieldValue.serverTimestamp(),
      })

      this.logger.info("Updated generation steps", {
        requestId,
        steps: steps.map((s) => ({ id: s.id, status: s.status })),
      })

      // Add a small delay to allow Firestore listeners to catch up
      // This ensures the frontend sees intermediate progress states
      // In production, this could be removed if we switch to async processing
       
      await new Promise((resolve) => setTimeout(resolve, 300))
    } catch (error) {
      this.logger.error("Failed to update generation steps", { error, requestId })
      throw error
    }
  }

  /**
   * Update the status of a generation request
   */
  async updateStatus(requestId: string, status: GeneratorRequest["status"]): Promise<void> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(requestId)

      await docRef.update({
        status,
        updatedAt: FieldValue.serverTimestamp(),
      })

      this.logger.info("Updated generation status", { requestId, status })
    } catch (error) {
      this.logger.error("Failed to update generation status", { error, requestId })
      throw error
    }
  }

  /**
   * Update intermediate results in a generation request
   * This allows storing AI-generated content and token usage for retry capability
   */
  async updateIntermediateResults(
    requestId: string,
    results: Partial<NonNullable<GeneratorRequest["intermediateResults"]>>
  ): Promise<void> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(requestId)

      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      }

      // Build nested updates for each field
      if (results?.resumeContent !== undefined) {
        updates["intermediateResults.resumeContent"] = results.resumeContent
      }
      if (results?.coverLetterContent !== undefined) {
        updates["intermediateResults.coverLetterContent"] = results.coverLetterContent
      }
      if (results?.resumeTokenUsage !== undefined) {
        updates["intermediateResults.resumeTokenUsage"] = results.resumeTokenUsage
      }
      if (results?.coverLetterTokenUsage !== undefined) {
        updates["intermediateResults.coverLetterTokenUsage"] = results.coverLetterTokenUsage
      }
      if (results?.model !== undefined) {
        updates["intermediateResults.model"] = results.model
      }

      await docRef.update(updates)

      this.logger.info("Updated intermediate results", {
        requestId,
        fields: Object.keys(results || {}),
      })
    } catch (error) {
      this.logger.error("Failed to update intermediate results", { error, requestId })
      throw error
    }
  }
}
