# AUTH-1 — Authentication System

> **Context**: See [CLAUDE.md](../../CLAUDE.md) for project overview, Firebase Auth setup
> **Architecture**: Firebase Authentication with protected routes and auth context

---

## Issue Metadata

```yaml
Title: AUTH-1 — Authentication System
Labels: priority-p0, repository-frontend, type-feature, status-todo
Assignee: Worker B
Priority: P0-Critical
Estimated Effort: 6-10 hours
Repository: job-finder-FE
```

---

## Summary

**Problem**: The application requires user authentication to access protected features and ensure data security. Without a proper authentication system, users cannot securely log in, and the app cannot enforce user-specific data access controls.

**Goal**: Implement a complete Firebase Authentication system with login/logout functionality, protected routes, auth context for state management, and user session persistence.

**Impact**: This is a critical foundation for all user-facing features. All pages that access user-specific data (job matches, documents, content items) depend on authentication.

---

## Architecture References

> **📚 Read these docs first for context:**

- **[CLAUDE.md](../../CLAUDE.md)** - Auth patterns, context usage, protected routes
- **[SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)** - Security and auth flow
- **Firebase Config**: `src/config/firebase.ts` for Firebase initialization

**Key concepts to understand**:

- **AuthContext**: Global auth state using React Context
- **Protected Routes**: Route guards requiring authentication
- **Public Routes**: Routes that redirect authenticated users
- **Session Persistence**: Firebase handles token refresh automatically

---

## Tasks

### Phase 1: Firebase Setup

1. **Configure Firebase Authentication**
   - What: Initialize Firebase Auth in config file
   - Where: `src/config/firebase.ts`
   - Why: Enable Firebase Authentication services
   - Test: Firebase auth instance available without errors

2. **Set up environment variables**
   - What: Add Firebase config to .env files
   - Where: `.env.development`, `.env.staging`, `.env.production`
   - Why: Separate auth configs per environment
   - Test: Environment variables load correctly

### Phase 2: Auth Context

3. **Create AuthContext**
   - What: React Context for global auth state
   - Where: `src/contexts/AuthContext.tsx` (create)
   - Why: Share auth state across entire app
   - Test: Context provides user, loading, and auth functions

4. **Implement auth state management**
   - What: Handle login, logout, user state, session persistence
   - Where: Within AuthContext provider
   - Why: Centralized auth logic
   - Test: User state persists across page refreshes

### Phase 3: UI Components

5. **Build login page**
   - What: Login form with email/password and social auth
   - Where: `src/pages/auth/LoginPage.tsx` (create)
   - Why: User entry point for authentication
   - Test: Login succeeds and redirects to dashboard

6. **Create route guards**
   - What: ProtectedRoute and PublicRoute components
   - Where: `src/components/auth/ProtectedRoute.tsx`, `PublicRoute.tsx` (create)
   - Why: Enforce authentication requirements
   - Test: Unauthenticated users redirected to login

---

## Technical Details

### Files to Create

```
CREATE:
- src/contexts/AuthContext.tsx - Global auth state management
- src/components/auth/ProtectedRoute.tsx - Protected route wrapper
- src/components/auth/PublicRoute.tsx - Public route wrapper
- src/pages/auth/LoginPage.tsx - Login interface
- src/pages/auth/UnauthorizedPage.tsx - Unauthorized access page
- src/pages/auth/index.ts - Barrel export

MODIFY:
- src/config/firebase.ts - Add auth initialization
- src/router.tsx - Wrap routes with auth guards
- src/App.tsx - Wrap with AuthProvider
- .env.example - Document Firebase auth variables

REFERENCE:
- Firebase Auth Documentation
- React Context patterns from existing code
```

### Key Implementation Notes

**AuthContext Implementation**:

```typescript
// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState } from 'react'
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth'
import { auth } from '@/config/firebase'

interface AuthContextType {
  user: User | null
  loading: boolean
  isEditor: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditor, setIsEditor] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user)

      // Check if user has editor role
      if (user) {
        const tokenResult = await user.getIdTokenResult()
        setIsEditor(tokenResult.claims.editor === true)
      } else {
        setIsEditor(false)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [])

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  const logout = async () => {
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider value={{ user, loading, isEditor, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

**Protected Route Component**:

```typescript
// src/components/auth/ProtectedRoute.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900" />
    </div>
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
```

**Login Page Component**:

```typescript
// src/pages/auth/LoginPage.tsx
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from?.pathname || '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err: any) {
      setError(err.message || 'Failed to log in')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)

    try {
      await loginWithGoogle()
      navigate(from, { replace: true })
    } catch (err: any) {
      setError(err.message || 'Failed to log in with Google')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login to Job Finder</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 rounded">
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Logging in...' : 'Log In'}
            </Button>
          </form>

          <div className="mt-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            <Button
              onClick={handleGoogleLogin}
              variant="outline"
              className="w-full mt-4"
              disabled={loading}
            >
              Sign in with Google
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Integration Points**:

- **Router**: Wrap protected routes with ProtectedRoute component
- **App**: Wrap entire app with AuthProvider
- **API Calls**: Use auth tokens for authenticated requests
- **Firestore**: Filter data by user.uid in queries

---

## Acceptance Criteria

- [ ] **Login works**: Users can log in with email/password
- [ ] **Google auth works**: Users can log in with Google
- [ ] **Logout works**: Users can sign out and are redirected to login
- [ ] **Protected routes**: Unauthenticated users redirected to login
- [ ] **Public routes**: Authenticated users redirected from login to dashboard
- [ ] **Session persists**: User stays logged in after page refresh
- [ ] **Loading states**: Shows spinner while checking auth state
- [ ] **Error handling**: Displays user-friendly error messages
- [ ] **Token refresh**: Firebase automatically refreshes auth tokens
- [ ] **Editor role**: isEditor flag correctly set from custom claims

---

## Testing

### Test Commands

```bash
# Type check
npm run type-check

# Lint
npm run lint

# Build
npm run build

# Run dev server
npm run dev
```

### Manual Testing

```bash
# Step 1: Start development server
npm run dev

# Step 2: Test protected route redirect
# 1. Visit http://localhost:5173/dashboard (without login)
# 2. Should redirect to /login
# 3. Verify login page displays

# Step 3: Test login
# 1. Enter valid email and password
# 2. Click "Log In"
# 3. Should redirect to /dashboard
# 4. Verify user info displayed

# Step 4: Test session persistence
# 1. Log in successfully
# 2. Refresh the page (F5)
# 3. Should remain logged in
# 4. Verify user state preserved

# Step 5: Test logout
# 1. Click logout button
# 2. Should redirect to /login
# 3. Try accessing /dashboard
# 4. Should redirect back to /login

# Step 6: Test Google login
# 1. Click "Sign in with Google"
# 2. Complete Google OAuth flow
# 3. Should redirect to dashboard
# 4. Verify user logged in

# Step 7: Test error handling
# 1. Enter invalid credentials
# 2. Verify error message displays
# 3. Verify form still usable after error
```

---

## Commit Message Template

```
feat(auth): implement Firebase authentication system

Set up complete authentication system using Firebase Auth with login,
logout, protected routes, and session management. Includes email/password
and Google OAuth authentication methods.

Key changes:
- Create AuthContext for global auth state management
- Implement ProtectedRoute and PublicRoute guards
- Build LoginPage with email/password and Google auth
- Add session persistence and automatic token refresh
- Integrate editor role checking from custom claims
- Add loading states and error handling

Testing:
- Verified login with email/password
- Tested Google OAuth flow
- Confirmed protected route redirects
- Validated session persistence across refreshes
- Tested logout and re-authentication

Closes #7
```

---

## Related Issues

- **Depends on**: SETUP-1 (Frontend Development Environment)
- **Blocks**: FEATURE-1 (Job Application Interface)
- **Blocks**: FEATURE-2 (Document Builder Interface)
- **Blocks**: All pages requiring user authentication

---

## Resources

### Documentation

- **Firebase Auth**: https://firebase.google.com/docs/auth/web/start
- **Firebase Auth State**: https://firebase.google.com/docs/auth/web/manage-users
- **Google OAuth**: https://firebase.google.com/docs/auth/web/google-signin
- **Custom Claims**: https://firebase.google.com/docs/auth/admin/custom-claims

### External References

- **React Context**: https://react.dev/reference/react/useContext
- **React Router Auth**: https://reactrouter.com/en/main/start/concepts#protected-routes

---

## Success Metrics

**How we'll measure success**:

- **Login success rate**: > 99% for valid credentials
- **Session persistence**: 100% of logins persist across refreshes
- **Auth check speed**: < 500ms to determine auth state
- **Error rate**: < 1% of legitimate logins fail

---

## Notes

**Questions? Need clarification?**

- Comment on this issue with specific questions
- Tag @PM for guidance
- Reference CLAUDE.md for auth patterns

**Implementation Tips**:

- Use onAuthStateChanged for automatic auth state updates
- Handle loading state to prevent flashing content
- Store intended route in location state for post-login redirect
- Consider adding password reset functionality
- Add email verification flow for new users
- Implement token refresh error handling
- Add logout confirmation dialog for better UX

---

**Created**: 2025-10-19
**Created By**: PM
**Last Updated**: 2025-10-19
**Status**: Todo
