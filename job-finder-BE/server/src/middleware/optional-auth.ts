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

/**
 * Middleware for generator routes that only allows public GET on safe sub-paths
 * (e.g. `/job-matches/:id/documents`), while requiring auth for sensitive endpoints
 * like `/requests` (which lists PII-containing generation history).
 *
 * `req.path` is relative to the mount point (`/api/generator`).
 */
export function generatorSelectivePublicRead(req: Request, res: Response, next: NextFunction) {
  // Only GET requests on the /job-matches/:id/documents path are public
  if (req.method === "GET" && /^\/job-matches\/[^/]+\/documents\/?$/.test(req.path)) {
    return next()
  }

  // Everything else (including GET /requests, GET /requests/:id/draft) requires auth
  return verifyFirebaseAuth(req, res, next)
}

/**
 * Middleware for queue routes that allows unauthenticated POST /jobs (public job submission)
 * but requires Firebase auth for all other queue routes.
 *
 * `req.path` is relative to the mount point, so when mounted at `/api/queue`
 * a request to `/api/queue/jobs` has `req.path === "/jobs"`.
 *
 * The POST /jobs handler already sets `submitted_by: null` and never reads `req.user`,
 * so skipping auth is safe. Route-level guards (e.g. `requireRole('admin')` on `/scrape`)
 * still apply because `verifyFirebaseAuth` runs for those paths.
 */
export function queuePublicJobSubmit(req: Request, res: Response, next: NextFunction) {
  if (req.method === "POST" && req.path === "/jobs") {
    return next()
  }

  return verifyFirebaseAuth(req, res, next)
}
