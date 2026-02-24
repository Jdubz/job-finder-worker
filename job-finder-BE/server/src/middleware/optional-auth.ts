import type { NextFunction, Request, Response } from "express"
import { verifyFirebaseAuth, requireRole } from "./firebase-auth"

/**
 * Middleware that allows public GET requests but requires authentication for other methods.
 * Used for endpoints that should be publicly readable but require auth for modifications.
 */
export function publicReadPrivateWrite(req: Request, res: Response, next: NextFunction) {
  // Allow public GET requests
  if (req.method === "GET") {
    return next()
  }

  // All other methods require authentication
  return verifyFirebaseAuth(req, res, (err?: unknown) => {
    if (err) return next(err)
    return requireRole("admin")(req, res, next)
  })
}

/**
 * Middleware that allows public GET requests but requires any authenticated user for mutations.
 * Unlike `publicReadPrivateWrite`, this does NOT require an admin role — any Google account suffices.
 */
export function publicReadAuthenticatedWrite(req: Request, res: Response, next: NextFunction) {
  // Allow public GET requests
  if (req.method === "GET") {
    return next()
  }

  // All other methods require authentication (any role)
  return verifyFirebaseAuth(req, res, next)
}
