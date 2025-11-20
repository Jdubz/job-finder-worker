/**
 * Test Setup Configuration
 *
 * Global test setup and configuration for unit tests
 */

import { vi, beforeEach, afterEach } from "vitest"

// MUST BE FIRST: Polyfill React.act before any other imports
// React 19 compatibility - @testing-library/react expects act from react-dom/test-utils
const actPolyfill = async (callback: () => void | Promise<void>) => {
  const result = callback()
  if (result && typeof result === "object" && "then" in result) {
    await result
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// Mock react-dom/test-utils BEFORE importing anything else
vi.mock("react-dom/test-utils", () => ({
  act: actPolyfill,
}))

// Now safe to import other modules
import "@testing-library/jest-dom"
import { setupTestCleanup, logMemoryUsage } from "./test-cleanup"

// Export act globally for React Testing Library (React 19 compatibility)
interface GlobalWithReactAct {
  IS_REACT_ACT_ENVIRONMENT: boolean
}

;(globalThis as unknown as GlobalWithReactAct).IS_REACT_ACT_ENVIRONMENT = true

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock window.open
Object.defineProperty(window, "open", {
  writable: true,
  value: vi.fn(),
})

// Mock window.confirm
Object.defineProperty(window, "confirm", {
  writable: true,
  value: vi.fn(),
})

// Mock window.alert
Object.defineProperty(window, "alert", {
  writable: true,
  value: vi.fn(),
})

// Mock fetch
global.fetch = vi.fn()

// Mock console methods to reduce noise in tests
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks()

  // Suppress console errors and warnings during tests
  console.error = vi.fn()
  console.warn = vi.fn()
})

afterEach(() => {
  // Restore console methods after each test
  console.error = originalConsoleError
  console.warn = originalConsoleWarn
})

// Mock environment variables
vi.mock("@/config/env", () => ({
  API_BASE_URL: "https://test-api.example.com",
  GOOGLE_OAUTH_CLIENT_ID: "test-client-id",
}))

// Mock Auth context hooks
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}))

// Mock API clients
vi.mock("@/api/generator-client", () => ({
  generatorClient: {
    generateDocument: vi.fn(),
    startGeneration: vi.fn(),
    executeStep: vi.fn(),
    getHistory: vi.fn(),
    getUserDefaults: vi.fn(),
    updateUserDefaults: vi.fn(),
    deleteDocument: vi.fn(),
  },
}))

vi.mock("@/api/job-matches-client", async () => {
  const actual = await vi.importActual<typeof import("@/api/job-matches-client")>("@/api/job-matches-client")
  return {
    ...actual,
    jobMatchesClient: {
      getMatches: vi.fn(),
      getMatch: vi.fn(),
      subscribeToMatches: vi.fn(() => vi.fn()),
      getMatchStats: vi.fn(),
    },
  }
})

// Mock React Router
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom")
  return {
    ...actual,
    useLocation: () => ({
      pathname: "/document-builder",
      search: "",
      hash: "",
      state: null,
    }),
    useNavigate: () => vi.fn(),
  }
})

// Mock date formatting
vi.mock("@/utils/date", () => ({
  formatDate: vi.fn((date: Date) => date.toLocaleDateString()),
  formatDateTime: vi.fn((date: Date) => date.toLocaleString()),
  formatRelativeTime: vi.fn((_date: Date) => "2 hours ago"),
}))

// Mock file download utilities
vi.mock("@/utils/download", () => ({
  downloadFile: vi.fn(),
  openInNewTab: vi.fn(),
}))

// Mock error handling utilities
vi.mock("@/utils/error", () => ({
  handleError: vi.fn(),
  logError: vi.fn(),
}))

// Mock analytics
vi.mock("@/utils/analytics", () => ({
  trackEvent: vi.fn(),
  trackPageView: vi.fn(),
}))

// Mock storage utilities
vi.mock("@/utils/storage", () => ({
  getFromStorage: vi.fn(),
  setInStorage: vi.fn(),
  removeFromStorage: vi.fn(),
}))

// Mock validation utilities
vi.mock("@/utils/validation", () => ({
  validateEmail: vi.fn((email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
  validateRequired: vi.fn((value: unknown) => value != null && value !== ""),
  validateUrl: vi.fn((url: string) => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }),
}))

// Mock API response utilities
vi.mock("@/utils/api", () => ({
  handleApiResponse: vi.fn(),
  handleApiError: vi.fn(),
  retryRequest: vi.fn(),
}))

// Mock UI utilities
vi.mock("@/utils/ui", () => ({
  showToast: vi.fn(),
  showModal: vi.fn(),
  hideModal: vi.fn(),
}))

// Mock constants
vi.mock("@/constants", () => ({
  DOCUMENT_TYPES: {
    RESUME: "resume",
    COVER_LETTER: "cover_letter",
    BOTH: "both",
  },
  GENERATION_STATUS: {
    PENDING: "pending",
    PROCESSING: "processing",
    COMPLETED: "completed",
    FAILED: "failed",
  },
}))

// Mock types
vi.mock("@/types/generator", () => ({
  GenerateDocumentRequest: {},
  GenerateDocumentResponse: {},
  StartGenerationResponse: {},
  ExecuteStepResponse: {},
  GenerationStep: {},
  UserDefaults: {},
}))

// Mock shared types
vi.mock("@shared/types", () => ({
  JobMatch: {},
  QueueItem: {},
  ContentItem: {},
  GeneratorRequest: {},
  GeneratorResponse: {},
}))

// Setup test cleanup and memory monitoring
setupTestCleanup()

// Log memory usage at start
logMemoryUsage("Test Setup Complete")

// Setup global test utilities
// Note: Global type declarations are handled by @testing-library/jest-dom

// Export test utilities
export const mockUser = {
  id: "test-user-123",
  uid: "test-user-123",
  email: "test@example.com",
  displayName: "Test User",
}

export const mockJobMatch = {
  id: "match-1",
  userId: "test-user-123",
  queueItemId: "queue-1",
  jobTitle: "Senior Software Engineer",
  companyName: "Tech Corp",
  location: "San Francisco, CA",
  salary: "$150,000 - $200,000",
  matchScore: 85,
  status: "new" as const,
  linkedInUrl: "https://linkedin.com/jobs/123",
  jobDescription: "We are looking for an experienced software engineer...",
  requirements: ["5+ years experience", "React", "TypeScript"],
  responsibilities: ["Build web applications", "Mentor team members"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  analyzed: true,
  aiMatchReasoning: "Strong technical match",
  recommendedSkills: ["React", "TypeScript", "Node.js"],
}

export const mockGenerationStep = {
  id: "fetch_data",
  name: "Fetch Data",
  description: "Loading your experience data",
  status: "completed" as const,
  startedAt: new Date(),
  completedAt: new Date(),
  duration: 1000,
}

export const mockDocumentHistoryItem = {
  id: "doc-1",
  type: "resume" as const,
  jobTitle: "Software Engineer",
  companyName: "Tech Corp",
  documentUrl: "https://storage.example.com/resume.pdf",
  createdAt: new Date(),
  status: "completed" as const,
  jobMatchId: "match-1",
}
