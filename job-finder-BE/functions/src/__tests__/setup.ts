/**
 * Test Setup File
 * Runs before all test suites to configure the test environment
 */

// Note: Don't set FIRESTORE_EMULATOR_HOST or ENVIRONMENT here
// Tests that need them should set them explicitly
// This allows database config tests to work properly

// Global test timeout (can be overridden per test)
jest.setTimeout(10000)
