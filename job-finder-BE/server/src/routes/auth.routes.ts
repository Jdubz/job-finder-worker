import { Router, type Request, type Response, type RequestHandler, type NextFunction } from 'express'
import { parse as parseCookie } from 'cookie'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { verifyGoogleIdToken } from '../config/google-oauth'
import { success } from '../utils/api-response'
import { env } from '../config/env'
import { DEV_TOKENS } from '../config/dev-tokens'
import { UserRepository } from '../modules/users/user.repository'
import { logger } from '../logger'
import { ApiErrorCode } from '@shared/types'
import { ApiHttpError } from '../middleware/api-error'
import { rateLimit } from '../middleware/rate-limit'
import { asyncHandler } from '../utils/async-handler'
import { getCookieDomain, clearSessionCookie } from '../utils/cookie'

const IS_DEVELOPMENT = env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
const SESSION_TTL_DAYS = env.SESSION_TTL_DAYS
export const SESSION_COOKIE = 'jf_session'

const userRepository = new UserRepository()

const LoginSchema = z.object({
  credential: z.string().min(1, 'credential is required'),
})

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: !IS_DEVELOPMENT,
    sameSite: IS_DEVELOPMENT ? 'lax' : 'none',
    domain: getCookieDomain(),
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  })
}

function createSession(userId: string, req: Request): string {
  const token = randomUUID()
  const expiresAtMs = Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  const userAgent = req.headers['user-agent']
  const ipAddress = req.ip || req.socket.remoteAddress

  userRepository.createSession(userId, token, expiresAtMs, userAgent, ipAddress)
  return token
}

export function buildAuthRouter() {
  const router = Router()
  const loginRateLimiter = rateLimit({ windowMs: 60_000, max: 20 })
  const loginGuard: RequestHandler = env.NODE_ENV === 'production'
    ? loginRateLimiter
    : (_req: Request, _res: Response, next: NextFunction) => next()

  /**
   * POST /auth/login
   * Exchange a Google OAuth credential for a session cookie.
   * This is the single entry point for authentication.
   */
  router.post('/login', loginGuard, asyncHandler(async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new ApiHttpError(ApiErrorCode.INVALID_REQUEST, 'Invalid request body', {
        status: 400,
        details: parsed.error.flatten(),
      })
    }

    const { credential } = parsed.data

    // Development mode: accept dev tokens
    if (IS_DEVELOPMENT && credential in DEV_TOKENS) {
      const devConfig = DEV_TOKENS[credential]
      logger.info({ email: devConfig.email }, 'Dev token login')

      const user = userRepository.upsertUser(
        devConfig.email,
        devConfig.name,
        undefined,
        devConfig.roles
      )

      const sessionToken = createSession(user.id, req)
      setSessionCookie(res, sessionToken)
      userRepository.touchLastLogin(user.id)

      return res.json(
        success({
          user: {
            uid: user.id,
            email: user.email,
            name: user.displayName,
            picture: user.avatarUrl,
            roles: user.roles,
          },
        })
      )
    }

    // Production: validate Google OAuth credential
    const googleUser = await verifyGoogleIdToken(credential)
    if (!googleUser || !googleUser.email) {
      throw new ApiHttpError(ApiErrorCode.INVALID_TOKEN, 'Invalid Google credential', {
        status: 401,
      })
    }

    // Upsert user and create session
    // Database is the source of truth for roles
    // Existing users keep their roles, new users get 'viewer' role by default
    const existingUser = userRepository.findByEmail(googleUser.email)
    const roles = existingUser?.roles?.length ? existingUser.roles : ['viewer']

    const user = userRepository.upsertUser(
      googleUser.email,
      googleUser.name,
      googleUser.picture,
      roles
    )

    const sessionToken = createSession(user.id, req)
    setSessionCookie(res, sessionToken)
    userRepository.touchLastLogin(user.id)

    logger.info({ email: user.email }, 'User logged in')

    return res.json(
      success({
        user: {
          uid: user.id,
          email: user.email,
          name: user.displayName,
          picture: user.avatarUrl,
          roles: user.roles,
        },
      })
    )
  }))

  /**
   * GET /auth/session
   * Restore session from cookie. No Bearer token required.
   * Returns user info if session is valid, 401 if not.
   */
  router.get('/session', asyncHandler(async (req, res) => {
    const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {}
    const sessionToken = cookies[SESSION_COOKIE]

    if (!sessionToken) {
      throw new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'No session cookie', { status: 401 })
    }

    // findBySessionToken handles expiry check and cleanup
    const user = userRepository.findBySessionToken(sessionToken)
    if (!user) {
      clearSessionCookie(res)
      throw new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Invalid or expired session', { status: 401 })
    }

    userRepository.touchLastLogin(user.id)

    return res.json(
      success({
        user: {
          uid: user.id,
          email: user.email,
          name: user.displayName,
          picture: user.avatarUrl,
          roles: user.roles,
        },
      })
    )
  }))

  /**
   * POST /auth/logout
   * Clear session cookie and invalidate the current session only.
   * Other sessions (e.g., on other devices) remain active.
   */
  router.post('/logout', asyncHandler(async (req, res) => {
    const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {}
    const sessionToken = cookies[SESSION_COOKIE]

    if (sessionToken) {
      // Only delete the specific session, not all user sessions
      userRepository.deleteSessionByToken(sessionToken)
      logger.info('Session logged out')
    }

    clearSessionCookie(res)

    return res.json(success({ loggedOut: true }))
  }))

  return router
}
