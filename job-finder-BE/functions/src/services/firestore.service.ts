import { Firestore } from "@google-cloud/firestore"
import { createFirestoreInstance } from "../config/firestore"
import { createDefaultLogger } from "../utils/logger"
import type { SimpleLogger } from "../types/logger.types"

export interface MailgunResponse {
  messageId: string
  status?: string
  accepted: boolean
  error?: string
  errorCode?: string
}

export interface ContactSubmission {
  name: string
  email: string
  message: string
  metadata: {
    ip?: string
    userAgent?: string
    timestamp: string
    referrer?: string
  }
  requestId: string
  traceId?: string
  spanId?: string
  transaction: {
    contactEmail: {
      success: boolean
      response?: MailgunResponse
      error?: string
      errorCode?: string
    }
    autoReply: {
      success: boolean
      response?: MailgunResponse
      error?: string
      errorCode?: string
    }
    errors: string[]
  }
  status: "new" | "read" | "replied" | "spam"
  createdAt: Date
  updatedAt: Date
}

export class FirestoreService {
  private db: Firestore
  private logger: SimpleLogger
  private collectionName = "contact-submissions"

  constructor(logger?: SimpleLogger) {
    // Use shared Firestore factory for consistent configuration
    this.db = createFirestoreInstance()

    // Use shared logger factory
    this.logger = logger || createDefaultLogger()
  }

  /**
   * Save a contact form submission to Firestore
   */
  async saveContactSubmission(data: Omit<ContactSubmission, "status" | "createdAt" | "updatedAt">): Promise<string> {
    try {
      const now = new Date()

      // Remove undefined values from metadata (Firestore doesn't allow undefined)
      const metadata: Record<string, string> = {
        timestamp: data.metadata.timestamp,
      }
      if (data.metadata.ip) metadata.ip = data.metadata.ip
      if (data.metadata.userAgent) metadata.userAgent = data.metadata.userAgent
      if (data.metadata.referrer) metadata.referrer = data.metadata.referrer

      // Clean transaction data - remove undefined values
      const cleanTransaction = {
        contactEmail: {
          success: data.transaction.contactEmail.success,
          ...(data.transaction.contactEmail.response && { response: data.transaction.contactEmail.response }),
          ...(data.transaction.contactEmail.error && { error: data.transaction.contactEmail.error }),
          ...(data.transaction.contactEmail.errorCode && { errorCode: data.transaction.contactEmail.errorCode }),
        },
        autoReply: {
          success: data.transaction.autoReply.success,
          ...(data.transaction.autoReply.response && { response: data.transaction.autoReply.response }),
          ...(data.transaction.autoReply.error && { error: data.transaction.autoReply.error }),
          ...(data.transaction.autoReply.errorCode && { errorCode: data.transaction.autoReply.errorCode }),
        },
        errors: data.transaction.errors,
      }

      const submission: ContactSubmission = {
        name: data.name,
        email: data.email,
        message: data.message,
        metadata: metadata as ContactSubmission["metadata"],
        requestId: data.requestId,
        ...(data.traceId && { traceId: data.traceId }),
        ...(data.spanId && { spanId: data.spanId }),
        transaction: cleanTransaction,
        status: "new",
        createdAt: now,
        updatedAt: now,
      }

      const docRef = await this.db.collection(this.collectionName).add(submission)

      this.logger.info("Contact submission saved to Firestore", {
        docId: docRef.id,
        requestId: data.requestId,
        email: data.email,
        transactionErrors: data.transaction.errors.length,
      })

      return docRef.id
    } catch (error) {
      this.logger.error("Failed to save contact submission to Firestore", {
        error,
        requestId: data.requestId,
      })
      throw error
    }
  }

  /**
   * Get a contact submission by ID
   */
  async getSubmission(docId: string): Promise<ContactSubmission | null> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(docId)
      const doc = await docRef.get()

      if (!doc.exists) {
        return null
      }

      return doc.data() as ContactSubmission
    } catch (error) {
      this.logger.error("Failed to get contact submission from Firestore", {
        error,
        docId,
      })
      throw error
    }
  }

  /**
   * Update submission status
   */
  async updateSubmissionStatus(docId: string, status: ContactSubmission["status"]): Promise<void> {
    try {
      const docRef = this.db.collection(this.collectionName).doc(docId)
      await docRef.update({
        status,
        updatedAt: new Date(),
      })

      this.logger.info("Contact submission status updated", {
        docId,
        status,
      })
    } catch (error) {
      this.logger.error("Failed to update contact submission status", {
        error,
        docId,
        status,
      })
      throw error
    }
  }

  /**
   * Get recent submissions
   */
  async getRecentSubmissions(limit = 50): Promise<Array<ContactSubmission & { id: string }>> {
    try {
      const snapshot = await this.db
        .collection(this.collectionName)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get()

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as ContactSubmission),
      }))
    } catch (error) {
      this.logger.error("Failed to get recent contact submissions", { error })
      throw error
    }
  }
}
