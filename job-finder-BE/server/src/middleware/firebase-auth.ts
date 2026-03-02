import type { NextFunction, Request, Response } from 'express'
import { parse as parseCookie } from 'cookie'
import { env } from '../config/env'
import { DEV_TOKENS } from '../config/dev-tokens'
import { UserRepository, type UserRole } from '../modules/users/user.repository'
import { ApiErrorCode } from '@shared/types'
import { ApiHttpError } from './api-error'
import { SESSION_COOKIE } from '../routes/auth.routes'
import { logger } from '../logger'

const IS_DEVELOPMENT = env.NODE_ENV === 'development'

const isTestEnv = () => process.env.NODE_ENV === 'test'
const buildBypassUser = (): AuthenticatedUser => ({
  uid: 'localhost-desktop',
  email: 'desktop@localhost',
  name: 'Desktop App',
  roles: ['editor']
})

function tryLocalhostBypass(req: Request): AuthenticatedUser | null {
  if (isTestEnv()) return null
  if (!isLocalhostRequest(req)) return null

  const host = req.headers.host ?? ''
  const origin = req.headers.origin ?? ''

  // If headers are present, ensure they align with local access; otherwise allow.
  const hostProvided = host.length > 0
  const originProvided = origin.length > 0

  const hostIsLocal =
    /^localhost(?::\d+)?$/i.test(host) ||
    /^127\.0\.0\.1(?::\d+)?$/.test(host) ||
    /^\[::1\](?::\d+)?$/i.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::\d+)?$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/.test(host)

  const originIsLocal =
    /^https?:\/\/localhost(?::\d+)?$/i.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin) ||
    /^https?:\/\/\[::1\](?::\d+)?$/i.test(origin) ||
    /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::\d+)?$/.test(origin) ||
    /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?$/.test(origin)

  const headersConsistent = (!hostProvided || hostIsLocal) && (!originProvided || originIsLocal)
  if (!headersConsistent) return null

  return buildBypassUser()
}

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
  if (IS_DEVELOPMENT || isTestEnv()) return undefined
  return env.COOKIE_DOMAIN || '.joshwentworth.com'
}

function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: !IS_DEVELOPMENT && !isTestEnv(),
    sameSite: IS_DEVELOPMENT || isTestEnv() ? 'lax' : 'none',
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
 * Check if request is from localhost, Docker host, or private LAN.
 * Used to allow desktop app access without auth when running on trusted networks.
 *
 * Accepts:
 * - 127.0.0.1, ::1, ::ffff:127.x.x.x (localhost)
 * - 172.16-31.x.x, ::ffff:172.16-31.x.x (Docker bridge networks)
 * - 192.168.x.x, ::ffff:192.168.x.x (private LAN for job-applicator on other machines)
 *
 * SECURITY: This check assumes Express's `trust proxy` is NOT enabled.
 * If `trust proxy` is enabled, an attacker could spoof the client IP via headers.
 * Always ensure `app.set('trust proxy', false)` when using this bypass.
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
  // Private LAN (192.168.0.0/16) - for job-applicator on other LAN machines
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true
  // IPv4-mapped IPv6 LAN (::ffff:192.168.x.x)
  if (/^::ffff:192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true

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
  // In development/test mode, check for dev tokens first
  if (IS_DEVELOPMENT || isTestEnv()) {
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

  const bypassUser = tryLocalhostBypass(req)
  if (bypassUser) {
    logger.info(
      { ip: req.socket?.remoteAddress, method: req.method, path: req.path },
      'Localhost auth bypass granted'
    )
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

  // findBySessionToken handles expiry check and cleanup for both new and legacy sessions
  const sessionUser = userRepository.findBySessionToken(sessionToken)
  if (!sessionUser) {
    clearSessionCookie(res)
    return next(
      new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Invalid or expired session', { status: 401 })
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
