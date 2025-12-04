export function formatDate(date: unknown): string {
  const d = normalizeDate(date)
  if (!d) return "—"
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

export function formatDateTime(date: unknown): string {
  const d = normalizeDate(date)
  if (!d) return "—"
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function normalizeDate(date: unknown): Date | null {
  if (!date) return null
  if (date instanceof Date) return isNaN(date.getTime()) ? null : date
  if (typeof date === "string" || typeof date === "number") {
    const d = new Date(date)
    return isNaN(d.getTime()) ? null : d
  }
  if (
    typeof date === "object" &&
    date !== null &&
    "toDate" in date &&
    typeof (date as { toDate: () => Date }).toDate === "function"
  ) {
    const d = (date as { toDate: () => Date }).toDate()
    return isNaN(d.getTime()) ? null : d
  }
  return null
}
