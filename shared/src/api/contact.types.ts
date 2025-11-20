import type { ContactSubmissionStatus, ContactSubmission } from "../contact.types"

export interface ListContactSubmissionsResponse {
  submissions: ContactSubmission[]
  count: number
}

export interface GetContactSubmissionResponse {
  submission: ContactSubmission
}

export interface UpdateContactSubmissionStatusRequest {
  submissionId: string
  status: ContactSubmissionStatus
}

export interface UpdateContactSubmissionStatusResponse {
  submission: ContactSubmission
}

export interface DeleteContactSubmissionResponse {
  submissionId: string
  deleted: boolean
}
