import { describe, it, expect, vi, beforeEach } from "vitest"
import { parseEmailBody, parseEmailBodyWithAiFallback, type ParsedEmailJob } from "../gmail-message-parser"

// Mock the logger to avoid console output in tests
vi.mock("../../../logger", () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }
}))

describe("gmail-message-parser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("parseEmailBody", () => {
    it("should extract job URL from email body", () => {
      const body = "Check out this job posting"
      const urls = ["https://boards.greenhouse.io/company/jobs/123"]

      const result = parseEmailBody(body, urls)

      expect(result).toHaveLength(1)
      expect(result[0].url).toBe("https://boards.greenhouse.io/company/jobs/123")
    })

    it("should extract title from Title: prefix", () => {
      const body = "Title: Senior Software Engineer\nCompany: Acme Corp"
      const urls = ["https://lever.co/job/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].title).toBe("Senior Software Engineer")
    })

    it("should extract title from Position: prefix", () => {
      const body = "Position: Frontend Developer\nLocation: Remote"
      const urls = ["https://lever.co/job/456"]

      const result = parseEmailBody(body, urls)

      expect(result[0].title).toBe("Frontend Developer")
    })

    it("should extract title from Role: prefix", () => {
      const body = "Role: Backend Engineer\nAt: StartupCo"
      const urls = ["https://jobs.ashbyhq.com/company/789"]

      const result = parseEmailBody(body, urls)

      expect(result[0].title).toBe("Backend Engineer")
    })

    it("should extract company from Company: prefix", () => {
      const body = "Title: Engineer\nCompany: TechCorp Inc."
      const urls = ["https://greenhouse.io/job/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].company).toBe("TechCorp Inc.")
    })

    it("should extract company from 'at CompanyName' pattern", () => {
      const body = "Senior Developer at Google"
      const urls = ["https://careers.google.com/jobs/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].company).toBe("Google")
    })

    it("should extract company from Employer: prefix", () => {
      const body = "Employer: Microsoft\nTitle: SDE"
      const urls = ["https://careers.microsoft.com/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].company).toBe("Microsoft")
    })

    it("should extract location from Location: prefix", () => {
      const body = "Title: Engineer\nLocation: San Francisco, CA"
      const urls = ["https://lever.co/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].location).toBe("San Francisco, CA")
    })

    it("should extract Remote as location", () => {
      const body = "Role: Developer\nRemote position available"
      const urls = ["https://lever.co/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].location).toBe("Remote")
    })

    it("should extract Hybrid location", () => {
      const body = "Title: Engineer\nHybrid - New York"
      const urls = ["https://lever.co/123"]

      const result = parseEmailBody(body, urls)

      // The pattern captures what comes after "Hybrid -"
      expect(result[0].location).toBe("New York")
    })

    it("should extract standalone Hybrid as location", () => {
      const body = "Title: Engineer\nThis is a Hybrid role in NYC"
      const urls = ["https://lever.co/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].location).toBe("Hybrid")
    })

    it("should handle multiple URLs", () => {
      const body = "Title: Engineer\nCompany: Acme"
      const urls = [
        "https://greenhouse.io/job/1",
        "https://lever.co/job/2",
        "https://ashbyhq.com/job/3"
      ]

      const result = parseEmailBody(body, urls)

      expect(result).toHaveLength(3)
      expect(result[0].url).toBe("https://greenhouse.io/job/1")
      expect(result[1].url).toBe("https://lever.co/job/2")
      expect(result[2].url).toBe("https://ashbyhq.com/job/3")
    })

    it("should truncate long descriptions to 6000 chars", () => {
      const body = "A".repeat(10000)
      const urls = ["https://lever.co/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].description?.length).toBe(6000)
    })

    it("should handle empty body gracefully", () => {
      const body = ""
      const urls = ["https://lever.co/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].title).toBeUndefined()
      expect(result[0].company).toBeUndefined()
      expect(result[0].description).toBe("")
    })

    it("should handle empty URLs array", () => {
      const body = "Title: Engineer"
      const urls: string[] = []

      const result = parseEmailBody(body, urls)

      expect(result).toHaveLength(0)
    })

    it("should sanitize extracted values (trim whitespace)", () => {
      const body = "Title:   Senior Engineer   \nCompany:   Acme Corp   "
      const urls = ["https://lever.co/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].title).toBe("Senior Engineer")
      expect(result[0].company).toBe("Acme Corp")
    })

    it("should handle hiring pattern for title", () => {
      const body = "We are hiring Backend Developer at TechCo"
      const urls = ["https://lever.co/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].title).toBe("Backend Developer")
    })

    it("should handle real-world email format", () => {
      const body = `
        New job alert from LinkedIn!

        Title: Staff Software Engineer
        Company: Netflix
        Location: Los Gatos, CA (Hybrid)

        Apply now: https://jobs.netflix.com/123
      `
      const urls = ["https://jobs.netflix.com/123"]

      const result = parseEmailBody(body, urls)

      expect(result[0].title).toBe("Staff Software Engineer")
      expect(result[0].company).toBe("Netflix")
      expect(result[0].location).toBe("Los Gatos, CA (Hybrid)")
    })
  })

  describe("parseEmailBodyWithAiFallback", () => {
    it("should return regex results when AI fallback is disabled", async () => {
      const body = "Title: Engineer\nCompany: Acme"
      const urls = ["https://lever.co/123"]

      const result = await parseEmailBodyWithAiFallback(body, urls, { aiFallbackEnabled: false })

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe("Engineer")
      expect(result[0].company).toBe("Acme")
    })

    it("should return regex results when AI fallback is not specified", async () => {
      const body = "Title: Engineer\nCompany: Acme"
      const urls = ["https://lever.co/123"]

      const result = await parseEmailBodyWithAiFallback(body, urls)

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe("Engineer")
    })

    it("should skip AI when regex successfully extracts all fields", async () => {
      const body = "Title: Engineer\nCompany: Acme\nLocation: Remote"
      const urls = ["https://lever.co/123"]

      const result = await parseEmailBodyWithAiFallback(body, urls, { aiFallbackEnabled: true })

      expect(result).toHaveLength(1)
      expect(result[0].title).toBe("Engineer")
      expect(result[0].company).toBe("Acme")
      // AI should not be called because regex succeeded
    })
  })
})
