import { describe, it, expect, beforeEach, vi } from "vitest"
import { GeminiProvider } from "./gemini-provider.js"

describe("GeminiProvider", () => {
  beforeEach(() => {
    vi.resetModules()
    // Clear env vars for clean state
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_CLOUD_PROJECT
  })

  it("should throw error if neither API key nor GCP project provided", () => {
    expect(() => new GeminiProvider({})).toThrow(
      "Gemini requires either GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT"
    )
  })

  it("should use API key authentication when provided", () => {
    const provider = new GeminiProvider({ apiKey: "test-key" })
    expect(provider["authMode"]).toBe("api_key")
  })

  it("should use Vertex AI authentication when project provided", () => {
    const provider = new GeminiProvider({ project: "test-project" })
    expect(provider["authMode"]).toBe("vertex_ai")
  })

  it("should prefer API key over Vertex AI when both provided", () => {
    const provider = new GeminiProvider({ apiKey: "test-key", project: "test-project" })
    expect(provider["authMode"]).toBe("api_key")
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
  beforeEach(() => {
    vi.resetModules()
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_CLOUD_PROJECT
  })

  it("should throw if neither GEMINI_API_KEY nor GOOGLE_CLOUD_PROJECT is set", () => {
    // Need to clear the singleton between tests
    const { getGeminiProvider } = require("./gemini-provider.js")
    expect(() => getGeminiProvider()).toThrow()
  })

  it("should work with GEMINI_API_KEY", () => {
    process.env.GEMINI_API_KEY = "test-key"
    const { getGeminiProvider } = require("./gemini-provider.js")
    const provider = getGeminiProvider()
    expect(provider).toBeDefined()
  })

  it("should work with GOOGLE_CLOUD_PROJECT", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "test-project"
    const { getGeminiProvider } = require("./gemini-provider.js")
    const provider = getGeminiProvider()
    expect(provider).toBeDefined()
  })
})
