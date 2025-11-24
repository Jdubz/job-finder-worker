import type { NextFunction, Request, Response } from "express"
import { env } from "../config/env"
import { verifyGoogleIdToken, type GoogleUser } from "../config/google-oauth"
import { UserRepository, type UserRole } from "../modules/users/user.repository"
import { logger } from "../logger"

const IS_DEVELOPMENT = env.NODE_ENV === "development"

// Dev tokens for local development without Google OAuth
const DEV_TOKENS: Record<string, { email: string; roles: UserRole[]; name: string }> = {
  "dev-admin-token": {
    email: "dev-admin@jobfinder.dev",
    roles: ["admin"],
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

function buildAuthorizedUser(profile: GoogleUser): AuthenticatedUser | null {
  if (!profile.email) {
    logger.warn("Auth token missing email claim")
    return null
  }

  const record = userRepository.findByEmail(profile.email)
  if (!record) {
    logger.warn({ email: profile.email }, "User not found in roles table")
    return null
  }

  if (!record.roles.includes("admin")) {
    logger.warn({ email: record.email, roles: record.roles }, "User lacks admin role")
    return null
  }

  userRepository.touchLastLogin(record.id)

  return {
    uid: profile.uid ?? record.id,
    email: record.email,
    emailVerified: profile.emailVerified ?? true,
    name: profile.name ?? record.displayName ?? undefined,
    picture: profile.picture ?? record.avatarUrl ?? undefined,
    roles: record.roles
  }
}

export async function verifyFirebaseAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing Authorization header" })
  }

  const token = authHeader.slice("Bearer ".length)

  if (env.TEST_AUTH_BYPASS_TOKEN && token === env.TEST_AUTH_BYPASS_TOKEN) {
    const email = resolveBypassEmail()
    if (!email) {
      logger.error("Bypass token used but no admin user is defined in the users table")
      return res.status(403).json({ message: "User is not authorized" })
    }
    const bypassUser = buildAuthorizedUser({ uid: "test-user", email, emailVerified: true })
    if (!bypassUser) {
      return res.status(403).json({ message: "User is not authorized" })
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
    return res.status(401).json({ message: "Invalid auth token" })
  }

  const authorizedUser = buildAuthorizedUser(googleUser)
  if (!authorizedUser) {
    return res.status(403).json({ message: "User is not authorized" })
  }

  ;(req as AuthenticatedRequest).user = authorizedUser
  return next()
}
