/**
 * Tests for generation steps utilities
 */

import {
  createInitialSteps,
  startStep,
  completeStep,
  failStep,
} from "../generation-steps"

describe("generation-steps", () => {
  describe("createInitialSteps", () => {
    it("should create steps for resume generation", () => {
      const steps = createInitialSteps("resume")

      expect(steps).toHaveLength(4)
      expect(steps[0].id).toBe("fetch_data")
      expect(steps[1].id).toBe("generate_resume")
      expect(steps[2].id).toBe("create_resume_pdf")
      expect(steps[3].id).toBe("upload_documents")

      // All steps should start as pending
      steps.forEach((step) => {
        expect(step.status).toBe("pending")
      })
    })

    it("should create steps for cover letter generation", () => {
      const steps = createInitialSteps("coverLetter")

      expect(steps).toHaveLength(4)
      expect(steps[0].id).toBe("fetch_data")
      expect(steps[1].id).toBe("generate_cover_letter")
      expect(steps[2].id).toBe("create_cover_letter_pdf")
      expect(steps[3].id).toBe("upload_documents")

      steps.forEach((step) => {
        expect(step.status).toBe("pending")
      })
    })

    it("should create steps for both resume and cover letter", () => {
      const steps = createInitialSteps("both")

      expect(steps).toHaveLength(6)
      expect(steps[0].id).toBe("fetch_data")
      expect(steps[1].id).toBe("generate_resume")
      expect(steps[2].id).toBe("generate_cover_letter")
      expect(steps[3].id).toBe("create_resume_pdf")
      expect(steps[4].id).toBe("create_cover_letter_pdf")
      expect(steps[5].id).toBe("upload_documents")

      steps.forEach((step) => {
        expect(step.status).toBe("pending")
        expect(step).toHaveProperty("name")
        expect(step).toHaveProperty("description")
      })
    })

    it("should have proper names and descriptions", () => {
      const steps = createInitialSteps("resume")

      expect(steps[0].name).toBe("Fetch Experience Data")
      expect(steps[0].description).toContain("experience")

      expect(steps[1].name).toBe("Generate Resume Content")
      expect(steps[1].description).toContain("AI")
    })
  })

  describe("startStep", () => {
    it("should mark a pending step as in_progress", () => {
      const steps = createInitialSteps("resume")
      const updatedSteps = startStep(steps, "fetch_data")

      const fetchDataStep = updatedSteps.find((s) => s.id === "fetch_data")
      expect(fetchDataStep?.status).toBe("in_progress")
      expect(fetchDataStep?.startedAt).toBeDefined()
    })

    it("should not modify other steps", () => {
      const steps = createInitialSteps("resume")
      const updatedSteps = startStep(steps, "fetch_data")

      const otherSteps = updatedSteps.filter((s) => s.id !== "fetch_data")
      otherSteps.forEach((step) => {
        expect(step.status).toBe("pending")
      })
    })

    it("should handle non-existent step gracefully", () => {
      const steps = createInitialSteps("resume")
      const updatedSteps = startStep(steps, "non_existent_step")

      // Should return unchanged steps
      expect(updatedSteps).toEqual(steps)
    })
  })

  describe("completeStep", () => {
    it("should mark a step as completed", () => {
      let steps = createInitialSteps("resume")
      steps = startStep(steps, "fetch_data")
      steps = completeStep(steps, "fetch_data")

      const fetchDataStep = steps.find((s) => s.id === "fetch_data")
      expect(fetchDataStep?.status).toBe("completed")
      expect(fetchDataStep?.completedAt).toBeDefined()
    })

    it("should accept optional result data", () => {
      let steps = createInitialSteps("resume")
      steps = startStep(steps, "create_resume_pdf")
      steps = completeStep(steps, "create_resume_pdf", {
        resumeUrl: "https://example.com/resume.pdf",
      })

      const pdfStep = steps.find((s) => s.id === "create_resume_pdf")
      expect(pdfStep?.result).toEqual({
        resumeUrl: "https://example.com/resume.pdf",
      })
    })

    it("should handle non-existent step gracefully", () => {
      const steps = createInitialSteps("resume")
      const updatedSteps = completeStep(steps, "non_existent_step")

      // Should return unchanged steps
      expect(updatedSteps).toEqual(steps)
    })
  })

  describe("failStep", () => {
    it("should mark a step as failed with error message", () => {
      let steps = createInitialSteps("resume")
      steps = startStep(steps, "generate_resume")
      steps = failStep(steps, "generate_resume", {
        message: "AI generation failed",
        code: "AI_ERROR",
      })

      const generateStep = steps.find((s) => s.id === "generate_resume")
      expect(generateStep?.status).toBe("failed")
      expect(generateStep?.error).toEqual({
        message: "AI generation failed",
        code: "AI_ERROR",
      })
      expect(generateStep?.completedAt).toBeDefined()
    })

    it("should handle error without code", () => {
      let steps = createInitialSteps("resume")
      steps = startStep(steps, "generate_resume")
      steps = failStep(steps, "generate_resume", { message: "Something went wrong" })

      const generateStep = steps.find((s) => s.id === "generate_resume")
      expect(generateStep?.status).toBe("failed")
      expect(generateStep?.error).toEqual({ message: "Something went wrong" })
    })

    it("should handle non-existent step gracefully", () => {
      const steps = createInitialSteps("resume")
      const updatedSteps = failStep(steps, "non_existent_step", { message: "error" })

      // Should return unchanged steps
      expect(updatedSteps).toEqual(steps)
    })
  })

  describe("step flow", () => {
    it("should handle complete workflow", () => {
      // Start with initial steps
      let steps = createInitialSteps("resume")
      expect(steps[0].status).toBe("pending")

      // Start first step
      steps = startStep(steps, "fetch_data")
      expect(steps[0].status).toBe("in_progress")
      expect(steps[0].startedAt).toBeDefined()

      // Complete first step
      steps = completeStep(steps, "fetch_data")
      expect(steps[0].status).toBe("completed")
      expect(steps[0].completedAt).toBeDefined()

      // Start second step
      steps = startStep(steps, "generate_resume")
      expect(steps[1].status).toBe("in_progress")

      // Complete second step
      steps = completeStep(steps, "generate_resume")
      expect(steps[1].status).toBe("completed")
    })

    it("should handle failure in workflow", () => {
      let steps = createInitialSteps("resume")

      // Progress normally through first step
      steps = startStep(steps, "fetch_data")
      steps = completeStep(steps, "fetch_data")

      // Fail on second step
      steps = startStep(steps, "generate_resume")
      steps = failStep(steps, "generate_resume", { message: "API error" })

      expect(steps[0].status).toBe("completed")
      expect(steps[1].status).toBe("failed")
      expect(steps[1].error).toEqual({ message: "API error" })
      expect(steps[2].status).toBe("pending") // Remaining steps still pending
    })
  })
})
