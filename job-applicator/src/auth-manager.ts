/**
 * OAuth flow manager for job-applicator.
 * Handles Google OAuth via popup window and session management.
 */

import { BrowserWindow, session } from "electron"
import {
  getSessionToken,
  setSessionToken,
  clearSessionToken,
} from "./auth-store.js"
import { getApiUrl } from "./api-client.js"
import { logger } from "./logger.js"

export interface AuthUser {
  email: string
  name?: string
  uid?: string
}

export interface AuthResult {
  success: boolean
  user?: AuthUser
  message?: string
}

const SESSION_COOKIE_NAME = "jf_session"

/**
 * Check if auth should be skipped (for local development with private IP bypass).
 */
function shouldSkipAuth(): boolean {
  return ["true", "1"].includes(String(process.env.JOB_FINDER_SKIP_AUTH).toLowerCase())
}

/**
 * Get the frontend URL for OAuth login.
 */
function getLoginUrl(): string {
  const frontendUrl = process.env.JOB_FINDER_FRONTEND_URL
  if (frontendUrl) return frontendUrl

  // Derive from API URL
  const apiUrl = getApiUrl()
  try {
    const url = new URL(apiUrl)
    if (url.port === "3000") {
      url.port = "5173"
      return url.origin
    }
    // Production: api subdomain to main domain
    if (url.hostname.includes("-api.")) {
      return url.origin.replace("-api.", ".")
    }
  } catch {
    // Fallback
  }

  return "http://localhost:5173"
}

/**
 * Open OAuth popup and wait for authentication.
 */
async function openAuthPopup(
  parentWindow: BrowserWindow | null
): Promise<{ token: string; user: AuthUser }> {
  return new Promise((resolve, reject) => {
    const loginUrl = getLoginUrl()
    logger.info(`[Auth] Opening login popup: ${loginUrl}`)

    const popup = new BrowserWindow({
      width: 500,
      height: 700,
      show: true,
      parent: parentWindow || undefined,
      modal: !!parentWindow,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    let resolved = false
    let timeoutId: NodeJS.Timeout | null = null
    let interval: NodeJS.Timeout | null = null

    // Cleanup function - clears both timeout and interval
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }

    // Listen for cookie changes to detect successful login
    const cookieListener = async () => {
      if (resolved) return

      try {
        const cookies = await popup.webContents.session.cookies.get({
          name: SESSION_COOKIE_NAME,
        })

        if (cookies.length > 0) {
          const sessionCookie = cookies[0]
          logger.info(`[Auth] Session cookie captured`)
          resolved = true
          cleanup()

          // Fetch user info from session endpoint
          const user = await fetchUserFromSession(sessionCookie.value)

          popup.close()
          resolve({ token: sessionCookie.value, user })
        }
      } catch (err) {
        // Cookie not yet set, continue waiting. Log for debugging.
        logger.debug(`[Auth] Cookie check failed (will retry): ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Check for cookie after each navigation
    popup.webContents.on("did-navigate", cookieListener)
    popup.webContents.on("did-navigate-in-page", cookieListener)

    // Also check periodically (for SPAs that don't trigger navigation)
    interval = setInterval(cookieListener, 500)

    // Handle popup close without authentication
    popup.on("closed", () => {
      cleanup()
      if (!resolved) {
        reject(new Error("Authentication cancelled"))
      }
    })

    // Load the login page
    popup.loadURL(loginUrl).catch((err) => {
      cleanup()
      if (!resolved) {
        popup.close()
        reject(new Error(`Failed to load login page: ${err.message}`))
      }
    })

    // Timeout after 5 minutes
    timeoutId = setTimeout(() => {
      cleanup()
      if (!resolved) {
        popup.close()
        reject(new Error("Authentication timeout"))
      }
    }, 5 * 60 * 1000)
  })
}

/**
 * Fetch user info from session endpoint using the session token.
 */
async function fetchUserFromSession(token: string): Promise<AuthUser> {
  const apiUrl = getApiUrl()
  const response = await fetch(`${apiUrl}/auth/session`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Session validation failed: ${response.status}`)
  }

  const data = await response.json()
  if (!data.success || !data.data?.user) {
    throw new Error("Invalid session response")
  }

  return {
    uid: data.data.user.uid,
    email: data.data.user.email,
    name: data.data.user.name,
  }
}

/**
 * Initiate the login flow.
 */
export async function initiateLogin(
  parentWindow: BrowserWindow | null
): Promise<AuthResult> {
  try {
    const { token, user } = await openAuthPopup(parentWindow)

    setSessionToken(token, {
      email: user.email,
      name: user.name,
    })

    return { success: true, user }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Auth] Login failed: ${message}`)
    return { success: false, message }
  }
}

/**
 * Log out the current user.
 */
export async function logout(): Promise<void> {
  const token = getSessionToken()

  if (token) {
    // Try to invalidate session on server
    try {
      const apiUrl = getApiUrl()
      await fetch(`${apiUrl}/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      })
    } catch (err) {
      logger.warn("[Auth] Server logout failed:", err)
    }
  }

  // Always clear local session
  clearSessionToken()

  // Clear cookies from default session
  try {
    await session.defaultSession.clearStorageData({
      storages: ["cookies"],
    })
  } catch (err) {
    logger.warn("[Auth] Failed to clear session cookies:", err)
  }
}

/**
 * Restore session from stored token.
 * Returns user info if session is valid, null otherwise.
 * If JOB_FINDER_SKIP_AUTH=true, returns a local user (for private IP bypass).
 */
export async function restoreSession(): Promise<AuthUser | null> {
  // Skip auth for local development (backend bypasses auth for private IPs)
  if (shouldSkipAuth()) {
    logger.info("[Auth] Auth skipped (JOB_FINDER_SKIP_AUTH=true)")
    return { email: "local@localhost", name: "Local User" }
  }

  const token = getSessionToken()
  if (!token) {
    return null
  }

  try {
    const user = await fetchUserFromSession(token)
    logger.info(`[Auth] Session restored for: ${user.email}`)
    return user
  } catch (err) {
    logger.warn("[Auth] Session validation failed, clearing:", err)
    clearSessionToken()
    return null
  }
}

/**
 * Get authentication headers for API requests.
 * Returns empty headers when auth is skipped (backend bypasses auth for private IPs).
 */
export function getAuthHeaders(): Record<string, string> {
  // Skip auth headers for local development (backend bypasses auth for private IPs)
  if (shouldSkipAuth()) {
    return {}
  }

  const token = getSessionToken()
  if (!token) {
    return {}
  }
  return {
    Cookie: `${SESSION_COOKIE_NAME}=${token}`,
  }
}
