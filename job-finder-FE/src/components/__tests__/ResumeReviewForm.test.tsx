import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { ResumeReviewForm } from "../ResumeReviewForm"
import type { ResumeContent, CoverLetterContent } from "@/api/generator-client"

describe("ResumeReviewForm", () => {
  const mockResumeContent: ResumeContent = {
    personalInfo: {
      name: "John Doe",
      title: "Software Engineer",
      summary: "Experienced developer",
      contact: {
        email: "john@example.com",
        location: "San Francisco, CA",
      },
    },
    professionalSummary: "A skilled software engineer with 10 years of experience.",
    experience: [
      {
        role: "Senior Developer",
        company: "Tech Corp",
        location: "San Francisco, CA",
        startDate: "2020-01",
        endDate: null,
        highlights: ["Led team of 5", "Built microservices"],
        technologies: ["React", "Node.js"],
      },
    ],
    skills: [
      {
        category: "Frontend",
        items: ["React", "TypeScript"],
      },
    ],
    education: [
      {
        institution: "University of Tech",
        degree: "BS Computer Science",
        field: "Computer Science",
      },
    ],
  }

  const mockCoverLetterContent: CoverLetterContent = {
    greeting: "Dear Hiring Manager,",
    openingParagraph: "I am writing to express my interest in the position.",
    bodyParagraphs: [
      "I have extensive experience in software development.",
      "My skills align well with your requirements.",
    ],
    closingParagraph: "Thank you for considering my application.",
    signature: "Best regards, John Doe",
  }

  describe("Resume Review", () => {
    it("renders resume content correctly", () => {
      const onSubmit = vi.fn()
      const onCancel = vi.fn()

      render(
        <ResumeReviewForm
          documentType="resume"
          content={mockResumeContent}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )

      expect(screen.getByText("Review Generated Resume")).toBeInTheDocument()
      expect(screen.getByText("Professional Summary")).toBeInTheDocument()
      expect(screen.getByText(mockResumeContent.professionalSummary)).toBeInTheDocument()
      expect(screen.getByText("Senior Developer")).toBeInTheDocument()
      expect(screen.getByText(/Tech Corp/)).toBeInTheDocument()
    })

    it("calls onSubmit when Approve & Continue is clicked", () => {
      const onSubmit = vi.fn()
      const onCancel = vi.fn()

      render(
        <ResumeReviewForm
          documentType="resume"
          content={mockResumeContent}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )

      fireEvent.click(screen.getAllByText("Approve & Continue")[0])
      expect(onSubmit).toHaveBeenCalledWith(mockResumeContent)
    })

    it("calls onCancel when Cancel is clicked", () => {
      const onSubmit = vi.fn()
      const onCancel = vi.fn()

      render(
        <ResumeReviewForm
          documentType="resume"
          content={mockResumeContent}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )

      fireEvent.click(screen.getAllByText("Cancel")[0])
      expect(onCancel).toHaveBeenCalled()
    })

    it("toggles edit mode when Edit Details is clicked", () => {
      const onSubmit = vi.fn()
      const onCancel = vi.fn()

      render(
        <ResumeReviewForm
          documentType="resume"
          content={mockResumeContent}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )

      expect(screen.getByText("Edit Details")).toBeInTheDocument()
      fireEvent.click(screen.getByText("Edit Details"))
      expect(screen.getByText("Done Editing")).toBeInTheDocument()
    })

    it("disables buttons when isSubmitting is true", () => {
      const onSubmit = vi.fn()
      const onCancel = vi.fn()

      render(
        <ResumeReviewForm
          documentType="resume"
          content={mockResumeContent}
          onSubmit={onSubmit}
          onCancel={onCancel}
          isSubmitting={true}
        />
      )

      const submitButtons = screen.getAllByText("Submitting...")
      expect(submitButtons[0]).toBeDisabled()
    })
  })

  describe("Cover Letter Review", () => {
    it("renders cover letter content correctly", () => {
      const onSubmit = vi.fn()
      const onCancel = vi.fn()

      render(
        <ResumeReviewForm
          documentType="coverLetter"
          content={mockCoverLetterContent}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )

      expect(screen.getByText("Review Generated Cover Letter")).toBeInTheDocument()
      expect(screen.getByText("Greeting")).toBeInTheDocument()
      expect(screen.getByText(mockCoverLetterContent.greeting)).toBeInTheDocument()
      expect(screen.getByText("Opening Paragraph")).toBeInTheDocument()
      expect(screen.getByText(mockCoverLetterContent.openingParagraph)).toBeInTheDocument()
      expect(screen.getByText("Signature")).toBeInTheDocument()
      expect(screen.getByText(mockCoverLetterContent.signature)).toBeInTheDocument()
    })

    it("calls onSubmit with cover letter content", () => {
      const onSubmit = vi.fn()
      const onCancel = vi.fn()

      render(
        <ResumeReviewForm
          documentType="coverLetter"
          content={mockCoverLetterContent}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )

      fireEvent.click(screen.getAllByText("Approve & Continue")[0])
      expect(onSubmit).toHaveBeenCalledWith(mockCoverLetterContent)
    })

    it("allows editing cover letter fields", () => {
      const onSubmit = vi.fn()
      const onCancel = vi.fn()

      render(
        <ResumeReviewForm
          documentType="coverLetter"
          content={mockCoverLetterContent}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )

      // Enter edit mode
      fireEvent.click(screen.getByText("Edit Details"))

      // Find the greeting input and change it
      const greetingInput = screen.getByDisplayValue(mockCoverLetterContent.greeting)
      fireEvent.change(greetingInput, { target: { value: "Hello Hiring Team," } })

      // Submit with edited content
      fireEvent.click(screen.getAllByText("Approve & Continue")[0])
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          greeting: "Hello Hiring Team,",
        })
      )
    })
  })
})
