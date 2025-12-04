/**
 * Normalize a URL to ensure it has a protocol prefix.
 * Returns the URL with https:// if no protocol is present.
 */
export function normalizeUrl(value: string): string {
  if (!value) return ''
  return /^https?:/i.test(value) ? value : `https://${value}`
}

/**
 * Strip protocol from a URL for display purposes.
 * "https://example.com" → "example.com"
 */
export function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//i, '')
}
