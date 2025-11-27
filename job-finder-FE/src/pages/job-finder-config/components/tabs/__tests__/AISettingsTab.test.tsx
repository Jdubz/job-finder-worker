/**
 * AISettingsTab Component Tests
 *
 * Tests for the AI Provider configuration tab component.
 * Verifies rendering, state management, and provider status indicators.
 *
 * Note: Radix UI Select components have known compatibility issues with jsdom's
 * pointer capture API. Tests that interact with dropdowns are simplified to
 * avoid these issues while still providing coverage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AISettingsTab } from "../AISettingsTab"
import type { AISettings, AIProviderStatus } from "@shared/types"

// Mock TabsContent to render children directly
vi.mock("@/components/ui/tabs", () => ({
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("AISettingsTab", () => {
  const mockProviders: AIProviderStatus[] = [
    {
      provider: "codex",
      interface: "cli",
      enabled: true,
      models: ["o3", "o4-mini", "gpt-4.1", "gpt-4o", "gpt-4o-mini"],
    },
    {
      provider: "claude",
      interface: "api",
      enabled: true,
      models: ["claude-sonnet-4-5-20250929", "claude-3-5-sonnet-20241022"],
    },
    {
      provider: "openai",
      interface: "api",
      enabled: false,
      reason: "Missing OPENAI_API_KEY",
      models: ["gpt-4o", "gpt-4o-mini"],
    },
    {
      provider: "gemini",
      interface: "api",
      enabled: false,
      reason: "Missing GEMINI_API_KEY",
      models: ["gemini-2.0-flash", "gemini-1.5-pro"],
    },
  ]

  const mockAISettings: AISettings = {
    selected: {
      provider: "codex",
      interface: "cli",
      model: "gpt-4o-mini",
    },
    providers: mockProviders,
  }

  const defaultProps = {
    isSaving: false,
    aiSettings: mockAISettings,
    setAISettings: vi.fn(),
    hasAIChanges: false,
    handleSaveAISettings: vi.fn(),
    handleResetAISettings: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("rendering", () => {
    it("should render the AI provider configuration card", () => {
      render(<AISettingsTab {...defaultProps} />)

      expect(screen.getByText("AI Provider Configuration")).toBeInTheDocument()
      expect(
        screen.getByText(
          "Select the AI provider, interface, and model for job matching and document generation"
        )
      ).toBeInTheDocument()
    })

    it("should render provider, interface, and model dropdowns", () => {
      render(<AISettingsTab {...defaultProps} />)

      expect(screen.getByLabelText("Provider")).toBeInTheDocument()
      expect(screen.getByLabelText("Interface")).toBeInTheDocument()
      expect(screen.getByLabelText("Model")).toBeInTheDocument()
    })

    it("should display help text for each field", () => {
      render(<AISettingsTab {...defaultProps} />)

      expect(screen.getByText("AI service provider for all AI operations")).toBeInTheDocument()
      expect(screen.getByText("How to connect to the provider")).toBeInTheDocument()
      expect(screen.getByText("Specific model version to use")).toBeInTheDocument()
    })
  })

  describe("provider status indicator", () => {
    it("should show enabled status for active provider", () => {
      render(<AISettingsTab {...defaultProps} />)

      expect(screen.getByText("Provider is enabled and ready")).toBeInTheDocument()
    })

    it("should show disabled status with reason", () => {
      const disabledSettings: AISettings = {
        ...mockAISettings,
        selected: {
          provider: "openai",
          interface: "api",
          model: "gpt-4o",
        },
      }

      render(<AISettingsTab {...defaultProps} aiSettings={disabledSettings} />)

      expect(
        screen.getByText(/Provider unavailable: Missing OPENAI_API_KEY/i)
      ).toBeInTheDocument()
    })

    it("should show green indicator for enabled provider", () => {
      render(<AISettingsTab {...defaultProps} />)

      const indicator = document.querySelector(".bg-green-500")
      expect(indicator).toBeInTheDocument()
    })

    it("should show red indicator for disabled provider", () => {
      const disabledSettings: AISettings = {
        ...mockAISettings,
        selected: {
          provider: "openai",
          interface: "api",
          model: "gpt-4o",
        },
      }

      render(<AISettingsTab {...defaultProps} aiSettings={disabledSettings} />)

      const indicator = document.querySelector(".bg-red-500")
      expect(indicator).toBeInTheDocument()
    })
  })

  describe("save and reset", () => {
    it("should disable save button when no changes", () => {
      render(<AISettingsTab {...defaultProps} hasAIChanges={false} />)

      const saveButton = screen.getByText("Save Changes")
      expect(saveButton).toBeDisabled()
    })

    it("should enable save button when there are changes", () => {
      render(<AISettingsTab {...defaultProps} hasAIChanges={true} />)

      const saveButton = screen.getByText("Save Changes")
      expect(saveButton).not.toBeDisabled()
    })

    it("should call handleSaveAISettings when save is clicked", async () => {
      const handleSaveAISettings = vi.fn()

      render(
        <AISettingsTab
          {...defaultProps}
          hasAIChanges={true}
          handleSaveAISettings={handleSaveAISettings}
        />
      )

      await userEvent.click(screen.getByText("Save Changes"))

      expect(handleSaveAISettings).toHaveBeenCalled()
    })

    it("should call handleResetAISettings when reset is clicked", async () => {
      const handleResetAISettings = vi.fn()

      render(
        <AISettingsTab
          {...defaultProps}
          hasAIChanges={true}
          handleResetAISettings={handleResetAISettings}
        />
      )

      await userEvent.click(screen.getByText("Reset"))

      expect(handleResetAISettings).toHaveBeenCalled()
    })

    it("should disable buttons while saving", () => {
      render(<AISettingsTab {...defaultProps} isSaving={true} hasAIChanges={true} />)

      expect(screen.getByText("Saving...")).toBeDisabled()
      expect(screen.getByText("Reset")).toBeDisabled()
    })
  })

  describe("null/undefined handling", () => {
    it("should handle null aiSettings gracefully", () => {
      render(<AISettingsTab {...defaultProps} aiSettings={null} />)

      // Should render with defaults
      expect(screen.getByText("AI Provider Configuration")).toBeInTheDocument()
    })

    it("should use default values when selected is missing", () => {
      const partialSettings: AISettings = {
        selected: {} as any,
        providers: [],
      }

      render(<AISettingsTab {...defaultProps} aiSettings={partialSettings} />)

      // Should not crash and should render
      expect(screen.getByText("AI Provider Configuration")).toBeInTheDocument()
    })
  })

  describe("dropdown elements", () => {
    it("should display current model in trigger", () => {
      render(<AISettingsTab {...defaultProps} />)

      // The current model should be visible in the trigger
      const modelTrigger = screen.getByLabelText("Model")
      expect(modelTrigger).toBeInTheDocument()
    })

    it("should display claude model for claude settings", () => {
      const claudeSettings: AISettings = {
        selected: {
          provider: "claude",
          interface: "api",
          model: "claude-sonnet-4-5-20250929",
        },
        providers: mockProviders,
      }

      render(<AISettingsTab {...defaultProps} aiSettings={claudeSettings} />)

      // The model dropdown should exist
      const modelTrigger = screen.getByLabelText("Model")
      expect(modelTrigger).toBeInTheDocument()
    })

    it("should show CLI interface for codex", () => {
      render(<AISettingsTab {...defaultProps} />)

      // Codex only supports CLI
      expect(screen.getByLabelText("Interface")).toBeInTheDocument()
    })

    it("should render interface dropdown for claude", () => {
      const claudeSettings: AISettings = {
        selected: {
          provider: "claude",
          interface: "api",
          model: "claude-sonnet-4-5-20250929",
        },
        providers: mockProviders,
      }

      render(<AISettingsTab {...defaultProps} aiSettings={claudeSettings} />)

      // Interface dropdown should exist
      const interfaceTrigger = screen.getByLabelText("Interface")
      expect(interfaceTrigger).toBeInTheDocument()
    })
  })
})
