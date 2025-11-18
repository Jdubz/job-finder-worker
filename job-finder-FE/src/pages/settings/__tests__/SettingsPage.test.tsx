import { render, screen, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { BrowserRouter } from "react-router-dom"
import { SettingsPage } from "../SettingsPage"
import userEvent from "@testing-library/user-event"

// Mock Auth context
const mockUseAuth = vi.fn()
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}))

// Mock personal info hook
const mockUsePersonalInfo = vi.fn()
vi.mock("@/hooks/usePersonalInfo", () => ({
  usePersonalInfo: () => mockUsePersonalInfo(),
}))

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseAuth.mockReturnValue({
      user: {
        uid: "test-user-id",
        email: "test@example.com",
      },
      isEditor: true,
    })

    mockUsePersonalInfo.mockReturnValue({
      personalInfo: {
        id: "test-id",
        name: "John Doe",
        email: "john@example.com",
        phone: "123-456-7890",
        location: "New York, NY",
        linkedin: "https://linkedin.com/in/johndoe",
        github: "https://github.com/johndoe",
        website: "https://johndoe.com",
        accentColor: "#3b82f6",
      },
      loading: false,
      error: null,
      updatePersonalInfo: vi.fn(),
    })
  })

  const renderSettingsPage = () => {
    return render(
      <BrowserRouter>
        <SettingsPage />
      </BrowserRouter>
    )
  }

  it("should render settings page", () => {
    renderSettingsPage()

    expect(screen.getByText(/Settings/i)).toBeInTheDocument()
  })

  it("should display user profile section", () => {
    renderSettingsPage()

    expect(screen.getByText(/Profile Information/i)).toBeInTheDocument()
  })

  it("should show loading state", () => {
    mockUsePersonalInfo.mockReturnValue({
      personalInfo: null,
      loading: true,
      error: null,
      updatePersonalInfo: vi.fn(),
    })

    renderSettingsPage()

    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })

  it("should display personal info fields", () => {
    renderSettingsPage()

    expect(screen.getByLabelText(/Name/i)).toHaveValue("John Doe")
    expect(screen.getByLabelText(/Email/i)).toHaveValue("john@example.com")
    expect(screen.getByLabelText(/Phone/i)).toHaveValue("123-456-7890")
  })

  it("should allow editing fields", async () => {
    const user = userEvent.setup()
    renderSettingsPage()

    const nameInput = screen.getByLabelText(/Name/i)
    await user.clear(nameInput)
    await user.type(nameInput, "Jane Doe")

    expect(nameInput).toHaveValue("Jane Doe")
  })

  it("should show save button", () => {
    renderSettingsPage()

    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument()
  })

  it("should display editor badge for editor users", () => {
    renderSettingsPage()

    expect(screen.getByText(/Editor/i)).toBeInTheDocument()
  })

  it("should show error message when load fails", () => {
    mockUsePersonalInfo.mockReturnValue({
      personalInfo: null,
      loading: false,
      error: new Error("Failed to load settings"),
      updatePersonalInfo: vi.fn(),
    })

    renderSettingsPage()

    expect(screen.getByText(/Failed to load settings/i)).toBeInTheDocument()
  })

  it("should call updatePersonalInfo on save", async () => {
    const mockUpdate = vi.fn().mockResolvedValue({})
    mockUsePersonalInfo.mockReturnValue({
      personalInfo: {
        id: "test-id",
        name: "John Doe",
        email: "john@example.com",
      },
      loading: false,
      error: null,
      updatePersonalInfo: mockUpdate,
    })

    const user = userEvent.setup()
    renderSettingsPage()

    const nameInput = screen.getByLabelText(/Name/i)
    await user.clear(nameInput)
    await user.type(nameInput, "Jane Doe")

    const saveButton = screen.getByRole("button", { name: /Save/i })
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled()
    })
  })

  it("should show theme selection", () => {
    renderSettingsPage()

    expect(screen.getByText(/Theme/i)).toBeInTheDocument()
  })

  it("should display all social profile fields", () => {
    renderSettingsPage()

    expect(screen.getByLabelText(/LinkedIn/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/GitHub/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Website/i)).toBeInTheDocument()
  })

  it("should handle empty personal info gracefully", () => {
    mockUsePersonalInfo.mockReturnValue({
      personalInfo: null,
      loading: false,
      error: null,
      updatePersonalInfo: vi.fn(),
    })

    renderSettingsPage()

    expect(screen.getByLabelText(/Name/i)).toHaveValue("")
  })
})
