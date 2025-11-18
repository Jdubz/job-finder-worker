/**
 * Integration Test Setup
 *
 * Configuration and setup for integration tests
 *
 * NOTE: This setup file is for integration tests that need real Firebase
 * connections (or emulator). It does NOT mock Firebase like src/test/setup.ts does.
 */

import { beforeAll, afterAll, afterEach, vi } from "vitest"
import { cleanupTestAuth } from "./utils/testHelpers"

// Unmock Firebase for integration tests (override src/test/setup.ts mocks)
vi.unmock("firebase/app")
vi.unmock("firebase/auth")
vi.unmock("firebase/firestore")

/**
 * Global test setup
 */
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = "test"

  // Log test environment info
  console.log("🧪 Integration test environment initialized")
  console.log("📍 API Base URL:", process.env.VITE_API_BASE_URL || "Not configured")
  console.log("🔥 Firebase Project:", process.env.VITE_FIREBASE_PROJECT_ID || "Not configured")
  console.log("🔌 Use Emulators:", process.env.VITE_USE_EMULATORS || "false")
  console.log("")
  console.log("⚠️  NOTE: Integration tests require Firebase emulator or real Firebase project")
  console.log("⚠️  These tests are currently SKIPPED as they need backend setup")
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
