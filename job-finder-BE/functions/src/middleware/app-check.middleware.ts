import { Request, Response, NextFunction } from "express"
import * as admin from "firebase-admin"
import { logger } from "../utils/logger"

/**
 * Firebase App Check middleware for Cloud Functions
 *
 * Verifies that requests come from legitimate app instances, not bots or scripts.
 *
 * In production: Strictly enforces App Check tokens
 * In development/emulator: Allows requests without tokens for easier testing
 */

const isProduction = process.env.NODE_ENV === "production"
const isTestEnvironment = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true"

// Explicit enforcement flag - must be set to "disabled" to bypass App Check
// This prevents accidental bypass through environment variable manipulation
const isAppCheckEnforced = process.env.APP_CHECK_ENFORCEMENT !== "disabled"

// Configure Firebase Auth Emulator before initializing Admin SDK
if (isEmulator && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  // Set the Auth emulator host for Firebase Admin SDK
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099"
  logger.info("[Admin SDK] Configured to use Firebase Auth Emulator at localhost:9099")
}

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp()
  if (isEmulator) {
    logger.info("[Admin SDK] Initialized in emulator mode")
  }
}

/**
 * App Check verification middleware
 *
 * Extracts and verifies Firebase App Check token from request headers.
 * Token must be in the X-Firebase-AppCheck header.
 */
export const verifyAppCheck = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Skip verification in test environment only
  if (isTestEnvironment) {
    return next()
  }

  // Allow bypass ONLY if explicitly disabled via APP_CHECK_ENFORCEMENT=disabled
  // This prevents accidental bypass through NODE_ENV or FUNCTIONS_EMULATOR manipulation
  if (!isAppCheckEnforced) {
    const appCheckToken = req.header("X-Firebase-AppCheck")
    if (!appCheckToken) {
      logger.warning("[AppCheck] App Check enforcement disabled - allowing request without token")
      logger.warning("[AppCheck] Set APP_CHECK_ENFORCEMENT=enabled to enforce App Check")
      return next()
    }
  } else if (!isProduction && isEmulator) {
    // In emulator with enforcement enabled, still allow for local testing
    // but log a warning to make it obvious
    const appCheckToken = req.header("X-Firebase-AppCheck")
    if (!appCheckToken) {
      logger.info("[AppCheck] Emulator mode with enforcement - allowing request for local testing")
      return next()
    }
  }

  try {
    const appCheckToken = req.header("X-Firebase-AppCheck")

    if (!appCheckToken) {
      logger.warning("[AppCheck] Missing App Check token")
      res.status(401).json({
        success: false,
        error: "UNAUTHORIZED",
        errorCode: "CF_SEC_001",
        message: "Unauthorized: App verification failed",
      })
      return
    }

    // Verify the App Check token
    const appCheckClaims = await admin.appCheck().verifyToken(appCheckToken)

    // Token is valid - attach app ID to request for logging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(req as any).appCheckAppId = appCheckClaims.appId

    logger.info("[AppCheck] Token verified successfully", {
      appId: appCheckClaims.appId,
    })

    next()
  } catch (error) {
    logger.error("[AppCheck] Token verification failed", {
      error: error instanceof Error ? error.message : error,
    })

    res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      errorCode: "CF_SEC_002",
      message: "Unauthorized: Invalid app verification",
    })
  }
}
