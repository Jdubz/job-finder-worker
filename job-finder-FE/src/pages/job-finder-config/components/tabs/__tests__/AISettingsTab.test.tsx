/**
 * AISettingsTab Component Tests
 *
 * Focuses on rendering and primary interactions after the tiered AI settings schema update.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AISettingsTab } from "../AISettingsTab"
import type { AISettings } from "@shared/types"

// Mock TabsContent to render children directly
vi.mock("@/components/ui/tabs", () => ({
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("AISettingsTab", () => {
  const mockAISettings: AISettings = {
    worker: { selected: { provider: "codex", interface: "cli", model: "gpt-4o" } },
    documentGenerator: { selected: { provider: "openai", interface: "api", model: "gpt-4o" } },
    options: [
      {
        value: "codex",
        interfaces: [{ value: "cli", enabled: true, models: ["gpt-4o"] }],
      },
      {
        value: "openai",
        interfaces: [{ value: "api", enabled: true, models: ["gpt-4o"] }],
      },
      {
        value: "claude",
        interfaces: [{ value: "api", enabled: true, models: ["claude-sonnet-4-5-20250929"] }],
      },
    ],
  }

  const defaultProps = {
    isSaving: false,
    aiSettings: mockAISettings,
    setAISettings: vi.fn(),
    hasAIChanges: false,
    handleSaveAISettings: vi.fn(),
    resetAI: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders provider, interface, and model selectors for both worker and document generator", () => {
    render(<AISettingsTab {...defaultProps} />)

    expect(screen.getAllByLabelText("Provider")).toHaveLength(2)
    expect(screen.getAllByLabelText("Interface")).toHaveLength(2)
    expect(screen.getAllByLabelText("Model")).toHaveLength(2)
  })

  it("calls save and reset handlers", async () => {
    const user = userEvent.setup()
    const handleSaveAISettings = vi.fn()
    const resetAI = vi.fn()

    render(
      <AISettingsTab
        {...defaultProps}
        handleSaveAISettings={handleSaveAISettings}
        resetAI={resetAI}
        hasAIChanges={true}
      />
    )

    await user.click(screen.getByText(/Save Changes/i))
    await user.click(screen.getByText("Reset"))

    expect(handleSaveAISettings).toHaveBeenCalled()
    expect(resetAI).toHaveBeenCalled()
  })
})
