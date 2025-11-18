/**
 * Test Utilities and Helpers
 * Common mocks, factories, and utilities for tests
 */

import type { Logger } from "../../types/logger.types"

/**
 * Create a mock logger for testing
 */
export function createMockLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  }
}

/**
 * Create a mock Firestore document reference
 */
export function createMockDocRef(id: string, data?: Record<string, unknown>) {
  return {
    id,
    get: jest.fn().mockResolvedValue({
      exists: !!data,
      id,
      data: () => data,
    }),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  }
}

/**
 * Create a mock Firestore collection reference
 */
export function createMockCollectionRef() {
  return {
    doc: jest.fn((id: string) => createMockDocRef(id)),
    add: jest.fn().mockResolvedValue(createMockDocRef("new-doc-id")),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({
      empty: true,
      size: 0,
      docs: [],
    }),
  }
}

/**
 * Create a mock Firestore instance
 */
export function createMockFirestore() {
  return {
    collection: jest.fn(() => createMockCollectionRef()),
  }
}

/**
 * Factory: Create test job queue item
 */
export function createTestQueueItem(overrides?: Record<string, unknown>) {
  return {
    id: "test-queue-id",
    type: "job",
    status: "pending",
    url: "https://example.com/job/123",
    company_name: "Test Company",
    submitted_at: new Date().toISOString(),
    submitted_by: "test-user-id",
    retry_count: 0,
    ...overrides,
  }
}

/**
 * Factory: Create test generation request
 */
export function createTestGenerationRequest(overrides?: Record<string, unknown>) {
  return {
    id: "test-request-id",
    status: "pending",
    generateType: "both",
    job: {
      role: "Software Engineer",
      company: "Test Company",
    },
    personalInfo: {
      name: "Test User",
      email: "test@example.com",
    },
    experienceData: {
      entries: [],
      blurbs: [],
    },
    createdAt: new Date(),
    ...overrides,
  }
}

/**
 * Factory: Create test content item
 */
export function createTestContentItem(overrides?: Record<string, unknown>) {
  return {
    id: "test-content-id",
    type: "company",
    company: "Test Company",
    role: "Software Engineer",
    startDate: "2020-01",
    order: 0,
    visibility: "published",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Factory: Create test authenticated request
 */
export function createMockAuthRequest(user?: Record<string, unknown>) {
  return {
    method: "POST",
    path: "/test",
    body: {},
    query: {},
    headers: {},
    user: user || {
      uid: "test-user-id",
      email: "test@example.com",
      role: "editor",
    },
  }
}

/**
 * Factory: Create test response object
 */
export function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  }
  return res
}

/**
 * Wait for a promise with timeout
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Suppress console output during tests
 */
export function suppressConsole() {
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  }

  beforeEach(() => {
    // eslint-disable-next-line no-console
    console.log = jest.fn()
     
    console.error = jest.fn()
     
    console.warn = jest.fn()
  })

  afterEach(() => {
    // eslint-disable-next-line no-console
    console.log = originalConsole.log
     
    console.error = originalConsole.error
     
    console.warn = originalConsole.warn
  })
}
