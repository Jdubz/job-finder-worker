import type { NextFunction, Request, Response } from "express"
import type { DecodedIdToken } from "firebase-admin/auth"
import { getAuth } from "../config/firebase"
import { env } from "../config/env"
import { verifyGoogleIdToken, type GoogleUser } from "../config/google-oauth"
import { logger } from "../logger"

interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken | GoogleUser
}

const adminAllowlist = env.ADMIN_EMAIL_ALLOWLIST
  ? env.ADMIN_EMAIL_ALLOWLIST.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
  : []

const defaultBypassEmail = adminAllowlist[0] ?? "test-user@example.com"

function isEmailAllowed(email?: string | null): boolean {
  if (!adminAllowlist.length) {
    return true
  }
  if (!email) {
    return false
  }
  return adminAllowlist.includes(email.toLowerCase())
}

export async function verifyFirebaseAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing Authorization header" })
  }

  const token = authHeader.slice("Bearer ".length)

  if (env.TEST_AUTH_BYPASS_TOKEN && token === env.TEST_AUTH_BYPASS_TOKEN) {
    const bypassUser: GoogleUser = {
      uid: "test-user",
      email: defaultBypassEmail,
      emailVerified: true
    }
    ;(req as AuthenticatedRequest).user = bypassUser
    return next()
  }

  const googleUser = await verifyGoogleIdToken(token)
  if (googleUser) {
    if (!isEmailAllowed(googleUser.email)) {
      return res.status(403).json({ message: "User is not authorized" })
    }
    ;(req as AuthenticatedRequest).user = googleUser
    return next()
  }

  try {
    const decoded = await getAuth().verifyIdToken(token, true)
    if (!isEmailAllowed(decoded.email ?? undefined)) {
      return res.status(403).json({ message: "User is not authorized" })
    }
    ;(req as AuthenticatedRequest).user = decoded
    return next()
  } catch (error) {
    logger.warn({ err: error }, "Failed to verify auth token")
    return res.status(401).json({ message: "Invalid auth token" })
  }
}
