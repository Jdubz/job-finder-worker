import type { NextFunction, Request, Response } from "express"
import { randomUUID } from "node:crypto"
import { env } from "../config/env"
import { verifyGoogleIdToken, type GoogleUser } from "../config/google-oauth"
import { UserRepository, type UserRole } from "../modules/users/user.repository"
import { logger } from "../logger"
import { ApiErrorCode } from "@shared/types"
import { ApiHttpError } from "./api-error"
import { parse as parseCookie } from "cookie"

const IS_DEVELOPMENT = env.NODE_ENV === "development"

// Dev tokens for local development without Google OAuth
const DEV_TOKENS: Record<string, { email: string; roles: UserRole[]; name: string }> = {
  "dev-admin-token": {
    email: "dev-admin@jobfinder.dev",
    roles: ["admin", "viewer"],
    name: "Dev Admin",
  },
  "dev-viewer-token": {
    email: "dev-viewer@jobfinder.dev",
    roles: ["viewer"],
    name: "Dev Viewer",
  },
}

interface AuthenticatedUser extends GoogleUser {
  roles: UserRole[]
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser
}

const userRepository = new UserRepository()
let cachedBypassEmail: string | null = null
const SESSION_COOKIE = "jf_session"
const SESSION_TTL_DAYS = env.SESSION_TTL_DAYS

function resolveBypassEmail(): string | undefined {
  if (cachedBypassEmail !== null) {
    return cachedBypassEmail || undefined
  }
  const admin = userRepository.findFirstAdmin()
  cachedBypassEmail = admin?.email ?? ""
  return cachedBypassEmail || undefined
}

function issueSession(res: Response, user: AuthenticatedUser) {
  const token = randomUUID()
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)

  // Persist on the user record
  userRepository.saveSession(user.uid, token, expires.toISOString())

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    // Allow the API domain to set/read the session cookie when called from the
    // frontend domain (job-finder.joshwentworth.com).
    sameSite: IS_DEVELOPMENT ? "lax" : "none",
    secure: !IS_DEVELOPMENT,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  })
}

export function resolveRoles(email: string | undefined): UserRole[] {
  if (!email) {
    return []
  }

  const record = userRepository.findByEmail(email)
  if (record) {
    userRepository.touchLastLogin(record.id)
    // Ensure viewers retain viewer access even if roles column is empty
    return record.roles.length ? record.roles : ["viewer"]
  }

  // If the user is not in the roles table, treat them as a basic viewer by default.
  return ["viewer"]
}

export function buildAuthenticatedUser(profile: GoogleUser): AuthenticatedUser | null {
  if (!profile.email) {
    logger.warn("Auth token missing email claim")
    return null
  }

  const roles = resolveRoles(profile.email)

  return {
    uid: profile.uid ?? profile.email,
    email: profile.email,
    emailVerified: profile.emailVerified ?? true,
    name: profile.name,
    picture: profile.picture,
    roles,
  }
}

export async function verifyFirebaseAuth(req: Request, res: Response, next: NextFunction) {
  const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {}
  const sessionToken = cookies[SESSION_COOKIE]

  if (sessionToken) {
    const sessionUser = userRepository.findBySessionToken(sessionToken)
    const expiryMs = sessionUser?.sessionExpiresAtMs ?? (sessionUser?.sessionExpiresAt ? Date.parse(sessionUser.sessionExpiresAt) : undefined)
    if (sessionUser && expiryMs && expiryMs > Date.now()) {
      const user: AuthenticatedUser = {
        uid: sessionUser.id,
        email: sessionUser.email,
        emailVerified: true,
        name: sessionUser.displayName,
        picture: sessionUser.avatarUrl,
        roles: sessionUser.roles.length ? sessionUser.roles : ["viewer"]
      }
      userRepository.touchLastLogin(sessionUser.id)
      ;(req as AuthenticatedRequest).user = user
      return next()
    }
    // Expired/invalid session - clear the cookie for the client
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: IS_DEVELOPMENT ? "lax" : "none",
      secure: !IS_DEVELOPMENT
    })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return next(new ApiHttpError(ApiErrorCode.UNAUTHORIZED, "Missing Authorization header", { status: 401 }))
  }

  const token = authHeader.slice("Bearer ".length)

  if (env.TEST_AUTH_BYPASS_TOKEN && token === env.TEST_AUTH_BYPASS_TOKEN) {
    const email = resolveBypassEmail()
    if (!email) {
      logger.error("Bypass token used but no admin user is defined in the users table")
      return next(new ApiHttpError(ApiErrorCode.FORBIDDEN, "User is not authorized", { status: 403 }))
    }
    const persisted = userRepository.upsertUser(email, "Test Bypass User", undefined, ["admin", "viewer"])
    const bypassUser: AuthenticatedUser = {
      uid: persisted.id,
      email: persisted.email,
      emailVerified: true,
      name: persisted.displayName,
      picture: persisted.avatarUrl,
      roles: persisted.roles.length ? persisted.roles : ["admin", "viewer"],
    }
    issueSession(res, bypassUser)
    ;(req as AuthenticatedRequest).user = bypassUser
    return next()
  }

  // Development mode: accept dev tokens without Google OAuth
  if (IS_DEVELOPMENT && token in DEV_TOKENS) {
    const devConfig = DEV_TOKENS[token]
    logger.info({ email: devConfig.email, roles: devConfig.roles }, "Dev token authentication")

    // Create user object for dev token. Role-based access is determined by the roles array.
    const persisted = userRepository.upsertUser(devConfig.email, devConfig.name, undefined, devConfig.roles)
    const devUser: AuthenticatedUser = {
      uid: persisted.id,
      email: persisted.email,
      emailVerified: true,
      name: persisted.displayName,
      picture: persisted.avatarUrl,
      roles: persisted.roles.length ? persisted.roles : devConfig.roles,
    }
    issueSession(res, devUser)
    ;(req as AuthenticatedRequest).user = devUser
    return next()
  }

  const googleUser = await verifyGoogleIdToken(token)
  if (!googleUser) {
    return next(new ApiHttpError(ApiErrorCode.INVALID_TOKEN, "Invalid auth token", { status: 401 }))
  }

  const authenticatedUser = buildAuthenticatedUser(googleUser)
  if (!authenticatedUser) {
    return next(new ApiHttpError(ApiErrorCode.FORBIDDEN, "User is not authorized", { status: 403 }))
  }

  const persisted = userRepository.upsertUser(
    authenticatedUser.email!,
    authenticatedUser.name,
    authenticatedUser.picture,
    authenticatedUser.roles
  )
  const sessionUser: AuthenticatedUser = {
    ...authenticatedUser,
    uid: persisted.id,
    email: persisted.email,
    roles: persisted.roles.length ? persisted.roles : authenticatedUser.roles,
    name: persisted.displayName ?? authenticatedUser.name,
    picture: persisted.avatarUrl ?? authenticatedUser.picture,
  }

  issueSession(res, sessionUser)

  ;(req as AuthenticatedRequest).user = sessionUser
  return next()
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthenticatedRequest).user
    if (!user) {
      return next(new ApiHttpError(ApiErrorCode.UNAUTHORIZED, "Missing authenticated user", { status: 401 }))
    }
    if (!user.roles.includes(role)) {
      return next(new ApiHttpError(ApiErrorCode.FORBIDDEN, "User is not authorized", { status: 403, details: { requiredRole: role } }))
    }
    next()
  }
}
