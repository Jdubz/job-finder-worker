> Status: Draft
> Owner: @Jdubz
> Last Updated: 2025-12-18

# Job Applicator External Network Authentication Plan

## Overview

Enable the job-applicator Electron app to communicate with the backend API from external networks by implementing Google OAuth authentication, reusing the existing backend auth infrastructure.

**Current State:** Job-applicator relies on localhost bypass (requests from 127.0.0.1, 192.168.x.x, 172.16-31.x.x are auto-authenticated). This fails for external network access.

**Target State:** Job-applicator authenticates via Google OAuth, stores session token, and includes it in all API requests.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Job-Applicator (Electron)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Renderer   │    │  Auth Store  │    │    API Client    │  │
│  │  (Login UI)  │───▶│  (Session)   │───▶│  (Cookie Header) │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         │                   ▲                     │             │
│         │                   │                     │             │
│         ▼                   │                     ▼             │
│  ┌──────────────┐           │            ┌──────────────────┐  │
│  │ Auth Popup   │           │            │    Backend API   │  │
│  │ (BrowserWin) │───────────┘            │  (External Net)  │  │
│  └──────────────┘                        └──────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
1. User clicks "Sign In" in sidebar
2. Electron opens popup BrowserWindow to job-finder-FE login page
3. User authenticates via Google OAuth in popup
4. Backend sets jf_session cookie in popup's session
5. Electron extracts cookie from popup session, stores locally
6. All API requests include Cookie: jf_session=<token> header
7. On app restart, validate stored session via GET /api/auth/session
```

---

## Files to CREATE

### 1. `src/auth-store.ts` - Session Storage

Manages session token persistence using Electron's safeStorage for encryption.

```typescript
// Key exports:
export function getSessionToken(): string | null
export function setSessionToken(token: string): void
export function clearSessionToken(): void
export function isAuthenticated(): boolean
```

**Implementation:**
- Use `electron-store` for persistence (already a common Electron pattern)
- Encrypt sensitive data with `safeStorage.encryptString()` when available
- Fallback to plaintext on systems without keychain access
- Store additional metadata: email, name, expiry for UI display

### 2. `src/auth-manager.ts` - OAuth Flow Handler

Handles the OAuth popup flow and session management.

```typescript
// Key exports:
export async function initiateLogin(): Promise<AuthResult>
export async function logout(): Promise<void>
export async function restoreSession(): Promise<AuthUser | null>
export async function getAuthHeaders(): Record<string, string>
```

**Implementation:**
- `initiateLogin()`: Opens popup to FE login, extracts cookie after auth
- `logout()`: Calls POST /api/auth/logout, clears local token
- `restoreSession()`: Validates stored token via GET /api/auth/session
- `getAuthHeaders()`: Returns `{ Cookie: 'jf_session=...' }` for API client

---

## Files to MODIFY

### 1. `src/api-client.ts`

Add authentication headers to all requests.

**Changes:**

```typescript
// Add import
import { getAuthHeaders } from "./auth-manager.js"

// Modify fetchOptions helper
function fetchOptions(options: RequestInit = {}): RequestInit {
  const headers = new Headers(options.headers)
  headers.set("Content-Type", "application/json")

  // Add auth headers if available
  const authHeaders = getAuthHeaders()
  for (const [key, value] of Object.entries(authHeaders)) {
    headers.set(key, value)
  }

  return { ...options, headers }
}
```

**Lines changed:** ~10 lines added

### 2. `src/main.ts`

Add IPC handlers for authentication and session restoration on startup.

**Add imports:**
```typescript
import { initiateLogin, logout, restoreSession } from "./auth-manager.js"
```

**Add IPC handlers:**
```typescript
// Login handler - opens OAuth popup
ipcMain.handle("auth-login", async (): Promise<{
  success: boolean
  user?: { email: string; name?: string }
  message?: string
}> => {
  try {
    const result = await initiateLogin()
    return { success: true, user: result.user }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Auth] Login failed: ${message}`)
    return { success: false, message }
  }
})

// Logout handler
ipcMain.handle("auth-logout", async (): Promise<{ success: boolean }> => {
  try {
    await logout()
    return { success: true }
  } catch (err) {
    logger.error(`[Auth] Logout failed:`, err)
    return { success: true } // Always clear local state even if API call fails
  }
})

// Get current auth state
ipcMain.handle("auth-get-user", async (): Promise<{
  authenticated: boolean
  user?: { email: string; name?: string }
}> => {
  try {
    const user = await restoreSession()
    return { authenticated: !!user, user: user || undefined }
  } catch {
    return { authenticated: false }
  }
})
```

**Add startup session restoration in `app.whenReady()`:**
```typescript
// Restore session on startup
try {
  const user = await restoreSession()
  if (user) {
    logger.info(`[Auth] Session restored for: ${user.email}`)
  } else {
    logger.info(`[Auth] No valid session found`)
  }
} catch (err) {
  logger.warn(`[Auth] Session restore failed:`, err)
}
```

**Lines changed:** ~60 lines added

### 3. `src/preload.ts`

Expose auth IPC methods to renderer.

**Add to contextBridge.exposeInMainWorld:**
```typescript
auth: {
  login: () => ipcRenderer.invoke("auth-login"),
  logout: () => ipcRenderer.invoke("auth-logout"),
  getUser: () => ipcRenderer.invoke("auth-get-user"),
  onAuthStateChanged: (callback: (user: AuthUser | null) => void) => {
    const handler = (_event: unknown, user: AuthUser | null) => callback(user)
    ipcRenderer.on("auth-state-changed", handler)
    return () => ipcRenderer.removeListener("auth-state-changed", handler)
  }
}
```

**Lines changed:** ~15 lines added

### 4. `src/renderer/index.html`

Add login/logout UI to sidebar.

**Add auth section at top of sidebar:**
```html
<!-- Auth Section -->
<section class="sidebar-section auth-section" id="authSection">
  <div class="auth-status" id="authStatus">
    <div class="auth-user hidden" id="authUser">
      <span class="user-email" id="userEmail"></span>
      <button class="btn-logout" id="logoutBtn" title="Sign out">Sign Out</button>
    </div>
    <div class="auth-login" id="authLogin">
      <span class="auth-message">Sign in to access your job matches</span>
      <button class="btn-login" id="loginBtn">Sign In with Google</button>
    </div>
  </div>
</section>
```

**Lines changed:** ~15 lines added

### 5. `src/renderer/app.ts`

Add auth state management and UI handlers.

**Add auth state and handlers:**
```typescript
// Auth state
let currentUser: { email: string; name?: string } | null = null

// DOM elements - Auth
const authSection = getElement<HTMLDivElement>("authSection")
const authUser = getElement<HTMLDivElement>("authUser")
const authLogin = getElement<HTMLDivElement>("authLogin")
const userEmail = getElement<HTMLSpanElement>("userEmail")
const loginBtn = getElement<HTMLButtonElement>("loginBtn")
const logoutBtn = getElement<HTMLButtonElement>("logoutBtn")

// Update auth UI based on state
function updateAuthUI(user: { email: string; name?: string } | null) {
  currentUser = user
  if (user) {
    authUser.classList.remove("hidden")
    authLogin.classList.add("hidden")
    userEmail.textContent = user.name || user.email
    // Enable authenticated features
    setStatus(`Signed in as ${user.email}`, "success")
  } else {
    authUser.classList.add("hidden")
    authLogin.classList.remove("hidden")
    // Disable features that require auth
    setStatus("Sign in to continue", "")
  }
}

// Login handler
async function handleLogin() {
  loginBtn.disabled = true
  setStatus("Signing in...", "loading")

  try {
    const result = await api.auth.login()
    if (result.success && result.user) {
      updateAuthUI(result.user)
    } else {
      setStatus(result.message || "Login failed", "error")
    }
  } catch (err) {
    setStatus("Login failed", "error")
  } finally {
    loginBtn.disabled = false
  }
}

// Logout handler
async function handleLogout() {
  logoutBtn.disabled = true
  await api.auth.logout()
  updateAuthUI(null)
  logoutBtn.disabled = false
}

// Add to initializeApp():
loginBtn.addEventListener("click", handleLogin)
logoutBtn.addEventListener("click", handleLogout)

// Check auth state on startup
const authState = await api.auth.getUser()
updateAuthUI(authState.authenticated ? authState.user : null)
```

**Lines changed:** ~60 lines added

### 6. `src/renderer/styles.css`

Add styles for auth section.

```css
/* Auth Section */
.auth-section {
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
  margin-bottom: 12px;
}

.auth-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.auth-user {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.user-email {
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-login {
  width: 100%;
  padding: 10px 16px;
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-login:hover {
  background: var(--accent-hover);
}

.btn-logout {
  padding: 4px 12px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.auth-message {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}
```

**Lines changed:** ~50 lines added

---

## Files to CREATE (detailed implementation)

### `src/auth-store.ts`

```typescript
/**
 * Secure session storage for job-applicator authentication.
 * Uses electron-store with safeStorage encryption when available.
 */

import Store from "electron-store"
import { safeStorage } from "electron"
import { logger } from "./logger.js"

interface StoredAuth {
  encryptedToken?: string
  plaintextToken?: string  // Fallback when safeStorage unavailable
  email?: string
  name?: string
  expiresAt?: string
}

const store = new Store<{ auth: StoredAuth }>({
  name: "job-applicator-auth",
  encryptionKey: "job-applicator-v1", // Basic obfuscation for non-sensitive fields
})

function canUseSafeStorage(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function getSessionToken(): string | null {
  const auth = store.get("auth")
  if (!auth) return null

  if (auth.encryptedToken && canUseSafeStorage()) {
    try {
      const buffer = Buffer.from(auth.encryptedToken, "base64")
      return safeStorage.decryptString(buffer)
    } catch (err) {
      logger.warn("[AuthStore] Failed to decrypt token:", err)
      return null
    }
  }

  return auth.plaintextToken || null
}

export function setSessionToken(
  token: string,
  userInfo?: { email?: string; name?: string; expiresAt?: string }
): void {
  const auth: StoredAuth = {
    email: userInfo?.email,
    name: userInfo?.name,
    expiresAt: userInfo?.expiresAt,
  }

  if (canUseSafeStorage()) {
    try {
      const encrypted = safeStorage.encryptString(token)
      auth.encryptedToken = encrypted.toString("base64")
    } catch (err) {
      logger.warn("[AuthStore] safeStorage failed, using plaintext:", err)
      auth.plaintextToken = token
    }
  } else {
    auth.plaintextToken = token
  }

  store.set("auth", auth)
  logger.info(`[AuthStore] Session stored for: ${userInfo?.email || "unknown"}`)
}

export function clearSessionToken(): void {
  store.delete("auth")
  logger.info("[AuthStore] Session cleared")
}

export function getStoredUserInfo(): { email?: string; name?: string } | null {
  const auth = store.get("auth")
  if (!auth?.email) return null
  return { email: auth.email, name: auth.name }
}

export function isAuthenticated(): boolean {
  return getSessionToken() !== null
}
```

### `src/auth-manager.ts`

```typescript
/**
 * OAuth flow manager for job-applicator.
 * Handles Google OAuth via popup window and session management.
 */

import { BrowserWindow, session } from "electron"
import { getSessionToken, setSessionToken, clearSessionToken, getStoredUserInfo } from "./auth-store.js"
import { getApiUrl } from "./api-client.js"
import { logger } from "./logger.js"

export interface AuthUser {
  email: string
  name?: string
  uid?: string
}

export interface AuthResult {
  success: boolean
  user?: AuthUser
  message?: string
}

const SESSION_COOKIE_NAME = "jf_session"

/**
 * Get the frontend URL for OAuth login.
 * In production, this would be the deployed frontend.
 * In development, we use the local frontend dev server.
 */
function getLoginUrl(): string {
  // Use environment variable or derive from API URL
  const frontendUrl = process.env.JOB_FINDER_FRONTEND_URL
  if (frontendUrl) return frontendUrl

  // Derive from API URL (replace -api subdomain or port 3000 with 5173)
  const apiUrl = getApiUrl()
  try {
    const url = new URL(apiUrl)
    if (url.port === "3000") {
      url.port = "5173"
      return url.origin
    }
    // Production: api subdomain to main domain
    if (url.hostname.includes("-api.")) {
      return url.origin.replace("-api.", ".")
    }
  } catch {
    // Fallback
  }

  return "http://localhost:5173"
}

/**
 * Open OAuth popup and wait for authentication.
 * Returns the session cookie value after successful auth.
 */
async function openAuthPopup(): Promise<{ token: string; user: AuthUser }> {
  return new Promise((resolve, reject) => {
    const loginUrl = getLoginUrl()
    logger.info(`[Auth] Opening login popup: ${loginUrl}`)

    const popup = new BrowserWindow({
      width: 500,
      height: 700,
      show: true,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    // Track if we've resolved (to prevent multiple resolutions)
    let resolved = false

    // Listen for cookie changes to detect successful login
    const cookieListener = async () => {
      if (resolved) return

      try {
        const cookies = await popup.webContents.session.cookies.get({
          name: SESSION_COOKIE_NAME,
        })

        if (cookies.length > 0) {
          const sessionCookie = cookies[0]
          logger.info(`[Auth] Session cookie captured`)
          resolved = true

          // Fetch user info from session endpoint
          const user = await fetchUserFromSession(sessionCookie.value)

          popup.close()
          resolve({ token: sessionCookie.value, user })
        }
      } catch (err) {
        // Cookie not yet set, continue waiting
      }
    }

    // Check for cookie after each navigation
    popup.webContents.on("did-navigate", cookieListener)
    popup.webContents.on("did-navigate-in-page", cookieListener)

    // Also check periodically (for SPAs that don't trigger navigation)
    const interval = setInterval(cookieListener, 500)

    // Handle popup close without authentication
    popup.on("closed", () => {
      clearInterval(interval)
      if (!resolved) {
        reject(new Error("Authentication cancelled"))
      }
    })

    // Load the login page
    popup.loadURL(loginUrl).catch((err) => {
      clearInterval(interval)
      if (!resolved) {
        popup.close()
        reject(new Error(`Failed to load login page: ${err.message}`))
      }
    })

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(interval)
      if (!resolved) {
        popup.close()
        reject(new Error("Authentication timeout"))
      }
    }, 5 * 60 * 1000)
  })
}

/**
 * Fetch user info from session endpoint using the session token.
 */
async function fetchUserFromSession(token: string): Promise<AuthUser> {
  const apiUrl = getApiUrl()
  const response = await fetch(`${apiUrl}/auth/session`, {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Session validation failed: ${response.status}`)
  }

  const data = await response.json()
  if (!data.success || !data.data?.user) {
    throw new Error("Invalid session response")
  }

  return {
    uid: data.data.user.uid,
    email: data.data.user.email,
    name: data.data.user.name,
  }
}

/**
 * Initiate the login flow.
 */
export async function initiateLogin(): Promise<AuthResult> {
  try {
    const { token, user } = await openAuthPopup()

    setSessionToken(token, {
      email: user.email,
      name: user.name,
    })

    return { success: true, user }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[Auth] Login failed: ${message}`)
    return { success: false, message }
  }
}

/**
 * Log out the current user.
 */
export async function logout(): Promise<void> {
  const token = getSessionToken()

  if (token) {
    // Try to invalidate session on server
    try {
      const apiUrl = getApiUrl()
      await fetch(`${apiUrl}/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
      })
    } catch (err) {
      logger.warn("[Auth] Server logout failed:", err)
    }
  }

  // Always clear local session
  clearSessionToken()

  // Clear cookies from default session
  try {
    await session.defaultSession.clearStorageData({
      storages: ["cookies"],
    })
  } catch (err) {
    logger.warn("[Auth] Failed to clear session cookies:", err)
  }
}

/**
 * Restore session from stored token.
 * Returns user info if session is valid, null otherwise.
 */
export async function restoreSession(): Promise<AuthUser | null> {
  const token = getSessionToken()
  if (!token) {
    return null
  }

  try {
    const user = await fetchUserFromSession(token)
    logger.info(`[Auth] Session restored for: ${user.email}`)
    return user
  } catch (err) {
    logger.warn("[Auth] Session validation failed, clearing:", err)
    clearSessionToken()
    return null
  }
}

/**
 * Get authentication headers for API requests.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getSessionToken()
  if (!token) {
    return {}
  }
  return {
    Cookie: `${SESSION_COOKIE_NAME}=${token}`,
  }
}
```

---

## Dependencies to Add

### `job-applicator/package.json`

```json
{
  "dependencies": {
    "electron-store": "^8.1.0"
  }
}
```

Run: `cd job-applicator && npm install electron-store`

---

## Environment Variables

Add to `.env` (optional, for production deployment):

```env
# Frontend URL for OAuth login popup
# Defaults to http://localhost:5173 in development
# JOB_FINDER_FRONTEND_URL=https://job-finder.joshwentworth.com
```

---

## Testing Checklist

### Manual Testing

- [ ] Sign in via Google OAuth in popup
- [ ] Session persists across app restart
- [ ] API calls work from external network
- [ ] Logout clears session
- [ ] Invalid/expired session prompts re-login
- [ ] UI updates correctly on auth state changes

### Integration Testing

- [ ] Popup captures session cookie correctly
- [ ] Cookie header included in all API requests
- [ ] 401 responses trigger auth state update
- [ ] Session restoration works on app launch

---

## Migration Path

### Phase 1: Add auth (backwards compatible)
1. Create `auth-store.ts` and `auth-manager.ts`
2. Add IPC handlers to `main.ts`
3. Update `preload.ts` with auth API
4. Add UI to renderer

### Phase 2: Require auth for external networks
1. Update `api-client.ts` to include auth headers
2. Test with backend from external network
3. Verify localhost bypass still works for local dev

### Phase 3: Remove localhost bypass (optional)
1. Backend change: Remove localhost bypass from `firebase-auth.ts`
2. All requests require valid session cookie
3. Update dev workflow to always authenticate

---

## Summary

| Action | Files | Lines |
|--------|-------|-------|
| Create | 2 | ~250 |
| Modify | 6 | ~210 |
| **Total** | 8 | ~460 |

```
job-applicator/src/
├── auth-store.ts        (new - ~80 lines)
├── auth-manager.ts      (new - ~170 lines)
├── api-client.ts        (modify - ~10 lines)
├── main.ts              (modify - ~60 lines)
├── preload.ts           (modify - ~15 lines)
├── renderer/
│   ├── index.html       (modify - ~15 lines)
│   ├── app.ts           (modify - ~60 lines)
│   └── styles.css       (modify - ~50 lines)
```

**Outcome:** Job-applicator can authenticate via Google OAuth and communicate with the backend from any network, while maintaining backwards compatibility with localhost development.
