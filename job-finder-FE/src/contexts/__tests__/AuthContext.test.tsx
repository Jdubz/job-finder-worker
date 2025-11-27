import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"

vi.stubEnv("VITE_OWNER_EMAIL", "owner@test.dev")
vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id")

// Unmock AuthContext first (it's mocked globally in setup.ts)
vi.unmock("@/contexts/AuthContext")

vi.mock("@/api/auth-client", () => {
  return {
    authClient: {
      fetchSession: vi.fn(() => Promise.reject({ statusCode: 401 })),
      logout: vi.fn(() => Promise.resolve({ loggedOut: true })),
    },
  }
})

vi.mock("@/config/admins.json", () => ({
  default: {
    adminEmails: ["owner@test.dev"],
  },
}))

vi.mock("@react-oauth/google", () => {
  const googleLogout = vi.fn()
  const GoogleOAuthProvider = ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  )
  const GoogleLogin = () => null
  return { GoogleOAuthProvider, GoogleLogin, googleLogout }
})

vi.mock("@/lib/auth-storage", () => {
  let token: string | null = null
  return {
    storeAuthToken: vi.fn((value: string) => {
      token = value
    }),
    getStoredAuthToken: vi.fn(() => token),
    clearStoredAuthToken: vi.fn(() => {
      token = null
    }),
  }
})

vi.mock("@/lib/jwt", () => ({
  decodeJwt: vi.fn(() => ({
    email: "owner@test.dev",
    sub: "user-123",
    email_verified: true,
    name: "Test User",
    picture: "avatar.png",
  })),
}))

const { storeAuthToken, clearStoredAuthToken } = await import("@/lib/auth-storage")
const { decodeJwt } = await import("@/lib/jwt")
const { googleLogout } = await import("@react-oauth/google")
const { authClient } = await import("@/api/auth-client")
const { AuthProvider, useAuth } = await import("../AuthContext")

const TestComponent = () => {
  const { user, loading, isOwner, signOut, authenticateWithGoogle } = useAuth()
  if (loading) {
    return <div>Loading...</div>
  }
  return (
    <div>
      <div data-testid="user-email">{user?.email ?? "No user"}</div>
      <div data-testid="is-owner">{isOwner ? "Owner" : "Viewer"}</div>
      <button data-testid="sign-in" onClick={() => authenticateWithGoogle("test-token")}>
        Sign In
      </button>
      <button data-testid="sign-out" onClick={() => signOut()}>
        Sign Out
      </button>
    </div>
  )
}

describe("AuthContext", () => {
  const user = userEvent.setup()

  beforeEach(() => {
    vi.mocked(storeAuthToken).mockClear()
    vi.mocked(clearStoredAuthToken).mockClear()
    vi.mocked(decodeJwt).mockClear()
    vi.mocked(googleLogout).mockClear()
    vi.mocked(authClient.fetchSession).mockClear()
    vi.mocked(authClient.logout).mockClear()
  })

  it("shows unauthenticated state by default", async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("user-email")).toHaveTextContent("No user")
      expect(screen.getByTestId("is-owner")).toHaveTextContent("Viewer")
    })
  })

  it("authenticates via GIS credential", async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    const signInButton = await screen.findByTestId("sign-in")
    await user.click(signInButton)

    await waitFor(() => {
      expect(storeAuthToken).toHaveBeenCalledWith("test-token")
      expect(screen.getByTestId("user-email")).toHaveTextContent("owner@test.dev")
      expect(screen.getByTestId("is-owner")).toHaveTextContent("Owner")
    })
  })

  it("clears state on sign out", async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    const signInButton = await screen.findByTestId("sign-in")
    await user.click(signInButton)
    await waitFor(() => expect(screen.getByTestId("user-email")).toHaveTextContent("owner@test.dev"))

    await user.click(screen.getByTestId("sign-out"))

    await waitFor(() => {
      expect(authClient.logout).toHaveBeenCalled()
      expect(clearStoredAuthToken).toHaveBeenCalled()
      expect(googleLogout).toHaveBeenCalled()
      expect(screen.getByTestId("user-email")).toHaveTextContent("No user")
    })
  })
})
