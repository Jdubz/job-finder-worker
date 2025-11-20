/**
 * CloudLogger Tests
 *
 * Tests for the Google Cloud Logging service integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { CloudLogger } from "../CloudLogger"

// Mock fetch for testing
global.fetch = vi.fn()

describe("CloudLogger", () => {
  let logger: CloudLogger

  beforeEach(() => {
    vi.clearAllMocks()
    logger = new CloudLogger({
      projectId: "test-project",
      logName: "test-logs",
      environment: "development",
      service: "test-service",
      version: "1.0.0",
    })
  })

  it("should create logger instance", () => {
    expect(logger).toBeDefined()
  })

  it("should log info messages", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await logger.info("database", "started", "Test message", {
      details: { test: "value" },
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[INFO] [database]"),
      "Test message",
      expect.objectContaining({
        action: "started",
        details: { test: "value" },
      })
    )

    consoleSpy.mockRestore()
  })

  it("should log error messages", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await logger.error("database", "failed", "Test error", {
      error: {
        type: "TestError",
        message: "Test error message",
        stack: "Test stack trace",
      },
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ERROR] [database]"),
      "Test error",
      expect.objectContaining({
        action: "failed",
        error: {
          type: "TestError",
          message: "Test error message",
          stack: "Test stack trace",
        },
      })
    )

    consoleSpy.mockRestore()
  })

  it("should log API requests", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await logger.logApiRequest("GET", "/api/test", 200, 150, {
      queueItemId: "test-123",
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[INFO] [database]"),
      expect.stringContaining("API GET /api/test - 200 (150ms)"),
      expect.objectContaining({
        action: "completed",
        details: expect.objectContaining({
          method: "GET",
          url: "/api/test",
          statusCode: 200,
          duration: 150,
        }),
      })
    )

    consoleSpy.mockRestore()
  })

  it("should handle API errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = new Error("Network error")

    await logger.logApiRequest("POST", "/api/test", 500, 2000, {
      error,
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ERROR] [database]"),
      expect.stringContaining("API POST /api/test - 500 (2000ms)"),
      expect.objectContaining({
        action: "failed",
        error: {
          type: "Error",
          message: "Network error",
          stack: expect.any(String),
        },
      })
    )

    consoleSpy.mockRestore()
  })

  it("should log user actions", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await logger.logUserAction(
      "button_click",
      {
        buttonId: "save-button",
        page: "content-items",
      },
      {
        queueItemId: "test-123",
      }
    )

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[INFO] [database]"),
      "User action: button_click",
      expect.objectContaining({
        action: "button_click",
        details: {
          buttonId: "save-button",
          page: "content-items",
        },
      })
    )

    consoleSpy.mockRestore()
  })

  it("should log component lifecycle", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    await logger.logComponentLifecycle("ContentItemCard", "mounted", {
      itemType: "company",
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[INFO] [database]"),
      "Component ContentItemCard mounted",
      expect.objectContaining({
        action: "mounted",
        details: {
        component: "ContentItemCard",
          itemType: "company",
        },
      })
    )

    consoleSpy.mockRestore()
  })

  it("should flush logs on destroy", async () => {
    const flushSpy = vi.spyOn(logger as any, "flush")

    await logger.destroy()

    expect(flushSpy).toHaveBeenCalled()
  })
})
