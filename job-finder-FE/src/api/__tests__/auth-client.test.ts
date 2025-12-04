/**
 * Tests for Auth Client
 *
 * Tests authentication endpoints: login, fetchSession, logout.
 * Auth uses session cookies (credentials: include) - no Bearer tokens.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuthError } from '../auth-client'

// We need to test the AuthClient class directly, so we'll create a test instance
// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Helper to create mock Response with proper headers for BaseApiClient compatibility
const createMockResponse = (options: {
  ok: boolean
  status?: number
  data: unknown
}) => ({
  ok: options.ok,
  status: options.status ?? (options.ok ? 200 : 500),
  headers: new Headers({ 'content-type': 'application/json' }),
  json: () => Promise.resolve(options.data),
})

// Import after mocking fetch
const { authClient } = await import('../auth-client')

describe('AuthClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('login', () => {
    it('should send credential and return unwrapped user data', async () => {
      const mockUser = {
        uid: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['viewer'],
      }

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: { success: true, data: { user: mockUser } },
        })
      )

      const result = await authClient.login('google-credential-token')

      expect(result.user).toEqual(mockUser)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ credential: 'google-credential-token' }),
        })
      )
    })

    it('should throw AuthError on failed login', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 401,
          data: { success: false, error: { message: 'Invalid credential' } },
        })
      )

      try {
        await authClient.login('bad-credential')
        expect.fail('Expected login to throw')
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError)
        expect((error as AuthError).statusCode).toBe(401)
      }
    })

    it('should handle JSON parse errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.reject(new Error('Invalid JSON')),
      })

      await expect(authClient.login('credential')).rejects.toThrow(AuthError)
    })
  })

  describe('fetchSession', () => {
    it('should return unwrapped user data from session', async () => {
      const mockUser = {
        uid: 'user-456',
        email: 'session@example.com',
        name: 'Session User',
        roles: ['admin', 'viewer'],
      }

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: { success: true, data: { user: mockUser } },
        })
      )

      const result = await authClient.fetchSession()

      expect(result.user).toEqual(mockUser)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/session'),
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      )
    })

    it('should throw AuthError when no session exists (401)', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 401,
          data: { success: false, error: { message: 'No session cookie' } },
        })
      )

      try {
        await authClient.fetchSession()
        expect.fail('Expected fetchSession to throw')
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError)
        expect((error as AuthError).statusCode).toBe(401)
      }
    })

    it('should retry on network errors with exponential backoff', async () => {
      const mockUser = { uid: 'user', email: 'test@example.com' }

      // Fail twice with network error, succeed on third try
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            data: { success: true, data: { user: mockUser } },
          })
        )

      const result = await authClient.fetchSession()

      expect(result.user).toEqual(mockUser)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should throw AuthError immediately on HTTP client errors (like 401)', async () => {
      // Clear mocks to ensure clean state
      vi.clearAllMocks()

      mockFetch.mockResolvedValue(
        createMockResponse({
          ok: false,
          status: 401,
          data: { success: false, error: { message: 'Unauthorized' } },
        })
      )

      // The key behavior: 401 should result in AuthError being thrown
      try {
        await authClient.fetchSession()
        expect.fail('Expected fetchSession to throw')
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError)
        expect((error as AuthError).statusCode).toBe(401)
        expect((error as AuthError).message).toContain('Unauthorized')
      }
    })
  })

  describe('logout', () => {
    it('should call logout endpoint and return success', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          data: { success: true, data: { loggedOut: true } },
        })
      )

      const result = await authClient.logout()

      expect(result).toEqual({ loggedOut: true })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      )
    })

    it('should throw AuthError on logout failure', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 500,
          data: { success: false, error: { message: 'Server error' } },
        })
      )

      await expect(authClient.logout()).rejects.toThrow(AuthError)
    })
  })

  describe('AuthError', () => {
    it('should create error with message and status code', () => {
      const error = new AuthError('Test error', 401)

      expect(error.message).toBe('Test error')
      expect(error.statusCode).toBe(401)
      expect(error.name).toBe('AuthError')
    })

    it('should be instanceof Error', () => {
      const error = new AuthError('Test', 500)

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(AuthError)
    })
  })
})
