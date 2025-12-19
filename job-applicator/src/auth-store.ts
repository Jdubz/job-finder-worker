/**
 * Secure session storage for job-applicator authentication.
 * Uses electron-store with safeStorage encryption when available.
 */

import Store from "electron-store"
import { safeStorage } from "electron"
import { logger } from "./logger.js"

interface StoredAuth {
  encryptedToken?: string
  plaintextToken?: string // Fallback when safeStorage unavailable
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
  if (!auth) return null

  if (auth.encryptedToken && canUseSafeStorage()) {
    try {
      const buffer = Buffer.from(auth.encryptedToken, "base64")
      return safeStorage.decryptString(buffer)
    } catch (err) {
      logger.warn("[AuthStore] Failed to decrypt token:", err)
      return null
    }
  }

  return auth.plaintextToken || null
}

export function setSessionToken(
  token: string,
  userInfo?: { email?: string; name?: string }
): void {
  const auth: StoredAuth = {
    email: userInfo?.email,
    name: userInfo?.name,
  }

  if (canUseSafeStorage()) {
    try {
      const encrypted = safeStorage.encryptString(token)
      auth.encryptedToken = encrypted.toString("base64")
    } catch (err) {
      logger.warn("[AuthStore] safeStorage failed, using plaintext:", err)
      auth.plaintextToken = token
    }
  } else {
    auth.plaintextToken = token
  }

  store.set("auth", auth)
  logger.info(`[AuthStore] Session stored for: ${userInfo?.email || "unknown"}`)
}

export function clearSessionToken(): void {
  store.delete("auth")
  logger.info("[AuthStore] Session cleared")
}
