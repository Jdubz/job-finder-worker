/**
 * Date formatting utilities for resume builder
 * All dates use "MMM YYYY" format (e.g., "Dec 2020")
 */

import type { TimestampLike } from "@shared/types"

/**
 * Convert TimestampLike to Date
 * Handles both Date objects and Firestore Timestamps
 * @param timestamp TimestampLike value (Date or FirestoreTimestamp)
 * @returns Date object
 */
export function toDate(timestamp: TimestampLike): Date {
  if (timestamp instanceof Date) {
    return timestamp
  }
  // FirestoreTimestamp has a toDate() method
  return timestamp.toDate()
}

/**
 * Convert YYYY-MM format to "MMM YYYY" display format
 * @param dateStr Date string in YYYY-MM format
 * @returns Formatted date string like "Dec 2020" or "Present" if null/undefined
 */
export function formatMonthYear(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return "Present"
  }

  try {
    const [year, month] = dateStr.split("-")
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]
    const monthNum = parseInt(month, 10)

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return "Present"
    }

    return `${monthNames[monthNum - 1]} ${year}`
  } catch {
    return "Present"
  }
}

/**
 * Get current date in YYYY-MM format
 * @returns Current date string in YYYY-MM format
 */
export function getCurrentMonthYear(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/**
 * Validate YYYY-MM format
 * @param dateStr Date string to validate
 * @returns True if valid YYYY-MM format
 */
export function isValidMonthYear(dateStr: string): boolean {
  if (!dateStr) {
    return false
  }

  const regex = /^\d{4}-(0[1-9]|1[0-2])$/
  return regex.test(dateStr)
}
