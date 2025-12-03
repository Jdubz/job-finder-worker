const AUTH_ERROR_KEYWORDS = [
  'not logged in',
  'login',
  'refresh token',
  'token was already used',
  'expired token',
  'authentication',
  'unauthorized'
]

export function isAuthenticationError(message?: string): boolean {
  if (!message) return false
  const lowered = message.toLowerCase()
  return AUTH_ERROR_KEYWORDS.some((k) => lowered.includes(k))
}
