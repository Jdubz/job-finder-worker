/**
 * Firestore Service Types
 *
 * Type definitions for the Firestore service layer
 */

import type { Timestamp } from "firebase/firestore"
import type {
  QueueItem,
  Company,
  ContentItem,
  StopList,
  QueueSettings,
  AISettings,
  PersonalInfoDocument as PersonalInfo,
} from "@shared/types"

// Type aliases for backward compatibility with FE naming convention
export type QueueItemDocument = QueueItem
export type CompanyDocument = Company
export type ContentItemDocument = ContentItem
// Note: ContactSubmissionDocument and UserDocument are FE-specific and not in shared-types
export type ContactSubmissionDocument = {
  name: string
  email: string
  message: string
  createdAt: Timestamp
}
export type UserDocument = {
  uid: string
  email: string
  displayName?: string
  createdAt: Timestamp
}

/**
 * Convert Firestore Timestamps to Dates for client-side usage
 */
export type ClientSideDocument<T> = {
  [K in keyof T]: T[K] extends Timestamp
    ? Date
    : T[K] extends Timestamp | undefined
      ? Date | undefined
      : T[K] extends Record<string, unknown>
        ? ClientSideDocument<T[K]>
        : T[K]
}

/**
 * Document with ID included
 */
export type DocumentWithId<T> = ClientSideDocument<T> & { id: string }

/**
 * Query constraints for Firestore queries
 */
export interface QueryConstraints {
  where?: Array<{
    field: string
    operator:
      | "<"
      | "<="
      | "=="
      | "!="
      | ">="
      | ">"
      | "array-contains"
      | "in"
      | "array-contains-any"
      | "not-in"
    value: unknown
  }>
  orderBy?: Array<{
    field: string
    direction?: "asc" | "desc"
  }>
  limit?: number
  startAfter?: unknown
  startAt?: unknown
}

/**
 * Subscription callback
 */
export type SubscriptionCallback<T> = (data: DocumentWithId<T>[]) => void

/**
 * Document subscription callback
 */
export type DocumentSubscriptionCallback<T> = (data: DocumentWithId<T> | null) => void

/**
 * Error callback
 */
export type ErrorCallback = (error: Error) => void

/**
 * Unsubscribe function
 */
export type UnsubscribeFn = () => void

/**
 * Job Finder Config document union type
 * The job-finder-config collection can contain different document types based on document ID
 */
export type JobFinderConfigDocument = PersonalInfo | StopList | QueueSettings | AISettings

/**
 * Collection map for type safety
 */
export interface CollectionTypeMap {
  "job-queue": QueueItemDocument
  companies: CompanyDocument
  "content-items": ContentItemDocument
  "contact-submissions": ContactSubmissionDocument
  users: UserDocument
  "job-finder-config": JobFinderConfigDocument
  "generator-documents": Record<string, unknown> // Will be defined later
  "job-matches": Record<string, unknown> // Will be defined later
  experiences: Record<string, unknown> // Will be defined later
  blurbs: Record<string, unknown> // Will be defined later
}

/**
 * Cache entry for documents
 */
export interface CacheEntry<T> {
  data: DocumentWithId<T>[]
  timestamp: number
  unsubscribe: UnsubscribeFn
  subscriberCount?: number
}

/**
 * Document cache entry
 */
export interface DocumentCacheEntry<T> {
  data: DocumentWithId<T> | null
  timestamp: number
  unsubscribe: UnsubscribeFn
  subscriberCount?: number
}
