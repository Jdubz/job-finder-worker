/**
 * Tests for usePersonalInfo Hook
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { usePersonalInfo } from "../usePersonalInfo"
import { useAuth } from "@/contexts/AuthContext"
import { useFirestore } from "@/contexts/FirestoreContext"
import type { PersonalInfo } from "@shared/types"

vi.mock("@/contexts/AuthContext")
vi.mock("@/contexts/FirestoreContext")

describe("usePersonalInfo", () => {
  const mockUser = {
    uid: "test-user-123",
    email: "test@example.com",
    displayName: "Test User",
  }

  const mockPersonalInfo: PersonalInfo = {
    name: "John Doe",
    email: "john@example.com",
    phone: "+1234567890",
    location: "San Francisco, CA",
    website: "https://johndoe.com",
    github: "johndoe",
    linkedin: "johndoe",
    avatar: "https://example.com/avatar.jpg",
    logo: "https://example.com/logo.png",
    accentColor: "#3b82f6",
  }

  const mockFirestoreService = {
    getDocument: vi.fn(),
    setDocument: vi.fn(),
    updateDocument: vi.fn(),
    createDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getDocuments: vi.fn(),
    subscribeToDocument: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
    } as any)

    vi.mocked(useFirestore).mockReturnValue({
      service: mockFirestoreService,
      subscribeToCollection: vi.fn(),
      subscribeToDocument: vi.fn(),
    } as any)
  })

  it("should load personal info on mount", async () => {
    mockFirestoreService.getDocument.mockResolvedValue({
      id: "personal-info",
      ...mockPersonalInfo,
    })

    const { result } = renderHook(() => usePersonalInfo())

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.personalInfo).toEqual({
      id: "personal-info",
      ...mockPersonalInfo,
    })
    expect(result.current.error).toBeNull()
    expect(mockFirestoreService.getDocument).toHaveBeenCalledWith(
      "job-finder-config",
      "personal-info"
    )
  })

  it("should handle loading error", async () => {
    const error = new Error("Failed to load")
    mockFirestoreService.getDocument.mockRejectedValue(error)

    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.personalInfo).toBeNull()
    expect(result.current.error).toEqual(error)
  })

  it("should handle no personal info", async () => {
    mockFirestoreService.getDocument.mockResolvedValue(null)

    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.personalInfo).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it("should not load when user is not authenticated", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      error: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
    } as any)

    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.personalInfo).toBeNull()
    expect(mockFirestoreService.getDocument).not.toHaveBeenCalled()
  })

  it("should create personal info when updating for first time", async () => {
    mockFirestoreService.getDocument.mockResolvedValue(null)
    mockFirestoreService.setDocument.mockResolvedValue(undefined)

    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const updates = {
      name: "New User",
      email: "new@example.com",
      phone: "+1234567890",
      location: "New York, NY",
    }

    await result.current.updatePersonalInfo(updates)

    expect(mockFirestoreService.setDocument).toHaveBeenCalledWith(
      "job-finder-config",
      "personal-info",
      expect.objectContaining({
        name: "New User",
        email: "new@example.com",
        phone: "+1234567890",
        location: "New York, NY",
        accentColor: "#3b82f6",
      })
    )
  })

  it("should update existing personal info", async () => {
    mockFirestoreService.getDocument.mockResolvedValue({
      id: "personal-info",
      ...mockPersonalInfo,
    })
    mockFirestoreService.updateDocument.mockResolvedValue(undefined)

    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => {
      expect(result.current.personalInfo).toBeTruthy()
    })

    const updates = { name: "Updated Name" }
    await result.current.updatePersonalInfo(updates)

    expect(mockFirestoreService.updateDocument).toHaveBeenCalledWith(
      "job-finder-config",
      "personal-info",
      updates
    )
  })

  it("should throw error when updating without authentication", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      loading: false,
      error: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
      sendPasswordResetEmail: vi.fn(),
    } as any)

    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await expect(result.current.updatePersonalInfo({ name: "Test" })).rejects.toThrow(
      "User must be authenticated"
    )
  })

  it("should handle update error", async () => {
    mockFirestoreService.getDocument.mockResolvedValue({
      id: "personal-info",
      ...mockPersonalInfo,
    })
    const error = new Error("Update failed")
    mockFirestoreService.updateDocument.mockRejectedValue(error)

    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => {
      expect(result.current.personalInfo).toBeTruthy()
    })

    await expect(result.current.updatePersonalInfo({ name: "Test" })).rejects.toThrow(
      "Update failed"
    )

    expect(result.current.error).toEqual(error)
  })

  it("should refetch personal info", async () => {
    mockFirestoreService.getDocument.mockResolvedValue({
      id: "personal-info",
      ...mockPersonalInfo,
    })

    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    mockFirestoreService.getDocument.mockClear()
    mockFirestoreService.getDocument.mockResolvedValue({
      id: "personal-info",
      ...mockPersonalInfo,
      name: "Updated Name",
    })

    await result.current.refetch()

    await waitFor(() => {
      expect(result.current.personalInfo?.name).toBe("Updated Name")
    })

    expect(mockFirestoreService.getDocument).toHaveBeenCalled()
  })

  it("should use user email as default when creating", async () => {
    mockFirestoreService.getDocument.mockResolvedValue(null)
    mockFirestoreService.setDocument.mockResolvedValue(undefined)

    const { result } = renderHook(() => usePersonalInfo())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await result.current.updatePersonalInfo({ name: "Test User" })

    expect(mockFirestoreService.setDocument).toHaveBeenCalledWith(
      "job-finder-config",
      "personal-info",
      expect.objectContaining({
        email: mockUser.email,
      })
    )
  })
})
