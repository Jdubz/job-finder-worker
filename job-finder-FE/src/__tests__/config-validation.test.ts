import { describe, it, expect, beforeAll } from "vitest"

describe("Environment Configuration Validation", () => {
  let envVars: Record<string, string | undefined>

  beforeAll(() => {
    envVars = {
      VITE_GOOGLE_OAUTH_CLIENT_ID: import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID,
      VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
      MODE: import.meta.env.MODE,
    }
  })

  it("should have GIS client ID defined", () => {
    expect(
      envVars.VITE_GOOGLE_OAUTH_CLIENT_ID,
      "VITE_GOOGLE_OAUTH_CLIENT_ID is required to initialize Google Identity Services"
    ).toBeDefined()
    expect(envVars.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim()).not.toHaveLength(0)
  })

  it("should have API base URL defined", () => {
    expect(envVars.VITE_API_BASE_URL, "VITE_API_BASE_URL is required").toBeDefined()
    const apiUrl = envVars.VITE_API_BASE_URL!
    expect(
      apiUrl.startsWith("http://") || apiUrl.startsWith("https://"),
      `API base URL must start with http:// or https://, got: ${apiUrl}`
    ).toBe(true)
  })
})
