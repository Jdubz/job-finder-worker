import "@testing-library/jest-dom"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, vi } from "vitest"
import React from "react"

beforeAll(() => {
  vi.stubEnv("VITE_ENVIRONMENT", "test")
  vi.stubEnv("VITE_OWNER_EMAIL", "owner@test.dev")
  vi.stubEnv("VITE_AUTH_BYPASS", "false")
  vi.stubEnv("VITE_E2E_AUTH_TOKEN", "test-token")
  vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id")
})

vi.mock("@react-oauth/google", () => {
  const googleLogout = vi.fn()

  const GoogleOAuthProvider = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)

  type MockGoogleLoginProps = {
    onSuccess?: (response: { credential: string }) => void
    [key: string]: unknown
  }

  const GoogleLogin = (props: MockGoogleLoginProps) =>
    React.createElement(
      "button",
      {
        "data-testid": "google-login",
        onClick: () =>
          props.onSuccess?.({
            credential: "test-google-credential",
          }),
      },
      "Google Login"
    )

  return { GoogleOAuthProvider, GoogleLogin, googleLogout }
})

vi.mock("@/api/auth-client", () => {
  return {
    authClient: {
      login: vi.fn(() =>
        Promise.resolve({
          user: {
            uid: "test-user-id",
            email: "test@example.com",
            name: "Test User",
          },
        })
      ),
      fetchSession: vi.fn(() => Promise.reject({ statusCode: 401 })),
      logout: vi.fn(() => Promise.resolve({ loggedOut: true })),
    },
    AuthError: class AuthError extends Error {
      statusCode: number
      constructor(message: string, statusCode: number) {
        super(message)
        this.name = "AuthError"
        this.statusCode = statusCode
      }
    },
  }
})

afterEach(() => {
  cleanup()
})
