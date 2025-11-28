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
 * Session-based authentication middleware with dev token fallback.
 *
 * In production: Only session cookies are accepted
 * In development/test: Also accepts dev tokens via Bearer header for testing
 */
export async function verifyFirebaseAuth(req: Request, res: Response, next: NextFunction) {
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
