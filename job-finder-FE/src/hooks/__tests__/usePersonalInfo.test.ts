import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { usePersonalInfo } from "../usePersonalInfo"
import { useAuth } from "@/contexts/AuthContext"
import { configClient } from "@/api"
import type { PersonalInfo } from "@shared/types"

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}))

vi.mock("@/api", () => ({
  configClient: {
    getPersonalInfo: vi.fn(),
    updatePersonalInfo: vi.fn(),
  },
}))

describe("usePersonalInfo", () => {
  const mockUser = { id: "user-1", uid: "user-1", email: "user@example.com" }
  const mockInfo: PersonalInfo = {
    name: "Test User",
    email: "user@example.com",
    phone: "123",
    location: "Earth",
    website: "https://example.com",
    github: "user",
    linkedin: "user",
    avatar: undefined,
    logo: undefined,
    accentColor: "#000000",
    applicationInfo: "Gender: Decline to self-identify",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(configClient.getPersonalInfo).mockResolvedValue(mockInfo)
  })

  it("loads personal info", async () => {
    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.personalInfo).toEqual(mockInfo)
  })

  it("handles missing auth", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.personalInfo).toBeNull()
  })

  it("updates personal info", async () => {
    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updatePersonalInfo({ name: "Updated" })
    })

    expect(configClient.updatePersonalInfo).toHaveBeenCalledWith({ name: "Updated" }, mockUser.email)
  })
})
