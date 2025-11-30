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
export async function loginWithDevToken(context: BrowserContext, devToken: 'dev-admin-token' | 'dev-viewer-token' = 'dev-admin-token') {
  // Make the login request using Playwright's context-level request
  const response = await context.request.post(`${API_BASE}/auth/login`, {
    data: { credential: devToken },
    headers: { 'Content-Type': 'application/json' }
  })

  if (!response.ok()) {
    const text = await response.text()
    throw new Error(`Login failed: ${response.status()} ${text}`)
  }

  // The context.request.post should automatically handle cookies from Set-Cookie headers
  // But we also need to get the cookies and add them for all origins
  const cookies = await context.cookies()

  // If no cookies were set, try to extract from the response headers
  const setCookieHeader = response.headers()['set-cookie']
  if (setCookieHeader && cookies.length === 0) {
    // Parse the cookie and add it to the context
    const cookieParts = setCookieHeader.split(';')[0].split('=')
    const cookieName = cookieParts[0].trim()
    const cookieValue = cookieParts.slice(1).join('=').trim()

    await context.addCookies([
      {
        name: cookieName,
        value: cookieValue,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      }
    ])
  }

  // Also ensure cookies are set for the frontend URL
  const existingCookies = await context.cookies()
  const sessionCookie = existingCookies.find(c => c.name === 'jf_session')
  if (sessionCookie) {
    // Re-add the cookie with the frontend URL to ensure it's sent
    await context.addCookies([
      {
        name: sessionCookie.name,
        value: sessionCookie.value,
        url: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      }
    ])
  }
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
