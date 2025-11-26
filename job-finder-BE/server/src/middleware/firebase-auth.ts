import type { NextFunction, Request, Response } from "express"
import { env } from "../config/env"
import { verifyGoogleIdToken, type GoogleUser } from "../config/google-oauth"
import { UserRepository, type UserRole } from "../modules/users/user.repository"
import { logger } from "../logger"
import { ApiErrorCode } from "@shared/types"
import { ApiHttpError } from "./api-error"

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

function resolveBypassEmail(): string | undefined {
  if (cachedBypassEmail !== null) {
    return cachedBypassEmail || undefined
  }
  const admin = userRepository.findFirstAdmin()
  cachedBypassEmail = admin?.email ?? ""
  return cachedBypassEmail || undefined
}

function resolveRoles(email: string | undefined): UserRole[] {
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

function buildAuthenticatedUser(profile: GoogleUser): AuthenticatedUser | null {
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
    const bypassUser: AuthenticatedUser = {
      uid: "test-user",
      email,
      emailVerified: true,
      name: "Test Bypass User",
      roles: ["admin", "viewer"],
    }
    ;(req as AuthenticatedRequest).user = bypassUser
    return next()
  }

  // Development mode: accept dev tokens without Google OAuth
  if (IS_DEVELOPMENT && token in DEV_TOKENS) {
    const devConfig = DEV_TOKENS[token]
    logger.info({ email: devConfig.email, roles: devConfig.roles }, "Dev token authentication")

    // Create user object for dev token. Role-based access is determined by the roles array.
    const devUser: AuthenticatedUser = {
      uid: `dev-${devConfig.roles[0]}-user`,
      email: devConfig.email,
      emailVerified: true,
      name: devConfig.name,
      roles: devConfig.roles,
    }
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

  ;(req as AuthenticatedRequest).user = authenticatedUser
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
