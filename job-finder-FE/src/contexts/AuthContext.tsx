/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { googleLogout } from '@react-oauth/google'
import { authClient, AuthError } from '@/api/auth-client'

const IS_DEVELOPMENT = import.meta.env.VITE_ENVIRONMENT === 'development'

export type DevRole = 'public' | 'viewer' | 'admin'

interface AuthUser {
  uid: string
  email: string
  name?: string
  picture?: string
  roles?: string[]
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  isOwner: boolean
  isDevelopment: boolean
  signOut: () => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  setDevRole: (role: DevRole) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)

  // Restore session from cookie on mount
  useEffect(() => {
    let mounted = true

    const restoreSession = async () => {
      try {
        const response = await authClient.fetchSession()
        if (mounted && response.user) {
          setUser(response.user)
          // Check if user has admin role (users table is source of truth)
          setIsOwner(response.user.roles?.includes('admin') ?? false)
        }
      } catch (error) {
        // 401 is expected when not logged in - silently ignore
        if (error instanceof AuthError && error.statusCode === 401) {
          // Not logged in, that's fine
        } else {
          console.warn('Failed to restore session:', error)
        }
        if (mounted) {
          setUser(null)
          setIsOwner(false)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    restoreSession()

    return () => {
      mounted = false
    }
  }, [])

  /**
   * Login with Google OAuth credential.
   * Sends credential to backend, which validates it and sets a session cookie.
   */
  const loginWithGoogle = useCallback(async (credential: string) => {
    try {
      const response = await authClient.login(credential)
      setUser(response.user)
      // Check if user has admin role (users table is source of truth)
      setIsOwner(response.user.roles?.includes('admin') ?? false)
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    }
  }, [])

  /**
   * Sign out - clear session on server and client.
   */
  const signOut = useCallback(async () => {
    try {
      await authClient.logout()
    } catch (error) {
      console.warn('Logout request failed:', error)
    }

    // Always clear client state, even if server request fails
    try {
      googleLogout()
    } catch (error) {
      console.warn('Google logout failed:', error)
    }

    setUser(null)
    setIsOwner(false)
  }, [])

  /**
   * Development mode: set role directly for testing.
   */
  const setDevRole = useCallback(async (role: DevRole) => {
    if (!IS_DEVELOPMENT) {
      console.warn('setDevRole is only available in development mode')
      return
    }

    if (role === 'public') {
      await signOut()
      return
    }

    // Use dev tokens that backend accepts in development mode
    const devCredential = role === 'admin' ? 'dev-admin-token' : 'dev-viewer-token'

    try {
      const response = await authClient.login(devCredential)
      setUser(response.user)
      // Check if user has admin role (users table is source of truth)
      setIsOwner(response.user.roles?.includes('admin') ?? false)
    } catch (error) {
      console.error('Dev login failed:', error)
    }
  }, [signOut])

  const value: AuthContextType = {
    user,
    loading,
    isOwner,
    isDevelopment: IS_DEVELOPMENT,
    signOut,
    loginWithGoogle,
    setDevRole,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
