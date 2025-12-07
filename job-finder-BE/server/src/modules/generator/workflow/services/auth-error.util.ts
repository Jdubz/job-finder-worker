const AUTH_ERROR_KEYWORDS = [
  'not logged in',
  'login',
  'refresh token',
  'token was already used',
  'expired token',
  'authentication',
  'unauthorized'
]

const QUOTA_ERROR_KEYWORDS = [
  'rate limit',
  'rate_limit',
  'ratelimit',
  'quota exceeded',
  'quota_exceeded',
  'too many requests',
  'resource exhausted',
  'resource_exhausted',
  'billing',
  'insufficient_quota',
  'tokens per minute',
  'requests per minute',
  'capacity',
  '429'
]

export function isAuthenticationError(message?: string): boolean {
  if (!message) return false
  const lowered = message.toLowerCase()
  return AUTH_ERROR_KEYWORDS.some((k) => lowered.includes(k))
}

export function isQuotaError(message?: string): boolean {
  if (!message) return false
  const lowered = message.toLowerCase()
  return QUOTA_ERROR_KEYWORDS.some((k) => lowered.includes(k))
}
