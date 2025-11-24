import { describe, it, expect, vi, beforeEach } from "vitest"
import { PromptsClient } from "../prompts-client"
import { DEFAULT_PROMPTS } from "@shared/types"
import { getStoredAuthToken } from "@/lib/auth-storage"

vi.mock("@/lib/auth-storage", () => ({
  getStoredAuthToken: vi.fn(() => null),
  storeAuthToken: vi.fn(),
  clearStoredAuthToken: vi.fn(),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch as any

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
      json: async () => ({ success: true, data: { prompts: { ...DEFAULT_PROMPTS, resumeGeneration: "test" } } }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    const prompts = await client.getPrompts()

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/prompts`,
      expect.objectContaining({ method: "GET" })
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
      json: async () => ({ success: true, data: { prompts: DEFAULT_PROMPTS } }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    await client.savePrompts(DEFAULT_PROMPTS, "user@example.com")

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/prompts`,
      expect.objectContaining({ method: "PUT" })
    )
  })

  it("resets prompts via POST", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { prompts: DEFAULT_PROMPTS } }),
      headers: { get: () => "application/json" },
    } as unknown as Response)

    await client.resetToDefaults("user@example.com")

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl}/prompts/reset`,
      expect.objectContaining({ method: "POST" })
    )
  })
})
