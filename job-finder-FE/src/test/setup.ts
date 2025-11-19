import "@testing-library/jest-dom"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll, vi } from "vitest"

// Skip integration tests when Firebase is mocked
process.env.FIREBASE_MOCKED = "true"

// Mock environment variables for tests
beforeAll(() => {
  // Set test environment variables using Vitest's vi.stubEnv
  vi.stubEnv("VITE_FIREBASE_API_KEY", "test-api-key")
  vi.stubEnv("VITE_FIREBASE_AUTH_DOMAIN", "test-project.firebaseapp.com")
  vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "test-project")
  vi.stubEnv("VITE_FIREBASE_STORAGE_BUCKET", "test-project.appspot.com")
  vi.stubEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "123456789")
  vi.stubEnv("VITE_FIREBASE_APP_ID", "1:123456789:web:abcdef")
  vi.stubEnv("VITE_USE_EMULATORS", "false")
  vi.stubEnv("VITE_ENVIRONMENT", "test")
  vi.stubEnv("VITE_OWNER_EMAIL", "owner@test.dev")
  vi.stubEnv("VITE_AUTH_BYPASS", "false")
  vi.stubEnv("VITE_E2E_AUTH_TOKEN", "test-token")
})

// Mock Firebase modules to avoid initialization in tests
vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
}))

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({
    currentUser: null,
  })),
  connectAuthEmulator: vi.fn(),
  onAuthStateChanged: vi.fn(() => {
    // Return unsubscribe function
    return () => {}
  }),
  signInWithPopup: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  GoogleAuthProvider: vi.fn(),
}))


// Cleanup after each test
afterEach(() => {
  cleanup()
})
