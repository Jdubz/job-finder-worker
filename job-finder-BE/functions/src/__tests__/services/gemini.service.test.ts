/**
 * Gemini Service Tests
 *
 * Tests for Gemini AI provider including:
 * - Resume generation
 * - Cover letter generation
 * - Token counting
 * - Error handling
 * - Mock mode functionality
 */

import { Timestamp } from "@google-cloud/firestore"
import { GeminiProvider } from "../../services/gemini.service"
import type {
  GenerateResumeOptions,
  GenerateCoverLetterOptions,
} from "../../types/generator.types"

describe("GeminiProvider", () => {
  let provider: GeminiProvider
  const mockLogger = {
    info: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Enable mock mode to avoid real API calls during tests
    process.env.GEMINI_MOCK_MODE = "true"
    provider = new GeminiProvider("test-api-key", mockLogger)
  })

  afterEach(() => {
    delete process.env.GEMINI_MOCK_MODE
  })

  describe("Constructor", () => {
    it("should initialize with correct model and provider type", () => {
      expect(provider.model).toBe("gemini-2.0-flash")
      expect(provider.providerType).toBe("gemini")
    })

    it("should have correct pricing information", () => {
      expect(provider.pricing.inputCostPer1M).toBe(0.1)
      expect(provider.pricing.outputCostPer1M).toBe(0.4)
    })

    it("should log warning when mock mode is enabled", () => {
      expect(mockLogger.warning).toHaveBeenCalledWith(
        expect.stringContaining("GEMINI MOCK MODE ENABLED"),
      )
    })
  })

  describe("generateResume", () => {
    const mockResumeOptions: GenerateResumeOptions = {
      job: {
        role: "Senior Software Engineer",
        company: "Tech Corp",
      },
      contentItems: [
        { 
          id: "sg1", 
          type: "skill-group",
          category: "Programming",
          skills: ["TypeScript", "React"],
          order: 1,
          parentId: null,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: "test@example.com",
          updatedBy: "test@example.com",
        },
        {
          id: "c1",
          type: "company",
          company: "Previous Corp",
          role: "Senior Developer",
          startDate: "2020-01",
          endDate: "2023-12",
          location: "San Francisco, CA",
          summary: "Led development team",
          accomplishments: ["Led team of 5 developers", "Improved performance by 40%"],
          technologies: ["React", "Node.js", "TypeScript"],
          parentId: null,
          order: 2,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: "test@example.com",
          updatedBy: "test@example.com",
        },
        {
          id: "p1",
          type: "project",
          name: "E-commerce Platform",
          description: "Built a scalable platform",
          technologies: ["React", "Node.js"],
          role: "Lead Developer",
          parentId: null,
          order: 3,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: "test@example.com",
          updatedBy: "test@example.com",
        },
      ],
      personalInfo: {
        name: "John Doe",
        email: "john@example.com",
        phone: "555-0100",
        location: "San Francisco, CA",
      },
    }

    it("should generate resume successfully in mock mode", async () => {
      const result = await provider.generateResume(mockResumeOptions)

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(result.content.personalInfo.name).toBe(mockResumeOptions.personalInfo.name)
      expect(result.content.personalInfo.contact?.email).toBe(mockResumeOptions.personalInfo.email)
      expect(result.tokenUsage).toBeDefined()
      expect(result.tokenUsage.totalTokens).toBeGreaterThan(0)
      expect(result.model).toContain("gemini-2.0-flash")
    })

    it("should include all skills in generated resume", async () => {
      const result = await provider.generateResume(mockResumeOptions)

      expect(result.content.skills).toBeDefined()
      expect(result.content.skills!.length).toBeGreaterThan(0)
      
      // Check that provided skills are included
      const allSkills = result.content.skills!.flatMap((s) => s.items)
      expect(allSkills).toContain("TypeScript")
      expect(allSkills).toContain("React")
    })

    it("should include experience sections in generated resume", async () => {
      const result = await provider.generateResume(mockResumeOptions)

      expect(result.content.experience).toBeDefined()
      expect(result.content.experience.length).toBeGreaterThan(0)
      expect(result.content.experience[0].company).toBeDefined()
    })

    it("should log generation start", async () => {
      await provider.generateResume(mockResumeOptions)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Generating"),
        expect.objectContaining({
          role: "Senior Software Engineer",
          company: "Tech Corp",
        }),
      )
    })

    it("should handle custom prompts", async () => {
      const optionsWithCustomPrompt: GenerateResumeOptions = {
        ...mockResumeOptions,
        customPrompts: {
          systemPrompt: "Custom system prompt",
          userPromptTemplate: "Generate resume for {role} at {company}",
        },
      }

      const result = await provider.generateResume(optionsWithCustomPrompt)

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
    })

    it("should include job match data when provided", async () => {
      const optionsWithJobMatch: GenerateResumeOptions = {
        ...mockResumeOptions,
        jobMatchData: {
          matchScore: 85,
          matchedSkills: ["TypeScript", "React"],
          missingSkills: ["Python"],
          keyStrengths: ["Strong frontend experience"],
        },
      }

      const result = await provider.generateResume(optionsWithJobMatch)

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
    })
  })

  describe("generateCoverLetter", () => {
    const mockCoverLetterOptions: GenerateCoverLetterOptions = {
      job: {
        role: "Senior Software Engineer",
        company: "Tech Corp",
        jobDescription: "We are looking for a senior engineer...",
      },
      contentItems: [
        { 
          id: "sg1", 
          type: "skill-group",
          category: "Programming",
          skills: ["TypeScript", "React"],
          order: 1,
          parentId: null,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: "test@example.com",
          updatedBy: "test@example.com",
        },
      ],
      personalInfo: {
        name: "John Doe",
        email: "john@example.com",
      },
    }

    it("should generate cover letter successfully in mock mode", async () => {
      const result = await provider.generateCoverLetter(mockCoverLetterOptions)

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(result.content.greeting).toBeDefined()
      expect(result.content.openingParagraph).toBeDefined()
      expect(result.content.bodyParagraphs).toBeDefined()
      expect(result.content.closingParagraph).toBeDefined()
      expect(result.content.signature).toBeDefined()
      expect(result.tokenUsage).toBeDefined()
      expect(result.model).toContain("gemini-2.0-flash")
    })

    it("should include personal info in cover letter", async () => {
      const result = await provider.generateCoverLetter(mockCoverLetterOptions)

      expect(result.content.greeting).toContain("Hiring Manager")
      expect(result.content.signature).toContain(mockCoverLetterOptions.personalInfo.name)
    })

    it("should reference job role and company", async () => {
      const result = await provider.generateCoverLetter(mockCoverLetterOptions)

      const fullLetter = `${result.content.openingParagraph} ${result.content.bodyParagraphs.join(" ")} ${result.content.closingParagraph}`
      
      expect(fullLetter).toContain("Senior Software Engineer")
      expect(fullLetter).toContain("Tech Corp")
    })

    it("should log generation start", async () => {
      await provider.generateCoverLetter(mockCoverLetterOptions)

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Generating"),
        expect.objectContaining({
          role: "Senior Software Engineer",
          company: "Tech Corp",
        }),
      )
    })
  })

  describe("Token Counting", () => {
    it("should estimate tokens for resume generation", async () => {
      const options: GenerateResumeOptions = {
        job: { role: "Developer", company: "Tech" },
        contentItems: [{ 
          id: "sg1", 
          type: "skill-group",
          category: "Programming",
          skills: ["JavaScript"],
          order: 1,
          parentId: null,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: "test@example.com",
          updatedBy: "test@example.com",
        }],
        personalInfo: {
          name: "Test User",
          email: "test@example.com",
        },
      }

      const result = await provider.generateResume(options)

      expect(result.tokenUsage.promptTokens).toBeGreaterThan(0)
      expect(result.tokenUsage.completionTokens).toBeGreaterThan(0)
      expect(result.tokenUsage.totalTokens).toBe(
        result.tokenUsage.promptTokens + result.tokenUsage.completionTokens,
      )
    })

    it("should estimate tokens for cover letter generation", async () => {
      const options: GenerateCoverLetterOptions = {
        job: { role: "Developer", company: "Tech" },
        contentItems: [],
        personalInfo: {
          name: "Test User",
          email: "test@example.com",
        },
      }

      const result = await provider.generateCoverLetter(options)

      expect(result.tokenUsage.promptTokens).toBeGreaterThan(0)
      expect(result.tokenUsage.completionTokens).toBeGreaterThan(0)
      expect(result.tokenUsage.totalTokens).toBeGreaterThan(0)
    })
  })

  describe("Error Handling", () => {
    it("should handle missing API key gracefully", () => {
      // This should not throw during construction
      expect(() => new GeminiProvider("", mockLogger)).not.toThrow()
    })

    it("should handle invalid resume options", async () => {
      const invalidOptions = {
        // Missing required fields
      } as unknown as GenerateResumeOptions

      // In mock mode, this should still work but with defaults
      const result = await provider.generateResume(invalidOptions)
      expect(result).toBeDefined()
    })

    it("should handle invalid cover letter options", async () => {
      const invalidOptions = {
        // Missing required fields
      } as unknown as GenerateCoverLetterOptions

      // In mock mode, this should still work but with defaults
      const result = await provider.generateCoverLetter(invalidOptions)
      expect(result).toBeDefined()
    })
  })

  describe("Resume Content Normalization", () => {
    it("should normalize resume content with all required fields", async () => {
      const options: GenerateResumeOptions = {
        job: { role: "Developer", company: "Tech" },
        contentItems: [{ 
          id: "sg1", 
          type: "skill-group",
          category: "Programming",
          skills: ["JavaScript"],
          order: 1,
          parentId: null,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          createdBy: "test@example.com",
          updatedBy: "test@example.com",
        }],
        personalInfo: {
          name: "Test User",
          email: "test@example.com",
          phone: "555-0100",
          location: "Test City",
        },
      }

      const result = await provider.generateResume(options)

      // Check all required resume fields are present
      expect(result.content.personalInfo).toBeDefined()
      expect(result.content.professionalSummary).toBeDefined()
      expect(result.content.skills).toBeDefined()
      expect(result.content.experience).toBeDefined()
    })

    it("should normalize personal info correctly", async () => {
      const options: GenerateResumeOptions = {
        job: { role: "Developer", company: "Tech" },
        contentItems: [],
        personalInfo: {
          name: "John Smith",
          email: "john.smith@example.com",
          phone: "+1-555-0123",
          location: "New York, NY",
          website: "https://johnsmith.dev",
          linkedin: "linkedin.com/in/johnsmith",
          github: "github.com/johnsmith",
        },
      }

      const result = await provider.generateResume(options)

      expect(result.content.personalInfo.name).toBe("John Smith")
      expect(result.content.personalInfo.contact.email).toBe("john.smith@example.com")
      expect(result.content.personalInfo.contact.location).toBe("New York, NY")
    })
  })

  describe("Cover Letter Content Normalization", () => {
    it("should normalize cover letter content with all required fields", async () => {
      const options: GenerateCoverLetterOptions = {
        job: { role: "Developer", company: "Tech Corp" },
        contentItems: [],
        personalInfo: {
          name: "Test User",
          email: "test@example.com",
        },
      }

      const result = await provider.generateCoverLetter(options)

      // Check all required cover letter fields are present
      expect(result.content.greeting).toBeDefined()
      expect(result.content.openingParagraph).toBeDefined()
      expect(result.content.bodyParagraphs).toBeDefined()
      expect(Array.isArray(result.content.bodyParagraphs)).toBe(true)
      expect(result.content.bodyParagraphs.length).toBeGreaterThan(0)
      expect(result.content.closingParagraph).toBeDefined()
      expect(result.content.signature).toBeDefined()
    })
  })

  describe("Mock Mode", () => {
    it("should use mock responses when GEMINI_MOCK_MODE is true", async () => {
      process.env.GEMINI_MOCK_MODE = "true"
      const mockProvider = new GeminiProvider("test-key", mockLogger)

      const options: GenerateResumeOptions = {
        job: { role: "Test Role", company: "Test Company" },
        contentItems: [],
        personalInfo: {
          name: "Mock User",
          email: "mock@example.com",
        },
      }

      const result = await mockProvider.generateResume(options)

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      // Mock responses should be fast
      expect(result.tokenUsage.totalTokens).toBeGreaterThan(0)
    })

    it("should work without API key in mock mode", async () => {
      process.env.GEMINI_MOCK_MODE = "true"
      const mockProvider = new GeminiProvider("", mockLogger)

      const options: GenerateResumeOptions = {
        job: { role: "Test", company: "Test" },
        contentItems: [],
        personalInfo: { name: "Test", email: "test@test.com" },
      }

      await expect(mockProvider.generateResume(options)).resolves.toBeDefined()
    })
  })
})
