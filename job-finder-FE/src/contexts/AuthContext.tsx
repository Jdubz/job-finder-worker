import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react"
import { googleLogout } from "@react-oauth/google"
import { decodeJwt, type JwtPayload } from "@/lib/jwt"
import { clearStoredAuthToken, getStoredAuthToken, storeAuthToken } from "@/lib/auth-storage"
import {
  AUTH_BYPASS_ENABLED,
  DEFAULT_E2E_AUTH_TOKEN,
  TEST_AUTH_STATE_KEY,
  TEST_AUTH_TOKEN_KEY,
} from "@/config/testing"
import adminConfig from "@/config/admins.json"

// Create a Set for O(1) admin email lookup
const adminEmailSet = new Set(
  Array.isArray(adminConfig.adminEmails) ? adminConfig.adminEmails : []
)

const BYPASS_FALLBACK_EMAIL = "owner@jobfinder.dev"
const TOKEN_EXPIRY_BUFFER_MS = 60_000 // refresh a minute early to avoid 401 loops
const IS_DEVELOPMENT = import.meta.env.VITE_ENVIRONMENT === "development"

export type DevRole = "public" | "viewer" | "admin"

interface AuthUser {
  id: string
  uid?: string
  email: string
  name?: string
  picture?: string
  emailVerified: boolean
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  isOwner: boolean
  isDevelopment: boolean
  signOut: () => Promise<void>
  authenticateWithGoogle: (credential: string) => void
  setDevRole: (role: DevRole) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const logoutTimerRef = useRef<number | null>(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID

  const clearLogoutTimer = useCallback(() => {
    if (logoutTimerRef.current !== null) {
      window.clearTimeout(logoutTimerRef.current)
      logoutTimerRef.current = null
    }
  }, [])

  const handleTokenExpired = useCallback(() => {
    clearStoredAuthToken()
    clearLogoutTimer()
    setUser(null)
    setIsOwner(false)
  }, [clearLogoutTimer])

  const scheduleTokenExpiry = useCallback((expiryMs: number | null | undefined) => {
    if (typeof window === "undefined") return
    clearLogoutTimer()
    if (!expiryMs) return
    const delay = expiryMs - Date.now() - TOKEN_EXPIRY_BUFFER_MS
    if (delay <= 0) {
      handleTokenExpired()
      return
    }
    logoutTimerRef.current = window.setTimeout(handleTokenExpired, delay)
  }, [clearLogoutTimer, handleTokenExpired])

  useEffect(() => {
    if (!AUTH_BYPASS_ENABLED && !googleClientId) {
      console.error("VITE_GOOGLE_OAUTH_CLIENT_ID is required for authentication.")
    }
  }, [googleClientId])

  useEffect(() => {
    if (AUTH_BYPASS_ENABLED && typeof window !== "undefined") {
      const bypassState = readBypassState()
      if (bypassState) {
        const bypassUser = buildBypassUser(bypassState)
        setUser(bypassUser)
        setIsOwner(bypassState.isOwner ?? adminEmailSet.has(bypassUser.email))
        // Bypass tokens are long-lived test tokens; no expiry timer needed
      } else {
        setUser(null)
        setIsOwner(false)
      }
      setLoading(false)
      return
    }

    const storedToken = getStoredAuthToken()
    if (storedToken) {
      const payload = decodeJwt(storedToken)
      const expiryMs = getTokenExpiryMs(payload)

      if (expiryMs && expiryMs <= Date.now()) {
        handleTokenExpired()
      } else {
        const restoredUser = buildUserFromToken(storedToken, payload)
        setUser(restoredUser)
        setIsOwner(restoredUser?.email ? adminEmailSet.has(restoredUser.email) : false)
        scheduleTokenExpiry(expiryMs)
      }
    }
    setLoading(false)
  }, [handleTokenExpired, scheduleTokenExpiry])

  const authenticateWithGoogle = (credential: string) => {
    const payload = decodeJwt(credential)
    const expiryMs = getTokenExpiryMs(payload)

    if (expiryMs && expiryMs <= Date.now()) {
      console.error("Received expired Google credential")
      return
    }

    const nextUser = buildUserFromToken(credential, payload)
    if (!nextUser) {
      console.error("Failed to decode Google credential.")
      return
    }

    storeAuthToken(credential)
    setUser(nextUser)
    setIsOwner(adminEmailSet.has(nextUser.email))
    scheduleTokenExpiry(expiryMs)
    setLoading(false)
  }

  const signOut = async () => {
    if (AUTH_BYPASS_ENABLED && typeof window !== "undefined") {
      window.localStorage.removeItem(TEST_AUTH_STATE_KEY)
      window.localStorage.removeItem(TEST_AUTH_TOKEN_KEY)
      setUser(null)
      setIsOwner(false)
      return
    }

    try {
      googleLogout()
    } catch (error) {
      console.warn("Failed to sign out of Google Identity Services", error)
    }

    clearStoredAuthToken()
    clearLogoutTimer()
    setUser(null)
    setIsOwner(false)
  }

  const setDevRole = (role: DevRole) => {
    if (!IS_DEVELOPMENT) {
      console.warn("setDevRole is only available in development mode")
      return
    }

    if (role === "public") {
      // Sign out - no user
      clearStoredAuthToken()
      clearLogoutTimer()
      setUser(null)
      setIsOwner(false)
      return
    }

    const isAdmin = role === "admin"
    const mockUser: AuthUser = {
      id: `dev-${role}-user`,
      uid: `dev-${role}-user`,
      email: isAdmin ? "dev-admin@jobfinder.dev" : "dev-viewer@jobfinder.dev",
      name: isAdmin ? "Dev Admin" : "Dev Viewer",
      picture: undefined,
      emailVerified: true,
    }

    // Store a mock token for API requests
    storeAuthToken(`dev-${role}-token`)
    setUser(mockUser)
    setIsOwner(isAdmin)
  }

  const value = {
    user,
    loading,
    isOwner,
    isDevelopment: IS_DEVELOPMENT,
    signOut,
    authenticateWithGoogle,
    setDevRole,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

interface BypassAuthState {
  uid?: string
  email?: string
  displayName?: string
  isOwner?: boolean
  emailVerified?: boolean
  token?: string
}

function readBypassState(): BypassAuthState | null {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const raw = window.localStorage.getItem(TEST_AUTH_STATE_KEY)
    return raw ? (JSON.parse(raw) as BypassAuthState) : null
  } catch {
    return null
  }
}

function resolveBypassToken(state?: BypassAuthState): string {
  if (state?.token) {
    return state.token
  }
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(TEST_AUTH_TOKEN_KEY)
    if (stored) {
      return stored
    }
  }
  return DEFAULT_E2E_AUTH_TOKEN
}

function buildBypassUser(state: BypassAuthState): AuthUser {
  const token = resolveBypassToken(state)
  const email = state.email ?? BYPASS_FALLBACK_EMAIL

  storeAuthToken(token)

  return {
    id: state.uid ?? "e2e-bypass-user",
    uid: state.uid ?? "e2e-bypass-user",
    email,
    name: state.displayName ?? "E2E Owner",
    picture: undefined,
    emailVerified: state.emailVerified ?? true,
  }
}

function buildUserFromToken(token: string, payload?: JwtPayload): AuthUser | null {
  const claims = payload ?? decodeJwt(token)
  if (!claims.email) {
    return null
  }
  const id = claims.sub ?? claims.email
  return {
    id,
    uid: id,
    email: claims.email,
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
    emailVerified: claims.email_verified ?? true,
  }
}

function getTokenExpiryMs(payload: JwtPayload): number | null {
  if (typeof payload.exp !== "number") return null
  return payload.exp * 1000
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
