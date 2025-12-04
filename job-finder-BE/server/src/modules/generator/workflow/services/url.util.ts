/**
 * Normalize a URL to ensure it has a protocol prefix.
 * Returns the URL with https:// if no protocol is present.
 * Returns empty string for empty/whitespace-only input.
 */
export function normalizeUrl(value: string): string {
  if (!value?.trim()) return ''
  const trimmed = value.trim()
  return /^https?:/i.test(trimmed) ? trimmed : `https://${trimmed}`
}
