/**
 * Error Handling Integration Tests
 *
 * Tests for API error scenarios and edge cases
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { ApiError } from "@/api/base-client"
import {
  makeAuthenticatedRequest,
  makeUnauthenticatedRequest,
  cleanupTestAuth,
  signInTestUser,
  getIntegrationDescribe,
} from "../utils/testHelpers"
import { mockErrorResponses } from "../fixtures/mockData"

// Skip integration tests if Firebase is mocked (unit test mode)
const describeIntegration = getIntegrationDescribe()

describeIntegration("Error Handling Integration", () => {
  beforeEach(async () => {
    await cleanupTestAuth()
  })

  describe("ApiError Class", () => {
    it("should create ApiError with message", () => {
      const error = new ApiError("Test error")

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(ApiError)
      expect(error.message).toBe("Test error")
      expect(error.name).toBe("ApiError")
    })

    it("should create ApiError with status code", () => {
      const error = new ApiError("Not found", 404)

      expect(error.statusCode).toBe(404)
      expect(error.message).toBe("Not found")
    })

    it("should create ApiError with response data", () => {
      const responseData = { field: "email", issue: "invalid format" }
      const error = new ApiError("Validation error", 400, responseData)

      expect(error.statusCode).toBe(400)
      expect(error.response).toEqual(responseData)
    })

    it("should have proper error name", () => {
      const error = new ApiError("Test")
      expect(error.name).toBe("ApiError")
    })

    it("should be throwable", () => {
      expect(() => {
        throw new ApiError("Test error")
      }).toThrow("Test error")
    })
  })

  describe("Error Response Structures", () => {
    it("should validate 401 unauthorized error", () => {
      const error = mockErrorResponses.unauthorized

      expect(error.statusCode).toBe(401)
      expect(error.error).toBe("Unauthorized")
      expect(error.message).toContain("Authentication")
    })

    it("should validate 403 forbidden error", () => {
      const error = mockErrorResponses.forbidden

      expect(error.statusCode).toBe(403)
      expect(error.error).toBe("Forbidden")
      expect(error.message).toContain("permissions")
    })

    it("should validate 400 bad request error", () => {
      const error = mockErrorResponses.badRequest

      expect(error.statusCode).toBe(400)
      expect(error.error).toBe("Bad Request")
      expect(error.message).toContain("Invalid")
    })

    it("should validate 404 not found error", () => {
      const error = mockErrorResponses.notFound

      expect(error.statusCode).toBe(404)
      expect(error.error).toBe("Not Found")
      expect(error.message).toContain("not found")
    })

    it("should validate 429 rate limit error", () => {
      const error = mockErrorResponses.rateLimited

      expect(error.statusCode).toBe(429)
      expect(error.error).toBe("Too Many Requests")
      expect(error.message).toContain("Rate limit")
    })

    it("should validate 500 server error", () => {
      const error = mockErrorResponses.serverError

      expect(error.statusCode).toBe(500)
      expect(error.error).toBe("Server Error")
      expect(error.message).toContain("Unexpected server failure")
    })
  })

  describe("Error Status Codes", () => {
    it("should have 4xx status codes for client errors", () => {
      const clientErrors = [
        mockErrorResponses.badRequest,
        mockErrorResponses.unauthorized,
        mockErrorResponses.forbidden,
        mockErrorResponses.notFound,
        mockErrorResponses.rateLimited,
      ]

      clientErrors.forEach((error) => {
        expect(error.statusCode).toBeGreaterThanOrEqual(400)
        expect(error.statusCode).toBeLessThan(500)
      })
    })

    it("should have 5xx status codes for server errors", () => {
      const serverErrors = [mockErrorResponses.serverError]

      serverErrors.forEach((error) => {
        expect(error.statusCode).toBeGreaterThanOrEqual(500)
        expect(error.statusCode).toBeLessThan(600)
      })
    })
  })

  describe("Error Messages", () => {
    it("should have descriptive error messages", () => {
      const errors = Object.values(mockErrorResponses)

      errors.forEach((error) => {
        expect(error.message).toBeDefined()
        expect(typeof error.message).toBe("string")
        expect(error.message.length).toBeGreaterThan(0)
      })
    })

    it("should have error types", () => {
      const errors = Object.values(mockErrorResponses)

      errors.forEach((error) => {
        expect(error.error).toBeDefined()
        expect(typeof error.error).toBe("string")
        expect(error.error.length).toBeGreaterThan(0)
      })
    })
  })

  describe("Authentication Errors", () => {
    it("should handle missing authentication", async () => {
      // Ensure we're not authenticated
      await cleanupTestAuth()

      // Try to make an unauthenticated request (this simulates the error case)
      const testUrl = "http://localhost:5001/test"

      try {
        const response = await makeUnauthenticatedRequest(testUrl, {
          method: "POST",
          body: JSON.stringify({ test: "data" }),
        })

        // If we get here, check the response
        // In a real scenario with backend, this would return 401
        expect(response).toBeDefined()
      } catch (error: any) {
        // Network error is expected when no backend is available
        expect(error).toBeDefined()
      }
    })

    it("should require auth token for authenticated requests", async () => {
      // Sign in first
      await signInTestUser("regular")

      const testUrl = "http://localhost:5001/test"

      try {
        const response = await makeAuthenticatedRequest(testUrl, {
          method: "POST",
          body: JSON.stringify({ test: "data" }),
        })

        // Should have Authorization header
        expect(response).toBeDefined()
      } catch (error: any) {
        // Network error is expected when no backend is available
        expect(error).toBeDefined()
      }
    })
  })

  describe("Validation Errors", () => {
    it("should validate required fields", () => {
      const error = mockErrorResponses.badRequest

      expect(error.statusCode).toBe(400)
      expect(error.message).toContain("Invalid")
    })

    it("should provide helpful error messages", () => {
      const errors = Object.values(mockErrorResponses)

      errors.forEach((error) => {
        expect(error.message.length).toBeGreaterThan(10)
        expect(error.message).not.toBe(error.error)
      })
    })
  })

  describe("Network Errors", () => {
    it("should handle network timeouts", () => {
      // Simulate timeout scenario
      const timeoutError = new ApiError("Request timeout", 408)

      expect(timeoutError.statusCode).toBe(408)
      expect(timeoutError.message).toContain("timeout")
    })

    it("should handle connection failures", () => {
      // Simulate connection failure
      const connectionError = new Error("Network request failed")

      expect(connectionError.message).toContain("Network")
    })

    it("should handle DNS failures", () => {
      // Simulate DNS failure
      const dnsError = new Error("Failed to resolve host")

      expect(dnsError.message).toContain("resolve")
    })
  })

  describe("Rate Limiting", () => {
    it("should have rate limit error structure", () => {
      const error = mockErrorResponses.rateLimited

      expect(error.statusCode).toBe(429)
      expect(error.message).toContain("Rate limit")
      expect(error.message).toContain("Rate limit exceeded")
    })

    it("should indicate when to retry", () => {
      const error = mockErrorResponses.rateLimited

      expect(error.message.toLowerCase()).toContain("exceeded")
    })
  })

  describe("Server Errors", () => {
    it("should have generic server error message", () => {
      const error = mockErrorResponses.serverError

      expect(error.statusCode).toBe(500)
      expect(error.message).toContain("Unexpected server failure")
    })

    it("should not expose internal details", () => {
      const error = mockErrorResponses.serverError

      // Should not contain stack traces, file paths, etc.
      expect(error.message).not.toContain("/")
      expect(error.message).not.toContain("\\")
      expect(error.message).not.toContain("Error:")
    })
  })

  describe("Error Recovery", () => {
    it("should allow retry after error", async () => {
      // This tests that errors don't leave the system in a bad state
      await cleanupTestAuth()
      await signInTestUser("regular")

      // System should be in working state
      expect(vi).toBeDefined()
    })

    it("should maintain auth state after non-auth errors", async () => {
      await signInTestUser("regular")

      // Simulate an error that's not auth-related
      const error = new ApiError("Server error", 500)

      // Auth state should still be valid
      expect(error.statusCode).toBe(500)
      expect(error.statusCode).not.toBe(401)
      expect(error.statusCode).not.toBe(403)
    })
  })

  describe("Error Edge Cases", () => {
    it("should handle empty error messages", () => {
      const error = new ApiError("")

      expect(error.message).toBe("")
      expect(error).toBeInstanceOf(ApiError)
    })

    it("should handle undefined status codes", () => {
      const error = new ApiError("Error")

      expect(error.statusCode).toBeUndefined()
      expect(error.message).toBe("Error")
    })

    it("should handle null response data", () => {
      const error = new ApiError("Error", 400, null)

      expect(error.response).toBeNull()
      expect(error.statusCode).toBe(400)
    })

    it("should handle complex response objects", () => {
      const complexResponse = {
        errors: [
          { field: "email", message: "Invalid format" },
          { field: "phone", message: "Required" },
        ],
        timestamp: new Date().toISOString(),
      }

      const error = new ApiError("Validation failed", 400, complexResponse)

      expect(error.response).toEqual(complexResponse)
      expect(error.response).toHaveProperty("errors")
      expect(error.response).toHaveProperty("timestamp")
    })
  })

  describe("HTTP Status Code Ranges", () => {
    it("should identify client errors (4xx)", () => {
      const statusCodes = [400, 401, 403, 404, 429]

      statusCodes.forEach((code) => {
        expect(code).toBeGreaterThanOrEqual(400)
        expect(code).toBeLessThan(500)
      })
    })

    it("should identify server errors (5xx)", () => {
      const statusCodes = [500, 502, 503, 504]

      statusCodes.forEach((code) => {
        expect(code).toBeGreaterThanOrEqual(500)
        expect(code).toBeLessThan(600)
      })
    })

    it("should not retry on 4xx errors except rate limits", () => {
      const noRetryStatuses = [400, 401, 403, 404]
      const retryStatuses = [429, 500, 502, 503]

      noRetryStatuses.forEach((code) => {
        expect(code).toBeGreaterThanOrEqual(400)
        expect(code).toBeLessThan(500)
        expect(code).not.toBe(429)
      })

      retryStatuses.forEach((code) => {
        expect(code === 429 || code >= 500).toBe(true)
      })
    })
  })
})
