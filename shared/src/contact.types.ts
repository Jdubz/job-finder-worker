export type ContactSubmissionStatus = "new" | "read" | "replied" | "spam"

export interface ContactSubmissionMetadata {
  timestamp: string
  ip: string
  userAgent: string
  referrer?: string
}

export interface EmailTransactionResult {
  success: boolean
  response?: {
    messageId: string
    status: string
    accepted: boolean
  }
  error?: string
}

export interface ContactSubmissionTransaction {
  contactEmail?: EmailTransactionResult
  autoReply?: EmailTransactionResult
  errors?: string[]
}

export interface ContactSubmission {
  id: string
  name: string
  email: string
  message: string
  metadata: ContactSubmissionMetadata
  transaction?: ContactSubmissionTransaction
  status: ContactSubmissionStatus
  createdAt: string
  updatedAt: string
}
