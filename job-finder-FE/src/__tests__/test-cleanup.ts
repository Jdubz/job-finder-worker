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

      // Clear any global variables that might accumulate
      if (window.location) {
        window.location.href = "about:blank"
      }
    }
  })

  afterEach(() => {
    // Cleanup after each test
    if (typeof window !== "undefined") {
      // Clear timers
      const highestTimeoutId = setTimeout(() => {}, 0)
      for (let i = 0; i < Number(highestTimeoutId); i++) {
        clearTimeout(i)
        clearInterval(i)
      }

      // Clear any event listeners
      if (window.removeEventListener) {
        window.removeEventListener("beforeunload", () => {})
        window.removeEventListener("unload", () => {})
      }
    }

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
