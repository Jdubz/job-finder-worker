import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle2, Circle, Loader2, XCircle, FileText } from "lucide-react"
import { Progress } from "@/components/ui/progress"

export interface GenerationStep {
  id: string
  name: string
  description: string
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
  startedAt?: Date
  completedAt?: Date
  duration?: number // milliseconds
  result?: {
    resumeUrl?: string
    coverLetterUrl?: string
    [key: string]: unknown
  }
  error?: {
    message: string
    code?: string
  }
}

interface GenerationProgressProps {
  steps: GenerationStep[]
}

/**
 * Step descriptions for each state
 */
const STEP_INFO: Record<
  string,
  {
    pending: string
    inProgress: string
    completed: string
  }
> = {
  "collect-data": {
    pending: "Will gather your profile, experience, and skills",
    inProgress: "Loading your profile and work history...",
    completed: "Loaded profile, experience, and skills",
  },
  "generate-resume": {
    pending: "Will tailor resume content for this role",
    inProgress: "AI is analyzing the job and crafting your resume...",
    completed: "Created tailored resume content",
  },
  "generate-cover-letter": {
    pending: "Will write a personalized cover letter",
    inProgress: "AI is writing your cover letter...",
    completed: "Created personalized cover letter",
  },
  "render-pdf": {
    pending: "Will create downloadable PDF documents",
    inProgress: "Generating PDF documents...",
    completed: "PDF documents ready for download",
  },
}

const getStepDescription = (step: GenerationStep): string => {
  const info = STEP_INFO[step.id]
  if (!info) {
    // Fallback for unknown steps
    switch (step.status) {
      case "pending":
        return step.description
      case "in_progress":
        return `Processing ${step.name.toLowerCase()}...`
      case "completed":
        return `${step.name} complete`
      default:
        return step.description
    }
  }

  switch (step.status) {
    case "pending":
      return info.pending
    case "in_progress":
      return info.inProgress
    case "completed":
      return info.completed
    case "failed":
      return step.error?.message || "An error occurred"
    case "skipped":
      return "Skipped"
    default:
      return step.description
  }
}

/**
 * GenerationProgress - Comprehensive checklist UI for document generation
 *
 * Shows:
 * - Overall progress summary (X of N steps)
 * - Progress bar visualization
 * - Each step with name always visible
 * - Status-specific descriptions (what will happen / is happening / happened)
 */
export function GenerationProgress({ steps }: GenerationProgressProps) {
  const completedCount = steps.filter((s) => s.status === "completed").length
  const failedCount = steps.filter((s) => s.status === "failed").length
  const totalSteps = steps.length
  const progressPercent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0
  const currentStep = steps.find((s) => s.status === "in_progress")
  const isComplete = completedCount === totalSteps
  const hasFailed = failedCount > 0

  const getStepIcon = (status: GenerationStep["status"]) => {
    switch (status) {
      case "pending":
        return <Circle className="w-5 h-5 text-muted-foreground/50" data-testid="pending-icon" />
      case "in_progress":
        return (
          <Loader2 className="w-5 h-5 text-primary animate-spin" data-testid="spinner-icon" />
        )
      case "completed":
        return (
          <CheckCircle2
            className="w-5 h-5 text-green-600"
            data-testid="check-icon"
          />
        )
      case "failed":
        return (
          <XCircle className="w-5 h-5 text-destructive" data-testid="error-icon" />
        )
      case "skipped":
        return (
          <Circle
            className="w-5 h-5 text-muted-foreground/30 line-through"
            data-testid="skipped-icon"
          />
        )
      default:
        return null
    }
  }

  const getStepStyles = (status: GenerationStep["status"]) => {
    switch (status) {
      case "completed":
        return {
          name: "text-foreground font-medium",
          description: "text-green-600",
        }
      case "failed":
        return {
          name: "text-destructive font-medium",
          description: "text-destructive/80",
        }
      case "in_progress":
        return {
          name: "text-primary font-semibold",
          description: "text-primary/80",
        }
      case "pending":
      case "skipped":
      default:
        return {
          name: "text-muted-foreground",
          description: "text-muted-foreground/70",
        }
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">
            {hasFailed
              ? "Generation Failed"
              : isComplete
                ? "Generation Complete"
                : currentStep
                  ? `Step ${completedCount + 1} of ${totalSteps}`
                  : "Preparing..."}
          </CardTitle>
        </div>
        {/* Progress summary */}
        <div className="flex items-center gap-3 mt-2">
          <Progress value={progressPercent} className="flex-1 h-2" />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {completedCount}/{totalSteps} complete
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3" data-testid="generation-progress">
          {steps.map((step) => {
            const styles = getStepStyles(step.status)
            const description = getStepDescription(step)

            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 py-2 ${
                  step.status === "in_progress"
                    ? "bg-primary/5 -mx-3 px-3 rounded-md"
                    : ""
                }`}
                data-step-id={step.id}
              >
                {/* Icon */}
                <div className="pt-0.5 flex-shrink-0">{getStepIcon(step.status)}</div>

                {/* Step Info - Always show name + description */}
                <div className="flex-1 min-w-0">
                  {/* Step name - always visible */}
                  <span className={`text-sm ${styles.name}`}>{step.name}</span>
                  {/* Description - what will/is/did happen */}
                  <p className={`text-xs mt-0.5 ${styles.description}`}>{description}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary message */}
        {isComplete && !hasFailed && (
          <div className="mt-4 pt-3 border-t">
            <p className="text-sm text-green-600 font-medium">
              Your documents are ready for download
            </p>
          </div>
        )}
        {hasFailed && (
          <div className="mt-4 pt-3 border-t">
            <p className="text-sm text-destructive">
              Generation encountered an error. Please try again.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
