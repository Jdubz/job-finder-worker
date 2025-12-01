import type { Page, BrowserContext } from "@playwright/test"

export const AUTH_STATE_STORAGE_KEY = "__JF_E2E_AUTH_STATE__"
export const AUTH_TOKEN_STORAGE_KEY = "__JF_E2E_AUTH_TOKEN__"

const API_BASE = process.env.JF_E2E_API_BASE || "http://127.0.0.1:5080/api"
const DEFAULT_OWNER_EMAIL = process.env.JF_E2E_OWNER_EMAIL || "owner@jobfinder.dev"
const DEFAULT_AUTH_TOKEN = process.env.JF_E2E_AUTH_TOKEN || "e2e-test-token"

export interface AuthBypassState {
  uid?: string
  email?: string
  displayName?: string
  isOwner?: boolean
  emailVerified?: boolean
  token?: string
}

/**
 * Authenticate by calling the backend /api/auth/login endpoint.
 * This sets the actual session cookie needed for protected routes.
 * Uses dev tokens that the backend accepts in development mode.
 */
export async function loginWithDevToken(
  context: BrowserContext,
  devToken: "dev-admin-token" | "dev-viewer-token" = "dev-admin-token"
) {
  const response = await context.request.post(`${API_BASE}/auth/login`, {
    data: { credential: devToken },
    headers: { "Content-Type": "application/json" },
  })

  if (!response.ok()) {
    throw new Error(`Login failed: ${response.status()} ${await response.text()}`)
  }

  // Playwright stores cookies from the login response on the context.
  // Mirror the session cookie onto the frontend origin so it's sent to the app host too.
  const cookies = await context.cookies()
  const sessionCookie = cookies.find((c) => c.name === "jf_session")

  if (!sessionCookie) {
    throw new Error("Session cookie was not set in context after login.")
  }

  // The server sets the cookie with sameSite: 'lax' for development, but cross-origin
  // fetch() requests from the frontend (port 5173) to the API (port 5080) won't include
  // lax cookies. We need to re-add the cookie with sameSite: 'none' so it's sent.
  // Note: Real browsers require Secure=true when sameSite='None', and will reject such
  // cookies over HTTP. This configuration only works in Playwright's test environment,
  // which bypasses this restriction, allowing us to test cross-origin cookie behavior
  // over HTTP without SSL. Do NOT use this pattern in production.
  await context.addCookies([
    {
      name: sessionCookie.name,
      value: sessionCookie.value,
      domain: sessionCookie.domain || "127.0.0.1",
      path: sessionCookie.path || "/",
      expires: sessionCookie.expires,
      httpOnly: sessionCookie.httpOnly,
      secure: false,
      sameSite: "None",
    },
  ])
}

export async function applyAuthState(page: Page, state?: AuthBypassState) {
  const payload: Required<AuthBypassState> = {
    uid: state?.uid || "e2e-owner",
    email: state?.email || DEFAULT_OWNER_EMAIL,
    displayName: state?.displayName || "E2E Owner",
    isOwner: state?.isOwner ?? true,
    emailVerified: state?.emailVerified ?? true,
    token: state?.token || DEFAULT_AUTH_TOKEN,
  }

  await page.addInitScript(
    ({ stateKey, tokenKey, authState }) => {
      window.localStorage.setItem(stateKey, JSON.stringify(authState))
      window.localStorage.setItem(tokenKey, authState.token)
    },
    {
      stateKey: AUTH_STATE_STORAGE_KEY,
      tokenKey: AUTH_TOKEN_STORAGE_KEY,
      authState: payload,
    }
  )
}

export function ownerAuthState(overrides?: AuthBypassState): AuthBypassState {
  return {
    uid: "e2e-owner",
    isOwner: true,
    emailVerified: true,
    ...overrides,
  }
}

export function viewerAuthState(overrides?: AuthBypassState): AuthBypassState {
  return {
    uid: "e2e-viewer",
    isOwner: false,
    emailVerified: true,
    ...overrides,
  }
}
