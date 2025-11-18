/**
 * Date formatting utilities for resume builder
 * All dates use "MMM YYYY" format (e.g., "Dec 2020")
 */

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
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    const monthNum = parseInt(month, 10)

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return "Present"
    }

    return `${monthNames[monthNum - 1]} ${year}`
  } catch {
    return "Present"
  }
}
