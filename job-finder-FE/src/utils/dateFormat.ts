/**
 * Date formatting utilities for resume builder
 * All dates use "MMM YYYY" format (e.g., "Dec 2020")
 */

import type { TimestampLike } from "@shared/types"

/**
 * Normalize any date-like value to a Date object.
 * Handles: Date objects, ISO strings, Unix timestamps (numbers),
 * Firebase Timestamps (objects with toDate method), and null/undefined.
 *
 * @param value - Any value that might represent a date
 * @returns Date object or null if the value cannot be converted
 */
export function normalizeDateValue(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") return new Date(value)
  // Handle Firebase Timestamps and similar objects with toDate method
  if (typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    const toDateFn = (value as { toDate: () => Date }).toDate
    if (typeof toDateFn === "function") return toDateFn.call(value)
  }
  return null
}

/**
 * Normalize any JSON-like value to an object.
 * Handles objects directly, or JSON strings that parse to objects.
 *
 * @param value - Any value that might be an object or JSON string
 * @returns Object or null if the value cannot be converted
 */
export function normalizeObjectValue(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* ignore invalid JSON */
    }
  }
  return null
}

/**
 * Convert a variety of timestamp representations to a Date instance.
 * Accepts: Date, TimestampLike (with toDate), ISO string, Unix number, or nullish.
 * Returns an Invalid Date when conversion is not possible (caller can check isNaN).
 */
export function toDate(timestamp: TimestampLike | string | number | null | undefined): Date {
  // Reuse broader normalization logic for anything we consider date-like
  const normalized = normalizeDateValue(timestamp)
  if (normalized) return normalized

  // Last resort: return an invalid date instead of throwing, so consumers can handle it
  return new Date(NaN)
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
