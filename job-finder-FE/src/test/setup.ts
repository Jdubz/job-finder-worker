import "@testing-library/jest-dom"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, vi } from "vitest"
import React from "react"
import { Buffer } from "buffer"

beforeAll(() => {
  vi.stubEnv("VITE_ENVIRONMENT", "test")
  vi.stubEnv("VITE_OWNER_EMAIL", "owner@test.dev")
  vi.stubEnv("VITE_AUTH_BYPASS", "false")
  vi.stubEnv("VITE_E2E_AUTH_TOKEN", "test-token")
  vi.stubEnv("VITE_GOOGLE_OAUTH_CLIENT_ID", "test-client-id")

  if (!(globalThis as { atob?: (input: string) => string }).atob) {
    ;(globalThis as { atob?: (input: string) => string }).atob = (value: string) =>
      Buffer.from(value, "base64").toString("binary")
  }
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

afterEach(() => {
  cleanup()
})
