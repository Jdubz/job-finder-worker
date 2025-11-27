/**
 * JobMatchTab Component Tests
 *
 * Tests for the Job Match configuration tab component.
 * Verifies rendering, form interactions, and state management.
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { JobMatchTab } from "../JobMatchTab"
import type { JobMatchConfig } from "@shared/types"

// Mock TabsContent to render children directly
vi.mock("@/components/ui/tabs", () => ({
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe("JobMatchTab", () => {
  const mockJobMatch: JobMatchConfig = {
    minMatchScore: 70,
    portlandOfficeBonus: 15,
    userTimezone: -8,
    preferLargeCompanies: true,
    generateIntakeData: true,
  }

  const defaultProps = {
    isSaving: false,
    jobMatch: mockJobMatch,
    setJobMatch: vi.fn(),
    hasJobMatchChanges: false,
    handleSaveJobMatch: vi.fn(),
    handleResetJobMatch: vi.fn(),
  }

  describe("rendering", () => {
    it("should render the job match configuration card", () => {
      render(<JobMatchTab {...defaultProps} />)

      expect(screen.getByText("Job Match Configuration")).toBeInTheDocument()
      expect(
        screen.getByText("Configure job matching thresholds and scoring preferences")
      ).toBeInTheDocument()
    })

    it("should render all configuration fields", () => {
      render(<JobMatchTab {...defaultProps} />)

      expect(screen.getByLabelText("Minimum Match Score")).toBeInTheDocument()
      expect(screen.getByLabelText("Generate Intake Data")).toBeInTheDocument()
      expect(screen.getByLabelText("Portland Office Bonus")).toBeInTheDocument()
      expect(screen.getByLabelText("User Timezone Offset")).toBeInTheDocument()
      expect(screen.getByLabelText("Prefer Large Companies")).toBeInTheDocument()
      expect(screen.getByLabelText("Remote-first Bonus")).toBeInTheDocument()
      expect(screen.getByLabelText("AI/ML Focus Bonus")).toBeInTheDocument()
      expect(screen.getByLabelText("Large Company Bonus")).toBeInTheDocument()
      expect(screen.getByLabelText("Small Company Penalty")).toBeInTheDocument()
      expect(screen.getByLabelText("Timezone Bonus (same)")).toBeInTheDocument()
      expect(screen.getByLabelText("High Priority Threshold")).toBeInTheDocument()
      expect(screen.getByLabelText("Medium Priority Threshold")).toBeInTheDocument()
    })

    it("should display current values", () => {
      render(<JobMatchTab {...defaultProps} />)

      expect(screen.getByLabelText("Minimum Match Score")).toHaveValue(70)
      expect(screen.getByLabelText("Portland Office Bonus")).toHaveValue(15)
      expect(screen.getByLabelText("User Timezone Offset")).toHaveValue(-8)
    })

    it("should display help text for each field", () => {
      render(<JobMatchTab {...defaultProps} />)

      expect(
        screen.getByText("Minimum score required to create a job match (0-100)")
      ).toBeInTheDocument()
      expect(screen.getByText("Generate resume intake data for matches")).toBeInTheDocument()
      expect(screen.getByText("Bonus points for Portland office jobs")).toBeInTheDocument()
      expect(screen.getByText("Offset from UTC (e.g., -8 for PST)")).toBeInTheDocument()
      expect(screen.getByText("Apply scoring bonus for larger companies")).toBeInTheDocument()
    })
  })

  describe("form interactions", () => {
    it("should call setJobMatch when minMatchScore changes", async () => {
      const setJobMatch = vi.fn()
      render(<JobMatchTab {...defaultProps} setJobMatch={setJobMatch} />)

      const input = screen.getByLabelText("Minimum Match Score")
      fireEvent.change(input, { target: { value: "80" } })

      expect(setJobMatch).toHaveBeenCalled()
    })

    it("should call setJobMatch when portlandOfficeBonus changes", async () => {
      const setJobMatch = vi.fn()
      render(<JobMatchTab {...defaultProps} setJobMatch={setJobMatch} />)

      const input = screen.getByLabelText("Portland Office Bonus")
      fireEvent.change(input, { target: { value: "20" } })

      expect(setJobMatch).toHaveBeenCalled()
    })

    it("should call setJobMatch when userTimezone changes", async () => {
      const setJobMatch = vi.fn()
      render(<JobMatchTab {...defaultProps} setJobMatch={setJobMatch} />)

      const input = screen.getByLabelText("User Timezone Offset")
      fireEvent.change(input, { target: { value: "-5" } })

      expect(setJobMatch).toHaveBeenCalled()
    })

    it("should support decimal timezone values", () => {
      const jobMatch = { ...mockJobMatch, userTimezone: 5.5 }
      render(<JobMatchTab {...defaultProps} jobMatch={jobMatch} />)

      expect(screen.getByDisplayValue("5.5")).toBeInTheDocument()
    })
  })

  describe("save and reset", () => {
    it("should disable save button when no changes", () => {
      render(<JobMatchTab {...defaultProps} hasJobMatchChanges={false} />)

      const saveButton = screen.getAllByText("Save Changes")[0]
      expect(saveButton).toBeDisabled()
    })

    it("should enable save button when there are changes", () => {
      render(<JobMatchTab {...defaultProps} hasJobMatchChanges={true} />)

      const saveButton = screen.getAllByText("Save Changes")[0]
      expect(saveButton).not.toBeDisabled()
    })

    it("should disable save button while saving", () => {
      render(<JobMatchTab {...defaultProps} isSaving={true} hasJobMatchChanges={true} />)

      // Button text changes to Saving... when isSaving is true
      const savingButton = screen.getAllByText("Saving...")[0]
      expect(savingButton).toBeDisabled()
    })

    it("should call handleSaveJobMatch when save is clicked", async () => {
      const user = userEvent.setup()
      const handleSaveJobMatch = vi.fn()

      render(
        <JobMatchTab
          {...defaultProps}
          hasJobMatchChanges={true}
          handleSaveJobMatch={handleSaveJobMatch}
        />
      )

      const saveButton = screen.getAllByText("Save Changes")[0]
      await user.click(saveButton)

      expect(handleSaveJobMatch).toHaveBeenCalled()
    })

    it("should disable reset button when no changes", () => {
      render(<JobMatchTab {...defaultProps} hasJobMatchChanges={false} />)

      const resetButton = screen.getAllByText("Reset")[0]
      expect(resetButton).toBeDisabled()
    })

    it("should enable reset button when there are changes", () => {
      render(<JobMatchTab {...defaultProps} hasJobMatchChanges={true} />)

      const resetButton = screen.getAllByText("Reset")[0]
      expect(resetButton).not.toBeDisabled()
    })

    it("should call handleResetJobMatch when reset is clicked", async () => {
      const user = userEvent.setup()
      const handleResetJobMatch = vi.fn()

      render(
        <JobMatchTab
          {...defaultProps}
          hasJobMatchChanges={true}
          handleResetJobMatch={handleResetJobMatch}
        />
      )

      const resetButton = screen.getAllByText("Reset")[0]
      await user.click(resetButton)

      expect(handleResetJobMatch).toHaveBeenCalled()
    })
  })

  describe("null/undefined handling", () => {
    it("should handle null jobMatch with defaults", () => {
      render(<JobMatchTab {...defaultProps} jobMatch={null} />)

      // Should show default values
      expect(screen.getByLabelText("Minimum Match Score")).toHaveValue(70)
      expect(screen.getByLabelText("Portland Office Bonus")).toHaveValue(15)
      expect(screen.getByLabelText("User Timezone Offset")).toHaveValue(-8)
    })

    it("should not crash when setJobMatch is called with null jobMatch", () => {
      const setJobMatch = vi.fn()
      render(<JobMatchTab {...defaultProps} jobMatch={null} setJobMatch={setJobMatch} />)

      const input = screen.getByLabelText("Minimum Match Score")
      fireEvent.change(input, { target: { value: "80" } })

      // setJobMatch should be called but the updater should handle null gracefully
      expect(setJobMatch).toHaveBeenCalled()
    })
  })

  describe("select dropdowns", () => {
    it("should render generateIntakeData as a select dropdown", () => {
      render(<JobMatchTab {...defaultProps} />)

      // The label should be there
      expect(screen.getByLabelText("Generate Intake Data")).toBeInTheDocument()
    })

    it("should render preferLargeCompanies as a select dropdown", () => {
      render(<JobMatchTab {...defaultProps} />)

      expect(screen.getByLabelText("Prefer Large Companies")).toBeInTheDocument()
    })
  })

  describe("input constraints", () => {
    it("should have min/max on minMatchScore input", () => {
      render(<JobMatchTab {...defaultProps} />)

      const input = screen.getByLabelText("Minimum Match Score")
      expect(input).toHaveAttribute("min", "0")
      expect(input).toHaveAttribute("max", "100")
      expect(input).toHaveAttribute("type", "number")
    })

    it("should have step on userTimezone for half-hour increments", () => {
      render(<JobMatchTab {...defaultProps} />)

      const input = screen.getByLabelText("User Timezone Offset")
      expect(input).toHaveAttribute("step", "0.5")
      expect(input).toHaveAttribute("type", "number")
    })
  })
})
