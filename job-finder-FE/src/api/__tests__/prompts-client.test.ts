import { describe, it, expect, vi, beforeEach } from "vitest"
import { PromptsClient } from "../prompts-client"
import type { PromptConfig } from "@shared/types"

const mockFetch = vi.fn()
global.fetch = mockFetch as any

// Test fixture for prompts
const testPrompts: PromptConfig = {
  resumeGeneration: "test resume prompt",
  coverLetterGeneration: "test cover letter prompt",
  jobScraping: "test job scraping prompt",
  jobMatching: "test job matching prompt",
}

describe("PromptsClient", () => {
  const baseUrl = "https://api.example.com"
  let client: PromptsClient

  beforeEach(() => {
    vi.resetAllMocks()
    client = new PromptsClient(baseUrl)
  })

  it("returns prompts from API", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { prompts: { ...testPrompts, resumeGeneration: "test" } } }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    const prompts = await client.getPrompts()

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/prompts`,
      expect.objectContaining({ method: "GET", credentials: "include" })
    )
    expect(prompts.resumeGeneration).toBe("test")
  })

  it("surfaces errors when request fails", async () => {
    mockFetch.mockRejectedValue(new Error("network"))

    await expect(client.getPrompts()).rejects.toThrow("network")
  })

  it("saves prompts via PUT", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { prompts: testPrompts } }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    await client.savePrompts(testPrompts, "user@example.com")

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/prompts`,
      expect.objectContaining({ method: "PUT", credentials: "include" })
    )
  })

  it("resets prompts via POST", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { prompts: testPrompts } }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    await client.resetToDefaults("user@example.com")

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/prompts/reset`,
      expect.objectContaining({ method: "POST", credentials: "include" })
    )
  })
})
