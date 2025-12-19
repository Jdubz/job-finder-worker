/**
 * Secure session storage for job-applicator authentication.
 * Uses electron-store with safeStorage encryption when available.
 */

import Store from "electron-store"
import { safeStorage } from "electron"
import { logger } from "./logger.js"

interface StoredAuth {
  encryptedToken?: string
  email?: string
  name?: string
}

const store = new Store<{ auth: StoredAuth }>({
  name: "job-applicator-auth",
})

function canUseSafeStorage(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function getSessionToken(): string | null {
  const auth = store.get("auth")
  if (!auth?.encryptedToken) return null

  if (!canUseSafeStorage()) {
    logger.warn("[AuthStore] safeStorage unavailable - cannot decrypt stored token")
    return null
  }

  try {
    const buffer = Buffer.from(auth.encryptedToken, "base64")
    return safeStorage.decryptString(buffer)
  } catch (err) {
    logger.warn("[AuthStore] Failed to decrypt token:", err)
    return null
  }
}

/**
 * Store session token securely.
 * @returns true if token was stored, false if encryption unavailable (token NOT stored)
 */
export function setSessionToken(
  token: string,
  userInfo?: { email?: string; name?: string }
): boolean {
  // Security: Only store tokens when encryption is available
  // Plaintext storage is a security risk if the machine is compromised
  if (!canUseSafeStorage()) {
    logger.error("[AuthStore] safeStorage unavailable - session token NOT stored for security")
    return false
  }

  try {
    const encrypted = safeStorage.encryptString(token)
    const auth: StoredAuth = {
      encryptedToken: encrypted.toString("base64"),
      email: userInfo?.email,
      name: userInfo?.name,
    }
    store.set("auth", auth)
    logger.info(`[AuthStore] Session stored securely for: ${userInfo?.email || "unknown"}`)
    return true
  } catch (err) {
    logger.error("[AuthStore] safeStorage encryption failed - session token NOT stored:", err)
    return false
  }
}

export function clearSessionToken(): void {
  store.delete("auth")
  logger.info("[AuthStore] Session cleared")
}
