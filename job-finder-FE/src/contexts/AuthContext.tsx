import React, { createContext, useContext, useEffect, useState } from "react"
import { googleLogout } from "@react-oauth/google"
import { decodeJwt } from "@/lib/jwt"
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
  signOut: () => Promise<void>
  authenticateWithGoogle: (credential: string) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const googleClientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID

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
        if (bypassUser) {
          setUser(bypassUser)
          setIsOwner(bypassState.isOwner ?? adminEmailSet.has(bypassUser.email))
        } else {
          window.localStorage.removeItem(TEST_AUTH_STATE_KEY)
          window.localStorage.removeItem(TEST_AUTH_TOKEN_KEY)
          clearStoredAuthToken()
          setUser(null)
          setIsOwner(false)
        }
      } else {
        setUser(null)
        setIsOwner(false)
      }
      setLoading(false)
      return
    }

    const storedToken = getStoredAuthToken()
    if (storedToken) {
      const restoredUser = buildUserFromToken(storedToken)
      setUser(restoredUser)
      setIsOwner(restoredUser?.email ? adminEmailSet.has(restoredUser.email) : false)
    }
    setLoading(false)
  }, [])

  const authenticateWithGoogle = (credential: string) => {
    const nextUser = buildUserFromToken(credential)
    if (!nextUser) {
      console.error("Failed to decode Google credential.")
      return
    }

    storeAuthToken(credential)
    setUser(nextUser)
    setIsOwner(adminEmailSet.has(nextUser.email))
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
    setUser(null)
    setIsOwner(false)
  }

  const value = {
    user,
    loading,
    isOwner,
    signOut,
    authenticateWithGoogle,
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

function buildBypassUser(state: BypassAuthState): AuthUser | null {
  const token = resolveBypassToken(state)
  const email = state.email

  if (!email) {
    return null
  }

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

function buildUserFromToken(token: string): AuthUser | null {
  const payload = decodeJwt(token)
  if (!payload.email) {
    return null
  }
  storeAuthToken(token)
  const id = payload.sub ?? payload.email
  return {
    id,
    uid: id,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
    emailVerified: payload.email_verified ?? true,
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
