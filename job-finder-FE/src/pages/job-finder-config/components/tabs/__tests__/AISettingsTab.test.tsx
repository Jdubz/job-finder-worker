/**
 * AISettingsTab Component Tests
 *
 * Tests the new AgentManager-based AI settings UI with agents,
 * fallback chains, and budget management.
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

// Mock lucide-react icons
vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>()
  return {
    ...actual,
    X: () => <span data-testid="x-icon">X</span>,
    RotateCcw: () => <span data-testid="rotate-icon">↻</span>,
    AlertCircle: () => <span data-testid="alert-icon">!</span>,
  }
})

describe("AISettingsTab", () => {
  const mockAISettings: AISettings = {
    agents: {
      "gemini.cli": {
        provider: "gemini",
        interface: "cli",
        defaultModel: "gemini-2.0-flash",
        enabled: true,
        reason: null,
        dailyBudget: 100,
        dailyUsage: 25,
      },
      "codex.cli": {
        provider: "codex",
        interface: "cli",
        defaultModel: "gpt-4o",
        enabled: false,
        reason: "quota_exhausted: daily budget reached",
        dailyBudget: 50,
        dailyUsage: 50,
      },
    },
    taskFallbacks: {
      extraction: ["gemini.cli", "codex.cli"],
      analysis: ["codex.cli"],
    },
    modelRates: {
      "gpt-4o": 1.0,
      "gemini-2.0-flash": 0.3,
    },
    documentGenerator: {
      selected: { provider: "openai", interface: "api", model: "gpt-4o" },
    },
    options: [
      {
        value: "codex",
        interfaces: [{ value: "cli", enabled: true, models: ["gpt-4o"] }],
      },
      {
        value: "gemini",
        interfaces: [
          { value: "cli", enabled: true, models: ["gemini-2.0-flash"] },
          { value: "api", enabled: true, models: ["gemini-2.0-flash"] },
        ],
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

  it("renders agent configuration section", () => {
    render(<AISettingsTab {...defaultProps} />)

    expect(screen.getByText("AI Agent Configuration")).toBeInTheDocument()
    expect(screen.getByText("Configured Agents")).toBeInTheDocument()
  })

  it("displays configured agents with their status", () => {
    render(<AISettingsTab {...defaultProps} />)

    // Check for agent display (provider labels)
    expect(screen.getByText("Google Gemini (CLI (Command Line))")).toBeInTheDocument()
    expect(screen.getByText("Codex CLI (OpenAI Pro) (CLI (Command Line))")).toBeInTheDocument()

    // Check for quota exhausted badge
    expect(screen.getByText("Quota Exhausted")).toBeInTheDocument()
  })

  it("displays usage information for agents", () => {
    render(<AISettingsTab {...defaultProps} />)

    // Check for usage display
    expect(screen.getByText(/25 \/ 100/)).toBeInTheDocument() // gemini usage
    expect(screen.getByText(/50 \/ 50/)).toBeInTheDocument() // codex usage
  })

  it("renders fallback chain configuration", () => {
    render(<AISettingsTab {...defaultProps} />)

    expect(screen.getByText("Task Fallback Chains")).toBeInTheDocument()
    expect(screen.getByText("Data Extraction")).toBeInTheDocument()
    expect(screen.getByText("Analysis")).toBeInTheDocument()
  })

  it("renders document generator section", () => {
    render(<AISettingsTab {...defaultProps} />)

    expect(screen.getByText("Document Generator")).toBeInTheDocument()
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

  it("shows configuration missing message when aiSettings is null", () => {
    render(<AISettingsTab {...defaultProps} aiSettings={null} />)

    expect(screen.getByText("Configuration Missing")).toBeInTheDocument()
  })

  it("displays model selection dropdown for agents", () => {
    render(<AISettingsTab {...defaultProps} />)

    // Model label should be present
    expect(screen.getAllByText("Model:").length).toBeGreaterThan(0)
  })

  it("shows clear error button for agents with errors", () => {
    render(<AISettingsTab {...defaultProps} />)

    // The codex.cli agent has a quota_exhausted reason, so Clear button should appear
    expect(screen.getByText("Clear")).toBeInTheDocument()
  })

  it("shows reset usage button when usage > 0", () => {
    render(<AISettingsTab {...defaultProps} />)

    // Both agents have usage > 0, so reset buttons should be present
    const rotateIcons = screen.getAllByTestId("rotate-icon")
    expect(rotateIcons.length).toBeGreaterThan(0)
  })

  it("shows remove buttons on fallback chain agents", () => {
    render(<AISettingsTab {...defaultProps} />)

    // X icons should be present for removing agents from fallback chains
    const xIcons = screen.getAllByTestId("x-icon")
    expect(xIcons.length).toBeGreaterThan(0)
  })

  it("calls setAISettings when clearing agent error", async () => {
    const user = userEvent.setup()
    const setAISettings = vi.fn()

    render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

    const clearButton = screen.getByText("Clear")
    await user.click(clearButton)

    expect(setAISettings).toHaveBeenCalled()
  })
})
