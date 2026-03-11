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

/**
 * Create a human-readable display version of a URL by stripping
 * protocol and www prefix (case-insensitive) and trailing slash.
 * Derives from normalizeUrl output to handle all input forms consistently.
 */
export function displayUrl(value: string): string {
  return normalizeUrl(value).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')
}
