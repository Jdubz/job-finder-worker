import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const sharedSrc = fileURLToPath(new URL('./shared/src', import.meta.url))
const feSrc = fileURLToPath(new URL('./job-finder-FE/src', import.meta.url))
const literal = (value: string) => JSON.stringify(value)

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 120000,
    hookTimeout: 60000,
    maxConcurrency: 1,
    globals: true,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1,
        minForks: 1,
      },
    },
    isolate: false,
    allowOnly: false,
  },
  resolve: {
    alias: {
      '@shared/types': path.join(sharedSrc, 'index.ts'),
      '@shared': sharedSrc,
      '@': feSrc,
    },
  },
  define: {
    'import.meta.env': {
      MODE: literal('test'),
      BASE_URL: literal(''),
      PROD: literal('false'),
      DEV: literal('true'),
      SSR: literal('false'),
      VITE_API_BASE_URL: 'globalThis.__E2E_API_BASE__ || "http://127.0.0.1:8080"',
      VITE_USE_EMULATORS: literal('false'),
      VITE_FUNCTIONS_BASE_URL: literal('http://localhost:4999'),
      VITE_FIREBASE_API_KEY: literal('test-api-key'),
      VITE_FIREBASE_AUTH_DOMAIN: literal('test.firebaseapp.com'),
      VITE_FIREBASE_PROJECT_ID: literal('test-project'),
      VITE_FIREBASE_APP_ID: literal('test-app-id'),
      VITE_FIREBASE_STORAGE_BUCKET: literal('test.appspot.com'),
      VITE_FIREBASE_MESSAGING_SENDER_ID: literal('1234567890'),
      VITE_FIREBASE_MEASUREMENT_ID: literal('G-TEST'),
      VITE_OWNER_EMAIL: literal('owner@jobfinder.dev'),
      VITE_AUTH_BYPASS: literal('true'),
      VITE_E2E_AUTH_TOKEN: literal('e2e-test-token'),
      VITE_RECAPTCHA_SITE_KEY: literal('test-recaptcha'),
    },
  },
})
