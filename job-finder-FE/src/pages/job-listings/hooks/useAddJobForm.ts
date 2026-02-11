import { useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useQueueItems } from "@/hooks/useQueueItems"
import { logger } from "@/services/logging/FrontendLogger"
import type { SubmitJobRequest } from "@shared/types"

interface AddJobFormState {
  jobUrl: string
  jobTitle: string
  jobDescription: string
  jobLocation: string
  jobTechStack: string
  bypassFilter: boolean
  companyName: string
}

const INITIAL_STATE: AddJobFormState = {
  jobUrl: "",
  jobTitle: "",
  jobDescription: "",
  jobLocation: "",
  jobTechStack: "",
  bypassFilter: false,
  companyName: "",
}

interface UseAddJobFormResult {
  formState: AddJobFormState
  isSubmitting: boolean
  submitError: string | null
  isModalOpen: boolean
  setIsModalOpen: (open: boolean) => void
  setField: <K extends keyof AddJobFormState>(field: K, value: AddJobFormState[K]) => void
  resetForm: () => void
  handleSubmit: (e: React.FormEvent) => Promise<void>
}

/**
 * Hook for managing the Add Job form state and submission.
 */
export function useAddJobForm(): UseAddJobFormResult {
  const navigate = useNavigate()
  const { submitJob } = useQueueItems()

  const [formState, setFormState] = useState<AddJobFormState>(INITIAL_STATE)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const setField = useCallback(<K extends keyof AddJobFormState>(field: K, value: AddJobFormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }, [])

  const resetForm = useCallback(() => {
    setFormState(INITIAL_STATE)
    setSubmitError(null)
  }, [])

  const handleModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open) resetForm()
      setIsModalOpen(open)
    },
    [resetForm]
  )

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setSubmitError(null)

      // Validation
      if (!formState.jobUrl.trim()) {
        setSubmitError("Job URL is required")
        return
      }

      try {
        setIsSubmitting(true)
        const payload: SubmitJobRequest = {
          url: formState.jobUrl.trim(),
          companyName: formState.companyName.trim() || undefined,
          title: formState.jobTitle.trim() || undefined,
          description: formState.jobDescription.trim() || undefined,
          location: formState.jobLocation.trim() || undefined,
          techStack: formState.jobTechStack.trim() || undefined,
          bypassFilter: formState.bypassFilter,
        }
        await submitJob(payload)
        resetForm()
        setIsModalOpen(false)
        navigate("/queue-management")
      } catch (err) {
        logger.error("JobListings", "submitJob", "Failed to submit job", {
          error: { type: "SubmitError", message: err instanceof Error ? err.message : String(err) },
        })
        setSubmitError(err instanceof Error ? err.message : "Failed to submit. Please try again.")
      } finally {
        setIsSubmitting(false)
      }
    },
    [formState, submitJob, resetForm, navigate]
  )

  return {
    formState,
    isSubmitting,
    submitError,
    isModalOpen,
    setIsModalOpen: handleModalOpenChange,
    setField,
    resetForm,
    handleSubmit,
  }
}
