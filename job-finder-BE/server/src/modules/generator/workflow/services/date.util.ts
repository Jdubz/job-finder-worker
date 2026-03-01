import { cleanText } from './text.util'

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

/**
 * Format date to "Mon YYYY" (e.g., "Feb 2025").
 * Handles various input formats: "2025-02", "2025-02-15", "Feb 2025", etc.
 */
export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return ''
  const cleaned = cleanText(dateStr)
  if (!cleaned || cleaned.toLowerCase() === 'present') return 'Present'

  // Try YYYY-MM or YYYY-MM-DD format
  const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})/)
  if (isoMatch) {
    const year = isoMatch[1]
    const monthIdx = parseInt(isoMatch[2], 10) - 1
    if (monthIdx >= 0 && monthIdx < 12) {
      return `${MONTH_NAMES[monthIdx]} ${year}`
    }
  }

  // Try "Month YYYY" or "Month-YYYY" format (already formatted)
  const monthYearMatch = cleaned.match(/^([A-Za-z]{3,})\s*[-\s]?\s*(\d{4})$/)
  if (monthYearMatch) {
    const monthStr = monthYearMatch[1].toLowerCase()
    // Try to match against full month names for canonical output
    const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(monthStr.slice(0, 3)))
    if (idx >= 0) {
      return `${MONTH_NAMES[idx]} ${monthYearMatch[2]}`
    }
    // Fall back to capitalized input
    const cap = monthStr.charAt(0).toUpperCase() + monthStr.slice(1)
    return `${cap} ${monthYearMatch[2]}`
  }

  // Just a year
  const yearMatch = cleaned.match(/^(\d{4})$/)
  if (yearMatch) {
    return yearMatch[1]
  }

  return cleaned
}
