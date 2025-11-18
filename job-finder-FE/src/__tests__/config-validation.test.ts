/**
 * Configuration Validation Tests
 *
 * These tests verify that all environment-specific configurations are correct.
 * They prevent deployment of misconfigured builds by catching issues at build time.
 *
 * This test file is critical for preventing the common issue where staging
 * builds are deployed with wrong database configurations.
 */

import { describe, it, expect, beforeAll } from "vitest"

describe("Environment Configuration Validation", () => {
  let envVars: Record<string, string | undefined>

  beforeAll(() => {
    envVars = {
      VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
      VITE_FIRESTORE_DATABASE_ID: import.meta.env.VITE_FIRESTORE_DATABASE_ID,
      VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
      VITE_RECAPTCHA_SITE_KEY: import.meta.env.VITE_RECAPTCHA_SITE_KEY,
      MODE: import.meta.env.MODE,
    }
  })

  describe("Required Environment Variables", () => {
    it("should have all required Firebase config variables defined", () => {
      expect(envVars.VITE_FIREBASE_API_KEY, "VITE_FIREBASE_API_KEY is required").toBeDefined()
      expect(
        envVars.VITE_FIREBASE_AUTH_DOMAIN,
        "VITE_FIREBASE_AUTH_DOMAIN is required"
      ).toBeDefined()
      expect(envVars.VITE_FIREBASE_PROJECT_ID, "VITE_FIREBASE_PROJECT_ID is required").toBeDefined()
      expect(
        envVars.VITE_FIREBASE_STORAGE_BUCKET,
        "VITE_FIREBASE_STORAGE_BUCKET is required"
      ).toBeDefined()
      expect(
        envVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
        "VITE_FIREBASE_MESSAGING_SENDER_ID is required"
      ).toBeDefined()
      expect(envVars.VITE_FIREBASE_APP_ID, "VITE_FIREBASE_APP_ID is required").toBeDefined()
    })

    it("should have VITE_FIRESTORE_DATABASE_ID defined", () => {
      expect(
        envVars.VITE_FIRESTORE_DATABASE_ID,
        "VITE_FIRESTORE_DATABASE_ID must be set to avoid using (default) database"
      ).toBeDefined()
    })

    it("should have VITE_API_BASE_URL defined", () => {
      expect(envVars.VITE_API_BASE_URL, "VITE_API_BASE_URL is required").toBeDefined()
    })
  })

  describe("App Check Configuration", () => {
    it("should require a reCAPTCHA site key for production and staging builds", () => {
      const { MODE: mode, VITE_RECAPTCHA_SITE_KEY: siteKey } = envVars

      if (mode === "production" || mode === "staging") {
        expect(
          siteKey,
          `❌ ${mode.toUpperCase()} BUILD ERROR: VITE_RECAPTCHA_SITE_KEY is required for Firebase App Check.`
        ).toBeDefined()
        expect(siteKey?.trim()).not.toHaveLength(0)
      }
    })
  })

  describe("Database Configuration", () => {
    it("should NEVER use (default) database", () => {
      const databaseId = envVars.VITE_FIRESTORE_DATABASE_ID

      expect(
        databaseId,
        "❌ CRITICAL: VITE_FIRESTORE_DATABASE_ID is not set! This will cause 400 errors in production."
      ).toBeDefined()

      expect(
        databaseId,
        "❌ CRITICAL: Database ID cannot be '(default)'. Use 'portfolio-staging' or 'portfolio'."
      ).not.toBe("(default)")

      expect(databaseId, "❌ CRITICAL: Database ID cannot be empty string.").not.toBe("")
    })

    it("should use correct database for staging builds", () => {
      const mode = envVars.MODE
      const databaseId = envVars.VITE_FIRESTORE_DATABASE_ID

      if (mode === "staging") {
        expect(databaseId, "❌ STAGING BUILD ERROR: Must use 'portfolio-staging' database").toBe(
          "portfolio-staging"
        )
      }
    })

    it("should use correct database for production builds", () => {
      const mode = envVars.MODE
      const databaseId = envVars.VITE_FIRESTORE_DATABASE_ID

      if (mode === "production") {
        expect(databaseId, "❌ PRODUCTION BUILD ERROR: Must use 'portfolio' database").toBe(
          "portfolio"
        )
      }
    })
  })

  describe("Project Configuration", () => {
    it("should use the correct Firebase project", () => {
      const mode = envVars.MODE

      if (mode !== "test") {
        expect(envVars.VITE_FIREBASE_PROJECT_ID).toBe("static-sites-257923")
      }
    })

    it("should have matching auth domain", () => {
      const mode = envVars.MODE
      const authDomain = envVars.VITE_FIREBASE_AUTH_DOMAIN

      if (mode !== "test") {
        expect(authDomain, "Auth domain should match the project").toContain("static-sites-257923")
      }
    })
  })

  describe("API Configuration", () => {
    it("should have valid API base URL format", () => {
      const apiUrl = envVars.VITE_API_BASE_URL

      expect(apiUrl, "VITE_API_BASE_URL must be defined").toBeDefined()
      expect(
        apiUrl?.startsWith("http://") || apiUrl?.startsWith("https://"),
        `API URL must start with http:// or https://, got: ${apiUrl}`
      ).toBe(true)
    })

    it("should use correct API URL for staging", () => {
      const mode = envVars.MODE
      const apiUrl = envVars.VITE_API_BASE_URL

      if (mode === "staging") {
        expect(
          apiUrl,
          "❌ STAGING BUILD ERROR: API URL should point to staging Cloud Functions"
        ).toContain("static-sites-257923")
      }
    })

    it("should use correct API URL for production", () => {
      const mode = envVars.MODE
      const apiUrl = envVars.VITE_API_BASE_URL

      if (mode === "production") {
        expect(
          apiUrl,
          "❌ PRODUCTION BUILD ERROR: API URL should point to production Cloud Functions"
        ).toContain("static-sites-257923")
      }
    })
  })

  describe("Configuration Summary (for debugging)", () => {
    it("should log current configuration", () => {
      console.log("\n=== Current Build Configuration ===")
      console.log("MODE:", envVars.MODE)
      console.log("DATABASE_ID:", envVars.VITE_FIRESTORE_DATABASE_ID)
      console.log("PROJECT_ID:", envVars.VITE_FIREBASE_PROJECT_ID)
      console.log("API_URL:", envVars.VITE_API_BASE_URL)
      console.log("AUTH_DOMAIN:", envVars.VITE_FIREBASE_AUTH_DOMAIN)
      console.log("===================================\n")

      // Verify we have a valid mode
      expect(envVars.MODE).toBeDefined()
    })
  })
})

describe("Deployment Checklist Validation", () => {
  it("should have correct build command for staging", () => {
    const mode = import.meta.env.MODE

    if (mode === "staging") {
      console.log("\n✅ Staging Build Checklist:")
      console.log("   - Build command should be: npm run build:staging")
      console.log("   - Database: portfolio-staging")
      console.log("   - Mode:", mode)
    }

    // Verify mode is a valid value
    expect(["test", "development", "staging", "production"]).toContain(mode)
  })

  it("should have correct build command for production", () => {
    const mode = import.meta.env.MODE

    if (mode === "production") {
      console.log("\n✅ Production Build Checklist:")
      console.log("   - Build command should be: npm run build:production")
      console.log("   - Database: portfolio")
      console.log("   - Mode:", mode)
    }

    // Verify mode is a valid value
    expect(["test", "development", "staging", "production"]).toContain(mode)
  })
})
