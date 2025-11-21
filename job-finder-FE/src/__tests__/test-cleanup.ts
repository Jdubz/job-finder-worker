/**
 * Test Cleanup Utilities
 *
 * Provides utilities to help manage memory and cleanup in tests
 */

import { afterEach, beforeEach } from "vitest"

/**
 * Global test cleanup to prevent memory leaks
 */
export function setupTestCleanup() {
  beforeEach(() => {
    // Clear any global state before each test
    if (typeof window !== "undefined") {
      // Clear localStorage and sessionStorage
      localStorage.clear()
      sessionStorage.clear()
    }
  })

  afterEach(() => {
    // Cleanup after each test
    // Note: Vitest and jsdom handle timer cleanup automatically
    // Aggressive manual cleanup can cause hangs in CI environments

    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }
  })
}

/**
 * Memory monitoring utility
 */
export function logMemoryUsage(label: string = "Memory Usage") {
  if (typeof process !== "undefined" && process.memoryUsage) {
    const usage = process.memoryUsage()
    console.log(`${label}:`, {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
    })
  }
}

/**
 * Force garbage collection (if available)
 */
export function forceGC() {
  if (global.gc) {
    global.gc()
  }
}
