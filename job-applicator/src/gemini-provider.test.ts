import { describe, it, expect, beforeEach, vi } from "vitest"
import { GeminiProvider } from "./gemini-provider.js"

describe("GeminiProvider", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("should throw error if no API key provided", () => {
    expect(() => new GeminiProvider({ apiKey: "" })).toThrow("GEMINI_API_KEY is required")
  })

  it("should use default model if not specified", () => {
    const provider = new GeminiProvider({ apiKey: "test-key" })
    expect(provider["model"]).toBe("gemini-2.0-flash-exp")
  })

  it("should use custom model if specified", () => {
    const provider = new GeminiProvider({ apiKey: "test-key", model: "gemini-1.5-pro" })
    expect(provider["model"]).toBe("gemini-1.5-pro")
  })

  it("should use environment variable for default model", () => {
    const originalEnv = process.env.GEMINI_DEFAULT_MODEL
    process.env.GEMINI_DEFAULT_MODEL = "custom-model"

    const provider = new GeminiProvider({ apiKey: "test-key" })
    expect(provider["model"]).toBe("custom-model")

    // Restore
    if (originalEnv) {
      process.env.GEMINI_DEFAULT_MODEL = originalEnv
    } else {
      delete process.env.GEMINI_DEFAULT_MODEL
    }
  })
})

describe("getGeminiProvider singleton", () => {
  it("should throw if GEMINI_API_KEY is not set", async () => {
    const originalKey = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY

    const { getGeminiProvider } = await import("./gemini-provider.js")
    expect(() => getGeminiProvider()).toThrow("GEMINI_API_KEY environment variable is required")

    // Restore
    if (originalKey) {
      process.env.GEMINI_API_KEY = originalKey
    }
  })
})
