import type { TimestampLike } from "./time.types"
import type { JobMatchStatus } from "./job.types"

/** Classification of an application-related email */
export type EmailClassification = "acknowledged" | "interviewing" | "denied" | "unclassified"

/** Signals used to match an email to a job application */
export interface MatchSignals {
  companyDomainMatch?: boolean
  companyNameInBody?: boolean
  jobTitleMatch?: boolean
  atsHeaderMatch?: boolean
  senderDomainNameMatch?: boolean
  temporalProximity?: number
}

/** An email tracked as part of the application lifecycle */
export interface ApplicationEmail {
  id: string
  jobMatchId: string | null
  gmailMessageId: string
  gmailThreadId?: string | null
  gmailEmail: string

  sender: string
  senderDomain?: string | null
  subject?: string | null
  receivedAt: TimestampLike
  snippet?: string | null
  bodyPreview?: string | null

  classification: EmailClassification
  classificationConfidence: number

  matchConfidence?: number | null
  matchSignals?: MatchSignals | null
  autoLinked: boolean

  processedAt: TimestampLike
  createdAt: TimestampLike
  updatedAt: TimestampLike
}

/** A status change event in the application lifecycle */
export interface ApplicationStatusHistory {
  id: string
  jobMatchId: string
  fromStatus: JobMatchStatus
  toStatus: JobMatchStatus
  changedBy: "user" | "email_tracker"
  applicationEmailId?: string | null
  note?: string | null
  createdAt: TimestampLike
}
