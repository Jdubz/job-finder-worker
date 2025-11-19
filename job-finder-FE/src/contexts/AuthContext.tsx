import React, { createContext, useContext, useEffect, useState } from "react"
import { type User, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth"
import { auth } from "@/config/firebase"
import {
  AUTH_BYPASS_ENABLED,
  DEFAULT_E2E_AUTH_TOKEN,
  TEST_AUTH_STATE_KEY,
  TEST_AUTH_TOKEN_KEY,
} from "@/config/testing"

interface AuthContextType {
  user: User | null
  loading: boolean
  isOwner: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const ownerEmail = import.meta.env.VITE_OWNER_EMAIL || ""

  useEffect(() => {
    if (AUTH_BYPASS_ENABLED && typeof window !== "undefined") {
      const bypassState = readBypassState()
      if (bypassState) {
        const bypassUser = buildBypassUser(bypassState, ownerEmail)
        setUser(bypassUser)
        setIsOwner(bypassState.isOwner ?? bypassUser.email === ownerEmail)
      } else {
        setUser(null)
        setIsOwner(false)
      }
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)

      if (firebaseUser) {
        setIsOwner(firebaseUser.email === ownerEmail && firebaseUser.emailVerified)
      } else {
        setIsOwner(false)
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [ownerEmail])

  const signOut = async () => {
    if (AUTH_BYPASS_ENABLED && typeof window !== "undefined") {
      window.localStorage.removeItem(TEST_AUTH_STATE_KEY)
      window.localStorage.removeItem(TEST_AUTH_TOKEN_KEY)
      setUser(null)
      setIsOwner(false)
      return
    }

    await firebaseSignOut(auth)
    setUser(null)
    setIsOwner(false)
  }

  const value = {
    user,
    loading,
    isOwner,
    signOut,
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

function buildBypassUser(state: BypassAuthState, fallbackEmail: string): User {
  const token = resolveBypassToken(state)
  const email = state.email ?? fallbackEmail ?? "owner@jobfinder.dev"

  const bypassUser: Partial<User> & {
    getIdToken: User["getIdToken"]
    getIdTokenResult: User["getIdTokenResult"]
    toJSON: User["toJSON"]
  } = {
    uid: state.uid ?? "e2e-bypass-user",
    email,
    emailVerified: state.emailVerified ?? true,
    displayName: state.displayName ?? "E2E Owner",
    isAnonymous: false,
    providerData: [],
    providerId: "custom",
    tenantId: null,
    phoneNumber: null,
    photoURL: null,
    refreshToken: token,
    delete: async () => {},
    reload: async () => {},
    getIdToken: async () => token,
    getIdTokenResult: async () => ({
      token,
      authTime: new Date().toISOString(),
      issuedAtTime: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      claims: {},
      signInProvider: "custom",
      signInSecondFactor: null,
    }),
    toJSON: () => ({
      uid: state.uid ?? "e2e-bypass-user",
      email,
      emailVerified: true,
      displayName: state.displayName ?? "E2E Owner",
    }),
  }

  return bypassUser as User
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
