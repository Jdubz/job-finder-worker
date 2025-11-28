/**
 * Tests for Base API Client
 *
 * Authentication is now handled via session cookies (credentials: include).
 * No Bearer tokens are used.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { BaseApiClient, ApiError } from "../base-client"
import { handleApiError } from "@/lib/api-error-handler"
import { ApiErrorCode } from "@shared/types"

vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: vi.fn((error: unknown) => error),
}))

// Mock fetch
global.fetch = vi.fn()

describe("BaseApiClient", () => {
  let client: BaseApiClient
  const baseUrl = "https://api.example.com"
  const mockedHandleApiError = vi.mocked(handleApiError)

  beforeEach(() => {
    vi.clearAllMocks()
    client = new BaseApiClient(baseUrl)
    mockedHandleApiError.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Constructor", () => {
    it("should initialize with default options", () => {
      const client = new BaseApiClient(baseUrl)

      expect(client.baseUrl).toBe(baseUrl)
      expect(client.defaultTimeout).toBe(30000)
      expect(client.defaultRetryAttempts).toBe(3)
      expect(client.defaultRetryDelay).toBe(1000)
    })

    it("should initialize with custom options", () => {
      const client = new BaseApiClient(baseUrl, {
        timeout: 5000,
        retryAttempts: 5,
        retryDelay: 2000,
      })

      expect(client.defaultTimeout).toBe(5000)
      expect(client.defaultRetryAttempts).toBe(5)
      expect(client.defaultRetryDelay).toBe(2000)
    })
  })

  describe("request", () => {
    it("should make successful GET request", async () => {
      const mockData = { id: 1, name: "Test" }
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        headers: {
          get: () => "application/json",
        },
        json: () => Promise.resolve(mockData),
      })

      const result = await client.get("/test")

      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/test`,
        expect.objectContaining({
          method: "GET",
          credentials: "include",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      )
    })

    it("should include credentials for cookie-based auth", async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        headers: {
          get: () => "application/json",
        },
        json: () => Promise.resolve({}),
      })

      await client.get("/test")

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/test`,
        expect.objectContaining({
          credentials: "include",
        })
      )
    })

    it("should make POST request with body", async () => {
      const mockBody = { name: "Test" }
      const mockResponse = { id: 1, ...mockBody }
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        headers: {
          get: () => "application/json",
        },
        json: () => Promise.resolve(mockResponse),
      })

      const result = await client.post("/test", mockBody)

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/test`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(mockBody),
        })
      )
    })

    it("should throw ApiError on 4xx response and report via handleApiError", async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve({
          success: false,
          error: { code: ApiErrorCode.INVALID_REQUEST, message: "Invalid input" },
        }),
      })
      try {
        await client.get("/test")
        expect.fail("Expected request to throw")
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).message).toBe("Invalid input")
        expect(handleApiError).toHaveBeenCalledTimes(1)
      }
    })

    it("should throw ApiError on 5xx response", async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({}),
      })

      await expect(client.get("/test")).rejects.toThrow(ApiError)
    })

    it("should retry on network errors", async () => {
      const client = new BaseApiClient(baseUrl, {
        retryAttempts: 3,
        retryDelay: 10,
      })

      ;(global.fetch as any)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: () => "application/json",
          },
          json: () => Promise.resolve({ success: true }),
        })

      const result = await client.get("/test")

      expect(result).toEqual({ success: true })
      expect(global.fetch).toHaveBeenCalledTimes(3)
    })

    it("should not retry on 4xx errors", async () => {
      const client = new BaseApiClient(baseUrl, {
        retryAttempts: 3,
      })

      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve({ message: "Invalid" }),
      })

      await expect(client.get("/test")).rejects.toThrow(ApiError)
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it("should use exponential backoff for retries", async () => {
      const client = new BaseApiClient(baseUrl, {
        retryAttempts: 3,
        retryDelay: 100,
      })

      const startTime = Date.now()
      ;(global.fetch as any).mockRejectedValue(new Error("Network error"))

      await expect(client.get("/test")).rejects.toThrow()

      const elapsed = Date.now() - startTime
      // Should have delays: 100ms, 200ms (exponential backoff)
      // Total should be at least 300ms
      expect(elapsed).toBeGreaterThanOrEqual(250)
    })

    it("should handle non-JSON responses", async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        headers: {
          get: () => "text/plain",
        },
      })

      const result = await client.get("/test")

      expect(result).toEqual({})
    })

    it("reports terminal retry failure through handleApiError", async () => {
      const client = new BaseApiClient(baseUrl, {
        retryAttempts: 2,
        retryDelay: 5,
      })

      ;(global.fetch as any).mockRejectedValue(new Error("Network error"))

      await expect(client.get("/test"))
        .rejects.toThrow("Network error")

      expect(handleApiError).toHaveBeenCalled()
    })
  })

  describe("HTTP Methods", () => {
    beforeEach(() => {
      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        headers: {
          get: () => "application/json",
        },
        json: () => Promise.resolve({ success: true }),
      })
    })

    it("should make GET request", async () => {
      await client.get("/test")

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/test`,
        expect.objectContaining({
          method: "GET",
        })
      )
    })

    it("should make POST request", async () => {
      const body = { data: "test" }
      await client.post("/test", body)

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/test`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(body),
        })
      )
    })

    it("should make PUT request", async () => {
      const body = { data: "test" }
      await client.put("/test", body)

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/test`,
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(body),
        })
      )
    })

    it("should make DELETE request", async () => {
      await client.delete("/test")

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/test`,
        expect.objectContaining({
          method: "DELETE",
        })
      )
    })

    it("should make PATCH request", async () => {
      const body = { data: "test" }
      await client.patch("/test", body)

      expect(global.fetch).toHaveBeenCalledWith(
        `${baseUrl}/test`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(body),
        })
      )
    })
  })

  describe("ApiError", () => {
    it("should create ApiError with message", () => {
      const error = new ApiError("Test error")

      expect(error.message).toBe("Test error")
      expect(error.name).toBe("ApiError")
      expect(error.statusCode).toBeUndefined()
    })

    it("should create ApiError with status code", () => {
      const error = new ApiError("Test error", 404)

      expect(error.statusCode).toBe(404)
    })

    it("should create ApiError with response data", () => {
      const response = { details: "Not found" }
      const error = new ApiError("Test error", 404, response)

      expect(error.response).toEqual(response)
    })
  })
})
