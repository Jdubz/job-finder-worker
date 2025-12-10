import type { NextFunction, Request, Response } from 'express'
import { parse as parseCookie } from 'cookie'
import { env } from '../config/env'
import { DEV_TOKENS } from '../config/dev-tokens'
import { UserRepository, type UserRole } from '../modules/users/user.repository'
import { ApiErrorCode } from '@shared/types'
import { ApiHttpError } from './api-error'
import { SESSION_COOKIE } from '../routes/auth.routes'

const IS_DEVELOPMENT = env.NODE_ENV === 'development'
const IS_TEST = env.NODE_ENV === 'test'
const CRON_API_KEY = env.CRON_API_KEY

export interface AuthenticatedUser {
  uid: string
  email: string
  name?: string
  picture?: string
  roles: UserRole[]
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser
}

const userRepository = new UserRepository()

function getCookieDomain(): string | undefined {
  if (IS_DEVELOPMENT || IS_TEST) {
    return undefined
  }
  return '.joshwentworth.com'
}

function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: !IS_DEVELOPMENT && !IS_TEST,
    sameSite: IS_DEVELOPMENT || IS_TEST ? 'lax' : 'none',
    domain: getCookieDomain(),
    path: '/',
  })
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}

/**
 * Check if request is from localhost or Docker host.
 * Used to allow desktop app access without auth when running on same machine.
 *
 * Accepts:
 * - 127.0.0.1, ::1, ::ffff:127.x.x.x (localhost)
 * - 172.16-31.x.x, ::ffff:172.16-31.x.x (Docker bridge networks)
 *
 * SECURITY: This check assumes Express's `trust proxy` is NOT enabled.
 * If `trust proxy` is enabled, an attacker could spoof the client IP via headers.
 * Always ensure `app.set('trust proxy', false)` when using localhost bypass.
 *
 * SECURITY: 172.16.0.0/12 is safe because the API port is bound to 127.0.0.1 only,
 * so only the Docker host machine can reach it via the bridge network.
 *
 * NOTE: Docker Compose creates custom networks in the 172.16-31.x.x range (not just
 * 172.17.x.x), so we allow the full 172.16.0.0/12 private range. Our production
 * network uses 172.22.x.x and gateway is 172.23.0.1.
 */
export function isLocalhostRequest(req: Request): boolean {
  // Prefer raw socket address which is not affected by trust proxy
  const ip = req.socket?.remoteAddress || req.ip || ''

  // IPv4 localhost
  if (ip === '127.0.0.1') return true
  // IPv6 localhost
  if (ip === '::1') return true
  // IPv4-mapped IPv6 localhost (::ffff:127.x.x.x range)
  if (/^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true
  // Docker bridge networks (172.16.0.0/12 - includes compose custom networks)
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(ip)) return true
  // IPv4-mapped IPv6 Docker bridge (::ffff:172.16-31.x.x)
  if (/^::ffff:172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(ip)) return true

  return false
}

/**
 * Session-based authentication middleware with dev token fallback.
 *
 * In production: Only session cookies are accepted (unless localhost)
 * In development/test: Also accepts dev tokens via Bearer header for testing
 * Localhost requests: Bypass auth for desktop app running on same machine
 */
export async function verifyFirebaseAuth(req: Request, res: Response, next: NextFunction) {
  // Machine key bypass (for internal cron or other trusted automation)
  const cronKey = req.headers['x-cron-key'] || req.headers['x-api-key']
  if (
    typeof CRON_API_KEY === 'string' &&
    CRON_API_KEY.length > 0 &&
    typeof cronKey === 'string' &&
    cronKey === CRON_API_KEY
  ) {
    const user: AuthenticatedUser = {
      uid: 'cron-service',
      email: 'cron@system.local',
      roles: ['admin']
    }
    ;(req as AuthenticatedRequest).user = user
    return next()
  }

  // In development/test mode, check for dev tokens first
  if (IS_DEVELOPMENT || IS_TEST) {
    const bearerToken = extractBearerToken(req)
    if (bearerToken && bearerToken in DEV_TOKENS) {
      const devConfig = DEV_TOKENS[bearerToken]
      const user: AuthenticatedUser = {
        uid: `dev-${devConfig.email}`,
        email: devConfig.email,
        name: devConfig.name,
        roles: devConfig.roles,
      }
      ;(req as AuthenticatedRequest).user = user
      return next()
    }
  }

  // Localhost bypass - allow desktop/hosted tools on the same machine when no other auth is present
  // Must run after cron/dev-token checks, but before session cookie lookup to avoid downgrading
  if (isLocalhostRequest(req)) {
    const bypassUser: AuthenticatedUser = {
      uid: 'localhost-desktop',
      email: 'desktop@localhost',
      name: 'Desktop App',
      roles: ['admin']
    }
    ;(req as AuthenticatedRequest).user = bypassUser
    return next()
  }

  // Check session cookie
  const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {}
  const sessionToken = cookies[SESSION_COOKIE]

  if (!sessionToken) {
    return next(
      new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Authentication required', { status: 401 })
    )
  }

  const sessionUser = userRepository.findBySessionToken(sessionToken)
  if (!sessionUser) {
    clearSessionCookie(res)
    return next(
      new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Invalid session', { status: 401 })
    )
  }

  const expiryMs =
    sessionUser.sessionExpiresAtMs ??
    (sessionUser.sessionExpiresAt ? Date.parse(sessionUser.sessionExpiresAt) : 0)

  if (expiryMs <= Date.now()) {
    clearSessionCookie(res)
    userRepository.clearSession(sessionUser.id)
    return next(
      new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Session expired', { status: 401 })
    )
  }

  const user: AuthenticatedUser = {
    uid: sessionUser.id,
    email: sessionUser.email,
    name: sessionUser.displayName,
    picture: sessionUser.avatarUrl,
    roles: sessionUser.roles.length ? sessionUser.roles : ['viewer'],
  }

  userRepository.touchLastLogin(sessionUser.id)
  ;(req as AuthenticatedRequest).user = user

  return next()
}

/**
 * Role-based access control middleware.
 * Must be used after verifyFirebaseAuth.
 */
export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user
    if (!user) {
      return next(
        new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Authentication required', { status: 401 })
      )
    }
    if (!user.roles.includes(role)) {
      return next(
        new ApiHttpError(ApiErrorCode.FORBIDDEN, 'Insufficient permissions', {
          status: 403,
          details: { requiredRole: role },
        })
      )
    }
    next()
  }
}
