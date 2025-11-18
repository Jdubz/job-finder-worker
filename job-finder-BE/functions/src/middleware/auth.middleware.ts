import type { Request, Response, NextFunction } from "express";
import { auth } from "firebase-admin";
import { createDefaultLogger } from "../utils/logger";
import type { SimpleLogger } from "../types/logger.types";

export const AUTH_ERROR_CODES = {
  UNAUTHORIZED: {
    code: "JF_AUTH_001",
    status: 401,
    message: "Authentication required",
  },
  INVALID_TOKEN: {
    code: "JF_AUTH_002",
    status: 401,
    message: "Invalid authentication token",
  },
  TOKEN_EXPIRED: {
    code: "JF_AUTH_003",
    status: 401,
    message: "Authentication token expired",
  },
  FORBIDDEN: {
    code: "JF_AUTH_004",
    status: 403,
    message: "Access denied",
  },
  EMAIL_NOT_VERIFIED: {
    code: "JF_AUTH_005",
    status: 403,
    message: "Email address not verified",
  },
} as const;

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    email_verified: boolean;
  };
  requestId?: string;
}

/**
 * Middleware to verify any authenticated user (viewer or editor)
 *
 * Usage:
 *   app.post('/protected-route', verifyAuthenticatedUser(logger), handler)
 *
 * Sets req.user with { uid, email, email_verified } if authenticated
 */
export function verifyAuthenticatedUser(logger?: SimpleLogger) {
  const log = logger || createDefaultLogger();

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.requestId || "unknown";

    try {
      // Extract Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        log.warning("Missing or invalid Authorization header", {
          requestId,
        });

        const err = AUTH_ERROR_CODES.UNAUTHORIZED;
        res.status(err.status).json({
          success: false,
          error: "UNAUTHORIZED",
          errorCode: err.code,
          message: err.message,
          requestId,
        });
        return;
      }

      // Extract token
      const idToken = authHeader.split("Bearer ")[1];

      if (!idToken) {
        log.warning("Empty bearer token", { requestId });

        const err = AUTH_ERROR_CODES.UNAUTHORIZED;
        res.status(err.status).json({
          success: false,
          error: "UNAUTHORIZED",
          errorCode: err.code,
          message: err.message,
          requestId,
        });
        return;
      }

      // Verify token with Firebase Admin SDK
      let decodedToken: auth.DecodedIdToken;

      try {
        decodedToken = await auth().verifyIdToken(idToken);
      } catch (tokenError) {
        const errorMessage =
          tokenError instanceof Error ? tokenError.message : String(tokenError);

        // Check if token is expired
        const isExpired = errorMessage.includes("expired");

        log.warning("Token verification failed", {
          requestId,
          error: errorMessage,
          isExpired,
        });

        const err = isExpired
          ? AUTH_ERROR_CODES.TOKEN_EXPIRED
          : AUTH_ERROR_CODES.INVALID_TOKEN;

        res.status(err.status).json({
          success: false,
          error: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
          errorCode: err.code,
          message: err.message,
          requestId,
        });
        return;
      }

      // Extract user info
      const { uid, email, email_verified } = decodedToken;

      if (!email) {
        log.warning("Token missing email claim", {
          requestId,
          uid,
        });

        const err = AUTH_ERROR_CODES.INVALID_TOKEN;
        res.status(err.status).json({
          success: false,
          error: "INVALID_TOKEN",
          errorCode: err.code,
          message: "Token missing email claim",
          requestId,
        });
        return;
      }

      // Attach user info to request
      req.user = {
        uid,
        email,
        email_verified: email_verified || false,
      };

      log.info("User authenticated successfully", {
        requestId,
        email,
        uid,
      });

      // Continue to next middleware/handler
      next();
    } catch (error) {
      log.error("Unexpected error in auth middleware", {
        error,
        requestId,
      });

      res.status(500).json({
        success: false,
        error: "INTERNAL_ERROR",
        errorCode: "JF_SYS_001",
        message: "An unexpected error occurred",
        requestId,
      });
    }
  };
}

/**
 * Optional auth check - verifies token if present but doesn't reject if missing
 *
 * Usage:
 *   const isAuth = await checkOptionalAuth(req, logger)
 *   if (isAuth) {
 *     // User is authenticated, apply higher rate limits
 *   } else {
 *     // User is not authenticated, apply lower rate limits
 *   }
 *
 * Returns true if authenticated, false otherwise
 * Sets req.user with { uid, email, email_verified } if authenticated
 */
export async function checkOptionalAuth(
  req: AuthenticatedRequest,
  logger?: SimpleLogger
): Promise<boolean> {
  const log = logger || createDefaultLogger();
  const requestId = req.requestId || "unknown";

  try {
    // Extract Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No auth header - not authenticated but not an error
      return false;
    }

    // Extract token
    const idToken = authHeader.split("Bearer ")[1];

    if (!idToken) {
      return false;
    }

    // Verify token with Firebase Admin SDK
    try {
      const decodedToken = await auth().verifyIdToken(idToken);

      // Extract user info
      const { uid, email, email_verified } = decodedToken;

      if (!email) {
        log.info("Token missing email claim (optional auth)", {
          requestId,
          uid,
        });
        return false;
      }

      // Attach user info to request
      req.user = {
        uid,
        email,
        email_verified: email_verified || false,
      };

      log.info("Optional auth succeeded", {
        requestId,
        email,
        uid,
      });

      return true;
    } catch (tokenError) {
      const errorMessage =
        tokenError instanceof Error ? tokenError.message : String(tokenError);

      log.info("Optional auth token verification failed", {
        requestId,
        error: errorMessage,
      });

      return false;
    }
  } catch (error) {
    log.warning("Unexpected error in optional auth check", {
      error,
      requestId,
    });

    // Return false on error (fail open for optional auth)
    return false;
  }
}
