import type { ContactSubmissionMetadata, ContactSubmissionTransaction } from "./firestore-schema.types"

export type ContactSubmissionStatus = "new" | "read" | "replied" | "spam"

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
