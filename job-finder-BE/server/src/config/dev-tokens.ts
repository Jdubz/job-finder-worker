/**
 * Dev tokens for local development and tests without Google OAuth.
 * Used by both auth routes (login) and auth middleware (Bearer token).
 */
export interface DevTokenConfig {
  email: string
  roles: string[]
  name: string
}

export const DEV_TOKENS: Record<string, DevTokenConfig> = {
  'dev-admin-token': {
    email: 'dev-admin@jobfinder.dev',
    roles: ['admin', 'viewer'],
    name: 'Dev Admin',
  },
  'dev-viewer-token': {
    email: 'dev-viewer@jobfinder.dev',
    roles: ['viewer'],
    name: 'Dev Viewer',
  },
  'bypass-token': {
    email: 'test@jobfinder.dev',
    roles: ['admin', 'viewer'],
    name: 'Test User',
  },
}
