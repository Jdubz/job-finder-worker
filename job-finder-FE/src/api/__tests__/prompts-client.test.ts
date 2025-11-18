/**
 * Prompts Client Tests
 *
 * Tests for AI prompts management including:
 * - Get and save prompt configurations
 * - Default prompts handling
 * - Prompt validation
 * - Variable extraction
 * - Reset to defaults
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { promptsClient, DEFAULT_PROMPTS } from "../prompts-client"

// Mock FirestoreService
vi.mock("@/services/firestore", () => ({
  firestoreService: {
    getDocument: vi.fn(),
    setDocument: vi.fn(),
  },
  convertTimestamps: vi.fn((data) => data),
}))

vi.mock("@/services/firestore/utils", () => ({
  createUpdateMetadata: (email: string) => ({
    updatedAt: new Date(),
    updatedBy: email,
  }),
}))

import { firestoreService } from "@/services/firestore"

describe("Prompts Client", () => {
  const mockUserEmail = "test@example.com"

  const mockPromptsData = {
    resumeGeneration: "Custom resume prompt with {{jobTitle}} and {{companyName}}",
    coverLetterGeneration: "Custom cover letter prompt with {{jobDescription}}",
    jobScraping: "Custom job scraping prompt with {{htmlContent}}",
    jobMatching: "Custom job matching prompt with {{userResume}} and {{userSkills}}",
    updatedAt: new Date(1705053600000),
    updatedBy: "admin@example.com",
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getPrompts", () => {
    it("should return custom prompts when they exist", async () => {
      vi.mocked(firestoreService.getDocument).mockResolvedValue(mockPromptsData as any)

      const prompts = await promptsClient.getPrompts()

      expect(prompts.resumeGeneration).toBe(mockPromptsData.resumeGeneration)
      expect(prompts.coverLetterGeneration).toBe(mockPromptsData.coverLetterGeneration)
      expect(prompts.jobScraping).toBe(mockPromptsData.jobScraping)
      expect(prompts.jobMatching).toBe(mockPromptsData.jobMatching)
    })

    it("should return default prompts when document doesn't exist", async () => {
      vi.mocked(firestoreService.getDocument).mockResolvedValue(null)

      const prompts = await promptsClient.getPrompts()

      expect(prompts).toEqual(DEFAULT_PROMPTS)
    })

    it("should return defaults on fetch errors without crashing UI", async () => {
      vi.mocked(firestoreService.getDocument).mockResolvedValue(null)

      // Should NOT throw - must return defaults to prevent UI crash
      const prompts = await promptsClient.getPrompts()

      expect(prompts).toEqual(DEFAULT_PROMPTS)
    })

    it("should return defaults on permission errors without crashing UI", async () => {
      vi.mocked(firestoreService.getDocument).mockResolvedValue(null)

      // Should NOT throw - must return defaults to prevent UI crash
      const prompts = await promptsClient.getPrompts()

      expect(prompts).toEqual(DEFAULT_PROMPTS)
    })
  })

  describe("savePrompts", () => {
    it("should save prompts with metadata", async () => {
      vi.mocked(firestoreService.setDocument).mockResolvedValue(undefined)

      const newPrompts = {
        resumeGeneration: "New resume prompt",
        coverLetterGeneration: "New cover letter prompt",
        jobScraping: "New scraping prompt",
        jobMatching: "New matching prompt",
      }

      await promptsClient.savePrompts(newPrompts, mockUserEmail)

      expect(firestoreService.setDocument).toHaveBeenCalledWith(
        "job-finder-config",
        "ai-prompts",
        expect.objectContaining({
          ...newPrompts,
          updatedAt: expect.any(Date),
          updatedBy: mockUserEmail,
        })
      )
    })

    it("should handle save errors", async () => {
      vi.mocked(firestoreService.setDocument).mockRejectedValue(new Error("Permission denied"))

      await expect(promptsClient.savePrompts(DEFAULT_PROMPTS, mockUserEmail)).rejects.toThrow(
        "Failed to save AI prompts"
      )
    })
  })

  describe("resetToDefaults", () => {
    it("should reset prompts to defaults", async () => {
      vi.mocked(firestoreService.setDocument).mockResolvedValue(undefined)

      await promptsClient.resetToDefaults(mockUserEmail)

      expect(firestoreService.setDocument).toHaveBeenCalledWith(
        "job-finder-config",
        "ai-prompts",
        expect.objectContaining({
          resumeGeneration: DEFAULT_PROMPTS.resumeGeneration,
          coverLetterGeneration: DEFAULT_PROMPTS.coverLetterGeneration,
          jobScraping: DEFAULT_PROMPTS.jobScraping,
          jobMatching: DEFAULT_PROMPTS.jobMatching,
        })
      )
    })

    it("should handle reset errors", async () => {
      vi.mocked(firestoreService.setDocument).mockRejectedValue(new Error("Database error"))

      await expect(promptsClient.resetToDefaults(mockUserEmail)).rejects.toThrow(
        "Failed to save AI prompts"
      )
    })
  })

  describe("validatePrompt", () => {
    it("should validate prompt with all required variables", () => {
      const prompt = "Generate resume for {{jobTitle}} at {{companyName}} using {{userSkills}}"
      const required = ["jobTitle", "companyName", "userSkills"]

      const result = promptsClient.validatePrompt(prompt, required)

      expect(result.valid).toBe(true)
      expect(result.missing).toEqual([])
    })

    it("should detect missing variables", () => {
      const prompt = "Generate resume for {{jobTitle}}"
      const required = ["jobTitle", "companyName", "userSkills"]

      const result = promptsClient.validatePrompt(prompt, required)

      expect(result.valid).toBe(false)
      expect(result.missing).toEqual(["companyName", "userSkills"])
    })

    it("should handle empty required variables list", () => {
      const prompt = "Simple prompt with no variables"
      const required: string[] = []

      const result = promptsClient.validatePrompt(prompt, required)

      expect(result.valid).toBe(true)
      expect(result.missing).toEqual([])
    })

    it("should handle prompt with no variables", () => {
      const prompt = "Simple prompt with no variables"
      const required = ["jobTitle"]

      const result = promptsClient.validatePrompt(prompt, required)

      expect(result.valid).toBe(false)
      expect(result.missing).toEqual(["jobTitle"])
    })

    it("should handle duplicate variables in prompt", () => {
      const prompt = "{{jobTitle}} for {{jobTitle}} at {{companyName}}"
      const required = ["jobTitle", "companyName"]

      const result = promptsClient.validatePrompt(prompt, required)

      expect(result.valid).toBe(true)
      expect(result.missing).toEqual([])
    })

    it("should validate default resume prompt", () => {
      const required = ["jobDescription", "jobTitle", "companyName", "userExperience", "userSkills"]

      const result = promptsClient.validatePrompt(DEFAULT_PROMPTS.resumeGeneration, required)

      expect(result.valid).toBe(true)
    })

    it("should validate default cover letter prompt", () => {
      const required = [
        "jobDescription",
        "jobTitle",
        "companyName",
        "userExperience",
        "matchReason",
      ]

      const result = promptsClient.validatePrompt(DEFAULT_PROMPTS.coverLetterGeneration, required)

      expect(result.valid).toBe(true)
    })

    it("should handle case-sensitive variable names", () => {
      const prompt = "{{JobTitle}} at {{companyName}}"
      const required = ["jobTitle", "companyName"]

      const result = promptsClient.validatePrompt(prompt, required)

      expect(result.valid).toBe(false)
      expect(result.missing).toEqual(["jobTitle"])
    })
  })

  describe("extractVariables", () => {
    it("should extract all variables from prompt", () => {
      const prompt = "Generate {{jobTitle}} resume for {{companyName}} with {{userSkills}}"

      const variables = promptsClient.extractVariables(prompt)

      expect(variables).toEqual(["jobTitle", "companyName", "userSkills"])
    })

    it("should handle prompt with no variables", () => {
      const prompt = "Simple prompt with no variables"

      const variables = promptsClient.extractVariables(prompt)

      expect(variables).toEqual([])
    })

    it("should deduplicate variables", () => {
      const prompt = "{{jobTitle}} for {{jobTitle}} at {{companyName}}"

      const variables = promptsClient.extractVariables(prompt)

      expect(variables).toEqual(["jobTitle", "companyName"])
    })

    it("should extract variables in order of appearance", () => {
      const prompt = "{{third}} {{first}} {{second}} {{first}}"

      const variables = promptsClient.extractVariables(prompt)

      expect(variables).toEqual(["third", "first", "second"])
    })

    it("should handle variables with underscores", () => {
      const prompt = "{{user_name}} and {{job_title}}"

      const variables = promptsClient.extractVariables(prompt)

      expect(variables).toEqual(["user_name", "job_title"])
    })

    it("should handle variables with numbers", () => {
      const prompt = "{{var1}} and {{var2}} and {{var3}}"

      const variables = promptsClient.extractVariables(prompt)

      expect(variables).toEqual(["var1", "var2", "var3"])
    })

    it("should extract from default resume prompt", () => {
      const variables = promptsClient.extractVariables(DEFAULT_PROMPTS.resumeGeneration)

      expect(variables).toContain("jobDescription")
      expect(variables).toContain("jobTitle")
      expect(variables).toContain("companyName")
      expect(variables).toContain("userExperience")
      expect(variables).toContain("userSkills")
      expect(variables).toContain("additionalInstructions")
    })

    it("should extract from default cover letter prompt", () => {
      const variables = promptsClient.extractVariables(DEFAULT_PROMPTS.coverLetterGeneration)

      expect(variables).toContain("jobDescription")
      expect(variables).toContain("jobTitle")
      expect(variables).toContain("companyName")
      expect(variables).toContain("userExperience")
      expect(variables).toContain("matchReason")
      expect(variables).toContain("additionalInstructions")
    })

    it("should handle empty prompt", () => {
      const variables = promptsClient.extractVariables("")

      expect(variables).toEqual([])
    })

    it("should ignore incomplete variable syntax", () => {
      const prompt = "{{valid}} {invalid} {{another}}"

      const variables = promptsClient.extractVariables(prompt)

      expect(variables).toEqual(["valid", "another"])
    })
  })

  describe("DEFAULT_PROMPTS", () => {
    it("should have all required prompt types", () => {
      expect(DEFAULT_PROMPTS.resumeGeneration).toBeTruthy()
      expect(DEFAULT_PROMPTS.coverLetterGeneration).toBeTruthy()
      expect(DEFAULT_PROMPTS.jobScraping).toBeTruthy()
      expect(DEFAULT_PROMPTS.jobMatching).toBeTruthy()
    })

    it("should have resume prompt with job variables", () => {
      expect(DEFAULT_PROMPTS.resumeGeneration).toContain("{{jobDescription}}")
      expect(DEFAULT_PROMPTS.resumeGeneration).toContain("{{jobTitle}}")
      expect(DEFAULT_PROMPTS.resumeGeneration).toContain("{{companyName}}")
    })

    it("should have resume prompt with user variables", () => {
      expect(DEFAULT_PROMPTS.resumeGeneration).toContain("{{userExperience}}")
      expect(DEFAULT_PROMPTS.resumeGeneration).toContain("{{userSkills}}")
    })

    it("should have cover letter prompt with relevant variables", () => {
      expect(DEFAULT_PROMPTS.coverLetterGeneration).toContain("{{jobDescription}}")
      expect(DEFAULT_PROMPTS.coverLetterGeneration).toContain("{{matchReason}}")
    })

    it("should have job scraping prompt with HTML variable", () => {
      expect(DEFAULT_PROMPTS.jobScraping).toContain("{{htmlContent}}")
    })

    it("should have job matching prompt with comparison variables", () => {
      expect(DEFAULT_PROMPTS.jobMatching).toContain("{{userResume}}")
      expect(DEFAULT_PROMPTS.jobMatching).toContain("{{userSkills}}")
    })
  })

  describe("Error Handling", () => {
    it("should return defaults when Firestore Service returns null", async () => {
      vi.mocked(firestoreService.getDocument).mockResolvedValue(null)

      const prompts = await promptsClient.getPrompts()

      expect(prompts).toEqual(DEFAULT_PROMPTS)
    })

    it("should handle incomplete data gracefully", async () => {
      // FirestoreService returns partial data
      vi.mocked(firestoreService.getDocument).mockResolvedValue({
        resumeGeneration: "test",
        // Missing other fields
      } as any)

      const prompts = await promptsClient.getPrompts()

      // Should still get the partial data (not defaults)
      expect(prompts.resumeGeneration).toBe("test")
    })
  })

  describe("Integration Scenarios", () => {
    it("should support save and load cycle", async () => {
      const customPrompts = {
        resumeGeneration: "Custom resume {{jobTitle}}",
        coverLetterGeneration: "Custom cover {{companyName}}",
        jobScraping: "Custom scraping {{htmlContent}}",
        jobMatching: "Custom matching {{userSkills}}",
      }

      vi.mocked(firestoreService.setDocument).mockResolvedValue(undefined)
      await promptsClient.savePrompts(customPrompts, mockUserEmail)

      // Mock successful load
      vi.mocked(firestoreService.getDocument).mockResolvedValue({
        ...customPrompts,
        updatedAt: new Date(),
        updatedBy: mockUserEmail,
      } as any)

      const loaded = await promptsClient.getPrompts()

      expect(loaded.resumeGeneration).toBe(customPrompts.resumeGeneration)
      expect(loaded.coverLetterGeneration).toBe(customPrompts.coverLetterGeneration)
      expect(loaded.jobScraping).toBe(customPrompts.jobScraping)
      expect(loaded.jobMatching).toBe(customPrompts.jobMatching)
      expect(loaded.updatedBy).toBe(mockUserEmail)
    })

    it("should validate after extraction", () => {
      const prompt = "{{jobTitle}} at {{companyName}}"
      const variables = promptsClient.extractVariables(prompt)
      const validation = promptsClient.validatePrompt(prompt, variables)

      expect(validation.valid).toBe(true)
      expect(validation.missing).toEqual([])
    })
  })
})
