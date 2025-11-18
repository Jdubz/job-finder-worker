import path from "path"
import { fileURLToPath } from "url"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Safe Vitest Configuration - job-finder-FE
 *
 * Prevents test explosions through strict file inclusion and process limits.
 */

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    conditions: ['development', 'browser'],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],

    // Include test files from source directory and tests directory
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "src/__tests__/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
    ],

    // Exclude everything else to prevent explosions
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.{git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
    ],

    // Force sequential execution to prevent memory issues
    pool: "forks", // Use forks for better isolation
    poolOptions: {
      forks: {
        maxForks: 1, // Only one process at a time
        minForks: 1,
      },
    },

    // Disable all parallelism
    fileParallelism: false,
    sequence: {
      concurrent: false, // Force sequential execution
    },

    // Test timeout configuration
    testTimeout: 30000,
    hookTimeout: 30000,

    // Memory optimization settings
    isolate: false, // Disable isolation to reduce memory overhead
    passWithNoTests: true, // Don't fail if no tests are found
    
    // Reduce memory usage by limiting concurrent operations
    maxConcurrency: 1,

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/tests/**",
        "**/__tests__/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/coverage/**",
        "**/setup.ts",
        "**/testHelpers.ts",
      ],
      include: [
        "src/**/*.{ts,tsx}",
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
})
