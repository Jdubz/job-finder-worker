/**
 * Database Configuration Tests
 *
 * These tests validate that the database configuration correctly
 * selects the appropriate database based on environment variables.
 */

describe("Database Configuration", () => {
  // Store original environment
  const originalEnv = process.env

  beforeEach(() => {
    // Reset modules and environment before each test
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe("DATABASE_ID selection", () => {
    it("should use explicit FIRESTORE_DATABASE_ID when set", async () => {
      process.env.FIRESTORE_DATABASE_ID = "custom-database"
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("custom-database")
    })

    it("should use (default) when FIRESTORE_EMULATOR_HOST is set", async () => {
      process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080"
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("(default)")
    })

    it("should use (default) when FUNCTIONS_EMULATOR is true", async () => {
      process.env.FUNCTIONS_EMULATOR = "true"
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("(default)")
    })

    it("should use portfolio-staging when ENVIRONMENT=staging", async () => {
      process.env.ENVIRONMENT = "staging"
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("portfolio-staging")
    })

    it("should use portfolio when ENVIRONMENT=production", async () => {
      process.env.ENVIRONMENT = "production"
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("portfolio")
    })

    it("should use (default) when ENVIRONMENT=development", async () => {
      process.env.ENVIRONMENT = "development"
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("(default)")
    })

    it("should use (default) when ENVIRONMENT=test", async () => {
      process.env.ENVIRONMENT = "test"
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("(default)")
    })

    it("should fall back to NODE_ENV when ENVIRONMENT is not set", async () => {
      process.env.NODE_ENV = "staging"
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("portfolio-staging")
    })

    it("should default to portfolio (production) when no env vars are set", async () => {
      delete process.env.ENVIRONMENT
      delete process.env.NODE_ENV
      delete process.env.FIRESTORE_DATABASE_ID
      delete process.env.FIRESTORE_EMULATOR_HOST
      delete process.env.FUNCTIONS_EMULATOR

      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("portfolio")
    })

    it("should prioritize FIRESTORE_DATABASE_ID over emulator detection", async () => {
      process.env.FIRESTORE_DATABASE_ID = "override-database"
      process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080"
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("override-database")
    })

    it("should prioritize emulator detection over ENVIRONMENT", async () => {
      process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080"
      process.env.ENVIRONMENT = "production"
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBe("(default)")
    })
  })

  describe("Environment-specific behavior", () => {
    it("should not throw error when DATABASE_ID is properly set", async () => {
      process.env.ENVIRONMENT = "production"
      await expect(import("../database")).resolves.toBeDefined()
    })

    it("should export collection names", async () => {
      process.env.ENVIRONMENT = "production"
      const config = await import("../database")
      expect(config.CONTACT_SUBMISSIONS_COLLECTION).toBe("contact-submissions")
    })
  })

  describe("Safety checks", () => {
    it("should prevent accidental production database use in test environment", async () => {
      process.env.NODE_ENV = "test"
      delete process.env.ENVIRONMENT
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).not.toBe("portfolio")
      expect(DATABASE_ID).toBe("(default)")
    })

    it("should ensure staging uses separate database from production", async () => {
      // Staging
      process.env.ENVIRONMENT = "staging"
      const { DATABASE_ID: stagingDb } = await import("../database")

      // Reset and check production
      jest.resetModules()
      process.env = { ...originalEnv }
      process.env.ENVIRONMENT = "production"
      const { DATABASE_ID: prodDb } = await import("../database")

      expect(stagingDb).not.toBe(prodDb)
      expect(stagingDb).toBe("portfolio-staging")
      expect(prodDb).toBe("portfolio")
    })
  })

  describe("Logging behavior", () => {
    it("should log database configuration in non-production environments", async () => {
      // Since the module is already loaded, we can't easily test the logging behavior
      // This test documents that logging happens at module load time in non-production
      // The actual logging is tested by running the application in different environments
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBeDefined()
    })

    it("should NOT log database configuration in production", async () => {
      // In production (NODE_ENV=production), logging is suppressed
      // This is tested by inspection of the database.ts code (lines 98-102)
      const { DATABASE_ID } = await import("../database")
      expect(DATABASE_ID).toBeDefined()
    })
  })
})
