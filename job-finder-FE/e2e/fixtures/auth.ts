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
  const page = await context.newPage()

  try {
    // Call the login endpoint with the dev token
    const response = await page.request.post(`${API_BASE}/auth/login`, {
      data: { credential: devToken },
      headers: { 'Content-Type': 'application/json' }
    })

    if (!response.ok()) {
      throw new Error(`Login failed: ${response.status()} ${await response.text()}`)
    }

    // The session cookie is now set in the browser context
    await page.close()
  } catch (error) {
    await page.close()
    throw error
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
