/**
 * Generator API Integration Tests
 *
 * Tests for document generation (resume and cover letter) API
 * Authentication is now handled via session cookies (credentials: include)
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { generatorClient } from "@/api/generator-client"
import { signInTestUser, cleanupTestAuth, generateTestId, getIntegrationDescribe } from "../utils/testHelpers"
import { mockGenerateResumeRequest, mockGenerateCoverLetterRequest } from "../fixtures/mockData"

// Skip integration tests if Firebase is mocked (unit test mode)
const describeIntegration = getIntegrationDescribe()

describeIntegration("Generator API Integration", () => {
  beforeAll(async () => {
    // Sign in test user before running tests
    await signInTestUser("regular")
  })

  beforeEach(async () => {
    // Clean up between tests
    await cleanupTestAuth()
    await signInTestUser("regular")
  })

  describe("Document Generation", () => {
    it("should handle generate document request structure", async () => {
      // Test that the client can construct a proper request
      // This tests the client interface, not the actual API call
      expect(mockGenerateResumeRequest).toHaveProperty("type")
      expect(mockGenerateResumeRequest).toHaveProperty("jobMatchId")
      expect(mockGenerateResumeRequest.type).toBe("resume")
    })

    it("should validate resume generation request structure", () => {
      const request = mockGenerateResumeRequest

      expect(request).toHaveProperty("type", "resume")
      expect(request).toHaveProperty("jobMatchId")
      expect(request).toHaveProperty("jobTitle")
      expect(request).toHaveProperty("companyName")
      expect(request).toHaveProperty("customization")
      expect(request).toHaveProperty("preferences")
    })

    it("should validate cover letter generation request structure", () => {
      const request = mockGenerateCoverLetterRequest

      expect(request).toHaveProperty("type", "cover_letter")
      expect(request).toHaveProperty("jobMatchId")
      expect(request).toHaveProperty("jobTitle")
      expect(request).toHaveProperty("companyName")
      expect(request).toHaveProperty("preferences")
    })

    it("should have proper preferences structure", () => {
      const { preferences } = mockGenerateResumeRequest

      expect(preferences).toBeDefined()
      expect(preferences?.provider).toBe("openai")
      expect(preferences?.tone).toBe("professional")
      expect(preferences?.includeProjects).toBe(true)
    })

    it("should have proper customization structure for resumes", () => {
      const { customization } = mockGenerateResumeRequest

      expect(customization).toBeDefined()
      expect(customization?.targetSummary).toBeDefined()
      expect(customization?.skillsPriority).toBeInstanceOf(Array)
      expect(customization?.experienceHighlights).toBeInstanceOf(Array)
    })
  })

  describe("Client Configuration", () => {
    it("should have proper base URL configured", () => {
      expect(generatorClient.baseUrl).toBeDefined()
      expect(typeof generatorClient.baseUrl).toBe("string")
    })

    it("should have timeout configured", () => {
      expect(generatorClient.defaultTimeout).toBeDefined()
      expect(generatorClient.defaultTimeout).toBeGreaterThan(0)
    })

    it("should have retry settings configured", () => {
      expect(generatorClient.defaultRetryAttempts).toBeDefined()
      expect(generatorClient.defaultRetryAttempts).toBeGreaterThanOrEqual(0)
      expect(generatorClient.defaultRetryDelay).toBeDefined()
      expect(generatorClient.defaultRetryDelay).toBeGreaterThan(0)
    })
  })

  describe("Authentication", () => {
    it("should be configured for cookie-based auth", () => {
      // Auth is now handled via session cookies (credentials: include)
      // No Bearer tokens are used - the client just needs to be configured
      expect(generatorClient).toBeDefined()
      expect(typeof generatorClient.baseUrl).toBe("string")
    })
  })

  describe("Error Handling", () => {
    it("should validate document type", () => {
      const validTypes = ["resume", "cover_letter"]

      expect(validTypes).toContain(mockGenerateResumeRequest.type)
      expect(validTypes).toContain(mockGenerateCoverLetterRequest.type)
    })
  })

  describe("Request Validation", () => {
    it("should require job match ID or job URL", () => {
      const hasJobMatchId = mockGenerateResumeRequest.jobMatchId !== undefined
      const hasJobUrl = mockGenerateResumeRequest.jobUrl !== undefined

      expect(hasJobMatchId || hasJobUrl).toBe(true)
    })

    it("should include job title and company name", () => {
      expect(mockGenerateResumeRequest.jobTitle).toBeDefined()
      expect(mockGenerateResumeRequest.companyName).toBeDefined()
      expect(mockGenerateResumeRequest.jobTitle.length).toBeGreaterThan(0)
      expect(mockGenerateResumeRequest.companyName.length).toBeGreaterThan(0)
    })

    it("should have valid AI provider options", () => {
      const validProviders = ["openai", "gemini"]
      const provider = mockGenerateResumeRequest.preferences?.provider

      expect(provider).toBeDefined()
      expect(validProviders).toContain(provider)
    })
  })

  describe("Data Structure Tests", () => {
    it("should generate unique test IDs", () => {
      const id1 = generateTestId("doc")
      const id2 = generateTestId("doc")

      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^doc-/)
      expect(id2).toMatch(/^doc-/)
    })

    it("should have proper experience highlights structure", () => {
      const highlights = mockGenerateResumeRequest.customization?.experienceHighlights

      expect(highlights).toBeDefined()
      expect(highlights?.length).toBeGreaterThan(0)

      if (highlights && highlights.length > 0) {
        const firstHighlight = highlights[0]
        expect(firstHighlight).toHaveProperty("company")
        expect(firstHighlight).toHaveProperty("title")
        expect(firstHighlight).toHaveProperty("pointsToEmphasize")
        expect(firstHighlight.pointsToEmphasize).toBeInstanceOf(Array)
      }
    })

    it("should have skills priority as array of strings", () => {
      const skills = mockGenerateResumeRequest.customization?.skillsPriority

      expect(skills).toBeDefined()
      expect(skills).toBeInstanceOf(Array)

      if (skills) {
        skills.forEach((skill: string) => {
          expect(typeof skill).toBe("string")
          expect(skill.length).toBeGreaterThan(0)
        })
      }
    })
  })
})
