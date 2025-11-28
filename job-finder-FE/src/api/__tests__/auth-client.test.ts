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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { user: mockUser },
          }),
      })

      const result = await authClient.login('google-credential-token')

      expect(result.user).toEqual(mockUser)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: 'google-credential-token' }),
        })
      )
    })

    it('should throw AuthError on failed login', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            success: false,
            error: { message: 'Invalid credential' },
          }),
      })

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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { user: mockUser },
          }),
      })

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
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            success: false,
            error: { message: 'No session cookie' },
          }),
      })

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
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { user: mockUser } }),
        })

      const result = await authClient.fetchSession()

      expect(result.user).toEqual(mockUser)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should NOT retry on HTTP errors (like 401)', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            success: false,
            error: { message: 'Unauthorized' },
          }),
      })

      await expect(authClient.fetchSession()).rejects.toThrow(AuthError)
      // Should only be called once - no retries for HTTP errors
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('logout', () => {
    it('should call logout endpoint and return success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { loggedOut: true },
          }),
      })

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
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            success: false,
            error: { message: 'Server error' },
          }),
      })

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
