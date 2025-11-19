import { describe, it, expect, vi, beforeEach } from "vitest"
import { PromptsClient } from "../prompts-client"
import { DEFAULT_PROMPTS } from "@shared/types"
import { auth } from "@/config/firebase"

declare global {
  // eslint-disable-next-line no-var
  var fetch: ReturnType<typeof vi.fn>
}

vi.mock("@/config/firebase", () => ({
  auth: { currentUser: null },
  appCheck: null,
}))

global.fetch = vi.fn()

describe("PromptsClient", () => {
  const baseUrl = "https://api.example.com"
  let client: PromptsClient

  beforeEach(() => {
    vi.resetAllMocks()
    client = new PromptsClient(baseUrl)
  })

  it("returns prompts from API", async () => {
    global.fetch.mockResolvedValue({
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

  it("falls back to defaults when request fails", async () => {
    global.fetch.mockRejectedValue(new Error("network"))

    const prompts = await client.getPrompts()

    expect(prompts).toEqual(DEFAULT_PROMPTS)
  })

  it("saves prompts via PUT", async () => {
    global.fetch.mockResolvedValue({
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
    global.fetch.mockResolvedValue({
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
