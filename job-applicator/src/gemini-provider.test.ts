import { describe, it, expect, beforeEach, vi } from "vitest"
import { GeminiProvider, getGeminiProvider } from "./gemini-provider.js"

describe("GeminiProvider", () => {
  beforeEach(() => {
    vi.resetModules()
    // Clear env vars for clean state
    delete process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.GOOGLE_CLOUD_LOCATION
  })

  it("should throw error if no project provided", () => {
    expect(() => new GeminiProvider({})).toThrow("GOOGLE_CLOUD_PROJECT environment variable is required")
  })

  it("should use project from config", () => {
    const provider = new GeminiProvider({ project: "test-project" })
    expect(provider).toBeDefined()
  })

  it("should use project from GOOGLE_CLOUD_PROJECT env var", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "env-project"
    const provider = new GeminiProvider({})
    expect(provider).toBeDefined()
  })

  it("should use default location if not specified", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "test-project"
    const provider = new GeminiProvider({})
    expect(provider["location"]).toBe("us-central1")
  })

  it("should use custom location if specified", () => {
    const provider = new GeminiProvider({ project: "test-project", location: "us-west1" })
    expect(provider["location"]).toBe("us-west1")
  })

  it("should use default model if not specified", () => {
    const provider = new GeminiProvider({ project: "test-project" })
    expect(provider["model"]).toBe("gemini-2.0-flash-001")
  })

  it("should use custom model if specified", () => {
    const provider = new GeminiProvider({ project: "test-project", model: "gemini-1.5-pro" })
    expect(provider["model"]).toBe("gemini-1.5-pro")
  })

  it("should use environment variable for default model", () => {
    const originalEnv = process.env.GEMINI_DEFAULT_MODEL
    process.env.GEMINI_DEFAULT_MODEL = "custom-model"
    process.env.GOOGLE_CLOUD_PROJECT = "test-project"

    const provider = new GeminiProvider({})
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
  })

  it("should throw if GOOGLE_CLOUD_PROJECT is not set", () => {
    const originalProject = process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.GOOGLE_CLOUD_PROJECT

    expect(() => getGeminiProvider()).toThrow("GOOGLE_CLOUD_PROJECT environment variable is required")

    // Restore
    if (originalProject) process.env.GOOGLE_CLOUD_PROJECT = originalProject
  })
})
