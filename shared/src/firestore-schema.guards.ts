/**
 * Type Guards for Firestore Schema Types
 * 
 * Runtime validation functions for Firestore document types.
 * 
 * @package @shared/types
 */

import type {
  QueueItemDocument,
  QueueItemDocumentStatus,
  QueueItemDocumentType,
  QueueDocumentSource,
  CompanyDocument,
  CompanyTier,
  ContentItemDocument,
  ContentItemDocumentType,
  ContentItemDocumentVisibility,
  ContactSubmissionDocument,
  UserDocument,
  ConfigDocument,
} from './firestore-schema.types'

// ============================================================================
// Queue Types Guards
// ============================================================================

export function isQueueItemStatus(value: unknown): value is QueueItemDocumentStatus {
  return (
    typeof value === 'string' &&
    ['pending', 'processing', 'success', 'failed', 'skipped'].includes(value)
  )
}

export function isQueueItemType(value: unknown): value is QueueItemDocumentType {
  return typeof value === 'string' && ['job', 'company'].includes(value)
}

export function isQueueSource(value: unknown): value is QueueDocumentSource {
  return (
    typeof value === 'string' &&
    ['user_submission', 'scraper', 'api', 'manual'].includes(value)
  )
}

export function isQueueItemDocument(value: unknown): value is QueueItemDocument {
  if (typeof value !== 'object' || value === null) return false

  const doc = value as Record<string, unknown>

  return (
    isQueueItemType(doc.type) &&
    isQueueItemStatus(doc.status) &&
    typeof doc.url === 'string' &&
    typeof doc.company_name === 'string' &&
    isQueueSource(doc.source) &&
    typeof doc.retry_count === 'number' &&
    typeof doc.max_retries === 'number' &&
    (doc.created_at instanceof Date || typeof doc.created_at === 'object') &&
    (doc.updated_at instanceof Date || typeof doc.updated_at === 'object')
  )
}

// ============================================================================
// Company Types Guards
// ============================================================================

export function isCompanyTier(value: unknown): value is CompanyTier {
  return (
    typeof value === 'string' &&
    ['S', 'A', 'B', 'C', 'D', ''].includes(value)
  )
}

export function isCompanyDocument(value: unknown): value is CompanyDocument {
  if (typeof value !== 'object' || value === null) return false

  const doc = value as Record<string, unknown>

  return (
    typeof doc.name === 'string' &&
    typeof doc.name_lower === 'string' &&
    typeof doc.website === 'string' &&
    typeof doc.hasPortlandOffice === 'boolean' &&
    isCompanyTier(doc.tier) &&
    typeof doc.priorityScore === 'number' &&
    Array.isArray(doc.techStack) &&
    (doc.createdAt instanceof Date || typeof doc.createdAt === 'object') &&
    (doc.updatedAt instanceof Date || typeof doc.updatedAt === 'object')
  )
}

// ============================================================================
// Content Item Document Guards
// ============================================================================

export function isContentItemDocument(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false

  const doc = value as Record<string, unknown>

  return (
    typeof doc.order === 'number' &&
    (doc.parentId === undefined || doc.parentId === null || typeof doc.parentId === 'string') &&
    (doc.title === undefined || typeof doc.title === 'string') &&
    (doc.role === undefined || typeof doc.role === 'string') &&
    (doc.location === undefined || typeof doc.location === 'string') &&
    (doc.website === undefined || typeof doc.website === 'string') &&
    (doc.startDate === undefined || typeof doc.startDate === 'string') &&
    (doc.endDate === undefined || doc.endDate === null || typeof doc.endDate === 'string') &&
    (doc.description === undefined || typeof doc.description === 'string') &&
    (doc.skills === undefined || doc.skills === null || Array.isArray(doc.skills)) &&
    typeof doc.userId === 'string' &&
    (doc.visibility === 'published' || doc.visibility === 'draft' || doc.visibility === 'archived') &&
    (doc.createdAt instanceof Date || typeof doc.createdAt === 'object') &&
    (doc.updatedAt instanceof Date || typeof doc.updatedAt === 'object') &&
    typeof doc.createdBy === 'string' &&
    typeof doc.updatedBy === 'string'
  )
}

export function isContactSubmissionDocument(
  value: unknown
): value is ContactSubmissionDocument {
  if (typeof value !== 'object' || value === null) return false

  const doc = value as Record<string, unknown>

  return (
    typeof doc.name === 'string' &&
    typeof doc.email === 'string' &&
    typeof doc.message === 'string' &&
    typeof doc.status === 'string' &&
    typeof doc.requestId === 'string' &&
    typeof doc.traceId === 'string' &&
    typeof doc.spanId === 'string' &&
    typeof doc.metadata === 'object' &&
    (doc.createdAt instanceof Date || typeof doc.createdAt === 'object') &&
    (doc.updatedAt instanceof Date || typeof doc.updatedAt === 'object')
  )
}

// ============================================================================
// User Types Guards
// ============================================================================

export function isUserDocument(value: unknown): value is UserDocument {
  if (typeof value !== 'object' || value === null) return false

  const doc = value as Record<string, unknown>

  return (
    typeof doc.email === 'string' &&
    (doc.createdAt instanceof Date || typeof doc.createdAt === 'object')
  )
}

// ============================================================================
// Config Types Guards
// ============================================================================

export function isConfigDocument(value: unknown): value is ConfigDocument {
  if (typeof value !== 'object' || value === null) return false

  const doc = value as Record<string, unknown>

  return (
    typeof doc.key === 'string' &&
    typeof doc.value === 'object' &&
    (doc.createdAt instanceof Date || typeof doc.createdAt === 'object') &&
    (doc.updatedAt instanceof Date || typeof doc.updatedAt === 'object')
  )
}

