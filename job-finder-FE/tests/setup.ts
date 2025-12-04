/**
 * Integration Test Setup
 *
 * Configuration and setup for integration tests
 *
 * Integration suite bootstrapping for GIS + Node API flows.
 * This file keeps the unit-test mocks defined in src/test/setup.ts disabled
 * so integration helpers can exercise the real modules.
 */

import { beforeAll, afterAll, afterEach, vi } from "vitest"
import { cleanupTestAuth } from "./utils/testHelpers"

/**
 * Global test setup
 */
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = "test"

  // Log test environment info
  console.log("🧪 Integration test environment initialized")
  console.log("📍 API Base URL:", process.env.VITE_API_BASE_URL || "Not configured")
  console.log("🔑 GIS Client ID:", process.env.VITE_GOOGLE_OAUTH_CLIENT_ID || "Not configured")
  console.log("🛡️  Auth bypass token:", process.env.VITE_E2E_AUTH_TOKEN ? "present" : "missing")
  console.log("")
  console.log("⚙️  NOTE: Integration tests rely on GIS bypass tokens and the Node API mock fetch layer.")
  console.log("")
})

/**
 * Cleanup after each test
 */
afterEach(async () => {
  // Clean up authentication
  await cleanupTestAuth().catch(() => {
    // Ignore cleanup errors in test environment
  })
})

/**
 * Global test teardown
 */
afterAll(async () => {
  console.log("🧹 Integration test cleanup complete")
})
