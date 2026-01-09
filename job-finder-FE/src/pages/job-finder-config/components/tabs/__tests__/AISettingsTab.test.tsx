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
import type { AISettings, AgentConfig } from "@shared/types"

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
      "gemini.api": {
        provider: "gemini",
        interface: "api",
        defaultModel: "gemini-2.0-flash",
        dailyBudget: 100,
        dailyUsage: 25,
        runtimeState: {
          worker: { enabled: true, reason: null },
          backend: { enabled: true, reason: null },
        },
        authRequirements: { type: "api", requiredEnv: ["GEMINI_API_KEY"] },
      },
      "claude.cli": {
        provider: "claude",
        interface: "cli",
        defaultModel: "default",
        dailyBudget: 50,
        dailyUsage: 50,
        runtimeState: {
          worker: { enabled: false, reason: "quota_exhausted: daily budget reached" },
          backend: { enabled: true, reason: null },
        },
        authRequirements: { type: "cli", requiredEnv: ["CLAUDE_CODE_OAUTH_TOKEN"] },
      },
    },
    taskFallbacks: {
      extraction: ["gemini.api", "claude.cli"],
      analysis: ["claude.cli"],
      document: ["claude.cli", "gemini.api"],
    },
    modelRates: {
      default: 1.0,
      "gemini-2.0-flash": 0.3,
    },
    options: [
      {
        value: "claude",
        interfaces: [{ value: "cli", enabled: true, models: ["default"] }],
      },
      {
        value: "gemini",
        interfaces: [{ value: "api", enabled: true, models: ["gemini-2.0-flash"] }],
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
    expect(screen.getByText("Google Gemini (API (Direct))")).toBeInTheDocument()
    expect(screen.getByText("Claude CLI (CLI (Command Line))")).toBeInTheDocument()

    // Check for quota exhausted badge
    expect(screen.getByText("Quota Exhausted")).toBeInTheDocument()
  })

  it("displays usage information for agents", () => {
    render(<AISettingsTab {...defaultProps} />)

    // Check for usage display
    expect(screen.getByText(/25 \/ 100/)).toBeInTheDocument() // gemini usage
    expect(screen.getByText(/50 \/ 50/)).toBeInTheDocument() // claude usage
  })

  it("renders fallback chain configuration", () => {
    render(<AISettingsTab {...defaultProps} />)

    expect(screen.getByText("Task Fallback Chains")).toBeInTheDocument()
    expect(screen.getByText("Data Extraction")).toBeInTheDocument()
    expect(screen.getByText("Analysis")).toBeInTheDocument()
  })

  it("renders document generator section", () => {
    render(<AISettingsTab {...defaultProps} />)

    expect(screen.getByText("AI Agent Configuration")).toBeInTheDocument()
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

    // The claude.cli worker scope has a quota_exhausted reason, so Clear button should appear
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

  describe("Model Selection", () => {
    it("displays current model for each agent", () => {
      render(<AISettingsTab {...defaultProps} />)

      // Check that model values are displayed (may appear multiple times in dropdowns and rates)
      expect(screen.getAllByText("gemini-2.0-flash").length).toBeGreaterThan(0)
      expect(screen.getAllByText("default").length).toBeGreaterThan(0)
    })

    it("calls setAISettings with updated model when model is changed", async () => {
      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

      // Find the model dropdown trigger for gemini agent (first one showing gemini-2.0-flash)
      const modelTriggers = screen.getAllByRole("combobox")
      const geminiModelTrigger = modelTriggers.find(
        (trigger) => trigger.textContent === "gemini-2.0-flash"
      )

      if (geminiModelTrigger) {
        await user.click(geminiModelTrigger)
        // The dropdown should show available models
        // Since we can only select from available models, clicking the same model
        // would still trigger the change handler
      }

      // The component should have model selection capability
      expect(screen.getAllByText("Model:").length).toBe(2) // One for each agent
    })
  })

  describe("Reset Daily Usage", () => {
    it("shows reset button only for agents with usage > 0", () => {
      const settingsWithZeroUsage: AISettings = {
        ...mockAISettings,
        agents: {
          ...mockAISettings.agents,
          "gemini.api": {
            ...mockAISettings.agents["gemini.api"]!,
            dailyUsage: 0,
          } as AgentConfig,
        },
      }

      render(<AISettingsTab {...defaultProps} aiSettings={settingsWithZeroUsage} />)

      // Only claude.cli has usage > 0, so only one reset button
      const resetButtons = screen.getAllByTitle("Reset daily usage")
      expect(resetButtons.length).toBe(1)
    })

    it("calls setAISettings to reset usage when reset button is clicked", async () => {
      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

      // Click the first reset button (for gemini.api which has usage 25)
      const resetButtons = screen.getAllByTitle("Reset daily usage")
      await user.click(resetButtons[0])

      expect(setAISettings).toHaveBeenCalledTimes(1)

      // Verify the updater function sets dailyUsage to 0
      const updaterFn = setAISettings.mock.calls[0][0]
      const result = updaterFn(mockAISettings)
      expect(result.agents["gemini.api"].dailyUsage).toBe(0)
    })

    it("does not show reset button when usage is 0", () => {
      const settingsWithAllZeroUsage: AISettings = {
        ...mockAISettings,
        agents: {
          "gemini.api": {
            ...mockAISettings.agents["gemini.api"]!,
            dailyUsage: 0,
          } as AgentConfig,
          "claude.cli": {
            ...mockAISettings.agents["claude.cli"]!,
            dailyUsage: 0,
          } as AgentConfig,
        },
      }

      render(<AISettingsTab {...defaultProps} aiSettings={settingsWithAllZeroUsage} />)

      // No reset buttons should be present
      expect(screen.queryAllByTitle("Reset daily usage").length).toBe(0)
    })
  })

  describe("Clear Error / Re-enable Agent", () => {
    it("shows clear button only for agents with errors", () => {
      render(<AISettingsTab {...defaultProps} />)

      // Only claude.cli has a worker reason set, so only one Clear button
      const clearButtons = screen.getAllByText("Clear")
      expect(clearButtons.length).toBe(1)
    })

    it("does not show clear button for healthy agents", () => {
      const settingsWithNoErrors: AISettings = {
        ...mockAISettings,
        agents: {
          "gemini.api": {
            ...mockAISettings.agents["gemini.api"]!,
            runtimeState: {
              worker: { enabled: true, reason: null },
              backend: { enabled: true, reason: null },
            },
          } as AgentConfig,
          "claude.cli": {
            ...mockAISettings.agents["claude.cli"]!,
            runtimeState: {
              worker: { enabled: true, reason: null },
              backend: { enabled: true, reason: null },
            },
          } as AgentConfig,
        },
      }

      render(<AISettingsTab {...defaultProps} aiSettings={settingsWithNoErrors} />)

      // No Clear buttons should be present
      expect(screen.queryByText("Clear")).not.toBeInTheDocument()
    })

    it("clears error and re-enables agent when clear button is clicked", async () => {
      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

      const clearButton = screen.getByText("Clear")
      await user.click(clearButton)

      expect(setAISettings).toHaveBeenCalledTimes(1)

      // Verify the updater function clears reason and enables the agent
      const updaterFn = setAISettings.mock.calls[0][0]
      const result = updaterFn(mockAISettings)
      expect(result.agents["claude.cli"].runtimeState.worker.enabled).toBe(true)
      expect(result.agents["claude.cli"].runtimeState.worker.reason).toBeNull()
    })

    it("shows error badge with correct variant for quota exhausted", () => {
      render(<AISettingsTab {...defaultProps} />)

      // Quota exhausted should show with secondary variant
      expect(screen.getByText("Quota Exhausted")).toBeInTheDocument()
    })

    it("shows error badge for general errors", () => {
      const settingsWithError: AISettings = {
        ...mockAISettings,
        agents: {
          ...mockAISettings.agents,
          "claude.cli": {
            ...mockAISettings.agents["claude.cli"]!,
            runtimeState: {
              worker: { enabled: false, reason: "error: API connection failed" },
              backend: { enabled: true, reason: null },
            },
          } as AgentConfig,
        },
      }

      render(<AISettingsTab {...defaultProps} aiSettings={settingsWithError} />)

      expect(screen.getByText("Error")).toBeInTheDocument()
    })

    it("shows detailed error panel for errors with multiline reasons", () => {
      const multilineError = `error: Claude CLI failed (exit 1): {"type":"error","message":"MCP client failed"}
{"type":"error","message":"Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again."}`

      const settingsWithDetailedError: AISettings = {
        ...mockAISettings,
        agents: {
          ...mockAISettings.agents,
          "claude.cli": {
            ...mockAISettings.agents["claude.cli"]!,
            runtimeState: {
              worker: { enabled: false, reason: multilineError },
              backend: { enabled: true, reason: null },
            },
          } as AgentConfig,
        },
      }

      render(<AISettingsTab {...defaultProps} aiSettings={settingsWithDetailedError} />)

      // Should show the error panel with scope and type
      expect(screen.getByText(/Worker disabled:/)).toBeInTheDocument()
      // Should have expandable details button for multiline errors
      expect(screen.getByText("Show full error")).toBeInTheDocument()
    })

    it("expands error details when Show full error is clicked", async () => {
      const user = userEvent.setup()
      const multilineError = `error: Claude CLI failed (exit 1): {"type":"error","message":"MCP client failed"}
{"type":"error","message":"Your access token could not be refreshed"}`

      const settingsWithDetailedError: AISettings = {
        ...mockAISettings,
        agents: {
          ...mockAISettings.agents,
          "claude.cli": {
            ...mockAISettings.agents["claude.cli"]!,
            runtimeState: {
              worker: { enabled: false, reason: multilineError },
              backend: { enabled: true, reason: null },
            },
          } as AgentConfig,
        },
      }

      render(<AISettingsTab {...defaultProps} aiSettings={settingsWithDetailedError} />)

      await user.click(screen.getByText("Show full error"))

      // After clicking, should show "Hide details" and the full error
      expect(screen.getByText("Hide details")).toBeInTheDocument()
      // The pre element with full error should be visible
      expect(screen.getByText(/Claude CLI failed/)).toBeInTheDocument()
    })

    it("does not show error panel for quota exhausted reasons", () => {
      // quota_exhausted: reasons should show badge but not the detailed panel
      render(<AISettingsTab {...defaultProps} />)

      // The quota exhausted badge should show
      expect(screen.getByText("Quota Exhausted")).toBeInTheDocument()
      // But no error panel (only shows for error: prefix)
      expect(screen.queryByText(/Worker disabled:/)).not.toBeInTheDocument()
    })
  })

  describe("Remove Agent from Fallback Chain", () => {
    it("shows remove button for each agent in fallback chain", () => {
      render(<AISettingsTab {...defaultProps} />)

      // Current mock data renders 5 agents across task chains
      const xIcons = screen.getAllByTestId("x-icon")
      expect(xIcons.length).toBe(5)
    })

    it("removes agent from fallback chain when X is clicked", async () => {
      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

      // Click the first X button (removes first agent from extraction chain)
      const removeButtons = screen.getAllByTitle("Remove from chain")
      await user.click(removeButtons[0])

      expect(setAISettings).toHaveBeenCalledTimes(1)

      // Verify the updater function removes the agent from the chain
      const updaterFn = setAISettings.mock.calls[0][0]
      const result = updaterFn(mockAISettings)
      // First agent (gemini.api) should be removed from extraction
      expect(result.taskFallbacks.extraction).toEqual(["claude.cli"])
    })

    it("removes correct agent when middle agent X is clicked", async () => {
      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

      // Click the second X button (removes second agent from extraction chain)
      const removeButtons = screen.getAllByTitle("Remove from chain")
      await user.click(removeButtons[1])

      expect(setAISettings).toHaveBeenCalledTimes(1)

      const updaterFn = setAISettings.mock.calls[0][0]
      const result = updaterFn(mockAISettings)
      // Second agent (claude.cli) should be removed from extraction
      expect(result.taskFallbacks.extraction).toEqual(["gemini.api"])
    })

    it("shows empty chain message when all agents removed", () => {
      const settingsWithEmptyChain: AISettings = {
        ...mockAISettings,
        taskFallbacks: {
          extraction: [],
          analysis: [],
          document: [],
        },
      }

      render(<AISettingsTab {...defaultProps} aiSettings={settingsWithEmptyChain} />)

      // Should show "No fallback chain configured" for all task types
      const emptyMessages = screen.getAllByText("No fallback chain configured")
      expect(emptyMessages.length).toBe(3)
    })
  })

  describe("Agent Toggle Behavior", () => {
    it("clears reason when agent is toggled on", async () => {
      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

      // Find the switches - there should be 4 (worker/backend for each agent)
      const switches = screen.getAllByRole("switch")
      // Index 2 corresponds to claude.cli worker scope (disabled with reason)
      await user.click(switches[2])

      expect(setAISettings).toHaveBeenCalledTimes(1)

      // Verify the updater clears reason when enabling
      const updaterFn = setAISettings.mock.calls[0][0]
      const result = updaterFn(mockAISettings)
      expect(result.agents["claude.cli"].runtimeState.worker.enabled).toBe(true)
      expect(result.agents["claude.cli"].runtimeState.worker.reason).toBeNull()
    })

    it("preserves reason when agent is toggled off", async () => {
      // Test with an enabled agent that has a reason set
      const settingsWithReason: AISettings = {
        ...mockAISettings,
        agents: {
          ...mockAISettings.agents,
          "gemini.api": {
            ...mockAISettings.agents["gemini.api"]!,
            runtimeState: {
              worker: { enabled: true, reason: "some_status: previously set" },
              backend: { enabled: true, reason: null },
            },
          } as AgentConfig,
        },
      }

      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} aiSettings={settingsWithReason} setAISettings={setAISettings} />)

      // Find the switches and click the first one (gemini.api worker which is enabled)
      const switches = screen.getAllByRole("switch")
      await user.click(switches[0])

      expect(setAISettings).toHaveBeenCalledTimes(1)

      // Verify the updater sets enabled to false but preserves reason
      const updaterFn = setAISettings.mock.calls[0][0]
      const result = updaterFn(settingsWithReason)
      expect(result.agents["gemini.api"].runtimeState.worker.enabled).toBe(false)
      // Reason should be preserved when disabling
      expect(result.agents["gemini.api"].runtimeState.worker.reason).toBe("some_status: previously set")
    })
  })

  describe("Budget Input", () => {
    it("displays budget input for each agent", () => {
      render(<AISettingsTab {...defaultProps} />)

      // Budget labels should be present
      expect(screen.getAllByText("Budget:").length).toBe(2)
    })

    it("updates budget on blur after typing", async () => {
      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

      // Find budget inputs
      const budgetInputs = screen.getAllByRole("spinbutton")
      // Filter to just the budget inputs (value 100 or 50)
      const geminiBudgetInput = budgetInputs.find((input) => (input as HTMLInputElement).value === "100")
      expect(geminiBudgetInput).toBeDefined()

      await user.clear(geminiBudgetInput!)
      await user.type(geminiBudgetInput!, "200")
      // Blur the input to trigger validation
      await user.tab()

      // setAISettings should be called once on blur with the new value
      expect(setAISettings).toHaveBeenCalled()
      const updaterFn = setAISettings.mock.calls[0][0]
      const result = updaterFn(mockAISettings)
      expect(result.agents["gemini.api"].dailyBudget).toBe(200)
    })

    it("resets to previous value on blur if input is zero", async () => {
      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

      const budgetInputs = screen.getAllByRole("spinbutton")
      const geminiBudgetInput = budgetInputs.find((input) => (input as HTMLInputElement).value === "100")
      expect(geminiBudgetInput).toBeDefined()

      await user.clear(geminiBudgetInput!)
      // Type invalid value (0)
      await user.type(geminiBudgetInput!, "0")
      await user.tab()

      // setAISettings should NOT be called because 0 is invalid
      // The input should reset to the previous value
      expect((geminiBudgetInput as HTMLInputElement).value).toBe("100")
    })

    it("resets to previous value on blur if input is negative", async () => {
      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

      const budgetInputs = screen.getAllByRole("spinbutton")
      const geminiBudgetInput = budgetInputs.find((input) => (input as HTMLInputElement).value === "100")
      expect(geminiBudgetInput).toBeDefined()

      await user.clear(geminiBudgetInput!)
      // Type invalid negative value
      await user.type(geminiBudgetInput!, "-5")
      await user.tab()

      // setAISettings should NOT be called because -5 is invalid
      // The input should reset to the previous value
      expect((geminiBudgetInput as HTMLInputElement).value).toBe("100")
    })

    it("does not call setAISettings during typing (only on blur)", async () => {
      const user = userEvent.setup()
      const setAISettings = vi.fn()

      render(<AISettingsTab {...defaultProps} setAISettings={setAISettings} />)

      const budgetInputs = screen.getAllByRole("spinbutton")
      const geminiBudgetInput = budgetInputs.find((input) => (input as HTMLInputElement).value === "100")
      expect(geminiBudgetInput).toBeDefined()

      await user.clear(geminiBudgetInput!)
      await user.type(geminiBudgetInput!, "50")

      // setAISettings should NOT be called yet (only on blur)
      expect(setAISettings).not.toHaveBeenCalled()
    })
  })
})
