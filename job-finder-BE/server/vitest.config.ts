import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{git,cache,output,temp}/**',
    ],
    env: {
      DATABASE_PATH: 'file:memory:?cache=shared',
    },
    environment: 'node',
    setupFiles: ['tests/setup-env.ts'],
    allowOnly: false,
    maxConcurrency: 1,
    fileParallelism: false,
    isolate: true,
    sequence: {
      concurrent: false,
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    passWithNoTests: false,
  },
})
