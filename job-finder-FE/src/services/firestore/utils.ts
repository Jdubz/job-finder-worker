/**
 * Firestore Utility Functions
 *
 * Shared utilities for Firestore operations across all clients.
 * Prevents code duplication and ensures consistent behavior.
 */

import { Timestamp } from "firebase/firestore"

/**
 * Convert Firestore Timestamps to JavaScript Dates recursively
 *
 * Handles:
 * - Top-level timestamps
 * - Nested objects with timestamps
 * - Arrays containing objects with timestamps
 *
 * @param data - Raw Firestore document data
 * @returns Converted data with Dates instead of Timestamps
 */
export function convertTimestamps<T>(data: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...data }

  for (const key in result) {
    const value = result[key]

    // Check if value is a Timestamp (either real or has toDate method)
    if (
      value instanceof Timestamp ||
      (value &&
        typeof value === "object" &&
        "toDate" in value &&
        typeof (value as { toDate?: unknown }).toDate === "function")
    ) {
      // Convert Timestamp to Date
      result[key] = (value as Timestamp).toDate()
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      // Recursively convert nested objects
      result[key] = convertTimestamps(value as Record<string, unknown>)
    } else if (Array.isArray(value)) {
      // Recursively convert array items
      result[key] = value.map((item) =>
        item && typeof item === "object" ? convertTimestamps(item as Record<string, unknown>) : item
      )
    }
  }

  return result as T
}

/**
 * Safe wrapper for async operations with fallback
 *
 * Catches errors and returns fallback value instead of throwing.
 * Useful for read operations that should never crash the UI.
 *
 * @param operation - Async operation to execute
 * @param fallback - Value to return on error
 * @returns Operation result or fallback
 */
export async function safeFirestoreOperation<T>(
  operation: () => Promise<T>,
  fallback: T,
  operationName?: string
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const name = operationName || "Firestore operation"
    console.error(`${name} failed, using fallback:`, error)
    return fallback
  }
}

/**
 * Validate that required fields exist in document data
 *
 * @param data - Document data to validate
 * @param requiredFields - Array of required field names
 * @returns True if all required fields exist
 */
export function validateDocumentData(
  data: Record<string, unknown>,
  requiredFields: string[]
): boolean {
  return requiredFields.every((field) => field in data && data[field] !== undefined)
}

/**
 * Create standardized metadata for document updates
 *
 * @param userEmail - Email of user making the update
 * @returns Metadata object with updatedAt and updatedBy
 */
export function createUpdateMetadata(userEmail: string) {
  return {
    updatedAt: new Date(),
    updatedBy: userEmail,
  }
}

/**
 * Create standardized metadata for document creation
 *
 * @param userEmail - Email of user creating the document
 * @returns Metadata object with createdAt, updatedAt, and createdBy
 */
export function createDocumentMetadata(userEmail: string) {
  const now = new Date()
  return {
    createdAt: now,
    updatedAt: now,
    createdBy: userEmail,
    updatedBy: userEmail,
  }
}
