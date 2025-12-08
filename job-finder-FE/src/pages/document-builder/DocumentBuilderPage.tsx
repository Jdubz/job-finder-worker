import { useState, useEffect } from "react"
import { useLocation } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { jobMatchesClient } from "@/api/job-matches-client"
import { logger } from "@/services/logging/FrontendLogger"
import {
  generatorClient,
  type GenerateDocumentRequest,
  type GenerationStep,
} from "@/api/generator-client"
import { getAbsoluteArtifactUrl } from "@/config/api"
import type { JobMatch } from "@shared/types"
import { AuthModal } from "../../components/auth/AuthModal"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Loader2, Sparkles, Download } from "lucide-react"
import { GenerationProgress } from "@/components/GenerationProgress"
import { toast } from "@/components/toast"

// Step definitions matching backend generation-steps.ts
function getInitialSteps(generateType: "resume" | "coverLetter" | "both"): GenerationStep[] {
  const baseSteps: Record<string, GenerationStep[]> = {
    resume: [
      { id: "collect-data", name: "Collect Data", description: "Gathering your experience data", status: "pending" },
      { id: "generate-resume", name: "Generate Resume", description: "AI generating tailored resume", status: "pending" },
      { id: "render-pdf", name: "Render PDF", description: "Creating PDF document", status: "pending" },
    ],
    coverLetter: [
      { id: "collect-data", name: "Collect Data", description: "Gathering your experience data", status: "pending" },
      { id: "generate-cover-letter", name: "Generate Cover Letter", description: "AI generating cover letter", status: "pending" },
      { id: "render-pdf", name: "Render PDF", description: "Creating PDF document", status: "pending" },
    ],
    both: [
      { id: "collect-data", name: "Collect Data", description: "Gathering your experience data", status: "pending" },
      { id: "generate-resume", name: "Generate Resume", description: "AI generating tailored resume", status: "pending" },
      { id: "generate-cover-letter", name: "Generate Cover Letter", description: "AI generating cover letter", status: "pending" },
      { id: "render-pdf", name: "Render PDF", description: "Creating PDF documents", status: "pending" },
    ],
  }
  return baseSteps[generateType] || baseSteps.resume
}

/** Normalized job match data for display */
interface NormalizedJobMatch {
  id: string
  jobTitle: string
  companyName: string
  location: string
  jobDescription: string
  matchScore: number
  analyzedAt: Date | string
}

/** Type for objects that can be indexed by string keys */
type IndexableObject = { [key: string]: unknown }

/**
 * Helper function to normalize job match data from different sources.
 * Handles JobMatch, JobMatchWithListing, and raw API response shapes.
 */
function normalizeJobMatch(match: JobMatch | Record<string, unknown>): NormalizedJobMatch {
  // Use type guard for flexible property access (handles snake_case and nested data)
  const matchObj: IndexableObject =
    typeof match === "object" && match !== null ? (match as IndexableObject) : {}

  const asObj = (value: unknown): IndexableObject =>
    typeof value === "object" && value !== null ? (value as IndexableObject) : {}

  const listing = asObj(matchObj.listing)
  const company = asObj(matchObj.company)

  const getString = (obj: IndexableObject, keys: string[], fallback?: string): string => {
    for (const key of keys) {
      const value = obj[key]
      if (typeof value === "string" && value.trim().length > 0) return value
    }
    return fallback ?? ""
  }

  const getNumber = (obj: IndexableObject, keys: string[], fallback = 0): number => {
    for (const key of keys) {
      const value = obj[key]
      if (typeof value === "number") return value
    }
    return fallback
  }

  const getDate = (obj: IndexableObject, keys: string[]): Date | undefined => {
    for (const key of keys) {
      const value = obj[key]
      if (value instanceof Date) return value
      if (typeof value === "string" || typeof value === "number") {
        const d = new Date(value)
        if (!isNaN(d.getTime())) return d
      }
    }
    return undefined
  }

  const jobTitle =
    getString(matchObj, ["jobTitle", "job_title", "title"]) ||
    getString(listing, ["title"], "Unknown Title")

  const companyName =
    getString(matchObj, ["companyName", "company_name"]) ||
    getString(listing, ["companyName"]) ||
    getString(company, ["name"], "Unknown Company")

  const location = getString(matchObj, ["location"]) || getString(listing, ["location"], "Remote")

  const jobDescription =
    getString(matchObj, ["jobDescription", "job_description", "description"]) ||
    getString(listing, ["description"], "")

  const matchScore = getNumber(matchObj, ["matchScore", "match_score"]) ||
    getNumber(listing, ["matchScore"], 0)

  const analyzedAt =
    getDate(matchObj, ["analyzedAt", "analyzed_at"]) ??
    getDate(listing, ["analyzedAt"]) ??
    new Date()

  const idValue = match.id ?? (listing.id as string | number | undefined) ?? ""

  return {
    id: typeof idValue === "string" ? idValue : String(idValue),
    jobTitle,
    companyName,
    location,
    jobDescription,
    matchScore,
    analyzedAt,
  }
}

export function DocumentBuilderPage() {
  const { user } = useAuth()
  const location = useLocation()
  const [jobMatches, setJobMatches] = useState<JobMatch[]>([])
  const [selectedJobMatchId, setSelectedJobMatchId] = useState<string>("")
  const [documentType, setDocumentType] = useState<"resume" | "cover_letter" | "both">("resume")
  const [customJobTitle, setCustomJobTitle] = useState("")
  const [customCompanyName, setCustomCompanyName] = useState("")
  const [customJobDescription, setCustomJobDescription] = useState("")
  const [targetSummary, setTargetSummary] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadingMatches, setLoadingMatches] = useState(true)
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)

  // Multi-step generation state
  const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([])
  const [_generationRequestId, setGenerationRequestId] = useState<string | null>(null)
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [coverLetterUrl, setCoverLetterUrl] = useState<string | null>(null)

  // Set page title
  useEffect(() => {
    document.title = "Document Builder - Job Finder"
  }, [])

  // Load job matches
  useEffect(() => {
    if (!user) return

    const loadMatches = async () => {
      try {
        setLoadingMatches(true)
        const matches = await jobMatchesClient.listMatches({
          minScore: 70, // Only show good matches
          limit: 50,
          status: "active",
        })
        setJobMatches(matches)
      } catch (error) {
        logger.error("DocumentBuilder", "loadMatches", "Failed to load job matches", {
          error: { type: "FetchError", message: error instanceof Error ? error.message : String(error) },
        })
      } finally {
        setLoadingMatches(false)
      }
    }

    loadMatches()
  }, [user])

  // Pre-fill form if job match is passed via navigation state
  useEffect(() => {
    const state = location.state as {
      jobMatch?: JobMatch
      documentType?: "resume" | "cover_letter" | "both"
    } | null
    if (state?.jobMatch) {
      const match = state.jobMatch
      const normalized = normalizeJobMatch(match)
      setSelectedJobMatchId(normalized.id)
      setCustomJobTitle(normalized.jobTitle)
      setCustomCompanyName(normalized.companyName)
      setCustomJobDescription(normalized.jobDescription)
      if (state.documentType) {
        setDocumentType(state.documentType)
      }
    }
  }, [location.state])

  // Auto-populate fields when job match is selected
  useEffect(() => {
    if (!selectedJobMatchId) {
      setCustomJobTitle("")
      setCustomCompanyName("")
      setCustomJobDescription("")
      return
    }

    const match = jobMatches.find((m) => m.id === selectedJobMatchId)
    if (match) {
      const normalized = normalizeJobMatch(match)
      setCustomJobTitle(normalized.jobTitle)
      setCustomCompanyName(normalized.companyName)
      setCustomJobDescription(normalized.jobDescription)
    }
  }, [selectedJobMatchId, jobMatches])

  const showUserError = (message: string, details?: unknown) => {
    if (details) {
      logger.error("DocumentBuilder", "userError", message, {
        error: { type: "UserError", message: details instanceof Error ? details.message : String(details) },
      })
    }
    const displayMessage =
      typeof details === "string"
        ? details
        : details instanceof Error
          ? details.message
          : message
    toast.error({ title: displayMessage })
    setAlert({ type: "error", message: displayMessage })
  }

  const handleGenerate = async () => {
    if (!user) {
      setAlert({ type: "error", message: "You must be logged in to generate documents" })
      setAuthModalOpen(true)
      return
    }

    // Validation
    if (!customJobTitle || !customCompanyName) {
      setAlert({ type: "error", message: "Job title and company name are required" })
      return
    }

    setLoading(true)
    setAlert(null)
    setGenerationSteps([])
    setResumeUrl(null)
    setCoverLetterUrl(null)
    setGenerationRequestId(null)

    try {
      // Map UI document type to backend generateType
      const generateType = documentType === "cover_letter" ? "coverLetter" : documentType

      const request: GenerateDocumentRequest = {
        generateType,
        job: {
          role: customJobTitle,
          company: customCompanyName,
          jobDescriptionText: customJobDescription || undefined,
        },
        jobMatchId: selectedJobMatchId || undefined,
        date: new Date().toLocaleDateString(), // Client's local date for cover letter
        preferences: targetSummary
          ? {
              emphasize: [targetSummary], // Use targetSummary as emphasis preference
            }
          : undefined,
      }

      // Show initial progress immediately with first step in_progress
      const initialSteps: GenerationStep[] = getInitialSteps(generateType)
      setGenerationSteps(
        initialSteps.map((step, index) =>
          index === 0 ? { ...step, status: "in_progress" as const } : step
        )
      )

      // Step 1: Start generation (executes first step synchronously)
      const startResponse = await generatorClient.startGeneration(request)

      if (!startResponse.success) {
        showUserError("Failed to start generation. Please try again.", startResponse.error)
        return
      }

      setGenerationRequestId(startResponse.data.requestId)

      // Update with backend's step states (first step already completed)
      if (startResponse.data.steps) {
        setGenerationSteps(startResponse.data.steps)
      }

      // Update URLs from start response
      if (startResponse.data.resumeUrl) {
        setResumeUrl(startResponse.data.resumeUrl)
      }
      if (startResponse.data.coverLetterUrl) {
        setCoverLetterUrl(startResponse.data.coverLetterUrl)
      }

      // Step 2: Execute remaining steps sequentially until complete
      let nextStep = startResponse.data.nextStep
      let currentSteps = startResponse.data.steps || []

      while (nextStep) {
        try {
          // Mark the next step as in_progress in the UI before making the request
          setGenerationSteps(
            currentSteps.map((step) =>
              step.id === nextStep ? { ...step, status: "in_progress" as const } : step
            )
          )

          // Execute the step (waits for completion)
          const stepResponse = await generatorClient.executeStep(startResponse.data.requestId)

          // Check if request failed (either HTTP failure or step failure)
          if (!stepResponse.success || stepResponse.data.status === "failed") {
            const errorMessage = stepResponse.data.error || "Generation step failed"
            // Update with backend's step states (will include failed step)
            if (stepResponse.data.steps) {
              // Add error message to the failed step
              const stepsWithError = stepResponse.data.steps.map((step) =>
                step.status === "failed" && !step.error
                  ? { ...step, error: { message: errorMessage } }
                  : step
              )
              setGenerationSteps(stepsWithError)
            } else {
              // Fallback: mark current step as failed locally
              setGenerationSteps(
                currentSteps.map((step) =>
                  step.id === nextStep
                    ? { ...step, status: "failed" as const, error: { message: errorMessage } }
                    : step
                )
              )
            }
            showUserError("Generation failed. See the checklist for details.", errorMessage)
            return
          }

          // Update with backend's step states (step is now completed)
          if (stepResponse.data.steps) {
            currentSteps = stepResponse.data.steps
            setGenerationSteps(currentSteps)
          }

          // Update URLs as they become available
          if (stepResponse.data.resumeUrl) {
            setResumeUrl(stepResponse.data.resumeUrl)
          }
          if (stepResponse.data.coverLetterUrl) {
            setCoverLetterUrl(stepResponse.data.coverLetterUrl)
          }

          // Move to next step (undefined when complete)
          nextStep = stepResponse.data.nextStep
        } catch (error) {
          logger.error("DocumentBuilder", "stepExecution", "Step execution error", {
            error: { type: "StepError", message: error instanceof Error ? error.message : String(error) },
          })
          // Mark current step as failed
          setGenerationSteps(
            currentSteps.map((step) =>
              step.id === nextStep
                ? {
                    ...step,
                    status: "failed" as const,
                    error: { message: error instanceof Error ? error.message : "Unknown error" },
                  }
                : step
            )
          )
          showUserError(
            "Step execution failed. Please retry.",
            error instanceof Error ? error.message : error
          )
          return
        }
      }

      const isComplete = !nextStep

      // Step 3: Mark complete only if pipeline completed successfully
      if (isComplete) {
        const documentTypeLabel =
          documentType === "resume"
            ? "Resume"
            : documentType === "cover_letter"
              ? "Cover letter"
              : "Resume and cover letter"
        toast.success({ title: `${documentTypeLabel} generated successfully!` })
        setAlert({
          type: "success",
          message: `${documentTypeLabel} generated successfully!`,
        })
      }

      // Reset form
      setSelectedJobMatchId("")
      setCustomJobTitle("")
      setCustomCompanyName("")
      setCustomJobDescription("")
      setTargetSummary("")
    } catch (error) {
      logger.error("DocumentBuilder", "generation", "Document generation failed", {
        error: { type: "GenerationError", message: error instanceof Error ? error.message : String(error) },
      })
      showUserError("Document generation failed. Please try again.", error)
    } finally {
      setLoading(false)
    }
  }

  const selectedMatch = jobMatches.find((m) => m.id === selectedJobMatchId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Document Builder</h1>
        <p className="text-muted-foreground mt-2">
          Generate custom resumes and cover letters with AI
        </p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Generate Document</CardTitle>
            <CardDescription>Create a customized resume or cover letter using AI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Document Type Selection */}
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select
                value={documentType}
                onValueChange={(value: "resume" | "cover_letter" | "both") =>
                  setDocumentType(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resume">Resume</SelectItem>
                  <SelectItem value="cover_letter">Cover Letter</SelectItem>
                  <SelectItem value="both">Both Resume & Cover Letter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Job Selection */}
            <div className="space-y-2">
              <Label>Select Job Match (Optional)</Label>
              <Select value={selectedJobMatchId} onValueChange={setSelectedJobMatchId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a job match or enter manually" />
                </SelectTrigger>
                <SelectContent>
                  {loadingMatches ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Loading matches...
                    </div>
                  ) : jobMatches.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      <div className="space-y-2">
                        <p>No job matches found.</p>
                        <p className="text-xs">
                          You can still generate documents by entering job details manually below.
                        </p>
                      </div>
                    </div>
                  ) : (
                    jobMatches.map((match) => {
                      const normalized = normalizeJobMatch(match)
                      return (
                        <SelectItem key={match.id} value={match.id || ""}>
                          <div className="flex items-center justify-between w-full">
                            <div className="flex flex-col items-start">
                              <span className="font-medium">{normalized.jobTitle}</span>
                              <span className="text-sm text-muted-foreground">
                                {normalized.companyName} • {normalized.location}
                              </span>
                            </div>
                            <Badge variant="secondary" className="ml-2">
                              {normalized.matchScore}%
                            </Badge>
                          </div>
                        </SelectItem>
                      )
                    })
                  )}
                </SelectContent>
              </Select>
              {selectedMatch && (
                <p className="text-sm text-muted-foreground">
                  Match Score: {normalizeJobMatch(selectedMatch).matchScore}% • Analyzed{" "}
                  {normalizeJobMatch(selectedMatch).analyzedAt
                    ? new Date(normalizeJobMatch(selectedMatch).analyzedAt).toLocaleDateString()
                    : "Recently"}
                </p>
              )}
              {jobMatches.length === 0 && !loadingMatches && (
                <p className="text-sm text-muted-foreground">
                  💡 Tip: Use the Job Finder to analyze job postings and get AI-powered match
                  scores.
                </p>
              )}
            </div>

            {/* Job Details */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">Job Details</h3>

              <div className="space-y-2">
                <Label htmlFor="job-title">
                  Job Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="job-title"
                  value={customJobTitle}
                  onChange={(e) => setCustomJobTitle(e.target.value)}
                  placeholder="e.g., Senior Software Engineer"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-name">
                  Company Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="company-name"
                  value={customCompanyName}
                  onChange={(e) => setCustomCompanyName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="job-description">Job Description (Optional)</Label>
                <Textarea
                  id="job-description"
                  value={customJobDescription}
                  onChange={(e) => setCustomJobDescription(e.target.value)}
                  placeholder="Paste the job description here for better customization..."
                  rows={6}
                />
              </div>
            </div>

            {/* Customization */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">Customization (Optional)</h3>

              <div className="space-y-2">
                <Label htmlFor="target-summary">Professional Summary Override</Label>
                <Textarea
                  id="target-summary"
                  value={targetSummary}
                  onChange={(e) => setTargetSummary(e.target.value)}
                  placeholder="Customize your professional summary for this role..."
                  rows={4}
                />
                <p className="text-sm text-muted-foreground">
                  Leave blank to use AI-generated summary based on job description
                </p>
              </div>
            </div>

            {/* Generate Button */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedJobMatchId("")
                  setCustomJobTitle("")
                  setCustomCompanyName("")
                  setCustomJobDescription("")
                  setTargetSummary("")
                  setAlert(null)
                }}
              >
                Clear Form
              </Button>
              <Button onClick={handleGenerate} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate{" "}
                    {documentType === "resume"
                      ? "Resume"
                      : documentType === "cover_letter"
                        ? "Cover Letter"
                        : "Both Documents"}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generation Progress - Positioned at bottom of page */}
      {generationSteps.length > 0 && (
        <Card className="mt-8">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Document Generation</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerationProgress steps={generationSteps} />

            {/* Download Buttons */}
            {(resumeUrl || coverLetterUrl) && (
              <div className="flex gap-3 justify-center mt-4">
                {resumeUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={getAbsoluteArtifactUrl(resumeUrl) || "#"} target="_blank" rel="noopener noreferrer">
                      <Download className="w-4 h-4 mr-2" />
                      Download Resume
                    </a>
                  </Button>
                )}
                {coverLetterUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={getAbsoluteArtifactUrl(coverLetterUrl) || "#"} target="_blank" rel="noopener noreferrer">
                      <Download className="w-4 h-4 mr-2" />
                      Download Cover Letter
                    </a>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error/Status banner anchored near the bottom */}
      {alert && (
        <div className="mt-6">
          <Alert variant={alert.type === "error" ? "destructive" : "default"} className="w-full">
            <AlertDescription>{alert.message}</AlertDescription>
          </Alert>
        </div>
      )}

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </div>
  )
}
