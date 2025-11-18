import path from "path"
import { fileURLToPath } from "url"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"
import { consoleLogger } from "./vite-plugin-console-logger"
import { jsonLogger } from "./vite-plugin-json-logger"
import { portChecker } from "./vite-plugin-port-checker"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths({
      projects: ["./tsconfig.json", "./tsconfig.app.json", "./tsconfig.vitest.json"],
    }),
    portChecker({
      port: 5173,
      projectName: "job-finder-FE"
    }),
    consoleLogger({
      backendUrl: "http://localhost:5000",
    }),
    jsonLogger({
      serviceName: "job-finder-frontend",
      logFile: path.resolve(__dirname, "./logs/frontend.log"),
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false, // Allow port switching as fallback
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Add content hash to filenames for cache-busting
        entryFileNames: `assets/[name].[hash].js`,
        chunkFileNames: `assets/[name].[hash].js`,
        assetFileNames: `assets/[name].[hash].[ext]`,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts", "./tests/setup.ts"],
    css: true,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/e2e/**", // Exclude E2E tests (run with Playwright)
      "**/.{idea,git,cache,output,temp}/**",
      "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/e2e/**",
        "**/*.config.*",
        "**/test/**",
        "**/tests/**",
        "**/__tests__/**",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
      ],
    },
  },
})
